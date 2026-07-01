"use client";

import { Bookmark, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { createSavedViewAction, deleteSavedViewAction, listSavedViewsAction, type ClientSavedView } from "@/lib/actions/saved-views";
import { Menu, MenuItem } from "@/components/ui/menu";
import type { BoardControls } from "@/lib/board/filtering";

export function SavedViewsMenu({
  orgSlug,
  boardId,
  controls,
  onApply,
}: {
  orgSlug: string;
  boardId: string;
  controls: BoardControls;
  onApply: (c: BoardControls) => void;
}) {
  const [views, setViews] = useState<ClientSavedView[]>([]);
  const load = async () => setViews(await listSavedViewsAction(orgSlug, boardId));

  return (
    <Menu
      width={240}
      trigger={({ toggle }) => (
        <button
          onClick={() => { toggle(); load(); }}
          className="flex h-8 items-center gap-1.5 rounded-lg px-2 text-xs font-medium text-slate-600 hover:bg-slate-100"
        >
          <Bookmark size={13} /> Views
        </button>
      )}
    >
      {(close) => (
        <>
          {views.length === 0 && <p className="px-3 py-2 text-xs text-slate-400">No saved views yet.</p>}
          {views.map((v) => (
            <div key={v.id} className="group flex items-center">
              <MenuItem onClick={() => { onApply(v.config as unknown as BoardControls); close(); }} className="flex-1">{v.name}</MenuItem>
              <button onClick={async () => { await deleteSavedViewAction(orgSlug, v.id); load(); }} className="px-2 text-slate-300 hover:text-red-600"><Trash2 size={13} /></button>
            </div>
          ))}
          <div className="my-1 border-t border-slate-100" />
          <MenuItem
            onClick={async () => {
              const name = window.prompt("Save current filters/sort/group as:");
              if (name && name.trim()) { await createSavedViewAction(orgSlug, boardId, name, controls as unknown as Record<string, unknown>); await load(); }
            }}
          >
            <Plus size={14} /> Save current view
          </MenuItem>
        </>
      )}
    </Menu>
  );
}
