import { can, requireMember } from "@/lib/authz";
import { getOrgMembers } from "@/lib/board/snapshot";
import { getPendingInvites } from "@/lib/invites";
import { MembersClient, type PendingInviteRow } from "@/components/board/MembersClient";

export default async function MembersPage({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const ctx = await requireMember(org);
  const members = await getOrgMembers(ctx);
  const invites = can(ctx.role, "inviteMembers") ? await getPendingInvites(ctx) : [];
  const inviteRows: PendingInviteRow[] = invites.map((i) => ({
    id: i.id,
    email: i.email,
    role: i.role,
    createdAt: i.createdAt.toISOString(),
    expiresAt: i.expiresAt.toISOString(),
  }));
  return (
    <MembersClient orgSlug={org} members={members} invites={inviteRows} viewer={{ id: ctx.user.id, role: ctx.role }} />
  );
}
