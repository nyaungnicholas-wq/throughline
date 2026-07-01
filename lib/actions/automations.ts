"use server";

import { and, eq, isNull, lt, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { automations, boards, items } from "@/db/schema";
import { runAutomations } from "@/lib/automations";
import { assertCan, requireMember } from "@/lib/authz";

export type ClientAutomation = {
  id: string;
  name: string;
  triggerType: string;
  triggerConfig: Record<string, unknown>;
  actionType: string;
  actionConfig: Record<string, unknown>;
  enabled: boolean;
};

const TRIGGERS = new Set(["status_changed", "item_created", "due_passed"]);
const ACTIONS = new Set(["notify", "set_priority", "assign"]);

async function assertBoard(ctx: Awaited<ReturnType<typeof requireMember>>, boardId: string) {
  const [b] = await ctx.db
    .select({ id: boards.id })
    .from(boards)
    .where(and(eq(boards.id, boardId), eq(boards.orgId, ctx.org.id), isNull(boards.deletedAt)))
    .limit(1);
  return !!b;
}

export async function listAutomationsAction(orgSlug: string, boardId: string): Promise<ClientAutomation[]> {
  const ctx = await requireMember(orgSlug);
  const rows = await ctx.db
    .select()
    .from(automations)
    .where(and(eq(automations.orgId, ctx.org.id), eq(automations.boardId, boardId), isNull(automations.deletedAt)))
    .orderBy(automations.createdAt);
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    triggerType: r.triggerType,
    triggerConfig: (r.triggerConfig ?? {}) as Record<string, unknown>,
    actionType: r.actionType,
    actionConfig: (r.actionConfig ?? {}) as Record<string, unknown>,
    enabled: r.enabled,
  }));
}

export async function createAutomationAction(
  orgSlug: string,
  boardId: string,
  input: { name: string; triggerType: string; triggerConfig: Record<string, unknown>; actionType: string; actionConfig: Record<string, unknown> },
): Promise<{ ok: boolean; error?: string }> {
  const ctx = await requireMember(orgSlug, "manager");
  assertCan(ctx.role, "manageAutomations");
  if (!TRIGGERS.has(input.triggerType) || !ACTIONS.has(input.actionType)) return { ok: false, error: "Invalid rule." };
  if (!(await assertBoard(ctx, boardId))) return { ok: false, error: "Board not found." };

  await ctx.db.insert(automations).values({
    orgId: ctx.org.id,
    boardId,
    name: input.name.trim() || "Automation",
    triggerType: input.triggerType,
    triggerConfig: input.triggerConfig ?? {},
    actionType: input.actionType,
    actionConfig: input.actionConfig ?? {},
    createdBy: ctx.user.id,
  });
  revalidatePath(`/${orgSlug}/boards/${boardId}`);
  return { ok: true };
}

export async function toggleAutomationAction(orgSlug: string, id: string, enabled: boolean) {
  const ctx = await requireMember(orgSlug, "manager");
  await ctx.db.update(automations).set({ enabled }).where(and(eq(automations.id, id), eq(automations.orgId, ctx.org.id)));
  return { ok: true };
}

export async function deleteAutomationAction(orgSlug: string, id: string) {
  const ctx = await requireMember(orgSlug, "manager");
  await ctx.db.update(automations).set({ deletedAt: new Date() }).where(and(eq(automations.id, id), eq(automations.orgId, ctx.org.id)));
  return { ok: true };
}

/** Fire 'due_passed' automations for every currently-overdue task on the board. */
export async function runDueAutomationsAction(orgSlug: string, boardId: string): Promise<{ ok: boolean; fired: number }> {
  const ctx = await requireMember(orgSlug, "manager");
  const overdue = await ctx.db
    .select({ id: items.id })
    .from(items)
    .where(
      and(
        eq(items.orgId, ctx.org.id),
        eq(items.boardId, boardId),
        isNull(items.deletedAt),
        lt(items.dueDate, new Date()),
        ne(items.status, "approved"),
      ),
    );
  for (const it of overdue) {
    await runAutomations(ctx, { type: "due_passed", boardId, itemId: it.id });
  }
  revalidatePath(`/${orgSlug}/boards/${boardId}`);
  return { ok: true, fired: overdue.length };
}
