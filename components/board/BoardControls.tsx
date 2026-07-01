"use client";

import { Search, X } from "lucide-react";
import type { ItemStatus, Priority } from "@/db/schema";
import { STATUS_META, STATUS_ORDER } from "@/lib/board/palette";
import { controlsActive, DEFAULT_CONTROLS, type BoardControls as Controls } from "@/lib/board/filtering";
import type { SnapshotMember } from "@/lib/board/types";
import { SavedViewsMenu } from "@/components/board/SavedViewsMenu";

const PRIORITIES: Priority[] = ["urgent", "high", "medium", "low"];

function Sel({ value, onChange, children, title }: { value: string; onChange: (v: string) => void; children: React.ReactNode; title: string }) {
  return (
    <select
      title={title}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-600 focus:border-indigo-400 focus:outline-none"
    >
      {children}
    </select>
  );
}

export function BoardControls({
  controls,
  setControls,
  members,
  orgSlug,
  boardId,
}: {
  controls: Controls;
  setControls: (c: Controls) => void;
  members: SnapshotMember[];
  orgSlug: string;
  boardId: string;
}) {
  const set = (patch: Partial<Controls>) => setControls({ ...controls, ...patch });
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-6 py-2">
      <div className="relative">
        <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          value={controls.q}
          onChange={(e) => set({ q: e.target.value })}
          placeholder="Filter tasks…"
          className="h-8 w-44 rounded-lg border border-slate-200 bg-white pl-8 pr-2 text-xs focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
        />
      </div>

      <Sel title="Status" value={controls.status} onChange={(v) => set({ status: v as ItemStatus | "all" })}>
        <option value="all">All statuses</option>
        {STATUS_ORDER.map((s) => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
      </Sel>

      <Sel title="Owner" value={controls.assignee} onChange={(v) => set({ assignee: v })}>
        <option value="all">Anyone</option>
        <option value="unassigned">Unassigned</option>
        {members.map((m) => <option key={m.id} value={m.id}>{m.name ?? m.email}</option>)}
      </Sel>

      <Sel title="Priority" value={controls.priority} onChange={(v) => set({ priority: v as Priority | "all" })}>
        <option value="all">Any priority</option>
        {PRIORITIES.map((p) => <option key={p} value={p}>{p[0].toUpperCase() + p.slice(1)}</option>)}
      </Sel>

      <span className="mx-1 h-5 w-px bg-slate-200" />

      <Sel title="Sort by" value={controls.sort} onChange={(v) => set({ sort: v as Controls["sort"] })}>
        <option value="manual">Sort: manual</option>
        <option value="due">Sort: due date</option>
        <option value="priority">Sort: priority</option>
        <option value="title">Sort: title</option>
        <option value="created">Sort: created</option>
      </Sel>

      <Sel title="Group by (Table)" value={controls.group} onChange={(v) => set({ group: v as Controls["group"] })}>
        <option value="none">Group: none</option>
        <option value="status">Group: status</option>
        <option value="assignee">Group: owner</option>
        <option value="priority">Group: priority</option>
      </Sel>

      {controlsActive(controls) && (
        <button onClick={() => setControls(DEFAULT_CONTROLS)} className="flex h-8 items-center gap-1 rounded-lg px-2 text-xs text-slate-500 hover:bg-slate-100">
          <X size={13} /> Clear
        </button>
      )}

      <div className="ml-auto">
        <SavedViewsMenu orgSlug={orgSlug} boardId={boardId} controls={controls} onApply={setControls} />
      </div>
    </div>
  );
}
