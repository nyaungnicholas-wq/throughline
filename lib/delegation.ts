import { and, eq, isNull, ne, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { boards, itemDependencies, items, membership, type Item } from "@/db/schema";
import { recordActivity, notify } from "@/lib/activity";
import { runAutomations } from "@/lib/automations";
import { type OrgContext, can } from "@/lib/authz";
import { TRANSITIONS, type TransitionAction } from "@/lib/delegation-meta";

export { TRANSITIONS, availableActions, type TransitionAction } from "@/lib/delegation-meta";

export type TransitionInput = {
  assigneeId?: string | null;
  reviewNotes?: string | null;
  /** Optimistic-concurrency token; pass the version the client last saw. */
  expectedVersion?: number;
};

export type TransitionResult =
  | { ok: true; item: Item }
  | { ok: false; error: string; code: "invalid" | "forbidden" | "conflict" };

async function isBoardOwner(ctx: OrgContext, boardId: string): Promise<boolean> {
  const [b] = await ctx.db
    .select({ ownerId: boards.ownerId })
    .from(boards)
    .where(and(eq(boards.id, boardId), eq(boards.orgId, ctx.org.id)))
    .limit(1);
  return !!b && b.ownerId === ctx.user.id;
}

async function isOrgMember(ctx: OrgContext, userId: string): Promise<boolean> {
  const rows = await ctx.db
    .select({ id: membership.id })
    .from(membership)
    .where(
      and(
        eq(membership.orgId, ctx.org.id),
        eq(membership.userId, userId),
        isNull(membership.deletedAt),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

function advanceDue(d: Date | null, rule: string): Date {
  const r = new Date(d ?? new Date());
  if (rule === "daily") r.setDate(r.getDate() + 1);
  else if (rule === "weekly") r.setDate(r.getDate() + 7);
  else if (rule === "biweekly") r.setDate(r.getDate() + 14);
  else if (rule === "monthly") r.setMonth(r.getMonth() + 1);
  return r;
}

/** On approving a recurring item, spawn the next occurrence with an advanced due date. */
async function spawnRecurrence(ctx: OrgContext, item: Item): Promise<void> {
  if (!item.recurrence) return;
  const [{ max }] = await ctx.db
    .select({ max: sql<number>`coalesce(max(${items.position}), -1)` })
    .from(items)
    .where(and(eq(items.boardId, item.boardId), eq(items.orgId, ctx.org.id)));
  const [next] = await ctx.db
    .insert(items)
    .values({
      orgId: ctx.org.id,
      boardId: item.boardId,
      title: item.title,
      position: Number(max) + 1,
      status: item.assigneeId ? "assigned" : "unassigned",
      priority: item.priority,
      assigneeId: item.assigneeId,
      assignerId: item.assignerId,
      dueDate: advanceDue(item.dueDate, item.recurrence),
      recurrence: item.recurrence,
      createdBy: item.createdBy,
    })
    .returning({ id: items.id });
  await recordActivity(ctx.db, { orgId: ctx.org.id, itemId: next.id, actorId: ctx.user.id, type: "item_created", data: { recurringFrom: item.id } });
}

/** Count of this item's blockers that aren't yet approved. */
async function openBlockerCount(ctx: OrgContext, itemId: string): Promise<number> {
  const blocker = alias(items, "blk");
  const rows = await ctx.db
    .select({ id: itemDependencies.id })
    .from(itemDependencies)
    .innerJoin(blocker, eq(blocker.id, itemDependencies.blockedById))
    .where(
      and(
        eq(itemDependencies.itemId, itemId),
        eq(itemDependencies.orgId, ctx.org.id),
        isNull(blocker.deletedAt),
        ne(blocker.status, "approved"),
      ),
    );
  return rows.length;
}

/**
 * The ONE place item status changes. Validates the transition, authorizes the
 * actor (role + self-approval guard), enforces optimistic concurrency, writes the
 * update + audit entry + notification — all org-scoped.
 */
export async function runTransition(
  ctx: OrgContext,
  itemId: string,
  action: TransitionAction,
  input: TransitionInput = {},
): Promise<TransitionResult> {
  const def = TRANSITIONS[action];
  if (!def) return { ok: false, error: "Unknown action.", code: "invalid" };

  const [item] = await ctx.db
    .select()
    .from(items)
    .where(and(eq(items.id, itemId), eq(items.orgId, ctx.org.id), isNull(items.deletedAt)))
    .limit(1);
  if (!item) return { ok: false, error: "Item not found.", code: "invalid" };

  if (!def.from.includes(item.status)) {
    return { ok: false, error: `Can't ${def.label.toLowerCase()} from "${item.status}".`, code: "invalid" };
  }

  // ── Authorization ──
  if (def.actor === "manager") {
    const allowed = can(ctx.role, "delegate") || (await isBoardOwner(ctx, item.boardId));
    if (!allowed) return { ok: false, error: "Only the board owner or a manager can do that.", code: "forbidden" };
  } else {
    if (item.assigneeId !== ctx.user.id) {
      return { ok: false, error: "Only the assignee can do that.", code: "forbidden" };
    }
  }
  if (def.notSelf && item.assigneeId === ctx.user.id) {
    return { ok: false, error: "You can't review your own work.", code: "forbidden" };
  }

  // Dependency gate: can't start or submit work that's still blocked.
  if (action === "start" || action === "submit") {
    const open = await openBlockerCount(ctx, itemId);
    if (open > 0) {
      return { ok: false, error: `Blocked by ${open} unfinished task${open === 1 ? "" : "s"}.`, code: "invalid" };
    }
  }

  if (input.expectedVersion != null && input.expectedVersion !== item.version) {
    return { ok: false, error: "This item changed since you loaded it. Refresh and retry.", code: "conflict" };
  }

  // ── Build the update ──
  const now = new Date();
  const patch: Partial<typeof items.$inferInsert> = {
    status: def.to,
    statusEnteredAt: now,
    version: item.version + 1,
  };

  if (action === "assign" || action === "reassign") {
    const assigneeId = input.assigneeId;
    if (!assigneeId) return { ok: false, error: "Pick someone to assign this to.", code: "invalid" };
    if (!(await isOrgMember(ctx, assigneeId))) {
      return { ok: false, error: "That person isn't a member of this workspace.", code: "forbidden" };
    }
    patch.assigneeId = assigneeId;
    patch.assignerId = ctx.user.id;
    patch.submittedAt = null;
    patch.reviewedById = null;
    patch.reviewNotes = null;
  } else if (action === "submit") {
    patch.submittedAt = now;
  } else if (action === "approve") {
    patch.reviewedById = ctx.user.id;
  } else if (action === "requestChanges") {
    patch.reviewedById = ctx.user.id;
    patch.reviewNotes = input.reviewNotes ?? null;
  }

  // Concurrency-guarded write: only updates if version is still what we read.
  const updated = await ctx.db
    .update(items)
    .set(patch)
    .where(and(eq(items.id, itemId), eq(items.orgId, ctx.org.id), eq(items.version, item.version)))
    .returning();
  if (updated.length === 0) {
    return { ok: false, error: "This item changed since you loaded it. Refresh and retry.", code: "conflict" };
  }
  const next = updated[0];

  await recordActivity(ctx.db, {
    orgId: ctx.org.id,
    itemId,
    actorId: ctx.user.id,
    type: `status:${action}`,
    data: { from: item.status, to: def.to, assigneeId: next.assigneeId, notes: input.reviewNotes ?? undefined },
  });

  // ── Notify the right person ──
  const dedupeKey = `${itemId}:${action}:${next.version}`;
  const notifyUser = (userId: string | null, type: string) => {
    if (!userId) return Promise.resolve();
    return notify(ctx.db, {
      orgId: ctx.org.id,
      userId,
      actorId: ctx.user.id,
      type,
      itemId,
      data: { title: next.title },
      dedupeKey,
    });
  };

  if (action === "assign" || action === "reassign") await notifyUser(next.assigneeId, "assigned");
  else if (action === "accept") await notifyUser(next.assignerId, "accepted");
  else if (action === "submit") await notifyUser(next.assignerId, "submitted");
  else if (action === "approve") await notifyUser(next.assigneeId, "approved");
  else if (action === "requestChanges") await notifyUser(next.assigneeId, "changes_requested");

  if (action === "approve" && next.recurrence) {
    await spawnRecurrence(ctx, next).catch((e) => console.error("[recurrence] spawn failed", e));
  }

  await runAutomations(ctx, { type: "status_changed", boardId: next.boardId, itemId, toStatus: def.to });

  return { ok: true, item: next };
}
