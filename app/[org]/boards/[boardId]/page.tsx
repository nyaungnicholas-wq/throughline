import { and, asc, eq, isNull } from "drizzle-orm";
import { notFound } from "next/navigation";
import { boards } from "@/db/schema";
import { requireMember } from "@/lib/authz";
import { serializeSnapshot } from "@/lib/board/serialize";
import { loadBoardSnapshot } from "@/lib/board/snapshot";
import { isUuid } from "@/lib/db";
import { BoardWorkspace } from "@/components/board/BoardWorkspace";

export default async function BoardPage({
  params,
  searchParams,
}: {
  params: Promise<{ org: string; boardId: string }>;
  searchParams: Promise<{ item?: string }>;
}) {
  const { org, boardId } = await params;
  const { item } = await searchParams;
  const ctx = await requireMember(org);
  if (!isUuid(boardId)) notFound();
  const snap = await loadBoardSnapshot(ctx, boardId);
  if (!snap) notFound();
  const initialOpen = item && snap.items.some((i) => i.id === item) ? item : null;
  const boardList = await ctx.db
    .select({ id: boards.id, name: boards.name })
    .from(boards)
    .where(and(eq(boards.orgId, ctx.org.id), isNull(boards.deletedAt)))
    .orderBy(asc(boards.createdAt));
  return <BoardWorkspace orgSlug={org} initial={serializeSnapshot(snap)} initialOpen={initialOpen} boards={boardList} />;
}
