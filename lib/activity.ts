import { eq } from "drizzle-orm";
import { activityLog, appUser, notifications } from "@/db/schema";
import type { Db } from "@/lib/db";
import { emailLive, sendEmail } from "@/lib/email";
import { publish } from "@/lib/events";
import { dispatchIntegrations } from "@/lib/integrations";

function notifSubject(type: string, title: string): string {
  switch (type) {
    case "assigned": return `You were assigned "${title}"`;
    case "submitted": return `"${title}" was submitted for review`;
    case "approved": return `Your work on "${title}" was approved`;
    case "changes_requested": return `Changes requested on "${title}"`;
    case "accepted": return `"${title}" was accepted`;
    case "comment": return `New comment on "${title}"`;
    case "automation": return `Automation update on "${title}"`;
    default: return `Update on "${title}"`;
  }
}

/** Append an immutable audit entry. Call inside the same flow as the mutation. */
export async function recordActivity(
  db: Db,
  args: {
    orgId: string;
    itemId?: string | null;
    actorId?: string | null;
    type: string;
    data?: Record<string, unknown>;
  },
) {
  await db.insert(activityLog).values({
    orgId: args.orgId,
    itemId: args.itemId ?? null,
    actorId: args.actorId ?? null,
    type: args.type,
    data: args.data ?? {},
  });
  publish(args.orgId, { kind: "activity", itemId: args.itemId ?? null });
  await dispatchIntegrations(db, { orgId: args.orgId, itemId: args.itemId, actorId: args.actorId, type: args.type, data: args.data });
}

/**
 * Create an in-app notification. `dedupeKey` makes it idempotent — a retried
 * mutation won't double-notify. Never notifies the actor about their own action.
 */
export async function notify(
  db: Db,
  args: {
    orgId: string;
    userId: string;
    actorId?: string | null;
    type: string;
    itemId?: string | null;
    data?: Record<string, unknown>;
    dedupeKey: string;
  },
) {
  if (args.actorId && args.actorId === args.userId) return; // don't notify yourself
  const inserted = await db
    .insert(notifications)
    .values({
      orgId: args.orgId,
      userId: args.userId,
      actorId: args.actorId ?? null,
      type: args.type,
      itemId: args.itemId ?? null,
      data: args.data ?? {},
      dedupeKey: args.dedupeKey,
    })
    .onConflictDoNothing({ target: notifications.dedupeKey })
    .returning({ id: notifications.id });
  if (inserted.length === 0) return; // deduped — don't re-publish or re-email

  publish(args.orgId, { kind: "notification", userId: args.userId });

  if (emailLive()) {
    const [u] = await db.select({ email: appUser.email }).from(appUser).where(eq(appUser.id, args.userId)).limit(1);
    if (u) {
      const subject = notifSubject(args.type, (args.data?.title as string) ?? "a task");
      await sendEmail({ to: u.email, subject, text: `${subject}\n\nOpen Throughline to view it.` });
    }
  }
}
