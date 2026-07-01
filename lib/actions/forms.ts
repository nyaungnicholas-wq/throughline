"use server";

import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { boardColumns, boards, comments, forms, items, itemValues } from "@/db/schema";
import { recordActivity } from "@/lib/activity";
import { requireMember } from "@/lib/authz";
import { randomToken } from "@/lib/crypto";
import { getDb } from "@/lib/db";
import { getPublicForm } from "@/lib/forms";
import { rateLimit } from "@/lib/rate-limit";

export type ClientForm = { id: string; title: string; enabled: boolean; token: string };

async function baseUrl(): Promise<string> {
  if (process.env.APP_URL) return process.env.APP_URL;
  // Never trust the Host header in production (it would let a spoofed Host poison the
  // public form-share link). Mirrors the guard in auth.ts/members.ts.
  if (process.env.NODE_ENV === "production") {
    throw new Error("APP_URL must be set in production");
  }
  const h = await headers();
  return `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host") ?? "localhost:3000"}`;
}

export async function listFormsAction(orgSlug: string, boardId: string): Promise<ClientForm[]> {
  const ctx = await requireMember(orgSlug, "manager");
  const rows = await ctx.db
    .select({ id: forms.id, title: forms.title, enabled: forms.enabled, token: forms.token })
    .from(forms)
    .where(and(eq(forms.orgId, ctx.org.id), eq(forms.boardId, boardId), isNull(forms.deletedAt)))
    .orderBy(asc(forms.createdAt));
  return rows;
}

export async function createFormAction(
  orgSlug: string,
  boardId: string,
  input: { title: string; description?: string },
): Promise<{ ok: boolean; link?: string; error?: string }> {
  const ctx = await requireMember(orgSlug, "manager");
  const [board] = await ctx.db
    .select({ id: boards.id })
    .from(boards)
    .where(and(eq(boards.id, boardId), eq(boards.orgId, ctx.org.id), isNull(boards.deletedAt)))
    .limit(1);
  if (!board) return { ok: false, error: "Board not found." };
  const token = `f_${randomToken(16)}`;
  await ctx.db.insert(forms).values({
    orgId: ctx.org.id,
    boardId,
    token,
    title: input.title.trim().slice(0, 120) || "Submit a request",
    description: input.description?.trim().slice(0, 500) || null,
    createdBy: ctx.user.id,
  });
  revalidatePath(`/${orgSlug}/boards/${boardId}`);
  return { ok: true, link: `${await baseUrl()}/form/${token}` };
}

export async function toggleFormAction(orgSlug: string, formId: string, enabled: boolean) {
  const ctx = await requireMember(orgSlug, "manager");
  await ctx.db.update(forms).set({ enabled }).where(and(eq(forms.id, formId), eq(forms.orgId, ctx.org.id)));
  return { ok: true };
}

export async function deleteFormAction(orgSlug: string, formId: string) {
  const ctx = await requireMember(orgSlug, "manager");
  await ctx.db.update(forms).set({ deletedAt: new Date() }).where(and(eq(forms.id, formId), eq(forms.orgId, ctx.org.id)));
  return { ok: true };
}

/** PUBLIC — no auth. Looks up the form by token and creates an item from the submission. */
export async function submitFormAction(
  token: string,
  data: { summary: string; details?: string; name?: string; email?: string },
): Promise<{ ok: boolean; error?: string }> {
  // Rate-limit by submitter IP (token-only keying lets distributed senders each get a full
  // budget), with a per-token backstop against a single IP rotating addresses.
  const hdrs = await headers();
  const ip = hdrs.get("x-forwarded-for")?.split(",")[0].trim() || hdrs.get("x-real-ip") || "unknown";
  if (!(await rateLimit(`form-ip:${ip}`, 5, 60_000))) return { ok: false, error: "Too many submissions — please try again shortly." };
  if (!(await rateLimit(`form-token:${token}`, 60, 60_000))) return { ok: false, error: "This form is receiving too many submissions right now. Please try again shortly." };
  const summary = (data.summary ?? "").trim();
  if (summary.length < 2) return { ok: false, error: "Please describe your request." };

  const pf = await getPublicForm(token);
  if (!pf) return { ok: false, error: "This form is no longer available." };

  const db = await getDb();
  const [{ max }] = await db
    .select({ max: sql<number>`coalesce(max(${items.position}), -1)` })
    .from(items)
    .where(and(eq(items.boardId, pf.form.boardId), eq(items.orgId, pf.form.orgId)));

  const [it] = await db
    .insert(items)
    .values({ orgId: pf.form.orgId, boardId: pf.form.boardId, title: summary.slice(0, 200), position: Number(max) + 1 })
    .returning({ id: items.id });

  const [notesCol] = await db
    .select({ id: boardColumns.id })
    .from(boardColumns)
    .where(and(eq(boardColumns.boardId, pf.form.boardId), eq(boardColumns.name, "Notes"), isNull(boardColumns.deletedAt)))
    .limit(1);
  if (data.details && notesCol) {
    await db.insert(itemValues).values({ orgId: pf.form.orgId, itemId: it.id, columnId: notesCol.id, valueText: data.details.slice(0, 1000) });
  }

  const subName = data.name?.trim().slice(0, 80);
  const subEmail = data.email?.trim().slice(0, 120);
  const who = [subName, subEmail ? `<${subEmail}>` : ""].filter(Boolean).join(" ");
  await db.insert(comments).values({
    orgId: pf.form.orgId,
    itemId: it.id,
    authorId: null,
    body: `📨 Submitted via the “${pf.form.title}” form${who ? ` by ${who}` : ""}.${data.details ? `\n\n${data.details.slice(0, 1000)}` : ""}`,
  });
  await recordActivity(db, { orgId: pf.form.orgId, itemId: it.id, actorId: null, type: "item_created", data: { form: true } });
  return { ok: true };
}
