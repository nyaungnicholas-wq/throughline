import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import {
  appUser,
  boardColumns,
  boards,
  columnLabels,
  items,
  itemValues,
  membership,
} from "@/db/schema";
import type { OrgContext } from "@/lib/authz";
import type { BoardSnapshot, MyWorkItem, SnapshotItem, SnapshotMember } from "@/lib/board/types";

/** All active members of the active org, with role. Used by snapshots and the members page. */
export async function getOrgMembers(ctx: OrgContext): Promise<SnapshotMember[]> {
  const rows = await ctx.db
    .select({
      id: appUser.id,
      email: appUser.email,
      name: appUser.name,
      role: membership.role,
    })
    .from(membership)
    .innerJoin(appUser, eq(appUser.id, membership.userId))
    .where(and(eq(membership.orgId, ctx.org.id), isNull(membership.deletedAt)))
    .orderBy(asc(appUser.email));
  return rows;
}

/** Load one board and everything its views need, in a few scoped queries. */
export async function loadBoardSnapshot(
  ctx: OrgContext,
  boardId: string,
): Promise<BoardSnapshot | null> {
  const [board] = await ctx.db
    .select()
    .from(boards)
    .where(and(eq(boards.id, boardId), eq(boards.orgId, ctx.org.id), isNull(boards.deletedAt)))
    .limit(1);
  if (!board) return null;

  const cols = await ctx.db
    .select()
    .from(boardColumns)
    .where(
      and(
        eq(boardColumns.boardId, boardId),
        eq(boardColumns.orgId, ctx.org.id),
        isNull(boardColumns.deletedAt),
      ),
    )
    .orderBy(asc(boardColumns.position));

  const colIds = cols.map((c) => c.id);
  const labels = colIds.length
    ? await ctx.db
        .select()
        .from(columnLabels)
        .where(and(eq(columnLabels.orgId, ctx.org.id), inArray(columnLabels.columnId, colIds)))
        .orderBy(asc(columnLabels.position))
    : [];

  // Safety cap: every board view (Table/Kanban/Calendar/Gantt) projects from this one
  // in-memory load, so an unbounded board would balloon the payload and block the request.
  // Fetch one past the cap to detect truncation; the UI then nudges users to filter/search.
  const ITEM_CAP = 1000;
  const rawRows = await ctx.db
    .select()
    .from(items)
    .where(and(eq(items.boardId, boardId), eq(items.orgId, ctx.org.id), isNull(items.deletedAt)))
    .orderBy(asc(items.position), asc(items.createdAt))
    .limit(ITEM_CAP + 1);
  const truncated = rawRows.length > ITEM_CAP;
  const rows = truncated ? rawRows.slice(0, ITEM_CAP) : rawRows;

  const itemIds = rows.map((r) => r.id);
  const values = itemIds.length
    ? await ctx.db
        .select()
        .from(itemValues)
        .where(and(eq(itemValues.orgId, ctx.org.id), inArray(itemValues.itemId, itemIds)))
    : [];

  const members = await getOrgMembers(ctx);
  const memberById = new Map(members.map((m) => [m.id, m]));

  const valuesByItem = new Map<string, Record<string, (typeof values)[number]>>();
  for (const v of values) {
    const bag = valuesByItem.get(v.itemId) ?? {};
    bag[v.columnId] = v;
    valuesByItem.set(v.itemId, bag);
  }

  const snapItems: SnapshotItem[] = rows.map((r) => ({
    ...r,
    values: valuesByItem.get(r.id) ?? {},
    assignee: r.assigneeId ? memberById.get(r.assigneeId) ?? null : null,
  }));

  return {
    board,
    columns: cols.map((c) => ({ ...c, labels: labels.filter((l) => l.columnId === c.id) })),
    items: snapItems,
    members,
    viewer: { id: ctx.user.id, role: ctx.role },
    boardOwnerId: board.ownerId,
    truncated,
  };
}

/** Items assigned to the current user across the org, newest-due first. */
export async function loadMyWork(ctx: OrgContext): Promise<MyWorkItem[]> {
  const rows = await ctx.db
    .select({ item: items, boardName: boards.name })
    .from(items)
    .innerJoin(boards, eq(boards.id, items.boardId))
    .where(
      and(
        eq(items.orgId, ctx.org.id),
        eq(items.assigneeId, ctx.user.id),
        isNull(items.deletedAt),
        isNull(boards.deletedAt),
      ),
    )
    .orderBy(asc(items.dueDate), desc(items.createdAt));
  return rows.map((r) => ({ ...r.item, boardName: r.boardName, boardId: r.item.boardId }));
}
