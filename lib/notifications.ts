import { and, count, desc, eq, isNull } from "drizzle-orm";
import { appUser, items, notifications, type Notification } from "@/db/schema";
import type { OrgContext } from "@/lib/authz";

export type NotificationRow = Notification & { actorName: string | null; itemTitle: string | null };

export async function getNotifications(
  ctx: OrgContext,
  limit = 30,
): Promise<{ rows: NotificationRow[]; unread: number }> {
  const rows = await ctx.db
    .select({
      n: notifications,
      actorName: appUser.name,
      actorEmail: appUser.email,
      itemTitle: items.title,
    })
    .from(notifications)
    .leftJoin(appUser, eq(appUser.id, notifications.actorId))
    .leftJoin(items, eq(items.id, notifications.itemId))
    .where(and(eq(notifications.orgId, ctx.org.id), eq(notifications.userId, ctx.user.id)))
    .orderBy(desc(notifications.createdAt))
    .limit(limit);

  const [{ value: unread }] = await ctx.db
    .select({ value: count() })
    .from(notifications)
    .where(
      and(
        eq(notifications.orgId, ctx.org.id),
        eq(notifications.userId, ctx.user.id),
        isNull(notifications.readAt),
      ),
    );

  return {
    rows: rows.map((r) => ({
      ...r.n,
      actorName: r.actorName ?? r.actorEmail ?? null,
      itemTitle: r.itemTitle ?? null,
    })),
    unread,
  };
}
