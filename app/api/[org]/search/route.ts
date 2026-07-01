import { and, desc, eq, ilike, isNull, or, sql } from "drizzle-orm";
import { boards, items } from "@/db/schema";
import { getMemberContext } from "@/lib/authz";

export async function GET(req: Request, { params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const ctx = await getMemberContext(org);
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });

  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return Response.json({ results: [] });

  // Full-text search over title + description (English stemming, multi-word, ranked),
  // OR'd with a substring match so short/partial queries (the as-you-type ⌘K palette)
  // still hit. `q` is bound as a parameter everywhere, so there's no injection surface.
  const escaped = q.replace(/[%_]/g, "\\$&");
  const doc = sql`to_tsvector('english', coalesce(${items.title}, '') || ' ' || coalesce(${items.description}, ''))`;
  const tsquery = sql`websearch_to_tsquery('english', ${q})`;

  const rows = await ctx.db
    .select({ id: items.id, title: items.title, status: items.status, boardId: items.boardId, boardName: boards.name })
    .from(items)
    .innerJoin(boards, eq(boards.id, items.boardId))
    .where(
      and(
        eq(items.orgId, ctx.org.id),
        isNull(items.deletedAt),
        isNull(boards.deletedAt),
        or(sql`${doc} @@ ${tsquery}`, ilike(items.title, `%${escaped}%`), ilike(items.description, `%${escaped}%`)),
      ),
    )
    // Relevance first (full-text matches rank > 0; substring-only matches rank 0), then recency.
    .orderBy(sql`ts_rank(${doc}, ${tsquery}) desc`, desc(items.createdAt))
    .limit(20);

  return Response.json({ results: rows });
}
