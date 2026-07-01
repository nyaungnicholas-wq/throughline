// eslint-disable-next-line no-restricted-imports -- dev seeding needs the raw, pre-tenant handle
import { getDb } from "@/lib/db";
import { seedDemo } from "@/lib/db/seed";

/** Dev-only: populate the two-org demo. Idempotent. Disabled in production AND whenever a
    real database is configured — so a misconfigured NODE_ENV can never seed prod data. */
export async function GET() {
  if (process.env.NODE_ENV !== "development" || process.env.DATABASE_URL) {
    return Response.json({ error: "disabled outside local development" }, { status: 403 });
  }
  const db = await getDb();
  const res = await seedDemo(db);
  return Response.json({
    ...res,
    message: res.seeded
      ? "Demo seeded. Use the dev quick-login on /login to sign in as any account."
      : "Already seeded.",
  });
}
