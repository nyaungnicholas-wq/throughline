"use server";

import { and, desc, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { webhooks } from "@/db/schema";
import { requireMember } from "@/lib/authz";
import { randomToken } from "@/lib/crypto";
import { isBlockedUrl } from "@/lib/ssrf-guard";

export type ClientWebhook = { id: string; url: string; enabled: boolean; createdAt: string };

export async function listWebhooksAction(orgSlug: string): Promise<ClientWebhook[]> {
  const ctx = await requireMember(orgSlug, "owner");
  const rows = await ctx.db
    .select()
    .from(webhooks)
    .where(and(eq(webhooks.orgId, ctx.org.id), isNull(webhooks.deletedAt)))
    .orderBy(desc(webhooks.createdAt));
  return rows.map((r) => ({ id: r.id, url: r.url, enabled: r.enabled, createdAt: r.createdAt.toISOString() }));
}

export async function createWebhookAction(orgSlug: string, url: string): Promise<{ ok: boolean; secret?: string; error?: string }> {
  const ctx = await requireMember(orgSlug, "owner");
  const u = url.trim();
  if (!/^https?:\/\/.+/i.test(u)) return { ok: false, error: "Enter a valid http(s) URL." };
  if (await isBlockedUrl(u)) return { ok: false, error: "That URL resolves to a private or internal address." };
  const secret = `whsec_${randomToken(24)}`;
  await ctx.db.insert(webhooks).values({ orgId: ctx.org.id, url: u.slice(0, 500), secret, createdBy: ctx.user.id });
  revalidatePath(`/${orgSlug}/settings`);
  return { ok: true, secret }; // shown once — used to verify the X-Throughline-Signature
}

export async function deleteWebhookAction(orgSlug: string, id: string) {
  const ctx = await requireMember(orgSlug, "owner");
  await ctx.db.update(webhooks).set({ deletedAt: new Date() }).where(and(eq(webhooks.id, id), eq(webhooks.orgId, ctx.org.id)));
  revalidatePath(`/${orgSlug}/settings`);
  return { ok: true };
}
