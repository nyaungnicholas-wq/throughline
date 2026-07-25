import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { appUser, attachments, boards, items, membership, organizations } from "@/db/schema";
import type { OrgContext } from "@/lib/authz";
import type { Db } from "@/lib/db";
import { getObject } from "@/lib/storage";
import { makeTestDb } from "./helpers/testdb";

/* End-to-end for the attachment path in local-filesystem mode: the upload server action
   writes real bytes through lib/storage, and the membership-checked lookup used by
   /api/attachments/[id] reads the same object back. */

let db: Db;
let ctx: OrgContext;

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/authz", () => ({ requireMember: async () => ctx }));
vi.mock("@/lib/db", async (orig) => ({
  ...(await orig<typeof import("@/lib/db")>()),
  getDb: async () => db,
}));

const { uploadAttachmentAction } = await import("@/lib/actions/attachments");
const { getAttachmentForUser } = await import("@/lib/attachments");

const world = {} as { user: string; outsider: string; item: string; board: string };

beforeAll(async () => {
  db = await makeTestDb();
  const [user] = await db.insert(appUser).values({ email: "u@a.test", name: "U" }).returning();
  const [outsider] = await db.insert(appUser).values({ email: "out@x.test" }).returning();
  const [org] = await db.insert(organizations).values({ slug: "org-a", name: "Org A" }).returning();
  await db.insert(membership).values({ orgId: org.id, userId: user.id, role: "owner" });
  const [board] = await db.insert(boards).values({ orgId: org.id, name: "B" }).returning();
  const [item] = await db.insert(items).values({ orgId: org.id, boardId: board.id, title: "T" }).returning();
  ctx = { db, user: { id: user.id, email: user.email, name: user.name }, org, role: "owner" };
  Object.assign(world, { user: user.id, outsider: outsider.id, item: item.id, board: board.id });
});

function form(file: File) {
  const fd = new FormData();
  fd.set("file", file);
  return fd;
}

describe("attachment upload (local filesystem backend)", () => {
  it("stores the bytes and a row, and reads the same bytes back", async () => {
    const body = "hello, throughline";
    const res = await uploadAttachmentAction(
      "org-a",
      world.board,
      world.item,
      form(new File([body], "quarterly report.txt", { type: "text/plain" })),
    );
    expect(res).toEqual({ ok: true });

    const [row] = await db.select().from(attachments).where(eq(attachments.itemId, world.item));
    expect(row.filename).toBe("quarterly report.txt");
    expect(row.orgId).toBe(ctx.org.id);
    // Key is org-scoped and filename-sanitised — never a public URL.
    expect(row.storageKey).toMatch(new RegExp(`^${ctx.org.id}/[A-Za-z0-9_-]+-quarterly_report\\.txt$`));

    const fetched = await getAttachmentForUser(world.user, row.id);
    expect(fetched?.id).toBe(row.id);
    const bytes = await getObject(fetched!.storageKey);
    expect(new TextDecoder().decode(bytes!)).toBe(body);
  });

  it("a non-member cannot resolve the attachment at all", async () => {
    const [row] = await db.select().from(attachments).where(eq(attachments.itemId, world.item));
    expect(await getAttachmentForUser(world.outsider, row.id)).toBeNull();
  });

  it("rejects an empty file and one over the 10MB cap", async () => {
    expect((await uploadAttachmentAction("org-a", world.board, world.item, form(new File([], "e.txt")))).ok).toBe(false);
    const big = new File([new Uint8Array(10 * 1024 * 1024 + 1)], "big.bin");
    expect((await uploadAttachmentAction("org-a", world.board, world.item, form(big))).error).toMatch(/too large/i);
  });

  it("refuses to attach to an item outside the caller's org", async () => {
    const res = await uploadAttachmentAction("org-a", world.board, crypto.randomUUID(), form(new File(["x"], "x.txt")));
    expect(res).toEqual({ ok: false, error: "Item not found." });
  });
});
