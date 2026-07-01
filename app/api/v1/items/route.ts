import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { boards, items, type Priority } from "@/db/schema";
import { recordActivity } from "@/lib/activity";
import { authenticateApiKey } from "@/lib/api-auth";
import { rateLimit } from "@/lib/rate-limit";

export async function GET(req: Request) {
  const auth = await authenticateApiKey(req);
  if (!auth) return Response.json({ error: "Invalid or missing API key." }, { status: 401 });
  if (!(await rateLimit(`api:${auth.org.id}`, 240, 60_000))) return Response.json({ error: "Rate limit exceeded." }, { status: 429 });
  const boardId = new URL(req.url).searchParams.get("boardId");
  const where = boardId
    ? and(eq(items.orgId, auth.org.id), eq(items.boardId, boardId), isNull(items.deletedAt))
    : and(eq(items.orgId, auth.org.id), isNull(items.deletedAt));
  const rows = await auth.db
    .select({ id: items.id, title: items.title, status: items.status, priority: items.priority, dueDate: items.dueDate, boardId: items.boardId, assigneeId: items.assigneeId })
    .from(items)
    .where(where)
    .orderBy(desc(items.createdAt))
    .limit(200);
  return Response.json({ items: rows });
}

export async function POST(req: Request) {
  const auth = await authenticateApiKey(req);
  if (!auth) return Response.json({ error: "Invalid or missing API key." }, { status: 401 });
  if (!(await rateLimit(`api:${auth.org.id}`, 240, 60_000))) return Response.json({ error: "Rate limit exceeded." }, { status: 429 });

  let body: { boardId?: string; title?: string; priority?: string; dueDate?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (!body.boardId || !body.title?.trim()) return Response.json({ error: "boardId and title are required." }, { status: 400 });

  const [board] = await auth.db
    .select({ id: boards.id })
    .from(boards)
    .where(and(eq(boards.id, body.boardId), eq(boards.orgId, auth.org.id), isNull(boards.deletedAt)))
    .limit(1);
  if (!board) return Response.json({ error: "Board not found." }, { status: 404 });

  const allowed: Priority[] = ["low", "medium", "high", "urgent"];
  const priority = body.priority && (allowed as string[]).includes(body.priority) ? (body.priority as Priority) : null;
  const due = body.dueDate ? new Date(body.dueDate) : null;

  const [{ max }] = await auth.db
    .select({ max: sql<number>`coalesce(max(${items.position}), -1)` })
    .from(items)
    .where(and(eq(items.boardId, body.boardId), eq(items.orgId, auth.org.id)));

  const [created] = await auth.db
    .insert(items)
    .values({ orgId: auth.org.id, boardId: body.boardId, title: body.title.trim().slice(0, 200), position: Number(max) + 1, priority, dueDate: due && !isNaN(due.getTime()) ? due : null })
    .returning();

  await recordActivity(auth.db, { orgId: auth.org.id, itemId: created.id, actorId: null, type: "item_created", data: { api: true } });
  return Response.json({ item: created }, { status: 201 });
}
