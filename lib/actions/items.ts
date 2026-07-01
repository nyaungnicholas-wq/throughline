"use server";

import { and, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { boards, items, type Priority } from "@/db/schema";
import { recordActivity } from "@/lib/activity";
import { runAutomations } from "@/lib/automations";
import { requireMember } from "@/lib/authz";
import { writeCell, type CellInput } from "@/lib/board/cells";

async function assertItemInOrg(ctx: Awaited<ReturnType<typeof requireMember>>, itemId: string) {
  const [it] = await ctx.db
    .select({ id: items.id, boardId: items.boardId })
    .from(items)
    .where(and(eq(items.id, itemId), eq(items.orgId, ctx.org.id), isNull(items.deletedAt)))
    .limit(1);
  return it ?? null;
}

export async function createItemAction(
  orgSlug: string,
  boardId: string,
  title: string,
): Promise<{ ok: boolean; itemId?: string; error?: string }> {
  const ctx = await requireMember(orgSlug); // any member can add work
  const [board] = await ctx.db
    .select({ id: boards.id })
    .from(boards)
    .where(and(eq(boards.id, boardId), eq(boards.orgId, ctx.org.id), isNull(boards.deletedAt)))
    .limit(1);
  if (!board) return { ok: false, error: "Board not found." };

  const [{ max }] = await ctx.db
    .select({ max: sql<number>`coalesce(max(${items.position}), -1)` })
    .from(items)
    .where(and(eq(items.boardId, boardId), eq(items.orgId, ctx.org.id)));

  const [created] = await ctx.db
    .insert(items)
    .values({
      orgId: ctx.org.id,
      boardId,
      title: title.trim() || "New task",
      position: Number(max) + 1,
      createdBy: ctx.user.id,
    })
    .returning({ id: items.id });

  await recordActivity(ctx.db, { orgId: ctx.org.id, itemId: created.id, actorId: ctx.user.id, type: "item_created" });
  await runAutomations(ctx, { type: "item_created", boardId, itemId: created.id });
  revalidatePath(`/${orgSlug}/boards/${boardId}`);
  return { ok: true, itemId: created.id };
}

export async function setDescriptionAction(orgSlug: string, itemId: string, description: string | null) {
  const ctx = await requireMember(orgSlug);
  const it = await assertItemInOrg(ctx, itemId);
  if (!it) return { ok: false, error: "Not found." };
  await ctx.db
    .update(items)
    .set({ description: description?.slice(0, 5000) || null })
    .where(and(eq(items.id, itemId), eq(items.orgId, ctx.org.id)));
  revalidatePath(`/${orgSlug}/boards/${it.boardId}`);
  return { ok: true };
}

export async function updateItemTitleAction(orgSlug: string, itemId: string, title: string) {
  const ctx = await requireMember(orgSlug);
  const it = await assertItemInOrg(ctx, itemId);
  if (!it) return { ok: false, error: "Not found." };
  await ctx.db.update(items).set({ title: title.trim() || "Untitled" }).where(and(eq(items.id, itemId), eq(items.orgId, ctx.org.id)));
  revalidatePath(`/${orgSlug}/boards/${it.boardId}`);
  return { ok: true };
}

export async function setPriorityAction(orgSlug: string, itemId: string, priority: Priority | null) {
  const ctx = await requireMember(orgSlug);
  const it = await assertItemInOrg(ctx, itemId);
  if (!it) return { ok: false, error: "Not found." };
  await ctx.db.update(items).set({ priority }).where(and(eq(items.id, itemId), eq(items.orgId, ctx.org.id)));
  revalidatePath(`/${orgSlug}/boards/${it.boardId}`);
  return { ok: true };
}

export async function setRecurrenceAction(orgSlug: string, itemId: string, recurrence: string | null) {
  const ctx = await requireMember(orgSlug);
  const it = await assertItemInOrg(ctx, itemId);
  if (!it) return { ok: false, error: "Not found." };
  const allowed = ["daily", "weekly", "biweekly", "monthly"];
  const value = recurrence && allowed.includes(recurrence) ? recurrence : null;
  await ctx.db.update(items).set({ recurrence: value }).where(and(eq(items.id, itemId), eq(items.orgId, ctx.org.id)));
  revalidatePath(`/${orgSlug}/boards/${it.boardId}`);
  return { ok: true };
}

export async function setDueDateAction(orgSlug: string, itemId: string, dueIso: string | null) {
  const ctx = await requireMember(orgSlug);
  const it = await assertItemInOrg(ctx, itemId);
  if (!it) return { ok: false, error: "Not found." };
  await ctx.db.update(items).set({ dueDate: dueIso ? new Date(dueIso) : null }).where(and(eq(items.id, itemId), eq(items.orgId, ctx.org.id)));
  revalidatePath(`/${orgSlug}/boards/${it.boardId}`);
  return { ok: true };
}

export async function setCellValueAction(
  orgSlug: string,
  itemId: string,
  columnId: string,
  input: CellInput,
): Promise<{ ok: boolean; error?: string }> {
  const ctx = await requireMember(orgSlug);
  const it = await assertItemInOrg(ctx, itemId);
  if (!it) return { ok: false, error: "Not found." };
  const res = await writeCell(ctx, { itemId, columnId, input });
  if (res.ok) revalidatePath(`/${orgSlug}/boards/${it.boardId}`);
  return res;
}

export async function deleteItemAction(orgSlug: string, itemId: string) {
  const ctx = await requireMember(orgSlug, "manager");
  const it = await assertItemInOrg(ctx, itemId);
  if (!it) return { ok: false, error: "Not found." };
  await ctx.db.update(items).set({ deletedAt: new Date() }).where(and(eq(items.id, itemId), eq(items.orgId, ctx.org.id)));
  revalidatePath(`/${orgSlug}/boards/${it.boardId}`);
  return { ok: true };
}

/** Undo a soft-delete (from the Trash view, or an undo affordance). */
export async function restoreItemAction(orgSlug: string, itemId: string): Promise<{ ok: boolean; boardId?: string }> {
  const ctx = await requireMember(orgSlug, "manager");
  const [it] = await ctx.db
    .select({ boardId: items.boardId })
    .from(items)
    .where(and(eq(items.id, itemId), eq(items.orgId, ctx.org.id), isNotNull(items.deletedAt)))
    .limit(1);
  if (!it) return { ok: false };
  await ctx.db.update(items).set({ deletedAt: null }).where(and(eq(items.id, itemId), eq(items.orgId, ctx.org.id)));
  revalidatePath(`/${orgSlug}/trash`);
  revalidatePath(`/${orgSlug}/boards/${it.boardId}`);
  return { ok: true, boardId: it.boardId };
}
