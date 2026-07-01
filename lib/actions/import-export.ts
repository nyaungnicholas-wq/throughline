"use server";

import { and, eq, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { boardColumns, boards, items, itemValues, type Priority } from "@/db/schema";
import { recordActivity } from "@/lib/activity";
import { requireMember } from "@/lib/authz";
import { parseCsv } from "@/lib/csv";

type Parsed = { title: string; priority: Priority | null; dueDate: Date | null; notes: string | null };

const PRIORITIES = ["low", "medium", "high", "urgent"];
function toDate(s: string): Date | null {
  const d = new Date(s);
  return s && !isNaN(d.getTime()) ? d : null;
}

/** Import tasks from a CSV (Asana/monday/Trello-CSV exports) or Trello board JSON. */
export async function importItemsAction(
  orgSlug: string,
  boardId: string,
  format: "csv" | "trello",
  content: string,
): Promise<{ ok: boolean; count?: number; error?: string }> {
  const ctx = await requireMember(orgSlug, "manager");
  const [board] = await ctx.db
    .select({ id: boards.id })
    .from(boards)
    .where(and(eq(boards.id, boardId), eq(boards.orgId, ctx.org.id), isNull(boards.deletedAt)))
    .limit(1);
  if (!board) return { ok: false, error: "Board not found." };

  let tasks: Parsed[] = [];

  if (format === "trello") {
    let json: { cards?: Array<{ name?: string; due?: string; desc?: string; closed?: boolean }> };
    try {
      json = JSON.parse(content);
    } catch {
      return { ok: false, error: "That doesn't look like a Trello JSON export." };
    }
    tasks = (json.cards ?? [])
      .filter((c) => !c.closed && c.name)
      .map((c) => ({ title: String(c.name).slice(0, 200), priority: null, dueDate: c.due ? toDate(c.due) : null, notes: c.desc ? String(c.desc).slice(0, 500) : null }));
  } else {
    const rows = parseCsv(content);
    if (rows.length < 2) return { ok: false, error: "No data rows found in the CSV." };
    const header = rows[0].map((h) => h.trim().toLowerCase());
    const idx = (names: string[]) => names.map((n) => header.indexOf(n)).find((i) => i >= 0) ?? -1;
    const ti = idx(["title", "name", "task", "task name", "item", "item name"]);
    const pi = idx(["priority"]);
    const di = idx(["due", "due date", "duedate", "deadline", "due_date"]);
    const ni = idx(["notes", "description", "details", "note"]);
    if (ti < 0) return { ok: false, error: "Couldn't find a Title/Name column in the CSV header." };
    for (let r = 1; r < rows.length; r++) {
      const row = rows[r];
      const title = (row[ti] ?? "").trim();
      if (!title) continue;
      const pr = pi >= 0 ? (row[pi] ?? "").trim().toLowerCase() : "";
      tasks.push({
        title: title.slice(0, 200),
        priority: PRIORITIES.includes(pr) ? (pr as Priority) : null,
        dueDate: di >= 0 ? toDate((row[di] ?? "").trim()) : null,
        notes: ni >= 0 ? (row[ni] ?? "").slice(0, 500) || null : null,
      });
    }
  }

  if (tasks.length === 0) return { ok: false, error: "No tasks to import." };
  tasks = tasks.slice(0, 500); // safety cap

  const [notesCol] = await ctx.db
    .select({ id: boardColumns.id })
    .from(boardColumns)
    .where(and(eq(boardColumns.boardId, boardId), eq(boardColumns.name, "Notes"), isNull(boardColumns.deletedAt)))
    .limit(1);

  const [{ max }] = await ctx.db
    .select({ max: sql<number>`coalesce(max(${items.position}), -1)` })
    .from(items)
    .where(and(eq(items.boardId, boardId), eq(items.orgId, ctx.org.id)));
  let pos = Number(max) + 1;

  for (const t of tasks) {
    const [it] = await ctx.db
      .insert(items)
      .values({ orgId: ctx.org.id, boardId, title: t.title, position: pos++, priority: t.priority, dueDate: t.dueDate, createdBy: ctx.user.id })
      .returning({ id: items.id });
    if (t.notes && notesCol) await ctx.db.insert(itemValues).values({ orgId: ctx.org.id, itemId: it.id, columnId: notesCol.id, valueText: t.notes });
    await recordActivity(ctx.db, { orgId: ctx.org.id, itemId: it.id, actorId: ctx.user.id, type: "item_created", data: { imported: true } });
  }

  revalidatePath(`/${orgSlug}/boards/${boardId}`);
  return { ok: true, count: tasks.length };
}
