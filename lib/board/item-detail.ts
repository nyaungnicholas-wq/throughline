import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import {
  activityLog,
  appUser,
  attachments,
  checklistItems,
  comments,
  itemDependencies,
  items,
  timeEntries,
  type ChecklistItem,
  type Item,
  type ItemStatus,
} from "@/db/schema";
import type { OrgContext } from "@/lib/authz";

export type DetailComment = { id: string; body: string; authorName: string | null; createdAt: Date };
export type DetailActivity = { id: string; type: string; actorName: string | null; data: Record<string, unknown>; createdAt: Date };
export type DetailAttachment = { id: string; filename: string; mimeType: string; sizeBytes: number; uploaderName: string | null; createdAt: Date };

export type DepRef = { depId: string; id: string; title: string; status: ItemStatus };
export type DetailTime = { id: string; minutes: number; note: string | null; userName: string | null; createdAt: Date };

export type ItemDetail = {
  item: Item & { assigneeName: string | null; assignerName: string | null; reviewerName: string | null };
  comments: DetailComment[];
  activity: DetailActivity[];
  attachments: DetailAttachment[];
  checklist: ChecklistItem[];
  blockers: DepRef[]; // items blocking THIS one
  blocking: DepRef[]; // items THIS one blocks
  timeEntries: DetailTime[];
  spentMinutes: number;
};

export async function loadItemDetail(ctx: OrgContext, itemId: string): Promise<ItemDetail | null> {
  const [it] = await ctx.db
    .select()
    .from(items)
    .where(and(eq(items.id, itemId), eq(items.orgId, ctx.org.id), isNull(items.deletedAt)))
    .limit(1);
  if (!it) return null;

  const ids = [it.assigneeId, it.assignerId, it.reviewedById].filter(Boolean) as string[];
  const users = ids.length
    ? await ctx.db.select({ id: appUser.id, name: appUser.name, email: appUser.email }).from(appUser).where(inArray(appUser.id, ids))
    : [];
  const nameOf = (id: string | null) => {
    if (!id) return null;
    const u = users.find((x) => x.id === id);
    return u ? u.name ?? u.email : null;
  };

  const commentRows = await ctx.db
    .select({ id: comments.id, body: comments.body, createdAt: comments.createdAt, name: appUser.name, email: appUser.email })
    .from(comments)
    .leftJoin(appUser, eq(appUser.id, comments.authorId))
    .where(and(eq(comments.itemId, itemId), eq(comments.orgId, ctx.org.id), isNull(comments.deletedAt)))
    .orderBy(asc(comments.createdAt));

  const activityRows = await ctx.db
    .select({ id: activityLog.id, type: activityLog.type, data: activityLog.data, createdAt: activityLog.createdAt, name: appUser.name, email: appUser.email })
    .from(activityLog)
    .leftJoin(appUser, eq(appUser.id, activityLog.actorId))
    .where(and(eq(activityLog.itemId, itemId), eq(activityLog.orgId, ctx.org.id)))
    .orderBy(desc(activityLog.createdAt))
    .limit(50);

  const attachmentRows = await ctx.db
    .select({ id: attachments.id, filename: attachments.filename, mimeType: attachments.mimeType, sizeBytes: attachments.sizeBytes, createdAt: attachments.createdAt, name: appUser.name, email: appUser.email })
    .from(attachments)
    .leftJoin(appUser, eq(appUser.id, attachments.uploaderId))
    .where(and(eq(attachments.itemId, itemId), eq(attachments.orgId, ctx.org.id)))
    .orderBy(desc(attachments.createdAt));

  const checklist = await ctx.db
    .select()
    .from(checklistItems)
    .where(and(eq(checklistItems.itemId, itemId), eq(checklistItems.orgId, ctx.org.id)))
    .orderBy(asc(checklistItems.position), asc(checklistItems.createdAt));

  const blocker = alias(items, "blocker");
  const blockers = await ctx.db
    .select({ depId: itemDependencies.id, id: blocker.id, title: blocker.title, status: blocker.status })
    .from(itemDependencies)
    .innerJoin(blocker, eq(blocker.id, itemDependencies.blockedById))
    .where(and(eq(itemDependencies.itemId, itemId), eq(itemDependencies.orgId, ctx.org.id), isNull(blocker.deletedAt)));

  const dependent = alias(items, "dependent");
  const blocking = await ctx.db
    .select({ depId: itemDependencies.id, id: dependent.id, title: dependent.title, status: dependent.status })
    .from(itemDependencies)
    .innerJoin(dependent, eq(dependent.id, itemDependencies.itemId))
    .where(and(eq(itemDependencies.blockedById, itemId), eq(itemDependencies.orgId, ctx.org.id), isNull(dependent.deletedAt)));

  const timeRows = await ctx.db
    .select({ id: timeEntries.id, minutes: timeEntries.minutes, note: timeEntries.note, createdAt: timeEntries.createdAt, name: appUser.name, email: appUser.email })
    .from(timeEntries)
    .leftJoin(appUser, eq(appUser.id, timeEntries.userId))
    .where(and(eq(timeEntries.itemId, itemId), eq(timeEntries.orgId, ctx.org.id)))
    .orderBy(desc(timeEntries.createdAt));
  const spentMinutes = timeRows.reduce((s, r) => s + r.minutes, 0);

  return {
    item: { ...it, assigneeName: nameOf(it.assigneeId), assignerName: nameOf(it.assignerId), reviewerName: nameOf(it.reviewedById) },
    comments: commentRows.map((c) => ({ id: c.id, body: c.body, createdAt: c.createdAt, authorName: c.name ?? c.email ?? null })),
    activity: activityRows.map((a) => ({ id: a.id, type: a.type, data: (a.data ?? {}) as Record<string, unknown>, createdAt: a.createdAt, actorName: a.name ?? a.email ?? null })),
    attachments: attachmentRows.map((a) => ({ id: a.id, filename: a.filename, mimeType: a.mimeType, sizeBytes: a.sizeBytes, createdAt: a.createdAt, uploaderName: a.name ?? a.email ?? null })),
    checklist,
    blockers,
    blocking,
    timeEntries: timeRows.map((r) => ({ id: r.id, minutes: r.minutes, note: r.note, createdAt: r.createdAt, userName: r.name ?? r.email ?? null })),
    spentMinutes,
  };
}
