"use server";

import { and, eq, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { checklistItems, items } from "@/db/schema";
import { requireMember } from "@/lib/authz";

async function itemInOrg(ctx: Awaited<ReturnType<typeof requireMember>>, itemId: string) {
  const [it] = await ctx.db
    .select({ id: items.id })
    .from(items)
    .where(and(eq(items.id, itemId), eq(items.orgId, ctx.org.id), isNull(items.deletedAt)))
    .limit(1);
  return !!it;
}

export async function addChecklistItemAction(orgSlug: string, boardId: string, itemId: string, text: string) {
  const ctx = await requireMember(orgSlug);
  const t = text.trim();
  if (!t) return { ok: false, error: "Empty." };
  if (!(await itemInOrg(ctx, itemId))) return { ok: false, error: "Not found." };
  const [{ max }] = await ctx.db
    .select({ max: sql<number>`coalesce(max(${checklistItems.position}), -1)` })
    .from(checklistItems)
    .where(eq(checklistItems.itemId, itemId));
  await ctx.db.insert(checklistItems).values({ orgId: ctx.org.id, itemId, text: t.slice(0, 300), position: Number(max) + 1 });
  revalidatePath(`/${orgSlug}/boards/${boardId}`);
  return { ok: true };
}

export async function toggleChecklistItemAction(orgSlug: string, boardId: string, id: string, done: boolean) {
  const ctx = await requireMember(orgSlug);
  await ctx.db.update(checklistItems).set({ done }).where(and(eq(checklistItems.id, id), eq(checklistItems.orgId, ctx.org.id)));
  revalidatePath(`/${orgSlug}/boards/${boardId}`);
  return { ok: true };
}

export async function deleteChecklistItemAction(orgSlug: string, boardId: string, id: string) {
  const ctx = await requireMember(orgSlug);
  await ctx.db.delete(checklistItems).where(and(eq(checklistItems.id, id), eq(checklistItems.orgId, ctx.org.id)));
  revalidatePath(`/${orgSlug}/boards/${boardId}`);
  return { ok: true };
}
