"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { itemDependencies, items } from "@/db/schema";
import { requireMember } from "@/lib/authz";

async function itemInOrg(ctx: Awaited<ReturnType<typeof requireMember>>, itemId: string) {
  const [it] = await ctx.db
    .select({ id: items.id })
    .from(items)
    .where(and(eq(items.id, itemId), eq(items.orgId, ctx.org.id), isNull(items.deletedAt)))
    .limit(1);
  return !!it;
}

/** Mark `itemId` as blocked by `blockedById`. */
export async function addDependencyAction(
  orgSlug: string,
  boardId: string,
  itemId: string,
  blockedById: string,
): Promise<{ ok: boolean; error?: string }> {
  const ctx = await requireMember(orgSlug);
  if (itemId === blockedById) return { ok: false, error: "A task can't block itself." };
  if (!(await itemInOrg(ctx, itemId)) || !(await itemInOrg(ctx, blockedById))) return { ok: false, error: "Task not found." };

  // Full cycle detection (any length): adding "itemId blocked-by blockedById" forms a
  // cycle iff itemId is already reachable from blockedById by following blocked-by edges.
  const edges = await ctx.db
    .select({ from: itemDependencies.itemId, to: itemDependencies.blockedById })
    .from(itemDependencies)
    .where(eq(itemDependencies.orgId, ctx.org.id));
  const adj = new Map<string, string[]>();
  for (const e of edges) {
    const arr = adj.get(e.from) ?? [];
    arr.push(e.to);
    adj.set(e.from, arr);
  }
  const seen = new Set<string>();
  const queue = [blockedById];
  while (queue.length) {
    const n = queue.shift()!;
    if (n === itemId) return { ok: false, error: "That would create a circular dependency." };
    if (seen.has(n)) continue;
    seen.add(n);
    for (const next of adj.get(n) ?? []) queue.push(next);
  }

  await ctx.db
    .insert(itemDependencies)
    .values({ orgId: ctx.org.id, itemId, blockedById })
    .onConflictDoNothing({ target: [itemDependencies.itemId, itemDependencies.blockedById] });
  revalidatePath(`/${orgSlug}/boards/${boardId}`);
  return { ok: true };
}

export async function removeDependencyAction(orgSlug: string, boardId: string, depId: string) {
  const ctx = await requireMember(orgSlug);
  await ctx.db.delete(itemDependencies).where(and(eq(itemDependencies.id, depId), eq(itemDependencies.orgId, ctx.org.id)));
  revalidatePath(`/${orgSlug}/boards/${boardId}`);
  return { ok: true };
}
