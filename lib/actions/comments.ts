"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { comments, items } from "@/db/schema";
import { notify, recordActivity } from "@/lib/activity";
import { requireMember } from "@/lib/authz";
import { getOrgMembers } from "@/lib/board/snapshot";

function parseMentions(text: string): string[] {
  return [...text.matchAll(/@([a-z0-9._-]+)/gi)].map((m) => m[1].toLowerCase());
}

export async function addCommentAction(
  orgSlug: string,
  boardId: string,
  itemId: string,
  body: string,
): Promise<{ ok: boolean; error?: string }> {
  const ctx = await requireMember(orgSlug);
  const text = body.trim();
  if (!text) return { ok: false, error: "Write something first." };
  if (text.length > 4000) return { ok: false, error: "That comment is too long." };

  const [it] = await ctx.db
    .select({ id: items.id, title: items.title, assigneeId: items.assigneeId, assignerId: items.assignerId })
    .from(items)
    .where(and(eq(items.id, itemId), eq(items.orgId, ctx.org.id), isNull(items.deletedAt)))
    .limit(1);
  if (!it) return { ok: false, error: "Item not found." };

  const [c] = await ctx.db
    .insert(comments)
    .values({ orgId: ctx.org.id, itemId, authorId: ctx.user.id, body: text })
    .returning({ id: comments.id });

  await recordActivity(ctx.db, { orgId: ctx.org.id, itemId, actorId: ctx.user.id, type: "comment_added" });

  // Notify the other party on the item (assignee + delegator), never the author.
  for (const uid of new Set([it.assigneeId, it.assignerId].filter(Boolean) as string[])) {
    await notify(ctx.db, {
      orgId: ctx.org.id,
      userId: uid,
      actorId: ctx.user.id,
      type: "comment",
      itemId,
      data: { title: it.title },
      dedupeKey: `comment:${c.id}:${uid}`,
    });
  }

  // @mentions — notify any member whose first name or email handle is mentioned.
  // Reuses the comment dedupeKey so a mentioned assignee gets a single notification.
  const tokens = parseMentions(text);
  if (tokens.length) {
    const members = await getOrgMembers(ctx);
    for (const m of members) {
      if (m.id === ctx.user.id) continue;
      const first = (m.name?.split(/\s+/)[0] ?? "").toLowerCase();
      const handle = m.email.split("@")[0].toLowerCase();
      if (tokens.includes(first) || tokens.includes(handle)) {
        await notify(ctx.db, {
          orgId: ctx.org.id,
          userId: m.id,
          actorId: ctx.user.id,
          type: "comment",
          itemId,
          data: { title: it.title },
          dedupeKey: `comment:${c.id}:${m.id}`,
        });
      }
    }
  }

  revalidatePath(`/${orgSlug}/boards/${boardId}`);
  return { ok: true };
}
