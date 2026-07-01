import { requireMember } from "@/lib/authz";
import { getOrgMembers, loadMyWork } from "@/lib/board/snapshot";
import { signToken } from "@/lib/crypto";
import { MyWorkList, type MyWorkRow } from "@/components/board/MyWorkList";

export default async function MyWorkPage({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const ctx = await requireMember(org);
  const [rows, members] = await Promise.all([loadMyWork(ctx), getOrgMembers(ctx)]);

  const clientRows: MyWorkRow[] = rows.map((r) => ({
    id: r.id,
    title: r.title,
    status: r.status,
    priority: r.priority,
    dueDate: r.dueDate ? r.dueDate.toISOString() : null,
    boardId: r.boardId,
    boardName: r.boardName,
  }));

  const icalPath = `/api/calendar/${signToken(`${ctx.user.id}:${ctx.org.id}`)}`;
  return <MyWorkList orgSlug={org} rows={clientRows} members={members} viewer={{ id: ctx.user.id, role: ctx.role }} icalPath={icalPath} />;
}
