import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { Crown, LayoutGrid } from "lucide-react";
import Link from "next/link";
import { boards, items } from "@/db/schema";
import { aiStatus } from "@/lib/ai/client";
import { requireMember } from "@/lib/authz";
import { getOrgMembers } from "@/lib/board/snapshot";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState } from "@/components/ui/misc";
import { AiGenerateButton } from "@/components/ai/AiGenerateButton";
import { NewBoardButton } from "@/components/shell/NewBoardButton";

export default async function BoardsPage({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const ctx = await requireMember(org);
  const isManager = ctx.role === "owner" || ctx.role === "manager";

  const list = await ctx.db
    .select({ id: boards.id, name: boards.name, description: boards.description, ownerId: boards.ownerId })
    .from(boards)
    .where(and(eq(boards.orgId, ctx.org.id), isNull(boards.deletedAt)))
    .orderBy(asc(boards.createdAt));

  const members = await getOrgMembers(ctx);
  const memberById = new Map(members.map((m) => [m.id, m]));

  const counts = await ctx.db
    .select({
      boardId: items.boardId,
      total: sql<number>`count(*)`,
      done: sql<number>`count(*) filter (where ${items.status} = 'approved')`,
    })
    .from(items)
    .where(and(eq(items.orgId, ctx.org.id), isNull(items.deletedAt)))
    .groupBy(items.boardId);
  const countMap = new Map(counts.map((c) => [c.boardId, c]));

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Boards</h1>
          <p className="text-sm text-slate-500">{ctx.org.name}</p>
        </div>
        {isManager && (
          <div className="flex gap-2">
            <AiGenerateButton orgSlug={org} aiLive={aiStatus().live} />
            <NewBoardButton orgSlug={org} variant="primary" />
          </div>
        )}
      </div>

      {list.length === 0 ? (
        <EmptyState
          icon={<LayoutGrid size={40} />}
          title="No boards yet"
          hint={isManager ? "Create your first board to start delegating work." : "Ask a manager to create a board."}
          action={isManager ? <NewBoardButton orgSlug={org} variant="primary" /> : undefined}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((b) => {
            const c = countMap.get(b.id);
            const total = Number(c?.total ?? 0);
            const done = Number(c?.done ?? 0);
            const pct = total ? Math.round((done / total) * 100) : 0;
            return (
              <Link
                key={b.id}
                href={`/${org}/boards/${b.id}`}
                className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-md"
              >
                <div className="mb-3 flex items-start justify-between">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-50 to-indigo-100 text-indigo-600 ring-1 ring-inset ring-indigo-100 transition-transform duration-200 group-hover:scale-105">
                    <LayoutGrid size={20} />
                  </div>
                  {(() => {
                    const o = b.ownerId ? memberById.get(b.ownerId) : null;
                    return o ? (
                      <span title={`Lead: ${o.name ?? o.email}`} className="flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-1.5 py-0.5">
                        <Crown size={11} className="text-amber-500" />
                        <Avatar name={o.name} email={o.email} size={18} />
                      </span>
                    ) : null;
                  })()}
                </div>
                <h3 className="font-semibold text-slate-900 group-hover:text-indigo-700">{b.name}</h3>
                {b.description && <p className="mt-0.5 line-clamp-2 text-sm text-slate-500">{b.description}</p>}
                <div className="mt-4">
                  <div className="mb-1 flex justify-between text-xs text-slate-400">
                    <span>{total} task{total === 1 ? "" : "s"}</span>
                    <span className={pct === 100 && total > 0 ? "font-medium text-emerald-600" : undefined}>{pct}% done</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-emerald-500 transition-[width] duration-500 ease-out" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
