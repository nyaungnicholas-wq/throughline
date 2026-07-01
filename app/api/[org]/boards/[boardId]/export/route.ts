import type { BoardColumn, ColumnLabel, ItemValue } from "@/db/schema";
import { getMemberContext } from "@/lib/authz";
import { STATUS_META } from "@/lib/board/palette";
import { loadBoardSnapshot } from "@/lib/board/snapshot";
import type { SnapshotMember } from "@/lib/board/types";
import { toCsv } from "@/lib/csv";
import { isUuid } from "@/lib/db";

const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");

function cellText(v: ItemValue | undefined, col: BoardColumn & { labels: ColumnLabel[] }, members: SnapshotMember[]): string {
  if (!v) return "";
  switch (col.type) {
    case "text":
    case "link":
      return v.valueText ?? "";
    case "number":
      return v.valueNumber ?? "";
    case "checkbox":
      return v.valueBool ? "Yes" : "";
    case "date":
      return iso(v.valueDate);
    case "timeline":
      return [iso(v.valueDate), iso(v.valueDateEnd)].filter(Boolean).join(" → ");
    case "person": {
      const m = members.find((x) => x.id === v.valueUser);
      return m ? (m.name ?? m.email) : "";
    }
    case "select":
    case "status":
      return col.labels.find((l) => l.id === v.valueLabelId)?.label ?? "";
    default:
      return "";
  }
}

export async function GET(_req: Request, { params }: { params: Promise<{ org: string; boardId: string }> }) {
  const { org, boardId } = await params;
  const ctx = await getMemberContext(org);
  if (!ctx) return new Response("unauthorized", { status: 401 });
  if (!isUuid(boardId)) return new Response("not found", { status: 404 });
  const snap = await loadBoardSnapshot(ctx, boardId);
  if (!snap) return new Response("not found", { status: 404 });

  const header = ["Title", "Status", "Owner", "Priority", "Due", ...snap.columns.map((c) => c.name)];
  const rows: Array<Array<string | null>> = [header];
  for (const it of snap.items) {
    rows.push([
      it.title,
      STATUS_META[it.status].label,
      it.assignee ? (it.assignee.name ?? it.assignee.email) : "",
      it.priority ?? "",
      iso(it.dueDate),
      ...snap.columns.map((c) => cellText(it.values[c.id], c, snap.members)),
    ]);
  }

  const filename = `${snap.board.name.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "board"}.csv`;
  return new Response(toCsv(rows), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${filename}"` },
  });
}
