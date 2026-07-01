"use server";

import { revalidatePath } from "next/cache";
import { requireMember } from "@/lib/authz";
import { runTransition, type TransitionAction, type TransitionInput } from "@/lib/delegation";

/** The client entry point for every status change. Server re-checks all rules. */
export async function transitionAction(
  orgSlug: string,
  boardId: string,
  itemId: string,
  action: TransitionAction,
  input?: TransitionInput,
) {
  const ctx = await requireMember(orgSlug);
  const res = await runTransition(ctx, itemId, action, input ?? {});
  if (res.ok) {
    revalidatePath(`/${orgSlug}/boards/${boardId}`);
    return { ok: true as const, item: res.item };
  }
  return { ok: false as const, error: res.error, code: res.code };
}
