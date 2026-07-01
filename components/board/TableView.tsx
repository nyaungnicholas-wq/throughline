"use client";

import { Plus } from "lucide-react";
import { Fragment, useState } from "react";
import { createItemAction } from "@/lib/actions/items";
import type { ItemGroup } from "@/lib/board/filtering";
import type { ClientBoardSnapshot } from "@/lib/board/types";
import { Avatar } from "@/components/ui/avatar";
import { AddColumnButton } from "@/components/board/AddColumnButton";
import { Cell } from "@/components/board/Cell";
import { PriorityPill, StatusPill } from "@/components/board/pills";
import { cn } from "@/lib/cn";
import { fmtDate, isOverdue } from "@/lib/time";

export function TableView({
  orgSlug,
  snapshot,
  groups,
  selected,
  onToggle,
  onToggleAll,
  onOpenItem,
  onChanged,
}: {
  orgSlug: string;
  snapshot: ClientBoardSnapshot;
  groups: ItemGroup[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  onToggleAll: (ids: string[], checked: boolean) => void;
  onOpenItem: (id: string) => void;
  onChanged: () => void;
}) {
  const isManager = snapshot.viewer.role !== "member";
  const [newTitle, setNewTitle] = useState("");
  const [adding, setAdding] = useState(false);
  const total = groups.reduce((n, g) => n + g.items.length, 0);
  const grouped = groups.length > 1 || (groups[0] && groups[0].label !== "");
  const allIds = groups.flatMap((g) => g.items.map((i) => i.id));
  const allChecked = allIds.length > 0 && allIds.every((id) => selected.has(id));
  const colCount = 7 + snapshot.columns.length;

  async function add() {
    const t = newTitle.trim();
    if (!t) return;
    setAdding(true);
    await createItemAction(orgSlug, snapshot.board.id, t);
    setNewTitle("");
    setAdding(false);
    onChanged();
  }

  return (
    <div className="tl-scroll overflow-x-auto px-6 py-4">
      <table className="w-full min-w-[760px] border-separate border-spacing-0 text-sm">
        <thead>
          <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
            <th className="w-8 border-b border-slate-200 py-2 pl-2">
              <input type="checkbox" checked={allChecked} onChange={(e) => onToggleAll(allIds, e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-indigo-600" aria-label="Select all" />
            </th>
            <Th className="w-[34%] pl-2">Task</Th>
            <Th>Status</Th>
            <Th>Owner</Th>
            <Th>Priority</Th>
            <Th>Due</Th>
            {snapshot.columns.map((c) => <Th key={c.id}>{c.name}</Th>)}
            <th className="border-b border-slate-200 py-2">
              {isManager && <AddColumnButton orgSlug={orgSlug} boardId={snapshot.board.id} onChanged={onChanged} />}
            </th>
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => (
            <Fragment key={g.key}>
              {grouped && g.label && (
                <tr>
                  <td colSpan={colCount} className="bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-500">
                    {g.label} <span className="font-normal text-slate-300">· {g.items.length}</span>
                  </td>
                </tr>
              )}
              {g.items.map((it) => (
            <tr key={it.id} className={cn("group hover:bg-slate-50/70", selected.has(it.id) && "bg-indigo-50/60")}>
              <Td className="w-8 pl-2">
                <input type="checkbox" checked={selected.has(it.id)} onChange={() => onToggle(it.id)} className="h-4 w-4 rounded border-slate-300 text-indigo-600" aria-label="Select task" />
              </Td>
              <Td className="pl-2">
                <button onClick={() => onOpenItem(it.id)} className="block max-w-[320px] truncate text-left font-medium text-slate-800 hover:text-indigo-700">
                  {it.title}
                </button>
              </Td>
              <Td><button onClick={() => onOpenItem(it.id)}><StatusPill status={it.status} /></button></Td>
              <Td>
                {it.assignee ? (
                  <span className="flex items-center gap-2" title={it.assignee.name ?? it.assignee.email}>
                    <Avatar name={it.assignee.name} email={it.assignee.email} size={24} />
                    <span className="hidden truncate text-slate-600 lg:inline">{it.assignee.name ?? it.assignee.email}</span>
                  </span>
                ) : (
                  <span className="text-slate-300">—</span>
                )}
              </Td>
              <Td><button onClick={() => onOpenItem(it.id)}><PriorityPill priority={it.priority} /></button></Td>
              <Td>
                <span className={cn("text-slate-600", it.dueDate && isOverdue(it.dueDate) && it.status !== "approved" && "font-medium text-red-600")}>
                  {it.dueDate ? fmtDate(it.dueDate) : <span className="text-slate-300">—</span>}
                </span>
              </Td>
              {snapshot.columns.map((c) => (
                <Td key={c.id}>
                  <Cell orgSlug={orgSlug} item={it} column={c} members={snapshot.members} onChanged={onChanged} />
                </Td>
              ))}
              <Td />
            </tr>
              ))}
            </Fragment>
          ))}

          {/* Add row */}
          <tr>
            <td className="py-2 pl-2" colSpan={colCount}>
              <div className="flex items-center gap-2">
                <Plus size={16} className="text-slate-400" />
                <input
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && add()}
                  onBlur={() => newTitle.trim() && add()}
                  disabled={adding}
                  placeholder="Add a task and press Enter"
                  className="w-72 bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400"
                />
              </div>
            </td>
          </tr>
        </tbody>
      </table>

      {total === 0 && (
        <p className="mt-3 text-sm text-slate-400">
          {snapshot.items.length === 0 ? "No tasks yet — add your first one above." : "No tasks match these filters."}
        </p>
      )}
    </div>
  );
}

function Th({ children, className }: { children?: React.ReactNode; className?: string }) {
  return <th className={cn("whitespace-nowrap border-b border-slate-200 px-3 py-2", className)}>{children}</th>;
}
function Td({ children, className }: { children?: React.ReactNode; className?: string }) {
  return <td className={cn("border-b border-slate-100 px-3 py-2 align-middle", className)}>{children}</td>;
}
