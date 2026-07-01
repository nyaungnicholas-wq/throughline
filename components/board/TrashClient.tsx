"use client";

import { RotateCcw, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { restoreBoardAction } from "@/lib/actions/boards";
import { restoreItemAction } from "@/lib/actions/items";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/misc";
import { timeAgo } from "@/lib/time";

export type TrashItem = { id: string; title: string; boardName: string; deletedAt: string };
export type TrashBoard = { id: string; name: string; deletedAt: string };

export function TrashClient({
  orgSlug,
  items,
  boards,
}: {
  orgSlug: string;
  items: TrashItem[];
  boards: TrashBoard[];
}) {
  const router = useRouter();

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Trash</h1>
        <p className="text-sm text-slate-500">Deleted items from the last 30 days. Restore anything that shouldn&apos;t be gone.</p>
      </div>

      {boards.length === 0 && items.length === 0 ? (
        <EmptyState icon={<Trash2 size={40} />} title="Trash is empty" hint="Deleted boards and tasks show up here so you can undo." />
      ) : (
        <div className="space-y-6">
          {boards.length > 0 && (
            <section>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Deleted boards</h2>
              <div className="space-y-2">
                {boards.map((b) => (
                  <div key={b.id} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-slate-800">{b.name}</p>
                      <p className="text-xs text-slate-400">deleted {timeAgo(b.deletedAt)}</p>
                    </div>
                    <Button size="sm" variant="secondary" onClick={async () => { await restoreBoardAction(orgSlug, b.id); router.refresh(); }}>
                      <RotateCcw size={14} /> Restore
                    </Button>
                  </div>
                ))}
              </div>
            </section>
          )}

          {items.length > 0 && (
            <section>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Deleted tasks</h2>
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                {items.map((it, i) => (
                  <div key={it.id} className={`flex items-center gap-3 px-4 py-2.5 ${i > 0 ? "border-t border-slate-100" : ""}`}>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-slate-700">{it.title}</p>
                      <p className="text-xs text-slate-400">{it.boardName} · deleted {timeAgo(it.deletedAt)}</p>
                    </div>
                    <button onClick={async () => { await restoreItemAction(orgSlug, it.id); router.refresh(); }} className="flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-800">
                      <RotateCcw size={13} /> Restore
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
