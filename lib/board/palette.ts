import type { ItemStatus, Priority } from "@/db/schema";

/**
 * Locked 9-swatch palette. Each swatch is a pill: a saturated dot + a light tint
 * background + dark saturated text. The label text and dot mean color is never the
 * ONLY signal (WCAG 2.2 SC 1.4.1), and dark-on-tint text clears AA contrast.
 */
export type Swatch = { name: string; dot: string; bg: string; text: string };

export const SWATCHES: Swatch[] = [
  { name: "Gray", dot: "#64748b", bg: "#f1f5f9", text: "#334155" },
  { name: "Blue", dot: "#3b82f6", bg: "#eff6ff", text: "#1d4ed8" },
  { name: "Indigo", dot: "#6366f1", bg: "#eef2ff", text: "#4338ca" },
  { name: "Violet", dot: "#8b5cf6", bg: "#f5f3ff", text: "#6d28d9" },
  { name: "Green", dot: "#22c55e", bg: "#f0fdf4", text: "#15803d" },
  { name: "Amber", dot: "#f59e0b", bg: "#fffbeb", text: "#b45309" },
  { name: "Orange", dot: "#f97316", bg: "#fff7ed", text: "#c2410c" },
  { name: "Red", dot: "#ef4444", bg: "#fef2f2", text: "#b91c1c" },
  { name: "Teal", dot: "#14b8a6", bg: "#f0fdfa", text: "#0f766e" },
];

export function swatch(i: number): Swatch {
  return SWATCHES[((i % SWATCHES.length) + SWATCHES.length) % SWATCHES.length];
}

/** Delegation lifecycle → human label + swatch index. The Kanban columns use this order. */
export const STATUS_META: Record<ItemStatus, { label: string; swatch: number }> = {
  unassigned: { label: "Unassigned", swatch: 0 },
  assigned: { label: "Assigned", swatch: 1 },
  accepted: { label: "Accepted", swatch: 2 },
  in_progress: { label: "In Progress", swatch: 5 },
  submitted: { label: "Submitted", swatch: 8 },
  changes_requested: { label: "Changes Requested", swatch: 7 },
  approved: { label: "Approved", swatch: 4 },
};

export const STATUS_ORDER: ItemStatus[] = [
  "unassigned",
  "assigned",
  "accepted",
  "in_progress",
  "submitted",
  "changes_requested",
  "approved",
];

export const PRIORITY_META: Record<Priority, { label: string; swatch: number }> = {
  low: { label: "Low", swatch: 0 },
  medium: { label: "Medium", swatch: 1 },
  high: { label: "High", swatch: 6 },
  urgent: { label: "Urgent", swatch: 7 },
};
