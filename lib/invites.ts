import { and, desc, eq, gt, isNull, or } from "drizzle-orm";
import { invites, membership, organizations, type Role } from "@/db/schema";
import { randomToken, sha256hex } from "@/lib/crypto";
import type { OrgContext, SessionUser } from "@/lib/authz";
import { atLeast } from "@/lib/authz";
import { getDb } from "@/lib/db";

const INVITE_DAYS = 14;

export type CreatedInvite = { token: string; role: Role; email: string | null };

/** Create an invite. Open links (no email) are capped to Member; you can't grant a role above your own. */
export async function createInvite(
  ctx: OrgContext,
  input: { email?: string | null; role: Role },
): Promise<CreatedInvite> {
  let role = input.role;
  const email = input.email?.trim().toLowerCase() || null;

  if (!atLeast(ctx.role, role)) role = ctx.role; // can't invite above yourself
  if (!email && role !== "member") role = "member"; // open links are member-only

  const token = randomToken(24);
  await ctx.db.insert(invites).values({
    orgId: ctx.org.id,
    email,
    role,
    tokenHash: sha256hex(token),
    createdBy: ctx.user.id,
    expiresAt: new Date(Date.now() + INVITE_DAYS * 86400_000),
  });
  return { token, role, email };
}

export type PendingInvite = { id: string; email: string | null; role: Role; createdAt: Date; expiresAt: Date };

/** Live invites for the members page: not revoked, not expired, and (for email invites) not yet used. */
export async function getPendingInvites(ctx: OrgContext): Promise<PendingInvite[]> {
  const now = new Date();
  const rows = await ctx.db
    .select({ id: invites.id, email: invites.email, role: invites.role, createdAt: invites.createdAt, expiresAt: invites.expiresAt })
    .from(invites)
    .where(
      and(
        eq(invites.orgId, ctx.org.id),
        isNull(invites.revokedAt),
        gt(invites.expiresAt, now),
        or(isNull(invites.email), isNull(invites.acceptedAt)),
      ),
    )
    .orderBy(desc(invites.createdAt));
  return rows;
}

export type AcceptResult = { ok: true; slug: string } | { ok: false; error: string };

/** Accept an invite for a signed-in user. Idempotent; enforces email match when scoped. */
export async function acceptInvite(user: SessionUser, token: string): Promise<AcceptResult> {
  const db = await getDb();
  const now = new Date();

  const [inv] = await db.select().from(invites).where(eq(invites.tokenHash, sha256hex(token))).limit(1);
  if (!inv) return { ok: false, error: "This invite link is invalid." };
  if (inv.revokedAt) return { ok: false, error: "This invite link has been revoked." };
  if (inv.acceptedAt && inv.email) return { ok: false, error: "This invite has already been used." };
  if (inv.expiresAt < now) return { ok: false, error: "This invite link has expired." };
  if (inv.email && inv.email !== user.email.toLowerCase()) {
    return { ok: false, error: "This invite was sent to a different email address." };
  }

  const [org] = await db
    .select()
    .from(organizations)
    .where(and(eq(organizations.id, inv.orgId), isNull(organizations.deletedAt)))
    .limit(1);
  if (!org) return { ok: false, error: "That workspace no longer exists." };

  await db
    .insert(membership)
    .values({ orgId: inv.orgId, userId: user.id, role: inv.role })
    .onConflictDoNothing({ target: [membership.orgId, membership.userId] });

  // Mark single-use (email) invites consumed; open links stay reusable until they expire.
  if (inv.email) await db.update(invites).set({ acceptedAt: now }).where(eq(invites.id, inv.id));

  return { ok: true, slug: org.slug };
}
