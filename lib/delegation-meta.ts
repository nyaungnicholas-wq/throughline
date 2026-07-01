import type { Item, ItemStatus } from "@/db/schema";

/** Client-safe delegation rules — no server imports, so UI can read them directly. */

export type TransitionAction =
  | "assign"
  | "reassign"
  | "accept"
  | "start"
  | "submit"
  | "approve"
  | "requestChanges";

export type Actor = "manager" | "assignee";

export type TransitionDef = {
  label: string;
  from: ItemStatus[];
  to: ItemStatus;
  actor: Actor;
  /** Actor must NOT be the current assignee — "no approving your own work". */
  notSelf?: boolean;
};

export const TRANSITIONS: Record<TransitionAction, TransitionDef> = {
  assign: { label: "Assign", from: ["unassigned"], to: "assigned", actor: "manager" },
  reassign: {
    label: "Reassign",
    from: ["assigned", "accepted", "in_progress", "submitted", "changes_requested"],
    to: "assigned",
    actor: "manager",
  },
  accept: { label: "Accept", from: ["assigned"], to: "accepted", actor: "assignee" },
  start: { label: "Start work", from: ["accepted"], to: "in_progress", actor: "assignee" },
  submit: {
    label: "Submit for review",
    from: ["in_progress", "changes_requested"],
    to: "submitted",
    actor: "assignee",
  },
  approve: { label: "Approve", from: ["submitted"], to: "approved", actor: "manager", notSelf: true },
  requestChanges: { label: "Request changes", from: ["submitted"], to: "changes_requested", actor: "manager", notSelf: true },
};

export type ActionTone = "primary" | "approve" | "changes" | "neutral";
export const ACTION_TONE: Record<TransitionAction, ActionTone> = {
  assign: "neutral",
  reassign: "neutral",
  accept: "primary",
  start: "primary",
  submit: "primary",
  approve: "approve",
  requestChanges: "changes",
};

/** Which transitions a viewer can attempt on an item right now (for rendering buttons).
    A board owner counts as a manager on their own board. */
export function availableActions(
  item: Pick<Item, "status" | "assigneeId">,
  viewer: { id: string; role: "owner" | "manager" | "member" },
  boardOwnerId?: string | null,
): TransitionAction[] {
  const isManager = viewer.role !== "member" || viewer.id === boardOwnerId;
  const isAssignee = item.assigneeId === viewer.id;
  return (Object.keys(TRANSITIONS) as TransitionAction[]).filter((a) => {
    const def = TRANSITIONS[a];
    if (!def.from.includes(item.status)) return false;
    if (def.actor === "manager" && !isManager) return false;
    if (def.actor === "assignee" && !isAssignee) return false;
    if (def.notSelf && isAssignee) return false;
    return true;
  });
}

/** Statuses a Kanban card can be dragged INTO (drag never assigns/reassigns). */
export function dragTargetsFor(
  item: Pick<Item, "status" | "assigneeId">,
  viewer: { id: string; role: "owner" | "manager" | "member" },
  boardOwnerId?: string | null,
): Partial<Record<ItemStatus, TransitionAction>> {
  const out: Partial<Record<ItemStatus, TransitionAction>> = {};
  for (const a of availableActions(item, viewer, boardOwnerId)) {
    if (a === "assign" || a === "reassign") continue;
    out[TRANSITIONS[a].to] = a;
  }
  return out;
}
