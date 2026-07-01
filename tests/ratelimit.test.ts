import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import { rateLimit } from "@/lib/rate-limit";
import type { Db } from "@/lib/db";

// Integration test against a fresh in-memory PGlite — exercises the real DB-backed
// limiter (atomic upsert), not a re-implementation.
let db: Db;

beforeAll(async () => {
  const client = new PGlite();
  await client.waitReady;
  await client.exec(`
    CREATE TABLE rate_limit_hit (
      key text NOT NULL,
      window_start timestamptz NOT NULL,
      count integer NOT NULL DEFAULT 0,
      PRIMARY KEY (key, window_start)
    );
  `);
  db = drizzle(client, { schema }) as unknown as Db;
});

describe("rate limiter (DB-backed)", () => {
  it("allows exactly `max` hits then blocks within the window", async () => {
    const key = `t:${Date.now()}:a`;
    let allowed = 0;
    for (let i = 0; i < 10; i++) if (await rateLimit(key, 5, 60_000, db)) allowed++;
    expect(allowed).toBe(5);
  });

  it("keeps separate budgets per key", async () => {
    const a = `t:${Date.now()}:b`;
    const b = `t:${Date.now()}:c`;
    expect(await rateLimit(a, 1, 60_000, db)).toBe(true);
    expect(await rateLimit(a, 1, 60_000, db)).toBe(false); // a exhausted
    expect(await rateLimit(b, 1, 60_000, db)).toBe(true); // b independent
  });

  it("uses separate windows over time (distinct window buckets are independent)", async () => {
    const key = `t:${Date.now()}:d`;
    // A 1ms window means consecutive calls land in different buckets, each fresh.
    expect(await rateLimit(key, 1, 1, db)).toBe(true);
    const start = Date.now();
    while (Date.now() - start < 3) {
      /* spin past the 1ms window */
    }
    expect(await rateLimit(key, 1, 1, db)).toBe(true);
  });

  it("fails open if the backend errors (never locks users out)", async () => {
    const broken = {
      insert() {
        throw new Error("db down");
      },
    } as unknown as Db;
    expect(await rateLimit("whatever", 1, 60_000, broken)).toBe(true);
  });
});
