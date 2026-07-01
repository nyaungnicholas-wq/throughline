import { and, desc, eq, gte, isNotNull } from "drizzle-orm";
import { redirect } from "next/navigation";
import { boards, items } from "@/db/schema";
import { can, requireMember } from "@/lib/authz";
import { TrashClient, type TrashBoard, type TrashItem } from "@/components/board/TrashClient";

export default async function TrashPage({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const ctx = await requireMember(org);
  if (!can(ctx.role, "deleteBoard")) redirect(`/${org}`);

  const since = new Date(Date.now() - 30 * 86400_000);
  const delItems = await ctx.db
    .select({ id: items.id, title: items.title, deletedAt: items.deletedAt, boardName: boards.name })
    .from(items)
    .innerJoin(boards, eq(boards.id, items.boardId))
    .where(and(eq(items.orgId, ctx.org.id), isNotNull(items.deletedAt), gte(items.deletedAt, since)))
    .orderBy(desc(items.deletedAt))
    .limit(100);
  const delBoards = await ctx.db
    .select({ id: boards.id, name: boards.name, deletedAt: boards.deletedAt })
    .from(boards)
    .where(and(eq(boards.orgId, ctx.org.id), isNotNull(boards.deletedAt)))
    .orderBy(desc(boards.deletedAt))
    .limit(50);

  const itemRows: TrashItem[] = delItems.map((r) => ({ id: r.id, title: r.title, boardName: r.boardName, deletedAt: r.deletedAt!.toISOString() }));
  const boardRows: TrashBoard[] = delBoards.map((r) => ({ id: r.id, name: r.name, deletedAt: r.deletedAt!.toISOString() }));
  return <TrashClient orgSlug={org} items={itemRows} boards={boardRows} />;
}
