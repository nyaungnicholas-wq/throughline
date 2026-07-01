import { runAllDueAutomations } from "@/lib/cron";
import { safeEqual } from "@/lib/crypto";
// eslint-disable-next-line no-restricted-imports -- system cron job, no tenant session
import { getDb } from "@/lib/db";

/** Hit this on a schedule (Vercel Cron / external) with the `x-cron-secret` HEADER.
    The secret is taken from the header only — never the query string, which would leak
    it into proxy/CDN access logs. Disabled (403) unless CRON_SECRET is set and matches. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const provided = req.headers.get("x-cron-secret");
  // Constant-time compare to avoid a timing oracle on the secret.
  if (!secret || !provided || !safeEqual(provided, secret)) return new Response("forbidden", { status: 403 });
  const db = await getDb();
  const res = await runAllDueAutomations(db);
  return Response.json(res);
}
