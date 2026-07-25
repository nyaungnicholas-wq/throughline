import { createHmac } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { appUser, items, organizations, webhooks } from "@/db/schema";
import type { Db } from "@/lib/db";
import { isBlockedUrl } from "@/lib/ssrf-guard";

function slackVerb(type: string): string {
  if (type === "item_created") return "created";
  if (type === "comment_added") return "commented on";
  if (type === "attachment_added") return "attached a file to";
  if (type === "automation_ran") return "ran an automation on";
  if (type.startsWith("status:")) {
    const a = type.slice(7);
    return a === "approve" ? "approved" : a === "submit" ? "submitted" : a === "requestChanges" ? "requested changes on" : `${a}ed`;
  }
  return "updated";
}

export type IntegrationEvent = {
  orgId: string;
  itemId?: string | null;
  actorId?: string | null;
  type: string;
  data?: Record<string, unknown>;
};

/**
 * Best-effort fan-out of an activity event to Slack + outbound webhooks. Never
 * throws into the caller's mutation. Most orgs have neither configured, so the
 * hot path is two empty indexed lookups.
 */
export async function dispatchIntegrations(db: Db, a: IntegrationEvent): Promise<void> {
  try {
    // ── Slack mirror ──
    const [org] = await db
      .select({ slack: organizations.slackWebhookUrl })
      .from(organizations)
      .where(eq(organizations.id, a.orgId))
      .limit(1);
    if (org?.slack && !(await isBlockedUrl(org.slack))) {
      let title = (a.data?.title as string) || null;
      if (!title && a.itemId) {
        const [it] = await db.select({ title: items.title }).from(items).where(eq(items.id, a.itemId)).limit(1);
        title = it?.title ?? null;
      }
      let actor = "Someone";
      if (a.actorId) {
        const [u] = await db.select({ name: appUser.name, email: appUser.email }).from(appUser).where(eq(appUser.id, a.actorId)).limit(1);
        actor = u?.name || u?.email || "Someone";
      }
      const text = `${actor} ${slackVerb(a.type)}${title ? ` "${title}"` : " a task"}`;
      await postSlack(org.slack, text);
    }

    // ── Outbound webhooks (HMAC-signed) ──
    const hooks = await db
      .select()
      .from(webhooks)
      .where(and(eq(webhooks.orgId, a.orgId), eq(webhooks.enabled, true), isNull(webhooks.deletedAt)));
    if (hooks.length) {
      // Re-check each URL at dispatch time (defends pre-existing rows + DNS rebinding).
      const safe = [];
      for (const h of hooks) if (!(await isBlockedUrl(h.url))) safe.push(h);
      if (safe.length) {
        const payload = JSON.stringify({
          event: a.type,
          orgId: a.orgId,
          itemId: a.itemId ?? null,
          actorId: a.actorId ?? null,
          data: a.data ?? {},
          sentAt: new Date().toISOString(),
        });
        await Promise.allSettled(
          safe.map((h) => {
            const sig = createHmac("sha256", h.secret).update(payload).digest("hex");
            return fetch(h.url, {
              method: "POST",
              headers: { "Content-Type": "application/json", "X-Throughline-Signature": `sha256=${sig}` },
              body: payload,
              // Do NOT follow redirects: the URL was SSRF-validated, but a 3xx
              // could send this POST to an internal/metadata target. Treat a
              // redirect as a failed delivery instead of following it.
              redirect: "manual",
            });
          }),
        );
      }
    }
  } catch (e) {
    console.error("[integrations] dispatch failed", e);
  }
}

async function postSlack(url: string, text: string): Promise<void> {
  try {
    await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }), redirect: "manual" });
  } catch (e) {
    console.error("[slack] post failed", e);
  }
}
