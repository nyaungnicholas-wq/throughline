import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { apiKeys, appUser, boards, items, membership, organizations } from "@/db/schema";
import { sha256hex } from "@/lib/crypto";
import type { Db } from "@/lib/db";
import { makeTestDb } from "./helpers/testdb";

/* The tenant chokepoint is `lib/authz`, which resolves the caller's org from their
   session. We stub only the *session* (getCurrentUser) and the raw db handle; the
   membership/org lookup under test is the real one. */

let db: Db;
let current: { id: string; email: string; name: string | null } | null = null;

vi.mock("@/lib/auth", () => ({ getCurrentUser: async () => current }));
vi.mock("@/lib/db", async (orig) => ({
  ...(await orig<typeof import("@/lib/db")>()),
  getDb: async () => db,
}));
// notFound()/redirect() throw sentinel errors in Next; reproduce that shape.
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  redirect: () => {
    throw new Error("NEXT_REDIRECT");
  },
}));

const { getMemberContext, requireMember } = await import("@/lib/authz");
const { authenticateApiKey } = await import("@/lib/api-auth");

const world = {} as {
  alice: string;
  bob: string;
  orgA: string;
  orgB: string;
  itemA: string;
  itemB: string;
  boardB: string;
  keyA: string;
  keyB: string;
  revokedKey: string;
};

beforeAll(async () => {
  db = await makeTestDb();

  const [alice] = await db.insert(appUser).values({ email: "alice@a.test", name: "Alice" }).returning();
  const [bob] = await db.insert(appUser).values({ email: "bob@b.test", name: "Bob" }).returning();
  const [orgA] = await db.insert(organizations).values({ slug: "org-a", name: "Org A" }).returning();
  const [orgB] = await db.insert(organizations).values({ slug: "org-b", name: "Org B" }).returning();

  await db.insert(membership).values([
    { orgId: orgA.id, userId: alice.id, role: "owner" },
    { orgId: orgB.id, userId: bob.id, role: "owner" },
  ]);

  const [boardA] = await db.insert(boards).values({ orgId: orgA.id, name: "A board" }).returning();
  const [boardB] = await db.insert(boards).values({ orgId: orgB.id, name: "B board" }).returning();
  const [itemA] = await db.insert(items).values({ orgId: orgA.id, boardId: boardA.id, title: "A secret" }).returning();
  const [itemB] = await db.insert(items).values({ orgId: orgB.id, boardId: boardB.id, title: "B secret" }).returning();

  const mkKey = async (orgId: string, raw: string, revoked = false) => {
    await db.insert(apiKeys).values({
      orgId,
      name: raw,
      keyHash: sha256hex(raw),
      prefix: raw.slice(0, 6),
      revokedAt: revoked ? new Date() : null,
    });
    return raw;
  };

  Object.assign(world, {
    alice: alice.id,
    bob: bob.id,
    orgA: orgA.id,
    orgB: orgB.id,
    itemA: itemA.id,
    itemB: itemB.id,
    boardB: boardB.id,
    keyA: await mkKey(orgA.id, "tl_key_aaaaaaaaaaaa"),
    keyB: await mkKey(orgB.id, "tl_key_bbbbbbbbbbbb"),
    revokedKey: await mkKey(orgA.id, "tl_key_rrrrrrrrrrrr", true),
  });
});

const asAlice = () => (current = { id: world.alice, email: "alice@a.test", name: "Alice" });

