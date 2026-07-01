"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { items, membership, organizations } from "@/db/schema";
import { requireMember, requireUser } from "@/lib/authz";
import { createBoard } from "@/lib/board/create";
import { getDb } from "@/lib/db";
import { isSlackWebhookHost } from "@/lib/ssrf-guard";

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "workspace"
  );
}

export type CreateOrgState = { error?: string };

/** Create a workspace, make the creator its Owner, and seed a starter board + welcome item. */
export async function createOrgAction(_prev: CreateOrgState, formData: FormData): Promise<CreateOrgState> {
  const user = await requireUser();
  const name = String(formData.get("name") ?? "").trim();
  if (name.length < 2) return { error: "Give your workspace a name." };

  const db = await getDb();

  // Find a free slug.
  const base = slugify(name);
  let slug = base;
  for (let i = 2; i < 50; i++) {
    const [exists] = await db
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.slug, slug))
      .limit(1);
    if (!exists) break;
    slug = `${base}-${i}`;
  }

  const [org] = await db.insert(organizations).values({ slug, name }).returning();
  await db.insert(membership).values({ orgId: org.id, userId: user.id, role: "owner" });

  const boardId = await createBoard(db, {
    orgId: org.id,
    name: "My First Board",
    createdBy: user.id,
    template: "task-tracker",
  });
  await db.insert(items).values({
    orgId: org.id,
    boardId,
    title: "👋 Welcome! Click a task to open it, then assign it to a teammate.",
    createdBy: user.id,
    position: 0,
  });

  redirect(`/${slug}/boards/${boardId}`);
}

/** Switch helper: not strictly needed (links do it), kept for symmetry. */
export async function leaveNoop() {}

export async function renameOrgAction(orgSlug: string, name: string): Promise<{ ok: boolean; error?: string }> {
  // requireMember handles auth, soft-deleted memberships, the owner gate, and 404s.
  const ctx = await requireMember(orgSlug, "owner");
  const trimmed = name.trim();
  if (trimmed.length < 2) return { ok: false, error: "Give your workspace a name." };
  await ctx.db.update(organizations).set({ name: trimmed }).where(eq(organizations.id, ctx.org.id));
  revalidatePath(`/${orgSlug}/settings`);
  return { ok: true };
}

export async function setSlackWebhookAction(orgSlug: string, url: string): Promise<{ ok: boolean; error?: string }> {
  const ctx = await requireMember(orgSlug, "owner");
  const u = url.trim();
  if (u && !isSlackWebhookHost(u)) {
    return { ok: false, error: "Must be a Slack Incoming Webhook URL (hooks.slack.com), or clear it." };
  }
  await ctx.db.update(organizations).set({ slackWebhookUrl: u || null }).where(eq(organizations.id, ctx.org.id));
  revalidatePath(`/${orgSlug}/settings`);
  return { ok: true };
}
