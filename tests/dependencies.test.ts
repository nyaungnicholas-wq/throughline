import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { appUser, boards, itemDependencies, items, membership, organizations } from "@/db/schema";
import type { OrgContext } from "@/lib/authz";
import type { Db } from "@/lib/db";
import { makeTestDb } from "./helpers/testdb";

let db: Db;
let ctx: OrgContext;
let otherOrgCtx: OrgContext;

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/authz", () => ({
  requireMember: async (slug: string) => (slug === "org-a" ? ctx : otherOrgCtx),
}));

const { addDependencyAction, removeDependencyAction } = await import("@/lib/actions/dependencies");

/** Named task ids, so the cycle assertions read like the graph they describe. */
const id: Record<string, string> = {};

beforeAll(async () => {
  db = await makeTestDb();
  const [user] = await db.insert(appUser).values({ email: "a@a.test", name: "A" }).returning();
  const [orgA] = await db.insert(organizations).values({ slug: "org-a", name: "Org A" }).returning();
  const [orgB] = await db.insert(organizations).values({ slug: "org-b", name: "Org B" }).returning();
  await db.insert(membership).values({ orgId: orgA.id, userId: user.id, role: "owner" });
  const [boardA] = await db.insert(boards).values({ orgId: orgA.id, name: "A" }).returning();
  const [boardB] = await db.insert(boards).values({ orgId: orgB.id, name: "B" }).returning();

  for (const title of ["a", "b", "c", "d"]) {
    const [it] = await db.insert(items).values({ orgId: orgA.id, boardId: boardA.id, title }).returning();
    id[title] = it.id;
  }
  const [foreign] = await db.insert(items).values({ orgId: orgB.id, boardId: boardB.id, title: "foreign" }).returning();
  id.foreign = foreign.id;

  const sessionUser = { id: user.id, email: user.email, name: user.name };
  ctx = { db, user: sessionUser, org: orgA, role: "owner" };
  otherOrgCtx = { db, user: sessionUser, org: orgB, role: "owner" };
  id.boardA = boardA.id;
});

const add = (item: string, blockedBy: string) => addDependencyAction("org-a", id.boardA, id[item], id[blockedBy]);

describe("item dependencies — cycle detection", () => {
  it("rejects a self-dependency", async () => {
    const res = await add("a", "a");
    expect(res).toEqual({ ok: false, error: "A task can't block itself." });
  });

  it("accepts an acyclic chain a → b → c", async () => {
    expect(await add("a", "b")).toEqual({ ok: true });
    expect(await add("b", "c")).toEqual({ ok: true });
    const rows = await db.select().from(itemDependencies);
    expect(rows).toHaveLength(2);
  });

  it("rejects the direct 2-cycle (b already blocked-by relationship reversed)", async () => {
    const res = await add("b", "a");
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/circular/i);
  });

  it("rejects a transitive cycle of length 3 (c → a closes a → b → c)", async () => {
    const res = await add("c", "a");
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/circular/i);
    expect(await db.select().from(itemDependencies)).toHaveLength(2);
  });

  it("still allows a new edge that does not close a cycle", async () => {
    expect(await add("d", "a")).toEqual({ ok: true });
    expect(await add("c", "d")).toEqual({ ok: false, error: "That would create a circular dependency." });
  });

  it("is idempotent — re-adding an existing edge does not duplicate it", async () => {
    const before = (await db.select().from(itemDependencies)).length;
    expect(await add("a", "b")).toEqual({ ok: true });
    expect(await db.select().from(itemDependencies)).toHaveLength(before);
  });

  it("refuses to link an item from another org", async () => {
    expect(await add("a", "foreign")).toEqual({ ok: false, error: "Task not found." });
    expect(await add("foreign", "a")).toEqual({ ok: false, error: "Task not found." });
  });

  it("removing an edge reopens a link the cycle check previously refused", async () => {
    // "c blocked-by a" was refused only because of the a → b → c path; drop b → c
    // and the same edge becomes legal.
    const [edge] = await db.select().from(itemDependencies).where(eq(itemDependencies.itemId, id.b));
    await removeDependencyAction("org-a", id.boardA, edge.id);
    expect(await add("c", "a")).toEqual({ ok: true });
  });
});
