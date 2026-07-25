import path from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "@/db/schema";
import type { Db } from "@/lib/db";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url)).replace(/[/\\]$/, "");

/** A throwaway in-memory Postgres with the real migrations applied. Nothing touches
    the developer's `.data/pglite` store, so specs are isolated and repeatable. */
export async function makeTestDb(): Promise<Db> {
  const client = new PGlite();
  await client.waitReady;
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: path.join(repoRoot, "drizzle") });
  return db as unknown as Db;
}
