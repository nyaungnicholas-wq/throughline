import { mkdir } from "node:fs/promises";
import path from "node:path";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "@/db/schema";

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

/** Guard route params before they reach a uuid column — Postgres throws a 500 on a
    non-uuid value (e.g. "undefined"), so callers should 404 instead. */
export function isUuid(s: string | undefined | null): s is string {
  return (
    typeof s === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)
  );
}

/* Single shared instance per process. The globalThis cache matters in dev:
   Next.js HMR re-evaluates modules, and two PGlite handles on the same data
   directory corrupt it. */
const g = globalThis as unknown as { __throughlineDb?: Promise<Db> };

async function init(): Promise<Db> {
  const migrationsFolder = path.join(process.cwd(), "drizzle");

  if (process.env.DATABASE_URL) {
    const { drizzle } = await import("drizzle-orm/postgres-js");
    const { migrate } = await import("drizzle-orm/postgres-js/migrator");
    const { sql } = await import("drizzle-orm");
    const postgres = (await import("postgres")).default;

    /* Serialize migrations across cold-starting serverless instances with a session
       advisory lock on a single dedicated connection (max:1) — on a pool the lock and
       unlock could land on different connections, leaking the lock. */
    const migrationClient = postgres(process.env.DATABASE_URL, { max: 1 });
    const mdb = drizzle(migrationClient, { schema });
    try {
      await mdb.execute(sql`SELECT pg_advisory_lock(7714329)`);
      try {
        await migrate(mdb, { migrationsFolder });
      } finally {
        await mdb.execute(sql`SELECT pg_advisory_unlock(7714329)`);
      }
    } finally {
      await migrationClient.end();
    }

    const client = postgres(process.env.DATABASE_URL, { max: 5 });
    return drizzle(client, { schema }) as unknown as Db;
  }

  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const dataDir = path.join(process.cwd(), ".data", "pglite");
  await mkdir(dataDir, { recursive: true });
  const client = new PGlite(dataDir);
  /* Wait for PGlite's filesystem backend to finish mounting before running any
     query. Without this, the migrator's first statement can race the fs init and
     throw "path argument must be a string … received URL" on cold start. */
  await client.waitReady;
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder });
  return db as unknown as Db;
}

/**
 * The raw, UNSCOPED database handle. It can touch every org's data.
 * UI / route code must NOT import this directly (an ESLint rule enforces it) —
 * go through the tenant-scoped helpers in `@/lib/authz` so org_id is always applied.
 */
export function getDb(): Promise<Db> {
  if (!g.__throughlineDb) {
    g.__throughlineDb = init().catch((err) => {
      console.error(
        `[db] init failed (driver: ${process.env.DATABASE_URL ? "postgres" : "pglite"}):`,
        err,
      );
      g.__throughlineDb = undefined;
      throw err;
    });
  }
  return g.__throughlineDb;
}
