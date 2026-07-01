"use server";

import { and, eq, inArray, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { boards, goals } from "@/db/schema";
import { assertCan, requireMember } from "@/lib/authz";

export async function createGoalAction(
  orgSlug: string,
  input: { name: string; boardIds: string[]; dueDate?: string | null },
): Promise<{ ok: boolean; error?: string }> {
  const ctx = await requireMember(orgSlug, "manager");
  assertCan(ctx.role, "viewDashboard");
  const name = input.name.trim();
  if (name.length < 2) return { ok: false, error: "Name your goal." };

  // keep only board ids that actually belong to this org
  let validIds: string[] = [];
  if (input.boardIds.length) {
    const rows = await ctx.db
      .select({ id: boards.id })
      .from(boards)
      .where(and(eq(boards.orgId, ctx.org.id), inArray(boards.id, input.boardIds), isNull(boards.deletedAt)));
    validIds = rows.map((r) => r.id);
  }

  await ctx.db.insert(goals).values({
    orgId: ctx.org.id,
    name: name.slice(0, 120),
    boardIds: validIds,
    dueDate: input.dueDate ? new Date(input.dueDate) : null,
    createdBy: ctx.user.id,
  });
  revalidatePath(`/${orgSlug}/goals`);
  return { ok: true };
}

export async function deleteGoalAction(orgSlug: string, goalId: string) {
  const ctx = await requireMember(orgSlug, "manager");
  await ctx.db.update(goals).set({ deletedAt: new Date() }).where(and(eq(goals.id, goalId), eq(goals.orgId, ctx.org.id)));
  revalidatePath(`/${orgSlug}/goals`);
  return { ok: true };
}
