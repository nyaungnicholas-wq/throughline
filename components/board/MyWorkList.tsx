"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ItemStatus, Priority } from "@/db/schema";
import type { SnapshotMember } from "@/lib/board/types";
import { Drawer } from "@/components/ui/overlay";
import { EmptyState } from "@/components/ui/misc";
import { ItemDrawer } from "@/components/board/ItemDrawer";
import { PriorityPill, StatusPill } from "@/components/board/pills";
import { CalendarPlus, ListChecks } from "lucide-react";
import { cn } from "@/lib/cn";
import { fmtDate, isOverdue } from "@/lib/time";

export type MyWorkRow = {
  id: string;
  title: string;
  status: ItemStatus;
  priority: Priority | null;
  dueDate: string | null;
  boardId: string;
  boardName: string;
};

const GROUPS: Array<{ key: string; label: string; match: (s: ItemStatus) => boolean }> = [
  { key: "todo", label: "To accept", match: (s) => s === "assigned" },
  { key: "doing", label: "In progress", match: (s) => s === "accepted" || s === "in_progress" || s === "changes_requested" },
  { key: "review", label: "Awaiting review", match: (s) => s === "submitted" },
  { key: "done", label: "Approved", match: (s) => s === "approved" },
];

export function MyWorkList({
  orgSlug,
  rows,
  members,
  viewer,
  icalPath,
}: {
  orgSlug: string;
  rows: MyWorkRow[];
  members: SnapshotMember[];
  viewer: { id: string; role: "owner" | "manager" | "member" };
  icalPath: string;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<{ itemId: string; boardId: string } | null>(null);

  if (rows.length === 0) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-10">
        <Header icalPath={icalPath} />
        <EmptyState icon={<ListChecks size={40} />} title="Nothing assigned to you yet" hint="When a manager delegates a task to you, it shows up here." />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <Header icalPath={icalPath} />
      <div className="space-y-6">
        {GROUPS.map((g) => {
          const items = rows.filter((r) => g.match(r.status));
          if (items.length === 0) return null;
          return (
            <section key={g.key}>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                {g.label} <span className="text-slate-300">· {items.length}</span>
              </h2>
              <div className="space-y-2">
                {items.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => setSelected({ itemId: r.id, boardId: r.boardId })}
                    className="flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-left shadow-sm transition hover:border-indigo-200 hover:shadow"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-slate-800">{r.title}</p>
                      <p className="text-xs text-slate-400">{r.boardName}</p>
                    </div>
                    {r.priority && <PriorityPill priority={r.priority} />}
                    {r.dueDate && (
                      <span className={cn("text-xs text-slate-500", isOverdue(r.dueDate) && r.status !== "approved" && "font-semibold text-red-600")}>
                        {fmtDate(r.dueDate)}
                      </span>
                    )}
                    <StatusPill status={r.status} />
                  </button>
                ))}
              </div>
            </section>
          );
        })}
      </div>

      <Drawer open={selected !== null} onClose={() => setSelected(null)}>
        {selected && (
          <ItemDrawer
            key={selected.itemId}
            orgSlug={orgSlug}
            boardId={selected.boardId}
            itemId={selected.itemId}
            members={members}
            viewer={viewer}
            onClose={() => setSelected(null)}
            onBoardChanged={() => router.refresh()}
          />
        )}
      </Drawer>
    </div>
  );
}

function Header({ icalPath }: { icalPath: string }) {
  return (
    <div className="mb-6 flex items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">My Work</h1>
        <p className="text-sm text-slate-500">Everything delegated to you, in one queue.</p>
      </div>
      <a href={icalPath} className="flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-500 hover:bg-slate-50" title="Subscribe to your due dates in any calendar app">
        <CalendarPlus size={14} /> Subscribe (iCal)
      </a>
    </div>
  );
}
