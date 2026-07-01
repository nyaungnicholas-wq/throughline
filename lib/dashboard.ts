import { and, asc, eq, isNull, lt, ne, sql } from "drizzle-orm";
import { appUser, boards, items } from "@/db/schema";
import type { Item } from "@/db/schema";
import type { OrgContext } from "@/lib/authz";

export type DashboardItem = Item & { boardName: string; assigneeName: string | null };
export type WorkloadRow = { userId: string; name: string | null; email: string; active: number; overdue: number };

export type Dashboard = {
  pendingApprovals: DashboardItem[];
  overdue: DashboardItem[];
  workload: WorkloadRow[];
};

const ACTIVE_STATUSES = sql`${items.status} not in ('approved', 'unassigned')`;

async function withContext(ctx: OrgContext, whereExtra: ReturnType<typeof and>) {
  const rows = await ctx.db
    .select({ item: items, boardName: boards.name, assigneeName: appUser.name, assigneeEmail: appUser.email })
    .from(items)
    .innerJoin(boards, eq(boards.id, items.boardId))
    .leftJoin(appUser, eq(appUser.id, items.assigneeId))
    .where(whereExtra)
    .orderBy(asc(items.dueDate));
  return rows.map((r): DashboardItem => ({
    ...r.item,
    boardName: r.boardName,
    assigneeName: r.assigneeName ?? r.assigneeEmail ?? null,
  }));
}

/** The three manager-dashboard tiles, each one scoped query. */
export async function getDashboard(ctx: OrgContext): Promise<Dashboard> {
  const now = new Date();

  const pendingApprovals = await withContext(
    ctx,
    and(eq(items.orgId, ctx.org.id), isNull(items.deletedAt), eq(items.status, "submitted")),
  );

  const overdue = await withContext(
    ctx,
    and(
      eq(items.orgId, ctx.org.id),
      isNull(items.deletedAt),
      lt(items.dueDate, now),
      ne(items.status, "approved"),
    ),
  );

  const workloadRows = await ctx.db
    .select({
      userId: appUser.id,
      name: appUser.name,
      email: appUser.email,
      active: sql<number>`count(*) filter (where ${ACTIVE_STATUSES})`,
      overdue: sql<number>`count(*) filter (where ${items.dueDate} < ${now} and ${items.status} <> 'approved')`,
    })
    .from(items)
    .innerJoin(appUser, eq(appUser.id, items.assigneeId))
    .where(and(eq(items.orgId, ctx.org.id), isNull(items.deletedAt)))
    .groupBy(appUser.id, appUser.name, appUser.email)
    .orderBy(asc(appUser.email));

  return {
    pendingApprovals,
    overdue,
    workload: workloadRows.map((r) => ({
      userId: r.userId,
      name: r.name,
      email: r.email,
      active: Number(r.active),
      overdue: Number(r.overdue),
    })),
  };
}
