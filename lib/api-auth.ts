import { and, eq, isNull } from "drizzle-orm";
import { apiKeys, organizations, type Organization } from "@/db/schema";
import { sha256hex } from "@/lib/crypto";
import { getDb, type Db } from "@/lib/db";

/** Authenticate a public-API request by `Authorization: Bearer <key>`. Returns the
    org + a db handle (callers MUST still scope every query by org.id). */
export async function authenticateApiKey(req: Request): Promise<{ org: Organization; db: Db } | null> {
  const m = (req.headers.get("authorization") ?? "").match(/^Bearer\s+(.+)$/i);
  if (!m) return null;
  const db = await getDb();
  const [row] = await db
    .select({ keyId: apiKeys.id, org: organizations })
    .from(apiKeys)
    .innerJoin(organizations, eq(organizations.id, apiKeys.orgId))
    .where(and(eq(apiKeys.keyHash, sha256hex(m[1].trim())), isNull(apiKeys.revokedAt), isNull(organizations.deletedAt)))
    .limit(1);
  if (!row) return null;
  await db.update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, row.keyId));
  return { org: row.org, db };
}
