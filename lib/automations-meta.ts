/** Client-safe catalogs for the automation builder (no server imports). */

export type TriggerType = "status_changed" | "item_created" | "due_passed";
export type ActionType = "notify" | "set_priority" | "assign";

export const TRIGGERS: Array<{ type: TriggerType; label: string; needsStatus?: boolean; note?: string }> = [
  { type: "status_changed", label: "When status changes to", needsStatus: true },
  { type: "item_created", label: "When a task is created" },
  { type: "due_passed", label: "When a task becomes overdue", note: "evaluated on demand / by a scheduled run" },
];

export const ACTIONS: Array<{ type: ActionType; label: string; kind: "target" | "priority" | "user" }> = [
  { type: "notify", label: "notify", kind: "target" },
  { type: "set_priority", label: "set priority to", kind: "priority" },
  { type: "assign", label: "assign to", kind: "user" },
];

export const NOTIFY_TARGETS: Array<{ value: string; label: string }> = [
  { value: "assignee", label: "the assignee" },
  { value: "assigner", label: "the delegator" },
  { value: "user", label: "a specific person" },
];
