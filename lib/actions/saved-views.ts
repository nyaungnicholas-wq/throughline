"use server";

import { and, asc, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { boards, savedViews } from "@/db/schema";
import { requireMember } from "@/lib/authz";

export type ClientSavedView = { id: string; name: string; config: Record<string, unknown> };

export async function listSavedViewsAction(orgSlug: string, boardId: string): Promise<ClientSavedView[]> {
  const ctx = await requireMember(orgSlug);
  const rows = await ctx.db
    .select({ id: savedViews.id, name: savedViews.name, config: savedViews.config })
    .from(savedViews)
    .where(and(eq(savedViews.orgId, ctx.org.id), eq(savedViews.boardId, boardId)))
    .orderBy(asc(savedViews.createdAt));
  return rows.map((r) => ({ id: r.id, name: r.name, config: (r.config ?? {}) as Record<string, unknown> }));
}

export async function createSavedViewAction(
  orgSlug: string,
  boardId: string,
  name: string,
  config: Record<string, unknown>,
): Promise<{ ok: boolean; error?: string }> {
  const ctx = await requireMember(orgSlug);
  const n = name.trim();
  if (!n) return { ok: false, error: "Name it first." };
  const [b] = await ctx.db
    .select({ id: boards.id })
    .from(boards)
    .where(and(eq(boards.id, boardId), eq(boards.orgId, ctx.org.id), isNull(boards.deletedAt)))
    .limit(1);
  if (!b) return { ok: false, error: "Board not found." };
  await ctx.db.insert(savedViews).values({ orgId: ctx.org.id, boardId, name: n.slice(0, 80), config, createdBy: ctx.user.id });
  revalidatePath(`/${orgSlug}/boards/${boardId}`);
  return { ok: true };
}

export async function deleteSavedViewAction(orgSlug: string, id: string) {
  const ctx = await requireMember(orgSlug);
  await ctx.db.delete(savedViews).where(and(eq(savedViews.id, id), eq(savedViews.orgId, ctx.org.id)));
  return { ok: true };
}
