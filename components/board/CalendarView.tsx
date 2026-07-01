"use client";

import { addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format, isSameDay, isSameMonth, startOfMonth, startOfWeek } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";
import { STATUS_META, swatch } from "@/lib/board/palette";
import type { ClientBoardSnapshot } from "@/lib/board/types";
import { cn } from "@/lib/cn";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function CalendarView({
  snapshot,
  onOpenItem,
}: {
  snapshot: ClientBoardSnapshot;
  onOpenItem: (id: string) => void;
}) {
  const [cursor, setCursor] = useState(() => new Date());
  const monthStart = startOfMonth(cursor);
  const days = eachDayOfInterval({ start: startOfWeek(monthStart), end: endOfWeek(endOfMonth(monthStart)) });

  const scheduled = snapshot.items.filter((i) => i.dueDate);
  const unscheduled = snapshot.items.length - scheduled.length;

  return (
    <div className="px-6 py-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-lg font-semibold text-slate-800">{format(cursor, "MMMM yyyy")}</h3>
        <div className="flex items-center gap-1">
          <button onClick={() => setCursor(addMonths(cursor, -1))} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"><ChevronLeft size={18} /></button>
          <button onClick={() => setCursor(new Date())} className="rounded-lg px-2 py-1 text-sm text-slate-500 hover:bg-slate-100">Today</button>
          <button onClick={() => setCursor(addMonths(cursor, 1))} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"><ChevronRight size={18} /></button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-xl border border-slate-200 bg-slate-200">
        {WEEKDAYS.map((d) => (
          <div key={d} className="bg-slate-50 py-2 text-center text-xs font-semibold text-slate-400">{d}</div>
        ))}
        {days.map((day) => {
          const inMonth = isSameMonth(day, monthStart);
          const today = isSameDay(day, new Date());
          const dayItems = scheduled.filter((i) => i.dueDate && isSameDay(new Date(i.dueDate), day));
          return (
            <div key={day.toISOString()} className={cn("min-h-24 bg-white p-1.5", !inMonth && "bg-slate-50/60")}>
              <div className={cn("mb-1 text-xs", today ? "font-bold text-indigo-600" : inMonth ? "text-slate-500" : "text-slate-300")}>
                {format(day, "d")}
              </div>
              <div className="space-y-1">
                {dayItems.slice(0, 4).map((it) => {
                  const sw = swatch(STATUS_META[it.status].swatch);
                  return (
                    <button
                      key={it.id}
                      onClick={() => onOpenItem(it.id)}
                      className="block w-full truncate rounded px-1.5 py-1 text-left text-xs font-medium"
                      style={{ background: sw.bg, color: sw.text }}
                      title={it.title}
                    >
                      {it.title}
                    </button>
                  );
                })}
                {dayItems.length > 4 && <span className="px-1 text-[11px] text-slate-400">+{dayItems.length - 4} more</span>}
              </div>
            </div>
          );
        })}
      </div>
      {unscheduled > 0 && (
        <p className="mt-2 text-xs text-slate-400">{unscheduled} task{unscheduled === 1 ? "" : "s"} without a due date.</p>
      )}
    </div>
  );
}
