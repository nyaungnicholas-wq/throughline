import { and, asc, count, eq, isNull, ne } from "drizzle-orm";
import { appUser, boards, items } from "@/db/schema";
import type { OrgContext } from "@/lib/authz";

export type ApprovalRow = {
  id: string;
  title: string;
  boardId: string;
  boardName: string;
  assigneeName: string | null;
  submittedAt: string | null;
  version: number;
};

/** Submitted items awaiting the viewer's approval (excludes their own work — no self-approval). */
export async function getPendingApprovals(ctx: OrgContext): Promise<ApprovalRow[]> {
  const rows = await ctx.db
    .select({ item: items, boardName: boards.name, name: appUser.name, email: appUser.email })
    .from(items)
    .innerJoin(boards, eq(boards.id, items.boardId))
    .leftJoin(appUser, eq(appUser.id, items.assigneeId))
    .where(
      and(
        eq(items.orgId, ctx.org.id),
        eq(items.status, "submitted"),
        isNull(items.deletedAt),
        isNull(boards.deletedAt),
        ne(items.assigneeId, ctx.user.id),
      ),
    )
    .orderBy(asc(items.submittedAt));
  return rows.map((r) => ({
    id: r.item.id,
    title: r.item.title,
    boardId: r.item.boardId,
    boardName: r.boardName,
    assigneeName: r.name ?? r.email ?? null,
    submittedAt: r.item.submittedAt?.toISOString() ?? null,
    version: r.item.version,
  }));
}

export async function pendingApprovalCount(ctx: OrgContext): Promise<number> {
  // Mirror getPendingApprovals exactly (incl. the board-deletion filter) so the
  // sidebar badge can never diverge from the list it links to.
  const [{ value }] = await ctx.db
    .select({ value: count() })
    .from(items)
    .innerJoin(boards, eq(boards.id, items.boardId))
    .where(
      and(
        eq(items.orgId, ctx.org.id),
        eq(items.status, "submitted"),
        isNull(items.deletedAt),
        isNull(boards.deletedAt),
        ne(items.assigneeId, ctx.user.id),
      ),
    );
  return value;
}
