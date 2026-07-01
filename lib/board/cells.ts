import { and, eq, isNull } from "drizzle-orm";
import { boardColumns, columnLabels, items, itemValues, membership, type ColumnType } from "@/db/schema";
import type { OrgContext } from "@/lib/authz";

/** A normalized cell payload sent from the client; only the relevant field is used. */
export type CellInput = {
  text?: string | null;
  number?: number | null;
  date?: string | null; // ISO
  dateEnd?: string | null; // ISO (timeline)
  bool?: boolean | null;
  userId?: string | null;
  labelId?: string | null;
};

function slotFor(type: ColumnType, input: CellInput) {
  const base = {
    valueText: null as string | null,
    valueNumber: null as string | null,
    valueDate: null as Date | null,
    valueDateEnd: null as Date | null,
    valueBool: null as boolean | null,
    valueUser: null as string | null,
    valueLabelId: null as string | null,
  };
  switch (type) {
    case "text":
    case "link":
      return { ...base, valueText: input.text ?? null };
    case "number":
      return { ...base, valueNumber: input.number == null ? null : String(input.number) };
    case "date":
      return { ...base, valueDate: input.date ? new Date(input.date) : null };
    case "timeline":
      return {
        ...base,
        valueDate: input.date ? new Date(input.date) : null,
        valueDateEnd: input.dateEnd ? new Date(input.dateEnd) : null,
      };
    case "checkbox":
      return { ...base, valueBool: input.bool ?? false };
    case "person":
      return { ...base, valueUser: input.userId ?? null };
    case "status":
    case "select":
      return { ...base, valueLabelId: input.labelId ?? null };
  }
}

/** Upsert one flexible-column cell value, validating the column belongs to the org. */
export async function writeCell(
  ctx: OrgContext,
  args: { itemId: string; columnId: string; input: CellInput },
): Promise<{ ok: boolean; error?: string }> {
  const [col] = await ctx.db
    .select()
    .from(boardColumns)
    .where(
      and(
        eq(boardColumns.id, args.columnId),
        eq(boardColumns.orgId, ctx.org.id),
        isNull(boardColumns.deletedAt),
      ),
    )
    .limit(1);
  if (!col) return { ok: false, error: "Unknown column." };

  // The column AND the item must live on the SAME board — both being in the org isn't
  // enough. Otherwise a member could attach board B's column schema to board A's item,
  // writing an orphaned cross-board EAV row.
  const [it] = await ctx.db
    .select({ boardId: items.boardId })
    .from(items)
    .where(and(eq(items.id, args.itemId), eq(items.orgId, ctx.org.id), isNull(items.deletedAt)))
    .limit(1);
  if (!it) return { ok: false, error: "Item not found." };
  if (it.boardId !== col.boardId) return { ok: false, error: "Column doesn't belong to this board." };

  const slot = slotFor(col.type, args.input);

  // person columns may only point at a member of this org
  if (col.type === "person" && slot.valueUser) {
    const [m] = await ctx.db
      .select({ id: membership.id })
      .from(membership)
      .where(
        and(
          eq(membership.orgId, ctx.org.id),
          eq(membership.userId, slot.valueUser),
          isNull(membership.deletedAt),
        ),
      )
      .limit(1);
    if (!m) return { ok: false, error: "That person isn't in this workspace." };
  }

  // select/status labels must belong to THIS org AND this column (the bare FK only
  // proves the UUID exists somewhere — it doesn't stop a cross-org label reference).
  if ((col.type === "select" || col.type === "status") && slot.valueLabelId) {
    const [lbl] = await ctx.db
      .select({ id: columnLabels.id })
      .from(columnLabels)
      .where(
        and(
          eq(columnLabels.id, slot.valueLabelId),
          eq(columnLabels.orgId, ctx.org.id),
          eq(columnLabels.columnId, args.columnId),
        ),
      )
      .limit(1);
    if (!lbl) return { ok: false, error: "Unknown label." };
  }

  await ctx.db
    .insert(itemValues)
    .values({ orgId: ctx.org.id, itemId: args.itemId, columnId: args.columnId, ...slot })
    .onConflictDoUpdate({
      target: [itemValues.itemId, itemValues.columnId],
      set: { ...slot, updatedAt: new Date() },
    });
  return { ok: true };
}
