"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { appUser } from "@/db/schema";
import { createSession, setSessionCookie } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { seedDemo } from "@/lib/db/seed";

/** Dev tooling is allowed ONLY in local development AND only against the local PGlite store
    (never when a real DATABASE_URL is set) — so a misconfigured NODE_ENV in a hosted
    environment can't mint sessions or seed against production data. */
function assertDevTools() {
  if (process.env.NODE_ENV !== "development" || process.env.DATABASE_URL) {
    throw new Error("Dev tools are only available in local development.");
  }
}

/** DEV ONLY — instant sign-in for a seeded demo account, no email round-trip. */
export async function devLoginAction(email: string) {
  assertDevTools();
  const db = await getDb();
  await db.insert(appUser).values({ email }).onConflictDoNothing({ target: appUser.email });
  const [u] = await db.select().from(appUser).where(eq(appUser.email, email)).limit(1);
  if (!u) throw new Error("No such account.");
  await setSessionCookie(await createSession(u.id));
  redirect("/");
}

/** DEV ONLY — load the two-org demo dataset, then bounce back to login. */
export async function seedDemoAction() {
  assertDevTools();
  const db = await getDb();
  await seedDemo(db);
  redirect("/login?seeded=1");
}
