"use client";

import { Crown } from "lucide-react";
import { setBoardOwnerAction } from "@/lib/actions/boards";
import type { SnapshotMember } from "@/lib/board/types";
import { Avatar } from "@/components/ui/avatar";
import { Menu, MenuItem } from "@/components/ui/menu";

export function BoardOwnerControl({
  orgSlug,
  boardId,
  ownerId,
  members,
  canManage,
  onChanged,
}: {
  orgSlug: string;
  boardId: string;
  ownerId: string | null;
  members: SnapshotMember[];
  canManage: boolean;
  onChanged: () => void;
}) {
  const owner = members.find((m) => m.id === ownerId) ?? null;

  const chip = (
    <span className="flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800">
      <Crown size={13} className="text-amber-500" />
      {owner ? (
        <>
          <Avatar name={owner.name} email={owner.email} size={18} />
          <span className="hidden sm:inline">{owner.name ?? owner.email}</span>
        </>
      ) : (
        <span>Assign a lead</span>
      )}
    </span>
  );

  if (!canManage) return owner ? chip : null;

  return (
    <Menu
      width={220}
      trigger={({ toggle }) => (
        <button onClick={toggle} title="Project lead — delegate this board" className="transition-opacity hover:opacity-80">
          {chip}
        </button>
      )}
    >
      {(close) => (
        <>
          <div className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Hand off this board to</div>
          {members.map((m) => (
            <MenuItem key={m.id} onClick={() => { close(); setBoardOwnerAction(orgSlug, boardId, m.id).then(onChanged); }}>
              <Avatar name={m.name} email={m.email} size={22} /> <span className="truncate">{m.name ?? m.email}</span>
            </MenuItem>
          ))}
          {owner && (
            <>
              <div className="my-1 border-t border-slate-100" />
              <MenuItem className="text-slate-400" onClick={() => { close(); setBoardOwnerAction(orgSlug, boardId, null).then(onChanged); }}>Remove lead</MenuItem>
            </>
          )}
        </>
      )}
    </Menu>
  );
}
