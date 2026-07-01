import { and, eq, isNull } from "drizzle-orm";
import { automations, items, membership, type Automation, type Item, type ItemStatus, type Priority } from "@/db/schema";
import { notify, recordActivity } from "@/lib/activity";
import type { OrgContext } from "@/lib/authz";

export type AutomationEvent =
  | { type: "status_changed"; boardId: string; itemId: string; toStatus: ItemStatus }
  | { type: "item_created"; boardId: string; itemId: string }
  | { type: "due_passed"; boardId: string; itemId: string };

async function isOrgMember(ctx: OrgContext, userId: string): Promise<boolean> {
  const rows = await ctx.db
    .select({ id: membership.id })
    .from(membership)
    .where(and(eq(membership.orgId, ctx.org.id), eq(membership.userId, userId), isNull(membership.deletedAt)))
    .limit(1);
  return rows.length > 0;
}

/**
 * Fire any matching board automations for an event. Best-effort: failures are
 * logged, never thrown, so a rule can't break the user's mutation. Automation
 * actions never change status, so they can't re-trigger status_changed (no loops).
 */
export async function runAutomations(ctx: OrgContext, event: AutomationEvent): Promise<void> {
  try {
    const rules = await ctx.db
      .select()
      .from(automations)
      .where(
        and(
          eq(automations.orgId, ctx.org.id),
          eq(automations.boardId, event.boardId),
          eq(automations.triggerType, event.type),
          eq(automations.enabled, true),
          isNull(automations.deletedAt),
        ),
      );
    if (rules.length === 0) return;

    const [item] = await ctx.db
      .select()
      .from(items)
      .where(and(eq(items.id, event.itemId), eq(items.orgId, ctx.org.id), isNull(items.deletedAt)))
      .limit(1);
    if (!item) return;

    for (const rule of rules) {
      if (event.type === "status_changed") {
        const want = (rule.triggerConfig as { toStatus?: string } | null)?.toStatus;
        if (want && want !== event.toStatus) continue;
      }
      await execAction(ctx, rule, item).catch((e) => console.error(`[automation ${rule.id}] action failed`, e));
    }
  } catch (e) {
    console.error("[automations] evaluation failed", e);
  }
}

async function execAction(ctx: OrgContext, rule: Automation, item: Item): Promise<void> {
  const cfg = (rule.actionConfig ?? {}) as { target?: string; userId?: string; priority?: string };

  if (rule.actionType === "notify") {
    const target = cfg.target ?? "assignee";
    let userId: string | null | undefined;
    if (target === "user") {
      // A 'user' target is an admin-supplied UUID — it must be a member of THIS org.
      // (assignee/assigner come from the item, which is already org-scoped, so they're safe.)
      userId = cfg.userId && (await isOrgMember(ctx, cfg.userId)) ? cfg.userId : null;
    } else {
      userId = target === "assigner" ? item.assignerId : item.assigneeId;
    }
    if (userId) {
      await notify(ctx.db, {
        orgId: ctx.org.id,
        userId,
        actorId: null,
        type: "automation",
        itemId: item.id,
        data: { title: item.title, rule: rule.name },
        dedupeKey: `auto:${rule.id}:${item.id}:${item.version}`,
      });
    }
  } else if (rule.actionType === "set_priority") {
    const p = cfg.priority as Priority | undefined;
    if (p && item.priority !== p) {
      await ctx.db.update(items).set({ priority: p }).where(and(eq(items.id, item.id), eq(items.orgId, ctx.org.id)));
    }
  } else if (rule.actionType === "assign") {
    const userId = cfg.userId;
    if (userId && item.assigneeId !== userId && (await isOrgMember(ctx, userId))) {
      await ctx.db
        .update(items)
        .set({
          assigneeId: userId,
          assignerId: rule.createdBy,
          ...(item.status === "unassigned" ? { status: "assigned" as ItemStatus, statusEnteredAt: new Date() } : {}),
        })
        .where(and(eq(items.id, item.id), eq(items.orgId, ctx.org.id)));
      await notify(ctx.db, {
        orgId: ctx.org.id,
        userId,
        actorId: null,
        type: "assigned",
        itemId: item.id,
        data: { title: item.title },
        dedupeKey: `auto-assign:${rule.id}:${item.id}:${item.version}`,
      });
    }
  }

  await recordActivity(ctx.db, {
    orgId: ctx.org.id,
    itemId: item.id,
    actorId: null,
    type: "automation_ran",
    data: { rule: rule.name, action: rule.actionType },
  });
}
