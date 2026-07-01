import { and, eq, isNull } from "drizzle-orm";
import { format, isSameWeek, startOfWeek, subWeeks } from "date-fns";
import { items, type ItemStatus } from "@/db/schema";
import type { OrgContext } from "@/lib/authz";
import { getOrgMembers } from "@/lib/board/snapshot";
import { STATUS_META, STATUS_ORDER } from "@/lib/board/palette";

export type Reports = {
  totals: { total: number; approved: number; overdue: number; dueThisWeek: number };
  statusBreakdown: Array<{ status: ItemStatus; label: string; count: number; swatch: number }>;
  workload: Array<{ name: string; active: number; overdue: number }>;
  throughput: Array<{ week: string; count: number }>;
  onTime: { onTime: number; late: number };
};

export async function getReports(ctx: OrgContext): Promise<Reports> {
  const rows = await ctx.db
    .select({
      status: items.status,
      dueDate: items.dueDate,
      statusEnteredAt: items.statusEnteredAt,
      assigneeId: items.assigneeId,
    })
    .from(items)
    .where(and(eq(items.orgId, ctx.org.id), isNull(items.deletedAt)));

  const now = new Date();
  const weekMs = 7 * 86400_000;

  const statusCounts = new Map<ItemStatus, number>();
  const active = new Map<string, number>();
  const overdueByUser = new Map<string, number>();
  let approved = 0,
    overdue = 0,
    dueThisWeek = 0,
    onTime = 0,
    late = 0;

  for (const r of rows) {
    statusCounts.set(r.status, (statusCounts.get(r.status) ?? 0) + 1);
    const isOverdue = !!(r.dueDate && r.dueDate.getTime() < now.getTime() && r.status !== "approved");
    if (r.status === "approved") {
      approved++;
      if (r.dueDate) (r.statusEnteredAt.getTime() <= r.dueDate.getTime() ? (onTime++) : (late++));
    } else if (r.assigneeId) {
      active.set(r.assigneeId, (active.get(r.assigneeId) ?? 0) + 1);
    }
    if (isOverdue) {
      overdue++;
      if (r.assigneeId) overdueByUser.set(r.assigneeId, (overdueByUser.get(r.assigneeId) ?? 0) + 1);
    }
    if (r.dueDate && r.status !== "approved") {
      const d = r.dueDate.getTime() - now.getTime();
      if (d >= 0 && d <= weekMs) dueThisWeek++;
    }
  }

  // throughput: approved items per week, last 8 weeks
  const weeks = Array.from({ length: 8 }, (_, i) => {
    const ws = startOfWeek(subWeeks(now, 7 - i));
    return { start: ws, week: format(ws, "MMM d"), count: 0 };
  });
  for (const r of rows) {
    if (r.status !== "approved") continue;
    const w = weeks.find((x) => isSameWeek(r.statusEnteredAt, x.start));
    if (w) w.count++;
  }

  const members = await getOrgMembers(ctx);

  return {
    totals: { total: rows.length, approved, overdue, dueThisWeek },
    statusBreakdown: STATUS_ORDER.map((s) => ({ status: s, label: STATUS_META[s].label, count: statusCounts.get(s) ?? 0, swatch: STATUS_META[s].swatch })),
    workload: members
      .map((m) => ({ name: m.name ?? m.email, active: active.get(m.id) ?? 0, overdue: overdueByUser.get(m.id) ?? 0 }))
      .filter((w) => w.active > 0 || w.overdue > 0)
      .sort((a, b) => b.active - a.active),
    throughput: weeks.map((w) => ({ week: w.week, count: w.count })),
    onTime: { onTime, late },
  };
}
