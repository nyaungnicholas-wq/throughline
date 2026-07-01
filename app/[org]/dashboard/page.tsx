import { redirect } from "next/navigation";
import { can, requireMember } from "@/lib/authz";
import { getOrgMembers } from "@/lib/board/snapshot";
import { getDashboard } from "@/lib/dashboard";
import { DashboardView, type DashRow } from "@/components/board/DashboardView";

export default async function DashboardPage({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const ctx = await requireMember(org);
  if (!can(ctx.role, "viewDashboard")) redirect(`/${org}/my-work`);

  const [dash, members] = await Promise.all([getDashboard(ctx), getOrgMembers(ctx)]);

  const toRow = (r: (typeof dash.pendingApprovals)[number]): DashRow => ({
    id: r.id,
    title: r.title,
    boardId: r.boardId,
    boardName: r.boardName,
    assigneeName: r.assigneeName,
    dueDate: r.dueDate ? r.dueDate.toISOString() : null,
    priority: r.priority,
    status: r.status,
  });

  return (
    <DashboardView
      orgSlug={org}
      orgName={ctx.org.name}
      pending={dash.pendingApprovals.map(toRow)}
      overdue={dash.overdue.map(toRow)}
      workload={dash.workload}
      members={members}
      viewer={{ id: ctx.user.id, role: ctx.role }}
    />
  );
}
