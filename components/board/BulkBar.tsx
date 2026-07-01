"use client";

import { ArrowRight, Flag, Trash2, UserPlus, X } from "lucide-react";
import { useState } from "react";
import type { Priority } from "@/db/schema";
import { bulkUpdateItemsAction, type BulkPatch } from "@/lib/actions/bulk";
import type { SnapshotMember } from "@/lib/board/types";
import { Avatar } from "@/components/ui/avatar";
import { Menu, MenuItem } from "@/components/ui/menu";
import { PriorityPill } from "@/components/board/pills";

const PRIORITIES: Priority[] = ["urgent", "high", "medium", "low"];

export function BulkBar({
  orgSlug,
  boardId,
  itemIds,
  members,
  boards,
  onDone,
  onClear,
}: {
  orgSlug: string;
  boardId: string;
  itemIds: string[];
  members: SnapshotMember[];
  boards: { id: string; name: string }[];
  onDone: () => void;
  onClear: () => void;
}) {
  const [busy, setBusy] = useState(false);
  async function run(patch: BulkPatch) {
    setBusy(true);
    await bulkUpdateItemsAction(orgSlug, boardId, itemIds, patch);
    setBusy(false);
    onDone();
  }
  const btn = "flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-sm text-slate-600 hover:bg-slate-100 disabled:opacity-50";

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-5 z-40 flex justify-center px-4">
      <div className="tl-pop pointer-events-auto flex items-center gap-1 rounded-2xl border border-slate-200 bg-white px-2 py-1.5 shadow-xl">
        <span className="px-2 text-sm font-semibold text-slate-800">{itemIds.length} selected</span>
        <div className="mx-1 h-5 w-px bg-slate-200" />

        <Menu width={220} trigger={({ toggle }) => (<button disabled={busy} onClick={toggle} className={btn}><UserPlus size={15} /> Assign</button>)}>
          {(close) => (
            <>
              {members.map((m) => (
                <MenuItem key={m.id} onClick={() => { close(); run({ assigneeId: m.id }); }}>
                  <Avatar name={m.name} email={m.email} size={22} /> <span className="truncate">{m.name ?? m.email}</span>
                </MenuItem>
              ))}
              <div className="my-1 border-t border-slate-100" />
              <MenuItem className="text-slate-400" onClick={() => { close(); run({ assigneeId: null }); }}>Unassign</MenuItem>
            </>
          )}
        </Menu>

        <Menu width={150} trigger={({ toggle }) => (<button disabled={busy} onClick={toggle} className={btn}><Flag size={15} /> Priority</button>)}>
          {(close) => (
            <>
              {PRIORITIES.map((p) => (
                <MenuItem key={p} onClick={() => { close(); run({ priority: p }); }}><PriorityPill priority={p} /></MenuItem>
              ))}
              <div className="my-1 border-t border-slate-100" />
              <MenuItem className="text-slate-400" onClick={() => { close(); run({ priority: null }); }}>Clear</MenuItem>
            </>
          )}
        </Menu>

        <label className={btn}>
          Due
          <input type="date" disabled={busy} onChange={(e) => run({ dueDate: e.target.value ? new Date(e.target.value).toISOString() : null })} className="bg-transparent text-xs outline-none disabled:opacity-50" />
        </label>

        {boards.filter((b) => b.id !== boardId).length > 0 && (
          <Menu width={200} trigger={({ toggle }) => (<button disabled={busy} onClick={toggle} className={btn}><ArrowRight size={15} /> Move</button>)}>
            {(close) => boards.filter((b) => b.id !== boardId).map((b) => (
              <MenuItem key={b.id} onClick={() => { close(); run({ moveBoardId: b.id }); }}>{b.name}</MenuItem>
            ))}
          </Menu>
        )}

        <button disabled={busy} onClick={() => { if (window.confirm(`Delete ${itemIds.length} task(s)?`)) run({ delete: true }); }} className="flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50">
          <Trash2 size={15} /> Delete
        </button>
        <button onClick={onClear} className="ml-1 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100" aria-label="Clear selection"><X size={16} /></button>
      </div>
    </div>
  );
}
