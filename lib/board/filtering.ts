import type { ItemStatus, Priority } from "@/db/schema";
import { PRIORITY_META, STATUS_META, STATUS_ORDER } from "@/lib/board/palette";
import type { ClientItem, SnapshotMember } from "@/lib/board/types";

export type SortKey = "manual" | "due" | "priority" | "title" | "created";
export type GroupKey = "none" | "status" | "assignee" | "priority";

export type BoardControls = {
  q: string;
  status: ItemStatus | "all";
  assignee: string | "all" | "unassigned";
  priority: Priority | "all";
  sort: SortKey;
  group: GroupKey;
};

export const DEFAULT_CONTROLS: BoardControls = {
  q: "",
  status: "all",
  assignee: "all",
  priority: "all",
  sort: "manual",
  group: "none",
};

export function controlsActive(c: BoardControls): boolean {
  return c.q.trim() !== "" || c.status !== "all" || c.assignee !== "all" || c.priority !== "all" || c.sort !== "manual" || c.group !== "none";
}

const PRI_RANK: Record<Priority, number> = { urgent: 0, high: 1, medium: 2, low: 3 };

export function applyControls(items: ClientItem[], c: BoardControls): ClientItem[] {
  let r = items;
  const q = c.q.trim().toLowerCase();
  if (q) r = r.filter((i) => i.title.toLowerCase().includes(q));
  if (c.status !== "all") r = r.filter((i) => i.status === c.status);
  if (c.assignee === "unassigned") r = r.filter((i) => !i.assigneeId);
  else if (c.assignee !== "all") r = r.filter((i) => i.assigneeId === c.assignee);
  if (c.priority !== "all") r = r.filter((i) => i.priority === c.priority);

  const sorted = [...r];
  const t = (d: string | null) => (d ? new Date(d).getTime() : Number.POSITIVE_INFINITY);
  if (c.sort === "due") sorted.sort((a, b) => t(a.dueDate) - t(b.dueDate));
  else if (c.sort === "priority") sorted.sort((a, b) => (a.priority ? PRI_RANK[a.priority] : 9) - (b.priority ? PRI_RANK[b.priority] : 9));
  else if (c.sort === "title") sorted.sort((a, b) => a.title.localeCompare(b.title));
  else if (c.sort === "created") sorted.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  // "manual" keeps the server's position order
  return sorted;
}

export type ItemGroup = { key: string; label: string; items: ClientItem[] };

export function groupItems(items: ClientItem[], group: GroupKey, members: SnapshotMember[]): ItemGroup[] {
  if (group === "none") return [{ key: "all", label: "", items }];
  const nameById = new Map(members.map((m) => [m.id, m.name ?? m.email]));
  const buckets = new Map<string, ItemGroup>();
  const order: string[] = [];
  const ensure = (key: string, label: string) => {
    if (!buckets.has(key)) {
      buckets.set(key, { key, label, items: [] });
      order.push(key);
    }
    return buckets.get(key)!;
  };

  if (group === "status") {
    for (const s of STATUS_ORDER) ensure(s, STATUS_META[s].label);
    for (const i of items) ensure(i.status, STATUS_META[i.status].label).items.push(i);
  } else if (group === "priority") {
    for (const p of ["urgent", "high", "medium", "low"] as Priority[]) ensure(p, PRIORITY_META[p].label);
    ensure("none", "No priority");
    for (const i of items) ensure(i.priority ?? "none", i.priority ? PRIORITY_META[i.priority].label : "No priority").items.push(i);
  } else {
    // assignee
    for (const i of items) {
      const key = i.assigneeId ?? "unassigned";
      ensure(key, i.assigneeId ? nameById.get(i.assigneeId) ?? "Member" : "Unassigned").items.push(i);
    }
  }
  return order.map((k) => buckets.get(k)!).filter((g) => g.items.length > 0);
}
