import { describe, expect, it } from "vitest";
import { applyControls, DEFAULT_CONTROLS, groupItems } from "@/lib/board/filtering";
import type { ClientItem } from "@/lib/board/types";

const mk = (p: Partial<{ id: string; title: string; status: string; priority: string | null; dueDate: string | null; assigneeId: string | null; createdAt: string }>): ClientItem =>
  ({
    id: p.id ?? "1",
    title: p.title ?? "x",
    status: p.status ?? "unassigned",
    priority: p.priority ?? null,
    dueDate: p.dueDate ?? null,
    assigneeId: p.assigneeId ?? null,
    createdAt: p.createdAt ?? "2026-01-01T00:00:00Z",
    values: {},
    assignee: null,
  }) as unknown as ClientItem;

describe("board filtering / sorting / grouping", () => {
  it("filters by status", () => {
    const r = applyControls([mk({ status: "approved" }), mk({ status: "unassigned" })], { ...DEFAULT_CONTROLS, status: "approved" });
    expect(r.length).toBe(1);
    expect(r[0].status).toBe("approved");
  });

  it("filters by case-insensitive title query", () => {
    const items = [mk({ title: "Design hero" }), mk({ title: "Write docs" })];
    expect(applyControls(items, { ...DEFAULT_CONTROLS, q: "DESIGN" }).length).toBe(1);
  });

  it("sorts by priority (urgent first)", () => {
    const items = [mk({ id: "a", priority: "low" }), mk({ id: "b", priority: "urgent" })];
    expect(applyControls(items, { ...DEFAULT_CONTROLS, sort: "priority" })[0].id).toBe("b");
  });

  it("groups by status", () => {
    const items = [mk({ status: "approved" }), mk({ status: "approved" }), mk({ status: "unassigned" })];
    const groups = groupItems(items, "status", []);
    expect(groups.find((g) => g.key === "approved")?.items.length).toBe(2);
    expect(groups.find((g) => g.key === "unassigned")?.items.length).toBe(1);
  });
});
