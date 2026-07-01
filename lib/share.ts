import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import {
  appUser,
  boardColumns,
  boards,
  columnLabels,
  items,
  itemValues,
  membership,
  organizations,
  type ColumnType,
  type ItemStatus,
  type ItemValue,
  type Priority,
} from "@/db/schema";
import { getDb } from "@/lib/db";

export type SharedCell =
  | { kind: "text"; text: string }
  | { kind: "label"; label: string; color: number }
  | { kind: "empty" };

export type SharedColumn = { id: string; name: string; type: ColumnType };

export type SharedItem = {
  id: string;
  title: string;
  status: ItemStatus;
  priority: Priority | null;
  dueDate: string | null;
  assigneeName: string | null;
  cells: Record<string, SharedCell>;
};

export type SharedBoard = {
  orgName: string;
  boardName: string;
  boardDescription: string | null;
  columns: SharedColumn[];
  items: SharedItem[];
};

function iso(d: Date | null): string | null {
  return d ? d.toISOString().slice(0, 10) : null;
}

function formatCell(
  type: ColumnType | undefined,
  v: ItemValue,
  labelById: Map<string, { label: string; color: number }>,
  nameById: Map<string, string>,
): SharedCell {
  switch (type) {
    case "status":
    case "select": {
      if (!v.valueLabelId) return { kind: "empty" };
      const l = labelById.get(v.valueLabelId);
      return l ? { kind: "label", label: l.label, color: l.color } : { kind: "empty" };
    }
    case "person": {
      const n = v.valueUser ? nameById.get(v.valueUser) : null;
      return n ? { kind: "text", text: n } : { kind: "empty" };
    }
    case "checkbox":
      return { kind: "text", text: v.valueBool ? "✓" : "—" };
    case "number":
      return v.valueNumber != null ? { kind: "text", text: String(v.valueNumber) } : { kind: "empty" };
    case "date":
      return iso(v.valueDate) ? { kind: "text", text: iso(v.valueDate)! } : { kind: "empty" };
    case "timeline": {
      const a = iso(v.valueDate);
      const b = iso(v.valueDateEnd);
      return a || b ? { kind: "text", text: [a, b].filter(Boolean).join(" → ") } : { kind: "empty" };
    }
    default:
      return v.valueText ? { kind: "text", text: v.valueText } : { kind: "empty" };
  }
}

/** Read-only public snapshot of a board by its share token (no auth — the token is the grant). */
export async function getSharedBoard(token: string): Promise<SharedBoard | null> {
  if (!token || token.length < 16) return null; // randomToken(18) → 24 base64url chars; reject obvious junk
  const db = await getDb();

  const [hit] = await db
    .select({ board: boards, orgName: organizations.name })
    .from(boards)
    .innerJoin(organizations, eq(organizations.id, boards.orgId))
    .where(and(eq(boards.shareToken, token), isNull(boards.deletedAt), isNull(organizations.deletedAt)))
    .limit(1);
  if (!hit) return null;

  const { board, orgName } = hit;
  const orgId = board.orgId;
  const boardId = board.id;

  const cols = await db
    .select()
    .from(boardColumns)
    .where(and(eq(boardColumns.boardId, boardId), eq(boardColumns.orgId, orgId), isNull(boardColumns.deletedAt)))
    .orderBy(asc(boardColumns.position));
  const colIds = cols.map((c) => c.id);
  const colType = new Map<string, ColumnType>(cols.map((c) => [c.id, c.type]));

  const labels = colIds.length
    ? await db.select().from(columnLabels).where(and(eq(columnLabels.orgId, orgId), inArray(columnLabels.columnId, colIds)))
    : [];
  const labelById = new Map(labels.map((l) => [l.id, { label: l.label, color: l.color }]));

  const rows = await db
    .select()
    .from(items)
    .where(and(eq(items.boardId, boardId), eq(items.orgId, orgId), isNull(items.deletedAt)))
    .orderBy(asc(items.position), asc(items.createdAt));
  const itemIds = rows.map((r) => r.id);

  const values = itemIds.length
    ? await db.select().from(itemValues).where(and(eq(itemValues.orgId, orgId), inArray(itemValues.itemId, itemIds)))
    : [];

  // This is a PUBLIC page — never select or fall back to email (PII leak). A member
  // without a display name shows as a generic label, not their address.
  const members = await db
    .select({ id: appUser.id, name: appUser.name })
    .from(membership)
    .innerJoin(appUser, eq(appUser.id, membership.userId))
    .where(and(eq(membership.orgId, orgId), isNull(membership.deletedAt)));
  const nameById = new Map(members.map((m) => [m.id, m.name ?? "Member"]));

  const valuesByItem = new Map<string, ItemValue[]>();
  for (const v of values) {
    const arr = valuesByItem.get(v.itemId) ?? [];
    arr.push(v);
    valuesByItem.set(v.itemId, arr);
  }

  const sharedItems: SharedItem[] = rows.map((r) => {
    const cells: Record<string, SharedCell> = {};
    for (const v of valuesByItem.get(r.id) ?? []) {
      cells[v.columnId] = formatCell(colType.get(v.columnId), v, labelById, nameById);
    }
    return {
      id: r.id,
      title: r.title,
      status: r.status,
      priority: r.priority,
      dueDate: iso(r.dueDate),
      assigneeName: r.assigneeId ? nameById.get(r.assigneeId) ?? null : null,
      cells,
    };
  });

  return {
    orgName,
    boardName: board.name,
    boardDescription: board.description,
    columns: cols.map((c) => ({ id: c.id, name: c.name, type: c.type })),
    items: sharedItems,
  };
}
