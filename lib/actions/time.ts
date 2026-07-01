"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { items, timeEntries } from "@/db/schema";
import { requireMember } from "@/lib/authz";

async function itemBoard(ctx: Awaited<ReturnType<typeof requireMember>>, itemId: string): Promise<string | null> {
  const [it] = await ctx.db
    .select({ boardId: items.boardId })
    .from(items)
    .where(and(eq(items.id, itemId), eq(items.orgId, ctx.org.id), isNull(items.deletedAt)))
    .limit(1);
  return it?.boardId ?? null;
}

export async function setEstimateAction(orgSlug: string, itemId: string, minutes: number | null) {
  const ctx = await requireMember(orgSlug);
  const boardId = await itemBoard(ctx, itemId);
  if (!boardId) return { ok: false, error: "Not found." };
  const m = minutes != null && minutes >= 0 ? Math.round(minutes) : null;
  await ctx.db.update(items).set({ estimateMinutes: m }).where(and(eq(items.id, itemId), eq(items.orgId, ctx.org.id)));
  revalidatePath(`/${orgSlug}/boards/${boardId}`);
  return { ok: true };
}

export async function logTimeAction(orgSlug: string, itemId: string, minutes: number, note?: string) {
  const ctx = await requireMember(orgSlug);
  if (!(minutes > 0)) return { ok: false, error: "Enter minutes greater than 0." };
  const boardId = await itemBoard(ctx, itemId);
  if (!boardId) return { ok: false, error: "Not found." };
  await ctx.db.insert(timeEntries).values({
    orgId: ctx.org.id,
    itemId,
    userId: ctx.user.id,
    minutes: Math.round(minutes),
    note: note?.trim().slice(0, 200) || null,
  });
  revalidatePath(`/${orgSlug}/boards/${boardId}`);
  return { ok: true };
}

export async function deleteTimeEntryAction(orgSlug: string, entryId: string) {
  const ctx = await requireMember(orgSlug);
  const [entry] = await ctx.db
    .select({ id: timeEntries.id, userId: timeEntries.userId, itemId: timeEntries.itemId })
    .from(timeEntries)
    .where(and(eq(timeEntries.id, entryId), eq(timeEntries.orgId, ctx.org.id)))
    .limit(1);
  if (!entry) return { ok: false, error: "Not found." };
  const isManager = ctx.role === "owner" || ctx.role === "manager";
  if (entry.userId !== ctx.user.id && !isManager) return { ok: false, error: "You can only remove your own time." };
  await ctx.db.delete(timeEntries).where(and(eq(timeEntries.id, entryId), eq(timeEntries.orgId, ctx.org.id)));
  const boardId = await itemBoard(ctx, entry.itemId);
  if (boardId) revalidatePath(`/${orgSlug}/boards/${boardId}`);
  return { ok: true };
}
