"use server";

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { attachments, items } from "@/db/schema";
import { recordActivity } from "@/lib/activity";
import { requireMember } from "@/lib/authz";
import { randomToken } from "@/lib/crypto";

const MAX_BYTES = 10 * 1024 * 1024; // 10MB

export async function uploadAttachmentAction(
  orgSlug: string,
  boardId: string,
  itemId: string,
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  const ctx = await requireMember(orgSlug);
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Pick a file." };
  if (file.size > MAX_BYTES) return { ok: false, error: "File too large (max 10MB)." };

  const [it] = await ctx.db
    .select({ id: items.id })
    .from(items)
    .where(and(eq(items.id, itemId), eq(items.orgId, ctx.org.id), isNull(items.deletedAt)))
    .limit(1);
  if (!it) return { ok: false, error: "Item not found." };

  const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80) || "file";
  const base = `${randomToken(8)}-${safe}`;
  const storageKey = `${ctx.org.id}/${base}`;
  const dir = path.join(process.cwd(), ".data", "uploads", ctx.org.id);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, base), Buffer.from(await file.arrayBuffer()));

  await ctx.db.insert(attachments).values({
    orgId: ctx.org.id,
    itemId,
    uploaderId: ctx.user.id,
    filename: file.name.slice(0, 200),
    mimeType: file.type || "application/octet-stream",
    sizeBytes: file.size,
    storageKey,
  });
  await recordActivity(ctx.db, { orgId: ctx.org.id, itemId, actorId: ctx.user.id, type: "attachment_added", data: { filename: file.name } });
  revalidatePath(`/${orgSlug}/boards/${boardId}`);
  return { ok: true };
}
