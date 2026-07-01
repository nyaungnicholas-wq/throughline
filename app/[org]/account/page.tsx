import { requireMember } from "@/lib/authz";
import { AccountClient } from "@/components/AccountClient";

export default async function AccountPage({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const ctx = await requireMember(org);
  return <AccountClient orgSlug={org} name={ctx.user.name} email={ctx.user.email} />;
}
