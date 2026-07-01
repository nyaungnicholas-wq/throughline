"use client";

import { format } from "date-fns";
import { STATUS_META, swatch } from "@/lib/board/palette";
import type { ClientBoardSnapshot } from "@/lib/board/types";
import { Avatar } from "@/components/ui/avatar";

export function TimelineView({
  snapshot,
  onOpenItem,
}: {
  snapshot: ClientBoardSnapshot;
  onOpenItem: (id: string) => void;
}) {
  const scheduled = snapshot.items.filter((i) => i.dueDate);
  const unscheduled = snapshot.items.length - scheduled.length;

  if (scheduled.length === 0) {
    return (
      <div className="px-6 py-10 text-sm text-slate-400">
        No tasks have due dates yet — set due dates to see them on the timeline.
        {unscheduled > 0 && ` (${unscheduled} task${unscheduled === 1 ? "" : "s"} without a date.)`}
      </div>
    );
  }

  const rows = scheduled.map((i) => {
    const end = new Date(i.dueDate!).getTime();
    const start = Math.min(new Date(i.createdAt).getTime(), end);
    return { item: i, start, end };
  });

  let rangeStart = Math.min(...rows.map((r) => r.start));
  let rangeEnd = Math.max(...rows.map((r) => r.end));
  const pad = (rangeEnd - rangeStart) * 0.06 || 86400_000 * 3;
  rangeStart -= pad;
  rangeEnd += pad;
  const span = rangeEnd - rangeStart || 1;
  const pct = (t: number) => ((t - rangeStart) / span) * 100;

  const ticks = Array.from({ length: 6 }, (_, i) => {
    const t = rangeStart + (span * i) / 5;
    return { left: (i / 5) * 100, label: format(new Date(t), "MMM d") };
  });
  const now = Date.now();
  const showToday = now >= rangeStart && now <= rangeEnd;

  return (
    <div className="tl-scroll overflow-auto px-6 py-4">
      <div className="min-w-[760px]">
        {/* axis */}
        <div className="flex border-b border-slate-200 pb-1">
          <div className="w-52 shrink-0" />
          <div className="relative h-5 flex-1">
            {ticks.map((t, i) => (
              <span key={i} className="absolute -translate-x-1/2 text-[11px] text-slate-400" style={{ left: `${t.left}%` }}>{t.label}</span>
            ))}
          </div>
        </div>

        {/* rows */}
        <div className="relative">
          {showToday && (
            <div className="pointer-events-none absolute bottom-0 top-0 z-10" style={{ left: `calc(13rem + ${pct(now)}% * (100% - 13rem) / 100)` }}>
              <div className="h-full w-px bg-red-400/70" />
            </div>
          )}
          {rows.map(({ item, start, end }) => {
            const sw = swatch(STATUS_META[item.status].swatch);
            const left = pct(start);
            const width = Math.max(2, pct(end) - left);
            return (
              <div key={item.id} className="flex items-center border-b border-slate-50 py-1.5">
                <div className="flex w-52 shrink-0 items-center gap-2 pr-3">
                  {item.assignee && <Avatar name={item.assignee.name} email={item.assignee.email} size={20} />}
                  <button onClick={() => onOpenItem(item.id)} className="truncate text-left text-sm text-slate-700 hover:text-indigo-700">{item.title}</button>
                </div>
                <div className="relative h-7 flex-1">
                  <button
                    onClick={() => onOpenItem(item.id)}
                    title={`${item.title} · due ${format(new Date(end), "MMM d")}`}
                    className="absolute top-1/2 flex h-5 -translate-y-1/2 items-center overflow-hidden rounded-md px-2 text-[11px] font-medium text-white shadow-sm"
                    style={{ left: `${left}%`, width: `${width}%`, background: sw.dot }}
                  >
                    <span className="truncate">{STATUS_META[item.status].label}</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {unscheduled > 0 && <p className="mt-3 text-xs text-slate-400">{unscheduled} task{unscheduled === 1 ? "" : "s"} without a due date (not shown).</p>}
    </div>
  );
}
