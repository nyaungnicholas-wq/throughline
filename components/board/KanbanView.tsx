"use client";

import {
  DndContext,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { useState } from "react";
import type { ItemStatus } from "@/db/schema";
import { transitionAction } from "@/lib/actions/delegation";
import { dragTargetsFor } from "@/lib/delegation-meta";
import { STATUS_META, STATUS_ORDER, swatch } from "@/lib/board/palette";
import type { ClientBoardSnapshot, ClientItem } from "@/lib/board/types";
import { Avatar } from "@/components/ui/avatar";
import { PriorityPill } from "@/components/board/pills";
import { cn } from "@/lib/cn";
import { fmtDate, isOverdue } from "@/lib/time";

export function KanbanView({
  orgSlug,
  snapshot,
  onOpenItem,
  onChanged,
}: {
  orgSlug: string;
  snapshot: ClientBoardSnapshot;
  onOpenItem: (id: string) => void;
  onChanged: () => void;
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const [error, setError] = useState<string | null>(null);

  async function onDragEnd(e: DragEndEvent) {
    const itemId = String(e.active.id);
    const target = e.over?.id as ItemStatus | undefined;
    if (!target) return;
    const item = snapshot.items.find((i) => i.id === itemId);
    if (!item || item.status === target) return;
    const action = dragTargetsFor(item, snapshot.viewer, snapshot.boardOwnerId)[target];
    if (!action) {
      setError(`Can't move "${item.title}" to ${STATUS_META[target].label} from here.`);
      setTimeout(() => setError(null), 2600);
      return;
    }
    const res = await transitionAction(orgSlug, snapshot.board.id, itemId, action, { expectedVersion: item.version });
    if (!res.ok) {
      setError(res.error);
      setTimeout(() => setError(null), 2600);
    }
    onChanged();
  }

  return (
    <div className="flex h-full flex-col">
      {error && (
        <div className="mx-6 mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">{error}</div>
      )}
      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        <div className="tl-scroll flex flex-1 gap-3 overflow-x-auto px-6 py-4">
          {STATUS_ORDER.map((status) => {
            const cards = snapshot.items.filter((i) => i.status === status);
            return (
              <Column key={status} status={status} count={cards.length}>
                {cards.map((it) => (
                  <Card key={it.id} item={it} onOpen={() => onOpenItem(it.id)} />
                ))}
              </Column>
            );
          })}
        </div>
      </DndContext>
    </div>
  );
}

function Column({ status, count, children }: { status: ItemStatus; count: number; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const meta = STATUS_META[status];
  const sw = swatch(meta.swatch);
  return (
    <div className="flex w-72 shrink-0 flex-col">
      <div className="mb-2 flex items-center gap-2 px-1">
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: sw.dot }} />
        <span className="text-sm font-semibold text-slate-700">{meta.label}</span>
        <span className="text-xs text-slate-400">{count}</span>
      </div>
      <div
        ref={setNodeRef}
        className={cn(
          "tl-scroll flex min-h-24 flex-1 flex-col gap-2 overflow-y-auto rounded-xl border border-dashed p-2 transition-colors",
          isOver ? "border-indigo-300 bg-indigo-50/50" : "border-slate-200 bg-slate-50/40",
        )}
      >
        {children}
      </div>
    </div>
  );
}

function Card({ item, onOpen }: { item: ClientItem; onOpen: () => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: item.id });
  return (
    <button
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onClick={onOpen}
      style={{ transform: CSS.Translate.toString(transform), opacity: isDragging ? 0.5 : 1 }}
      className="cursor-grab rounded-xl border border-slate-200 bg-white p-3 text-left shadow-sm transition-shadow duration-150 hover:shadow-md active:cursor-grabbing"
    >
      <p className="mb-2 line-clamp-2 text-sm font-medium text-slate-800">{item.title}</p>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          {item.priority && <PriorityPill priority={item.priority} />}
          {item.dueDate && (
            <span className={cn("text-xs text-slate-400", isOverdue(item.dueDate) && item.status !== "approved" && "font-medium text-red-500")}>
              {fmtDate(item.dueDate)}
            </span>
          )}
        </div>
        {item.assignee && <Avatar name={item.assignee.name} email={item.assignee.email} size={22} />}
      </div>
    </button>
  );
}
