import { and, asc, eq, isNull } from "drizzle-orm";
import { redirect } from "next/navigation";
import { boards } from "@/db/schema";
import { can, requireMember } from "@/lib/authz";
import { getGoals } from "@/lib/goals";
import { GoalsClient } from "@/components/board/GoalsClient";

export default async function GoalsPage({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const ctx = await requireMember(org);
  if (!can(ctx.role, "viewDashboard")) redirect(`/${org}`);

  const [goals, boardList] = await Promise.all([
    getGoals(ctx),
    ctx.db
      .select({ id: boards.id, name: boards.name })
      .from(boards)
      .where(and(eq(boards.orgId, ctx.org.id), isNull(boards.deletedAt)))
      .orderBy(asc(boards.createdAt)),
  ]);

  return <GoalsClient orgSlug={org} goals={goals} boards={boardList} />;
}
