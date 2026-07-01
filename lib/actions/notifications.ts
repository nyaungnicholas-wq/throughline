"use server";

import { and, eq, isNull } from "drizzle-orm";
import { notifications } from "@/db/schema";
import { requireMember } from "@/lib/authz";

export async function markAllReadAction(orgSlug: string) {
  const ctx = await requireMember(orgSlug);
  await ctx.db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(notifications.orgId, ctx.org.id),
        eq(notifications.userId, ctx.user.id),
        isNull(notifications.readAt),
      ),
    );
  return { ok: true };
}

export async function markReadAction(orgSlug: string, id: string) {
  const ctx = await requireMember(orgSlug);
  await ctx.db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(notifications.id, id),
        eq(notifications.orgId, ctx.org.id),
        eq(notifications.userId, ctx.user.id),
      ),
    );
  return { ok: true };
}
