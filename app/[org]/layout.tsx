import { and, asc, eq, isNull } from "drizzle-orm";
import { boards } from "@/db/schema";
import { aiStatus } from "@/lib/ai/client";
import { pendingApprovalCount } from "@/lib/approvals";
import { can, listOrgsForUser, requireMember } from "@/lib/authz";
import { getNotifications } from "@/lib/notifications";
import { AppShell } from "@/components/shell/AppShell";

export default async function OrgLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ org: string }>;
}) {
  const { org } = await params;
  const ctx = await requireMember(org);

  const [orgs, boardList, notif, approvalCount] = await Promise.all([
    listOrgsForUser(ctx.user.id),
    ctx.db
      .select({ id: boards.id, name: boards.name })
      .from(boards)
      .where(and(eq(boards.orgId, ctx.org.id), isNull(boards.deletedAt)))
      .orderBy(asc(boards.createdAt)),
    getNotifications(ctx),
    can(ctx.role, "approve") ? pendingApprovalCount(ctx) : Promise.resolve(0),
  ]);

  const notifInitial = JSON.parse(JSON.stringify(notif)) as { rows: never[]; unread: number };

  return (
    <AppShell
      org={{ slug: ctx.org.slug, name: ctx.org.name }}
      role={ctx.role}
      user={{ email: ctx.user.email, name: ctx.user.name }}
      orgs={orgs.map((o) => ({ slug: o.org.slug, name: o.org.name }))}
      boards={boardList}
      notifInitial={notifInitial}
      aiLive={aiStatus().live}
      approvalCount={approvalCount}
    >
      {children}
    </AppShell>
  );
}
