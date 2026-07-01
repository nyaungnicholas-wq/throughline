"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { boardColumns, boards, columnLabels, membership, type ColumnType } from "@/db/schema";
import { notify, recordActivity } from "@/lib/activity";
import { assertCan, requireMember } from "@/lib/authz";
import { createBoard } from "@/lib/board/create";
import { randomToken } from "@/lib/crypto";

export async function createBoardAction(
  orgSlug: string,
  input: { name: string; description?: string; template?: string },
): Promise<{ ok: true; boardId: string } | { ok: false; error: string }> {
  const ctx = await requireMember(orgSlug, "manager");
  assertCan(ctx.role, "createBoard");
  const boardId = await createBoard(ctx.db, {
    orgId: ctx.org.id,
    name: input.name,
    description: input.description ?? null,
    createdBy: ctx.user.id,
    template: input.template ?? "task-tracker",
  });
  revalidatePath(`/${orgSlug}`);
  return { ok: true, boardId };
}

export async function renameBoardAction(orgSlug: string, boardId: string, name: string) {
  const ctx = await requireMember(orgSlug, "manager");
  assertCan(ctx.role, "editBoard");
  await ctx.db
    .update(boards)
    .set({ name: name.trim() || "Untitled board" })
    .where(and(eq(boards.id, boardId), eq(boards.orgId, ctx.org.id)));
  revalidatePath(`/${orgSlug}/boards/${boardId}`);
  return { ok: true };
}

export async function deleteBoardAction(orgSlug: string, boardId: string) {
  const ctx = await requireMember(orgSlug, "manager");
  assertCan(ctx.role, "deleteBoard");
  await ctx.db
    .update(boards)
    .set({ deletedAt: new Date() })
    .where(and(eq(boards.id, boardId), eq(boards.orgId, ctx.org.id)));
  revalidatePath(`/${orgSlug}`);
  return { ok: true };
}

/** Delegate the whole board to someone (hand off project ownership). */
export async function setBoardOwnerAction(
  orgSlug: string,
  boardId: string,
  userId: string | null,
): Promise<{ ok: boolean; error?: string }> {
  const ctx = await requireMember(orgSlug);
  const [board] = await ctx.db
    .select({ id: boards.id, ownerId: boards.ownerId, name: boards.name })
    .from(boards)
    .where(and(eq(boards.id, boardId), eq(boards.orgId, ctx.org.id), isNull(boards.deletedAt)))
    .limit(1);
  if (!board) return { ok: false, error: "Board not found." };

  const canManage = ctx.role === "owner" || ctx.role === "manager";
  if (!canManage && board.ownerId !== ctx.user.id) {
    return { ok: false, error: "Only a manager or the current lead can hand off this board." };
  }
  if (userId) {
    const [m] = await ctx.db
      .select({ id: membership.id })
      .from(membership)
      .where(and(eq(membership.orgId, ctx.org.id), eq(membership.userId, userId), isNull(membership.deletedAt)))
      .limit(1);
    if (!m) return { ok: false, error: "That person isn't in this workspace." };
  }

  await ctx.db.update(boards).set({ ownerId: userId }).where(and(eq(boards.id, boardId), eq(boards.orgId, ctx.org.id)));
  await recordActivity(ctx.db, { orgId: ctx.org.id, itemId: null, actorId: ctx.user.id, type: "board_handoff", data: { boardName: board.name } });
  if (userId && userId !== ctx.user.id) {
    await notify(ctx.db, {
      orgId: ctx.org.id,
      userId,
      actorId: ctx.user.id,
      type: "board_owner",
      itemId: null,
      data: { title: board.name },
      dedupeKey: `boardowner:${boardId}:${userId}:${Date.now()}`,
    });
  }
  revalidatePath(`/${orgSlug}`);
  revalidatePath(`/${orgSlug}/boards/${boardId}`);
  return { ok: true };
}

/** Enable/disable a public, read-only share link for a board (manager only). */
export async function setBoardShareAction(
  orgSlug: string,
  boardId: string,
  enable: boolean,
): Promise<{ ok: true; shareToken: string | null } | { ok: false; error: string }> {
  const ctx = await requireMember(orgSlug, "manager");
  assertCan(ctx.role, "editBoard");
  const [board] = await ctx.db
    .select({ id: boards.id, shareToken: boards.shareToken })
    .from(boards)
    .where(and(eq(boards.id, boardId), eq(boards.orgId, ctx.org.id), isNull(boards.deletedAt)))
    .limit(1);
  if (!board) return { ok: false, error: "Board not found." };

  // Reuse the existing token when re-enabling so old links keep working; rotate only when off→on with none.
  const shareToken = enable ? board.shareToken ?? randomToken(18) : null;
  await ctx.db.update(boards).set({ shareToken }).where(and(eq(boards.id, boardId), eq(boards.orgId, ctx.org.id)));
  revalidatePath(`/${orgSlug}/boards/${boardId}`);
  return { ok: true, shareToken };
}

export async function restoreBoardAction(orgSlug: string, boardId: string) {
  const ctx = await requireMember(orgSlug, "manager");
  assertCan(ctx.role, "deleteBoard");
  await ctx.db.update(boards).set({ deletedAt: null }).where(and(eq(boards.id, boardId), eq(boards.orgId, ctx.org.id)));
  revalidatePath(`/${orgSlug}`);
  revalidatePath(`/${orgSlug}/trash`);
  return { ok: true };
}

export async function addColumnAction(
  orgSlug: string,
  boardId: string,
  input: { name: string; type: ColumnType; labels?: string[] },
): Promise<{ ok: boolean; error?: string }> {
  const ctx = await requireMember(orgSlug, "manager");
  assertCan(ctx.role, "editBoard");

  // verify board is in this org
  const [board] = await ctx.db
    .select({ id: boards.id })
    .from(boards)
    .where(and(eq(boards.id, boardId), eq(boards.orgId, ctx.org.id), isNull(boards.deletedAt)))
    .limit(1);
  if (!board) return { ok: false, error: "Board not found." };

  const existing = await ctx.db
    .select({ position: boardColumns.position })
    .from(boardColumns)
    .where(and(eq(boardColumns.boardId, boardId), isNull(boardColumns.deletedAt)));
  const nextPos = existing.reduce((m, c) => Math.max(m, c.position + 1), 0);

  const [col] = await ctx.db
    .insert(boardColumns)
    .values({ orgId: ctx.org.id, boardId, name: input.name.trim() || "Column", type: input.type, position: nextPos })
    .returning({ id: boardColumns.id });

  if ((input.type === "select" || input.type === "status") && input.labels?.length) {
    await ctx.db.insert(columnLabels).values(
      input.labels.map((label, i) => ({
        orgId: ctx.org.id,
        columnId: col.id,
        label: label.trim() || `Option ${i + 1}`,
        color: (i + 1) % 9,
        position: i,
      })),
    );
  }
  revalidatePath(`/${orgSlug}/boards/${boardId}`);
  return { ok: true };
}