describe("tenant isolation — lib/authz chokepoint", () => {
  it("resolves the org the user actually belongs to", async () => {
    asAlice();
    const ctx = await getMemberContext("org-a");
    expect(ctx?.org.id).toBe(world.orgA);
    expect(ctx?.role).toBe("owner");
  });

  it("getMemberContext returns null for an org the user is not a member of", async () => {
    asAlice();
    expect(await getMemberContext("org-b")).toBeNull();
  });

  it("requireMember 404s on a foreign org rather than revealing it exists", async () => {
    asAlice();
    await expect(requireMember("org-b")).rejects.toThrow("NEXT_NOT_FOUND");
    // a nonexistent org fails identically — the two cases are indistinguishable
    await expect(requireMember("org-does-not-exist")).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("signed-out callers get no context and are redirected", async () => {
    current = null;
    expect(await getMemberContext("org-a")).toBeNull();
    await expect(requireMember("org-a")).rejects.toThrow("NEXT_REDIRECT");
  });

  it("a soft-deleted membership loses access", async () => {
    asAlice();
    await db
      .update(membership)
      .set({ deletedAt: new Date() })
      .where(and(eq(membership.orgId, world.orgA), eq(membership.userId, world.alice)));
    expect(await getMemberContext("org-a")).toBeNull();
    await db
      .update(membership)
      .set({ deletedAt: null })
      .where(and(eq(membership.orgId, world.orgA), eq(membership.userId, world.alice)));
    expect(await getMemberContext("org-a")).not.toBeNull();
  });

  it("a member cannot obtain a manager/owner context (role floor is enforced)", async () => {
    const [carol] = await db.insert(appUser).values({ email: "carol@a.test" }).returning();
    await db.insert(membership).values({ orgId: world.orgA, userId: carol.id, role: "member" });
    current = { id: carol.id, email: "carol@a.test", name: null };
    expect(await getMemberContext("org-a", "member")).not.toBeNull();
    expect(await getMemberContext("org-a", "manager")).toBeNull();
    expect(await getMemberContext("org-a", "owner")).toBeNull();
  });
});

describe("tenant isolation — org-scoped reads and writes", () => {
  it("org A cannot READ org B's boards or items through its own context", async () => {
    asAlice();
    const ctx = (await getMemberContext("org-a"))!;

    const visibleItems = await ctx.db.select().from(items).where(eq(items.orgId, ctx.org.id));
    expect(visibleItems.map((i) => i.title)).toEqual(["A secret"]);

    // Even naming org B's item id explicitly, the org filter yields nothing.
    const stolen = await ctx.db
      .select()
      .from(items)
      .where(and(eq(items.id, world.itemB), eq(items.orgId, ctx.org.id)));
    expect(stolen).toHaveLength(0);

    const visibleBoards = await ctx.db.select().from(boards).where(eq(boards.orgId, ctx.org.id));
    expect(visibleBoards.map((b) => b.name)).toEqual(["A board"]);
    expect(visibleBoards.map((b) => b.id)).not.toContain(world.boardB);
  });

  it("org A cannot MUTATE org B's item", async () => {
    asAlice();
    const ctx = (await getMemberContext("org-a"))!;

    const updated = await ctx.db
      .update(items)
      .set({ title: "pwned" })
      .where(and(eq(items.id, world.itemB), eq(items.orgId, ctx.org.id)))
      .returning();
    expect(updated).toHaveLength(0);

    const deleted = await ctx.db
      .delete(items)
      .where(and(eq(items.id, world.itemB), eq(items.orgId, ctx.org.id)))
      .returning();
    expect(deleted).toHaveLength(0);

    const [stillThere] = await db.select().from(items).where(eq(items.id, world.itemB));
    expect(stillThere.title).toBe("B secret");
  });
});

describe("tenant isolation — lib/api-auth (public API keys)", () => {
  const req = (auth?: string) => new Request("https://x.test/api", auth ? { headers: { authorization: auth } } : undefined);

  it("resolves a key to exactly its own org", async () => {
    expect((await authenticateApiKey(req(`Bearer ${world.keyA}`)))?.org.id).toBe(world.orgA);
    expect((await authenticateApiKey(req(`Bearer ${world.keyB}`)))?.org.id).toBe(world.orgB);
  });

  it("rejects missing, malformed, unknown and revoked keys", async () => {
    expect(await authenticateApiKey(req())).toBeNull();
    expect(await authenticateApiKey(req("Basic abc"))).toBeNull();
    expect(await authenticateApiKey(req("Bearer tl_key_not_a_real_key"))).toBeNull();
    expect(await authenticateApiKey(req(`Bearer ${world.revokedKey}`))).toBeNull();
  });

  it("an org A key scoped to its org sees none of org B's items", async () => {
    const auth = (await authenticateApiKey(req(`Bearer ${world.keyA}`)))!;
    const rows = await auth.db.select().from(items).where(eq(items.orgId, auth.org.id));
    expect(rows.map((r) => r.title)).toEqual(["A secret"]);
    expect(rows.map((r) => r.id)).not.toContain(world.itemB);
  });

  it("a key belonging to a soft-deleted org stops authenticating", async () => {
    const [ghost] = await db.insert(organizations).values({ slug: "ghost", name: "Ghost", deletedAt: new Date() }).returning();
    await db.insert(apiKeys).values({ orgId: ghost.id, name: "g", keyHash: sha256hex("tl_key_gggggggggggg"), prefix: "tl_key" });
    expect(await authenticateApiKey(req("Bearer tl_key_gggggggggggg"))).toBeNull();
  });
});
