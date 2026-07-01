import { and, asc, eq, isNull } from "drizzle-orm";
import { boards } from "@/db/schema";
import { authenticateApiKey } from "@/lib/api-auth";
import { rateLimit } from "@/lib/rate-limit";

export async function GET(req: Request) {
  const auth = await authenticateApiKey(req);
  if (!auth) return Response.json({ error: "Invalid or missing API key." }, { status: 401 });
  if (!(await rateLimit(`api:${auth.org.id}`, 240, 60_000))) return Response.json({ error: "Rate limit exceeded." }, { status: 429 });
  const rows = await auth.db
    .select({ id: boards.id, name: boards.name, description: boards.description, createdAt: boards.createdAt })
    .from(boards)
    .where(and(eq(boards.orgId, auth.org.id), isNull(boards.deletedAt)))
    .orderBy(asc(boards.createdAt));
  return Response.json({ org: auth.org.slug, boards: rows });
}
