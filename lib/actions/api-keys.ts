"use server";

import { and, desc, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { apiKeys } from "@/db/schema";
import { requireMember } from "@/lib/authz";
import { randomToken, sha256hex } from "@/lib/crypto";

export type ClientApiKey = { id: string; name: string; prefix: string; createdAt: string; lastUsedAt: string | null };

export async function listApiKeysAction(orgSlug: string): Promise<ClientApiKey[]> {
  const ctx = await requireMember(orgSlug, "owner");
  const rows = await ctx.db
    .select()
    .from(apiKeys)
    .where(and(eq(apiKeys.orgId, ctx.org.id), isNull(apiKeys.revokedAt)))
    .orderBy(desc(apiKeys.createdAt));
  return rows.map((r) => ({ id: r.id, name: r.name, prefix: r.prefix, createdAt: r.createdAt.toISOString(), lastUsedAt: r.lastUsedAt?.toISOString() ?? null }));
}

export async function createApiKeyAction(orgSlug: string, name: string): Promise<{ ok: boolean; key?: string; error?: string }> {
  const ctx = await requireMember(orgSlug, "owner");
  const n = name.trim() || "API key";
  const key = `tl_${randomToken(24)}`;
  await ctx.db.insert(apiKeys).values({ orgId: ctx.org.id, name: n.slice(0, 60), keyHash: sha256hex(key), prefix: key.slice(0, 11), createdBy: ctx.user.id });
  revalidatePath(`/${orgSlug}/settings`);
  return { ok: true, key }; // shown exactly once
}

export async function revokeApiKeyAction(orgSlug: string, id: string) {
  const ctx = await requireMember(orgSlug, "owner");
  await ctx.db.update(apiKeys).set({ revokedAt: new Date() }).where(and(eq(apiKeys.id, id), eq(apiKeys.orgId, ctx.org.id)));
  revalidatePath(`/${orgSlug}/settings`);
  return { ok: true };
}
