"use server";

import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { boards, items, membership, type ItemStatus, type Priority } from "@/db/schema";
import { requireMember } from "@/lib/authz";

// Bulk assignment is only safe before work has started. Items already in the review flow
// must be reassigned through runTransition (which writes audit + version + notifications),
// so the bulk tool leaves them untouched rather than corrupting their delegation state.
const PRE_WORK_STATES: ItemStatus[] = ["unassigned", "assigned"];

export type BulkPatch = {
  priority?: Priority | null;
  assigneeId?: string | null;
  dueDate?: string | null;
  moveBoardId?: string;
  delete?: boolean;
};

/** Apply one change to many items at once. Member+ for field edits; manager for move/delete. */
export async function bulkUpdateItemsAction(
  orgSlug: string,
  boardId: string,
  itemIds: string[],
  patch: BulkPatch,
): Promise<{ ok: boolean; count?: number; error?: string }> {
  const ctx = await requireMember(orgSlug);
  if (itemIds.length === 0) return { ok: false, error: "Nothing selected." };

  const isManager = ctx.role === "owner" || ctx.role === "manager";
  if ((patch.delete || patch.moveBoardId) && !isManager) return { ok: false, error: "Only managers can move or delete." };

  if (patch.moveBoardId) {
    const [b] = await ctx.db
      .select({ id: boards.id })
      .from(boards)
      .where(and(eq(boards.id, patch.moveBoardId), eq(boards.orgId, ctx.org.id), isNull(boards.deletedAt)))
      .limit(1);
    if (!b) return { ok: false, error: "Target board not found." };
  }

  // The assignee (if any) must be a member of THIS org — don't trust a raw UUID.
  if (patch.assigneeId) {
    const [m] = await ctx.db
      .select({ id: membership.id })
      .from(membership)
      .where(and(eq(membership.orgId, ctx.org.id), eq(membership.userId, patch.assigneeId), isNull(membership.deletedAt)))
      .limit(1);
    if (!m) return { ok: false, error: "That person isn't in this workspace." };
  }

  const where = and(eq(items.orgId, ctx.org.id), inArray(items.id, itemIds), isNull(items.deletedAt));
  // Non-delegation fields apply to every selected item directly.
  const set: Partial<typeof items.$inferInsert> = {};
  if ("priority" in patch) set.priority = patch.priority ?? null;
  if ("dueDate" in patch) set.dueDate = patch.dueDate ? new Date(patch.dueDate) : null;
  if (patch.moveBoardId) set.boardId = patch.moveBoardId;
  if (patch.delete) set.deletedAt = new Date();

  if (Object.keys(set).length > 0) {
    await ctx.db.update(items).set(set).where(where);
  }

  // Assignment is a delegation change — only bulk-apply to pre-work items, and bump the
  // version so optimistic-concurrency readers re-sync. Items already in review are skipped.
  if ("assigneeId" in patch) {
    const assignWhere = and(
      eq(items.orgId, ctx.org.id),
      inArray(items.id, itemIds),
      isNull(items.deletedAt),
      inArray(items.status, PRE_WORK_STATES),
    );
    if (patch.assigneeId) {
      await ctx.db
        .update(items)
        .set({ assigneeId: patch.assigneeId, status: "assigned", statusEnteredAt: new Date(), assignerId: ctx.user.id, version: sql`${items.version} + 1` })
        .where(assignWhere);
    } else {
      await ctx.db
        .update(items)
        .set({ assigneeId: null, status: "unassigned", statusEnteredAt: new Date(), assignerId: null, version: sql`${items.version} + 1` })
        .where(assignWhere);
    }
  }

  revalidatePath(`/${orgSlug}/boards/${boardId}`);
  if (patch.moveBoardId) revalidatePath(`/${orgSlug}/boards/${patch.moveBoardId}`);
  return { ok: true, count: itemIds.length };
}
