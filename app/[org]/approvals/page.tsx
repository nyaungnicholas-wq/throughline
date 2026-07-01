import { redirect } from "next/navigation";
import { getPendingApprovals } from "@/lib/approvals";
import { can, requireMember } from "@/lib/authz";
import { ApprovalsClient } from "@/components/board/ApprovalsClient";

export default async function ApprovalsPage({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const ctx = await requireMember(org);
  if (!can(ctx.role, "approve")) redirect(`/${org}`);
  const rows = await getPendingApprovals(ctx);
  return <ApprovalsClient orgSlug={org} rows={rows} />;
}
