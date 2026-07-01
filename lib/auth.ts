import { and, count, eq, gt, gte, isNull } from "drizzle-orm";
import { cookies } from "next/headers";
import { cache } from "react";
import { appUser, magicTokens, sessions } from "@/db/schema";
import { randomToken, sha256hex } from "@/lib/crypto";
import { getDb } from "@/lib/db";
import { emailLive, sendEmail } from "@/lib/email";

export const SESSION_COOKIE = "tl_session";
const SESSION_DAYS = 30;
const MAGIC_LINK_MINUTES = 15;
const MAGIC_LINKS_PER_EMAIL_PER_10MIN = 5;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type RequestLinkResult = { ok: boolean; error?: string; devLink?: string };

/** Issue a one-time magic link. In dev (no email transport) we return the link so
    it can be shown/clicked locally; in production this would be emailed instead. */
export async function requestMagicLink(
  emailRaw: string,
  baseUrl: string,
): Promise<RequestLinkResult> {
  const email = emailRaw.trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return { ok: false, error: "That email doesn't look right." };

  const db = await getDb();
  const token = randomToken(32);
  const tokenHash = sha256hex(token);

  // Insert-then-count so concurrent requests can't all slip under the cap.
  await db.insert(magicTokens).values({
    tokenHash,
    email,
    expiresAt: new Date(Date.now() + MAGIC_LINK_MINUTES * 60_000),
  });
  const tenMinAgo = new Date(Date.now() - 10 * 60_000);
  const [{ value: recent }] = await db
    .select({ value: count() })
    .from(magicTokens)
    .where(and(eq(magicTokens.email, email), gte(magicTokens.createdAt, tenMinAgo)));
  if (recent > MAGIC_LINKS_PER_EMAIL_PER_10MIN) {
    await db.delete(magicTokens).where(eq(magicTokens.tokenHash, tokenHash));
    return { ok: true }; // same generic response so the endpoint can't be probed
  }

  const link = `${baseUrl}/api/auth/verify?token=${token}`;
  if (emailLive()) {
    await sendEmail({
      to: email,
      subject: "Your Throughline sign-in link",
      text: `Sign in to Throughline:\n\n${link}\n\nThis link expires in ${MAGIC_LINK_MINUTES} minutes and can be used once. If you didn't request it, ignore this email.`,
    });
  }
  // In production with no email transport we deliberately do NOT log the token
  // (it's a live, replayable credential). Configure RESEND_API_KEY to deliver it.
  if (process.env.NODE_ENV === "production") return { ok: true };
  console.log(`\n🔗 [throughline] magic link for ${email}:\n   ${link}\n`);
  return { ok: true, devLink: link };
}

/** Atomically claim a magic token, upsert the user, and start a session. */
export async function verifyMagicToken(
  token: string,
): Promise<{ sessionToken: string } | { error: string }> {
  const db = await getDb();
  const now = new Date();

  const claimed = await db
    .update(magicTokens)
    .set({ usedAt: now })
    .where(
      and(
        eq(magicTokens.tokenHash, sha256hex(token)),
        isNull(magicTokens.usedAt),
        gt(magicTokens.expiresAt, now),
      ),
    )
    .returning({ email: magicTokens.email });

  if (claimed.length === 0) return { error: "This sign-in link is invalid or has expired." };
  const email = claimed[0].email;

  await db.insert(appUser).values({ email }).onConflictDoNothing({ target: appUser.email });
  const [user] = await db.select().from(appUser).where(eq(appUser.email, email)).limit(1);
  if (!user) return { error: "Could not sign you in. Try again." };

  return { sessionToken: await createSession(user.id) };
}

export async function createSession(userId: string): Promise<string> {
  const db = await getDb();
  const token = randomToken(32);
  await db.insert(sessions).values({
    userId,
    tokenHash: sha256hex(token),
    expiresAt: new Date(Date.now() + SESSION_DAYS * 86400_000),
  });
  return token;
}

export async function setSessionCookie(token: string) {
  const c = await cookies();
  c.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_DAYS * 86400,
  });
}

/** Current signed-in user (deduped per request). Null when signed out. */
export const getCurrentUser = cache(async () => {
  const c = await cookies();
  const token = c.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const db = await getDb();
  const rows = await db
    .select({
      id: appUser.id,
      email: appUser.email,
      name: appUser.name,
      expiresAt: sessions.expiresAt,
    })
    .from(sessions)
    .innerJoin(appUser, eq(appUser.id, sessions.userId))
    .where(and(eq(sessions.tokenHash, sha256hex(token)), gt(sessions.expiresAt, new Date())))
    .limit(1);

  if (rows.length === 0) return null;
  const { expiresAt: _drop, ...user } = rows[0];
  void _drop;
  return user;
});

export async function signOut() {
  const c = await cookies();
  const token = c.get(SESSION_COOKIE)?.value;
  if (token) {
    const db = await getDb();
    await db.delete(sessions).where(eq(sessions.tokenHash, sha256hex(token)));
  }
  c.delete(SESSION_COOKIE);
}

/** Revoke EVERY session for the current user — the recovery path if a session is stolen
    (sessions otherwise live for 30 days and logging in elsewhere doesn't end old ones). */
export async function signOutEverywhere() {
  const c = await cookies();
  const token = c.get(SESSION_COOKIE)?.value;
  if (token) {
    const db = await getDb();
    const [row] = await db.select({ userId: sessions.userId }).from(sessions).where(eq(sessions.tokenHash, sha256hex(token))).limit(1);
    if (row) await db.delete(sessions).where(eq(sessions.userId, row.userId));
  }
  c.delete(SESSION_COOKIE);
}
