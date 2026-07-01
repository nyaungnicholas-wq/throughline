import { asc, eq } from "drizzle-orm";
import { boardColumns, boards, columnLabels, type ColumnType } from "@/db/schema";
import type { Db } from "@/lib/db";

type TemplateColumn = { name: string; type: ColumnType; labels?: Array<{ label: string; color: number }> };

const TEMPLATES: Record<string, TemplateColumn[]> = {
  blank: [],
  "task-tracker": [
    { name: "Notes", type: "text" },
    { name: "Estimate (h)", type: "number" },
    {
      name: "Tag",
      type: "select",
      labels: [
        { label: "Design", color: 3 },
        { label: "Dev", color: 1 },
        { label: "QA", color: 8 },
      ],
    },
  ],
  sprint: [
    { name: "Story Points", type: "number" },
    { name: "Component", type: "select", labels: [{ label: "Frontend", color: 1 }, { label: "Backend", color: 2 }, { label: "Design", color: 3 }, { label: "Infra", color: 5 }] },
    { name: "Notes", type: "text" },
  ],
  "content-calendar": [
    { name: "Channel", type: "select", labels: [{ label: "Blog", color: 2 }, { label: "Social", color: 6 }, { label: "Email", color: 4 }, { label: "Video", color: 7 }] },
    { name: "Publish", type: "date" },
    { name: "Notes", type: "text" },
  ],
  "bug-tracker": [
    { name: "Severity", type: "select", labels: [{ label: "Critical", color: 7 }, { label: "Major", color: 6 }, { label: "Minor", color: 5 }, { label: "Trivial", color: 0 }] },
    { name: "Steps to reproduce", type: "text" },
    { name: "Environment", type: "text" },
  ],
};

/** Create a board (optionally from a template) and return its id. Caller must have scoped the orgId. */
export async function createBoard(
  db: Db,
  args: { orgId: string; name: string; description?: string | null; createdBy: string; template?: string },
): Promise<string> {
  const [board] = await db
    .insert(boards)
    .values({
      orgId: args.orgId,
      name: args.name.trim() || "Untitled board",
      description: args.description ?? null,
      createdBy: args.createdBy,
    })
    .returning({ id: boards.id });

  const tmpl = TEMPLATES[args.template ?? "task-tracker"] ?? [];
  let pos = 0;
  for (const c of tmpl) {
    const [col] = await db
      .insert(boardColumns)
      .values({ orgId: args.orgId, boardId: board.id, name: c.name, type: c.type, position: pos++ })
      .returning({ id: boardColumns.id });
    if (c.labels?.length) {
      await db.insert(columnLabels).values(
        c.labels.map((l, i) => ({
          orgId: args.orgId,
          columnId: col.id,
          label: l.label,
          color: l.color,
          position: i,
        })),
      );
    }
  }
  return board.id;
}

/** First board id for an org (for post-login redirect), or null. */
export async function firstBoardId(db: Db, orgId: string): Promise<string | null> {
  const [b] = await db
    .select({ id: boards.id })
    .from(boards)
    .where(eq(boards.orgId, orgId))
    .orderBy(asc(boards.createdAt))
    .limit(1);
  return b?.id ?? null;
}
