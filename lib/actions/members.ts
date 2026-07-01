"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { invites, membership, type Role } from "@/db/schema";
import { assertCan, atLeast, requireMember } from "@/lib/authz";
import { sendEmail } from "@/lib/email";
import { createInvite } from "@/lib/invites";

async function baseUrl(): Promise<string> {
  if (process.env.APP_URL) return process.env.APP_URL;
  // Don't trust the Host header in production for invite links.
  if (process.env.NODE_ENV === "production") {
    throw new Error("APP_URL must be set in production");
  }
  const h = await headers();
  return `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host") ?? "localhost:3000"}`;
}

export async function createInviteAction(
  orgSlug: string,
  input: { email?: string; role: Role },
): Promise<{ ok: true; link: string; role: Role; email: string | null } | { ok: false; error: string }> {
  const ctx = await requireMember(orgSlug, "manager");
  assertCan(ctx.role, "inviteMembers");
  const inv = await createInvite(ctx, { email: input.email, role: input.role });
  const link = `${await baseUrl()}/invite/${inv.token}`;
  if (inv.email) {
    await sendEmail({
      to: inv.email,
      subject: `You're invited to ${ctx.org.name} on Throughline`,
      text: `${ctx.user.name ?? ctx.user.email} invited you to join "${ctx.org.name}" as ${inv.role}.\n\nAccept your invite:\n${link}`,
    });
  }
  revalidatePath(`/${orgSlug}/members`);
  return { ok: true, link, role: inv.role, email: inv.email };
}

export async function revokeInviteAction(orgSlug: string, inviteId: string): Promise<{ ok: boolean; error?: string }> {
  const ctx = await requireMember(orgSlug, "manager");
  assertCan(ctx.role, "inviteMembers");
  await ctx.db
    .update(invites)
    .set({ revokedAt: new Date() })
    .where(and(eq(invites.id, inviteId), eq(invites.orgId, ctx.org.id)));
  revalidatePath(`/${orgSlug}/members`);
  return { ok: true };
}

type Ctx = Awaited<ReturnType<typeof requireMember>>;

/** Run `mutate` while holding a row lock on the org's current owner rows, but only if
    that would leave ≥1 owner. Locking serializes concurrent owner removals/demotions so
    two of them can't each read "2 owners", both proceed, and strand the org with zero
    owners (a TOCTOU race the plain count()+update was open to). */
async function withLastOwnerGuard(
  ctx: Ctx,
  errorIfLast: string,
  mutate: (tx: Parameters<Parameters<Ctx["db"]["transaction"]>[0]>[0]) => Promise<void>,
): Promise<{ ok: boolean; error?: string }> {
  return ctx.db.transaction(async (tx) => {
    const owners = await tx
      .select({ id: membership.id })
      .from(membership)
      .where(and(eq(membership.orgId, ctx.org.id), eq(membership.role, "owner"), isNull(membership.deletedAt)))
      .for("update");
    if (owners.length <= 1) return { ok: false, error: errorIfLast };
    await mutate(tx);
    return { ok: true };
  });
}

export async function removeMemberAction(orgSlug: string, userId: string): Promise<{ ok: boolean; error?: string }> {
  const ctx = await requireMember(orgSlug, "manager");
  const [target] = await ctx.db
    .select()
    .from(membership)
    .where(and(eq(membership.orgId, ctx.org.id), eq(membership.userId, userId), isNull(membership.deletedAt)))
    .limit(1);
  if (!target) return { ok: false, error: "Not a member." };

  // A manager may only remove members; only an owner may remove managers/owners.
  // (atLeast(target, actor) is true when the target outranks-or-equals the actor.)
  if (atLeast(target.role, ctx.role) && ctx.role !== "owner") {
    return { ok: false, error: "You can't remove someone at your level or above." };
  }
  const softDelete = (tx: { update: typeof ctx.db.update }) =>
    tx.update(membership).set({ deletedAt: new Date() }).where(eq(membership.id, target.id)).then(() => undefined);
  if (target.role === "owner") {
    const res = await withLastOwnerGuard(ctx, "You can't remove the last owner.", softDelete);
    if (!res.ok) return res;
  } else {
    await softDelete(ctx.db);
  }
  revalidatePath(`/${orgSlug}/members`);
  return { ok: true };
}

export async function changeRoleAction(
  orgSlug: string,
  userId: string,
  role: Role,
): Promise<{ ok: boolean; error?: string }> {
  const ctx = await requireMember(orgSlug, "owner"); // only owners change roles
  const [target] = await ctx.db
    .select()
    .from(membership)
    .where(and(eq(membership.orgId, ctx.org.id), eq(membership.userId, userId), isNull(membership.deletedAt)))
    .limit(1);
  if (!target) return { ok: false, error: "Not a member." };

  const setRole = (tx: { update: typeof ctx.db.update }) =>
    tx.update(membership).set({ role }).where(eq(membership.id, target.id)).then(() => undefined);
  if (target.role === "owner" && role !== "owner") {
    const res = await withLastOwnerGuard(ctx, "Promote another owner first — a workspace needs at least one.", setRole);
    if (!res.ok) return res;
  } else {
    await setRole(ctx.db);
  }
  revalidatePath(`/${orgSlug}/members`);
  return { ok: true };
}
