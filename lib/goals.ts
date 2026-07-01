import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { boards, goals, items } from "@/db/schema";
import type { OrgContext } from "@/lib/authz";

export type ClientGoal = {
  id: string;
  name: string;
  dueDate: string | null;
  boards: { id: string; name: string }[];
  total: number;
  done: number;
  pct: number;
};

/** All goals for the org with progress rolled up from their linked boards. */
export async function getGoals(ctx: OrgContext): Promise<ClientGoal[]> {
  const rows = await ctx.db
    .select()
    .from(goals)
    .where(and(eq(goals.orgId, ctx.org.id), isNull(goals.deletedAt)))
    .orderBy(asc(goals.createdAt));

  const allBoardIds = [...new Set(rows.flatMap((r) => r.boardIds ?? []))];
  const empty = (): ClientGoal[] => rows.map((r) => ({ id: r.id, name: r.name, dueDate: r.dueDate?.toISOString() ?? null, boards: [], total: 0, done: 0, pct: 0 }));
  if (allBoardIds.length === 0) return empty();

  const boardRows = await ctx.db
    .select({ id: boards.id, name: boards.name })
    .from(boards)
    .where(and(eq(boards.orgId, ctx.org.id), inArray(boards.id, allBoardIds), isNull(boards.deletedAt)));
  const nameById = new Map(boardRows.map((b) => [b.id, b.name]));

  const counts = await ctx.db
    .select({ boardId: items.boardId, total: sql<number>`count(*)`, done: sql<number>`count(*) filter (where ${items.status} = 'approved')` })
    .from(items)
    .where(and(eq(items.orgId, ctx.org.id), inArray(items.boardId, allBoardIds), isNull(items.deletedAt)))
    .groupBy(items.boardId);
  const countById = new Map(counts.map((c) => [c.boardId, { total: Number(c.total), done: Number(c.done) }]));

  return rows.map((r) => {
    const bids = (r.boardIds ?? []).filter((id) => nameById.has(id));
    let total = 0;
    let done = 0;
    for (const id of bids) {
      const c = countById.get(id);
      if (c) { total += c.total; done += c.done; }
    }
    return {
      id: r.id,
      name: r.name,
      dueDate: r.dueDate?.toISOString() ?? null,
      boards: bids.map((id) => ({ id, name: nameById.get(id)! })),
      total,
      done,
      pct: total ? Math.round((100 * done) / total) : 0,
    };
  });
}
