"use client";

import { AlertTriangle, CheckCheck, Users2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ItemStatus, Priority } from "@/db/schema";
import type { SnapshotMember } from "@/lib/board/types";
import { Avatar } from "@/components/ui/avatar";
import { Drawer } from "@/components/ui/overlay";
import { ItemDrawer } from "@/components/board/ItemDrawer";
import { PriorityPill } from "@/components/board/pills";
import { cn } from "@/lib/cn";
import { fmtDate } from "@/lib/time";

export type DashRow = {
  id: string;
  title: string;
  boardId: string;
  boardName: string;
  assigneeName: string | null;
  dueDate: string | null;
  priority: Priority | null;
  status: ItemStatus;
};
export type WorkloadRow = { userId: string; name: string | null; email: string; active: number; overdue: number };

export function DashboardView({
  orgSlug,
  orgName,
  pending,
  overdue,
  workload,
  members,
  viewer,
}: {
  orgSlug: string;
  orgName: string;
  pending: DashRow[];
  overdue: DashRow[];
  workload: WorkloadRow[];
  members: SnapshotMember[];
  viewer: { id: string; role: "owner" | "manager" | "member" };
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<{ itemId: string; boardId: string } | null>(null);
  const maxActive = Math.max(1, ...workload.map((w) => w.active));

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Dashboard</h1>
        <p className="text-sm text-slate-500">{orgName} · team overview</p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Tile title="Pending your approval" count={pending.length} accent="indigo" icon={<CheckCheck size={16} />}>
          {pending.length === 0 ? (
            <Empty text="Nothing waiting on you. 🎉" />
          ) : (
            pending.map((r) => (
              <Row key={r.id} r={r} onClick={() => setSelected({ itemId: r.id, boardId: r.boardId })} />
            ))
          )}
        </Tile>

        <Tile title="Overdue" count={overdue.length} accent="red" icon={<AlertTriangle size={16} />}>
          {overdue.length === 0 ? (
            <Empty text="Nothing overdue." />
          ) : (
            overdue.map((r) => (
              <Row key={r.id} r={r} due onClick={() => setSelected({ itemId: r.id, boardId: r.boardId })} />
            ))
          )}
        </Tile>
      </div>

      <div className="mt-4">
        <Tile title="Workload by person" count={workload.length} accent="slate" icon={<Users2 size={16} />}>
          {workload.length === 0 ? (
            <Empty text="No assigned work yet." />
          ) : (
            <div className="space-y-3 py-1">
              {workload.map((w) => (
                <div key={w.userId} className="flex items-center gap-3">
                  <Avatar name={w.name} email={w.email} size={28} />
                  <span className="w-40 shrink-0 truncate text-sm text-slate-700">{w.name ?? w.email}</span>
                  <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-indigo-500" style={{ width: `${(w.active / maxActive) * 100}%` }} />
                  </div>
                  <span className="w-24 shrink-0 text-right text-sm text-slate-500">
                    {w.active} active{w.overdue > 0 && <span className="text-red-600"> · {w.overdue} late</span>}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Tile>
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

function Tile({ title, count, accent, icon, children }: { title: string; count: number; accent: "indigo" | "red" | "slate"; icon: React.ReactNode; children: React.ReactNode }) {
  const accentClass = { indigo: "bg-indigo-50 text-indigo-600", red: "bg-red-50 text-red-600", slate: "bg-slate-100 text-slate-600" }[accent];
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <span className={cn("flex h-7 w-7 items-center justify-center rounded-lg", accentClass)}>{icon}</span>
        <h2 className="font-semibold text-slate-800">{title}</h2>
        <span className="ml-auto rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500">{count}</span>
      </div>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function Row({ r, due, onClick }: { r: DashRow; due?: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-slate-50">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-slate-800">{r.title}</p>
        <p className="text-xs text-slate-400">{r.boardName}{r.assigneeName ? ` · ${r.assigneeName}` : ""}</p>
      </div>
      {r.priority && <PriorityPill priority={r.priority} />}
      {r.dueDate && (
        <span className={cn("shrink-0 text-xs text-slate-500", due && "font-semibold text-red-600")}>{fmtDate(r.dueDate)}</span>
      )}
    </button>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="px-2 py-4 text-sm text-slate-400">{text}</p>;
}
