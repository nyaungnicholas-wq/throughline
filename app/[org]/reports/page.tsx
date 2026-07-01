import { redirect } from "next/navigation";
import { can, requireMember } from "@/lib/authz";
import { getReports } from "@/lib/reports";
import { ReportsView } from "@/components/board/ReportsView";

export default async function ReportsPage({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const ctx = await requireMember(org);
  if (!can(ctx.role, "viewDashboard")) redirect(`/${org}/my-work`);
  const reports = await getReports(ctx);
  return <ReportsView orgName={ctx.org.name} reports={reports} />;
}
