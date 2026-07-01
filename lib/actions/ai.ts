"use server";

import { and, asc, desc, eq, isNull, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import {
  activityLog,
  appUser,
  boardColumns,
  boards,
  comments,
  items,
  itemValues,
} from "@/db/schema";
import { recordActivity } from "@/lib/activity";
import { aiStatus } from "@/lib/ai/client";
import {
  aiAnswerWorkspace,
  aiGenerateTasks,
  aiSuggestDelegation,
  aiSummarizeBoard,
  aiSummarizeThread,
  type DelegationSuggestion,
  type WorkspaceContext,
} from "@/lib/ai/features";
import { assertCan, requireMember, type OrgContext } from "@/lib/authz";
import { getOrgMembers } from "@/lib/board/snapshot";
import { createBoard } from "@/lib/board/create";

export async function getAiStatusAction() {
  return aiStatus();
}

/** Map of userId → count of active (non-approved, non-unassigned) assigned items. */
async function activeCounts(ctx: OrgContext): Promise<Map<string, number>> {
  const rows = await ctx.db
    .select({ userId: items.assigneeId, n: sql<number>`count(*)` })
    .from(items)
    .where(
      and(
        eq(items.orgId, ctx.org.id),
        isNull(items.deletedAt),
        ne(items.status, "approved"),
        ne(items.status, "unassigned"),
      ),
    )
    .groupBy(items.assigneeId);
  const m = new Map<string, number>();
  for (const r of rows) if (r.userId) m.set(r.userId, Number(r.n));
  return m;
}

/* ── 1. Generate a board from a brief ── */
export async function aiGenerateBoardAction(
  orgSlug: string,
  input: { name: string; brief: string },
): Promise<{ ok: true; boardId: string; taskCount: number } | { ok: false; error: string }> {
  const ctx = await requireMember(orgSlug, "manager");
  assertCan(ctx.role, "createBoard");
  if (input.brief.trim().length < 8) return { ok: false, error: "Add a sentence or two describing the project." };

  const members = await getOrgMembers(ctx);
  const nameOf = new Map(members.map((m) => [m.name ?? m.email, m]));

  let tasks;
  try {
    tasks = await aiGenerateTasks(input.brief, members.map((m) => m.name ?? m.email));
  } catch (e) {
    return { ok: false, error: `AI request failed: ${(e as Error).message}` };
  }

  const boardId = await createBoard(ctx.db, {
    orgId: ctx.org.id,
    name: input.name.trim() || "AI Board",
    description: input.brief.slice(0, 180),
    createdBy: ctx.user.id,
    template: "task-tracker",
  });
  const [notesCol] = await ctx.db
    .select({ id: boardColumns.id })
    .from(boardColumns)
    .where(and(eq(boardColumns.boardId, boardId), eq(boardColumns.name, "Notes")))
    .limit(1);

  let pos = 0;
  for (const t of tasks) {
    const assignee = t.assignee ? nameOf.get(t.assignee) : null;
    const [it] = await ctx.db
      .insert(items)
      .values({
        orgId: ctx.org.id,
        boardId,
        title: t.title,
        position: pos++,
        priority: t.priority,
        status: assignee ? "assigned" : "unassigned",
        assigneeId: assignee?.id ?? null,
        assignerId: assignee ? ctx.user.id : null,
        dueDate: t.dueInDays != null ? new Date(Date.now() + t.dueInDays * 86400_000) : null,
        createdBy: ctx.user.id,
      })
      .returning({ id: items.id });
    if (t.notes && notesCol) {
      await ctx.db.insert(itemValues).values({ orgId: ctx.org.id, itemId: it.id, columnId: notesCol.id, valueText: t.notes });
    }
    await recordActivity(ctx.db, { orgId: ctx.org.id, itemId: it.id, actorId: ctx.user.id, type: "item_created", data: { ai: true } });
  }

  revalidatePath(`/${orgSlug}`);
  return { ok: true, boardId, taskCount: tasks.length };
}

/* ── 2a. Summarize a task thread ── */
export async function aiSummarizeThreadAction(
  orgSlug: string,
  itemId: string,
): Promise<{ ok: boolean; summary?: string; error?: string }> {
  const ctx = await requireMember(orgSlug);
  const [it] = await ctx.db
    .select({ title: items.title })
    .from(items)
    .where(and(eq(items.id, itemId), eq(items.orgId, ctx.org.id), isNull(items.deletedAt)))
    .limit(1);
  if (!it) return { ok: false, error: "Item not found." };

  const cs = await ctx.db
    .select({ body: comments.body, name: appUser.name, email: appUser.email })
    .from(comments)
    .leftJoin(appUser, eq(appUser.id, comments.authorId))
    .where(and(eq(comments.itemId, itemId), eq(comments.orgId, ctx.org.id), isNull(comments.deletedAt)))
    .orderBy(asc(comments.createdAt));
  const [{ n }] = await ctx.db
    .select({ n: sql<number>`count(*)` })
    .from(activityLog)
    .where(and(eq(activityLog.itemId, itemId), eq(activityLog.orgId, ctx.org.id)));

  try {
    const summary = await aiSummarizeThread(
      it.title,
      cs.map((c) => ({ author: c.name ?? c.email ?? "Someone", body: c.body })),
      Number(n),
    );
    return { ok: true, summary };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/* ── 2b. Summarize a board's health ── */
export async function aiSummarizeBoardAction(
  orgSlug: string,
  boardId: string,
): Promise<{ ok: boolean; summary?: string; error?: string }> {
  const ctx = await requireMember(orgSlug);
  const [board] = await ctx.db
    .select({ name: boards.name })
    .from(boards)
    .where(and(eq(boards.id, boardId), eq(boards.orgId, ctx.org.id), isNull(boards.deletedAt)))
    .limit(1);
  if (!board) return { ok: false, error: "Board not found." };

  const rows = await ctx.db
    .select({ status: items.status, assigneeId: items.assigneeId, dueDate: items.dueDate })
    .from(items)
    .where(and(eq(items.boardId, boardId), eq(items.orgId, ctx.org.id), isNull(items.deletedAt)));

  const byStatus: Record<string, number> = {};
  let overdue = 0;
  const perPerson = new Map<string, number>();
  const now = Date.now();
  for (const r of rows) {
    byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
    if (r.dueDate && r.dueDate.getTime() < now && r.status !== "approved") overdue++;
    if (r.assigneeId && r.status !== "approved") perPerson.set(r.assigneeId, (perPerson.get(r.assigneeId) ?? 0) + 1);
  }
  const members = await getOrgMembers(ctx);
  const nameById = new Map(members.map((m) => [m.id, m.name ?? m.email]));
  const topPeople = [...perPerson.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([id, n]) => ({ name: nameById.get(id) ?? "Someone", active: n }));

  try {
    const summary = await aiSummarizeBoard(board.name, { total: rows.length, byStatus, overdue, topPeople });
    return { ok: true, summary };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/* ── 3. Delegation suggestion (does not apply — the drawer applies it) ── */
export async function aiSuggestDelegationAction(
  orgSlug: string,
  itemId: string,
): Promise<{ ok: boolean; suggestion?: DelegationSuggestion; error?: string }> {
  const ctx = await requireMember(orgSlug, "manager");
  const [it] = await ctx.db
    .select({ title: items.title })
    .from(items)
    .where(and(eq(items.id, itemId), eq(items.orgId, ctx.org.id), isNull(items.deletedAt)))
    .limit(1);
  if (!it) return { ok: false, error: "Item not found." };

  const members = await getOrgMembers(ctx);
  const counts = await activeCounts(ctx);
  try {
    const suggestion = await aiSuggestDelegation(
      it.title,
      members.map((m) => ({ id: m.id, name: m.name ?? m.email, active: counts.get(m.id) ?? 0 })),
    );
    return { ok: true, suggestion };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/* ── 4. Ask-your-workspace ── */
export async function aiAskAction(
  orgSlug: string,
  question: string,
): Promise<{ ok: boolean; answer?: string; error?: string }> {
  const ctx = await requireMember(orgSlug);
  if (question.trim().length < 2) return { ok: false, error: "Ask a question." };

  const rows = await ctx.db
    .select({
      board: boards.name,
      title: items.title,
      status: items.status,
      priority: items.priority,
      dueDate: items.dueDate,
      assignee: appUser.name,
      assigneeEmail: appUser.email,
    })
    .from(items)
    .innerJoin(boards, eq(boards.id, items.boardId))
    .leftJoin(appUser, eq(appUser.id, items.assigneeId))
    .where(and(eq(items.orgId, ctx.org.id), isNull(items.deletedAt), isNull(boards.deletedAt)))
    .orderBy(desc(items.createdAt))
    .limit(300);

  const now = Date.now();
  const boardMap = new Map<string, WorkspaceContext["boards"][number]>();
  for (const r of rows) {
    if (!boardMap.has(r.board)) boardMap.set(r.board, { name: r.board, items: [] });
    boardMap.get(r.board)!.items.push({
      title: r.title,
      status: r.status,
      assignee: r.assignee ?? r.assigneeEmail ?? null,
      priority: r.priority,
      overdue: !!(r.dueDate && r.dueDate.getTime() < now && r.status !== "approved"),
    });
  }

  try {
    const answer = await aiAnswerWorkspace(question, { boards: [...boardMap.values()] });
    return { ok: true, answer };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
