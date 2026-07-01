import { lt, sql } from "drizzle-orm";
import { rateLimitHits } from "@/db/schema";
import { getDb, type Db } from "@/lib/db";

/** DB-backed atomic fixed-window rate limiter. Returns true if the call is allowed.
 *
 *  Unlike an in-process Map (which resets per process and is useless across multiple
 *  server instances / serverless cold starts), this shares one counter through the
 *  database, so the limit holds no matter how the app is deployed (PGlite locally,
 *  Neon/Postgres in prod). The increment is a single atomic upsert, so concurrent
 *  requests can't slip under the cap.
 *
 *  Fails OPEN: if the limiter backend errors we allow the request rather than lock
 *  legitimate users out — rate limiting is abuse mitigation, not an auth gate. */
let calls = 0;

export async function rateLimit(key: string, max: number, windowMs: number, injectedDb?: Db): Promise<boolean> {
  const now = Date.now();
  const windowStart = new Date(Math.floor(now / windowMs) * windowMs);
  try {
    const db = injectedDb ?? (await getDb());
    const [row] = await db
      .insert(rateLimitHits)
      .values({ key, windowStart, count: 1 })
      .onConflictDoUpdate({
        target: [rateLimitHits.key, rateLimitHits.windowStart],
        set: { count: sql`${rateLimitHits.count} + 1` },
      })
      .returning({ count: rateLimitHits.count });

    // Opportunistic GC of expired windows (every ~200 calls) so the table stays small.
    if (++calls % 200 === 0) {
      void db.delete(rateLimitHits).where(lt(rateLimitHits.windowStart, new Date(now - 3_600_000))).catch(() => {});
    }
    return (row?.count ?? 1) <= max;
  } catch {
    return true; // fail open
  }
}
