import { and, eq, isNull } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { membership, organizations, type Organization, type Role } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { getDb, type Db } from "@/lib/db";

export type SessionUser = { id: string; email: string; name: string | null };

export type OrgContext = {
  db: Db;
  user: SessionUser;
  org: Organization;
  role: Role;
};

const RANK: Record<Role, number> = { owner: 3, manager: 2, member: 1 };

export function atLeast(role: Role, min: Role): boolean {
  return RANK[role] >= RANK[min];
}

/** Capability matrix. Keep this the single source of truth for "who can do what". */
export type Capability =
  | "manageOrg"
  | "inviteMembers"
  | "createBoard"
  | "editBoard"
  | "deleteBoard"
  | "createItem"
  | "delegate"
  | "approve"
  | "manageAutomations"
  | "viewDashboard";

const MIN_ROLE: Record<Capability, Role> = {
  manageOrg: "owner",
  inviteMembers: "manager",
  createBoard: "manager",
  editBoard: "manager",
  deleteBoard: "manager",
  createItem: "member",
  delegate: "manager",
  approve: "manager",
  manageAutomations: "manager",
  viewDashboard: "manager",
};

export function can(role: Role, cap: Capability): boolean {
  return atLeast(role, MIN_ROLE[cap]);
}

/** Require a signed-in user, else send them to login. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** All orgs the user belongs to (for the org switcher / post-login routing). */
export async function listOrgsForUser(
  userId: string,
): Promise<Array<{ org: Organization; role: Role }>> {
  const db = await getDb();
  const rows = await db
    .select({ org: organizations, role: membership.role })
    .from(membership)
    .innerJoin(organizations, eq(organizations.id, membership.orgId))
    .where(
      and(
        eq(membership.userId, userId),
        isNull(membership.deletedAt),
        isNull(organizations.deletedAt),
      ),
    );
  return rows;
}

/**
 * Resolve the tenant context WITHOUT redirecting/404ing. Returns null when there's
 * no session, the org doesn't exist, the user isn't a member, or the role is too low.
 * Use this in API route handlers (which must return JSON, not an HTML redirect).
 *
 * Every downstream query MUST filter by the returned `org.id`.
 */
export async function getMemberContext(slug: string, minRole: Role = "member"): Promise<OrgContext | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  const db = await getDb();

  const rows = await db
    .select({ org: organizations, role: membership.role })
    .from(membership)
    .innerJoin(organizations, eq(organizations.id, membership.orgId))
    .where(
      and(
        eq(organizations.slug, slug),
        eq(membership.userId, user.id),
        isNull(membership.deletedAt),
        isNull(organizations.deletedAt),
      ),
    )
    .limit(1);

  if (rows.length === 0) return null;
  const { org, role } = rows[0];
  if (!atLeast(role, minRole)) return null;
  return { db, user, org, role };
}

/**
 * THE tenant chokepoint for pages & server actions. Redirects to /login when
 * signed out, and 404s non-members so the org's existence isn't revealed.
 */
export async function requireMember(slug: string, minRole: Role = "member"): Promise<OrgContext> {
  await requireUser(); // redirect to /login if signed out
  const ctx = await getMemberContext(slug, minRole);
  if (!ctx) notFound();
  return ctx;
}

/** Throwing capability assert for use inside server actions (after requireMember). */
export function assertCan(role: Role, cap: Capability) {
  if (!can(role, cap)) {
    throw new Error("You don't have permission to do that.");
  }
}
