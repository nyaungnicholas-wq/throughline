"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { appUser } from "@/db/schema";
import { requireMember } from "@/lib/authz";

/** Set the signed-in user's display name (global to the user, not per-org). Until now there
    was no way to set a name, so magic-link users stayed nameless everywhere they appear. */
export async function updateProfileAction(orgSlug: string, name: string): Promise<{ ok: boolean; error?: string }> {
  const ctx = await requireMember(orgSlug);
  const clean = name.trim().slice(0, 80);
  if (!clean) return { ok: false, error: "Please enter a name." };
  await ctx.db.update(appUser).set({ name: clean }).where(eq(appUser.id, ctx.user.id));
  revalidatePath(`/${orgSlug}`, "layout");
  return { ok: true };
}
