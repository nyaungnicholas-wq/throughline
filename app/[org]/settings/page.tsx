import { redirect } from "next/navigation";
import { can, requireMember } from "@/lib/authz";
import { listApiKeysAction } from "@/lib/actions/api-keys";
import { listWebhooksAction } from "@/lib/actions/webhooks";
import { SettingsClient } from "@/components/board/SettingsClient";

export default async function SettingsPage({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const ctx = await requireMember(org);
  if (!can(ctx.role, "manageOrg")) redirect(`/${org}`); // owner only
  const [apiKeys, webhooks] = await Promise.all([listApiKeysAction(org), listWebhooksAction(org)]);
  return (
    <SettingsClient
      orgSlug={org}
      orgName={ctx.org.name}
      slackUrl={ctx.org.slackWebhookUrl ?? ""}
      apiKeys={apiKeys}
      webhooks={webhooks}
    />
  );
}
