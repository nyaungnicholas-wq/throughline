"use client";

import { Clock, Play, Plus, Square, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { deleteTimeEntryAction, logTimeAction, setEstimateAction } from "@/lib/actions/time";
import { cn } from "@/lib/cn";

function fmt(min: number): string {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h ? `${h}h ${m}m` : `${m}m`;
}
function clock(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

type Entry = { id: string; minutes: number; note: string | null; userName: string | null };

export function TimeSection({
  orgSlug,
  itemId,
  estimateMinutes,
  spentMinutes,
  entries,
  onChanged,
}: {
  orgSlug: string;
  itemId: string;
  estimateMinutes: number | null;
  spentMinutes: number;
  entries: Entry[];
  onChanged: () => void;
}) {
  const [est, setEst] = useState(estimateMinutes != null ? String(estimateMinutes) : "");
  const [logMin, setLogMin] = useState("");
  const [running, setRunning] = useState<number | null>(null);
  const [, setTick] = useState(0);
  const key = `tl_timer_${itemId}`;
  const estRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const v = typeof window !== "undefined" ? localStorage.getItem(key) : null;
    if (v) setRunning(Number(v));
  }, [key]);
  useEffect(() => {
    if (running == null) return;
    const i = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(i);
  }, [running]);
  useEffect(() => {
    if (document.activeElement !== estRef.current) setEst(estimateMinutes != null ? String(estimateMinutes) : "");
  }, [estimateMinutes]);

  const start = () => { const now = Date.now(); localStorage.setItem(key, String(now)); setRunning(now); };
  async function stop() {
    if (running == null) return;
    const mins = Math.max(1, Math.round((Date.now() - running) / 60000));
    localStorage.removeItem(key);
    setRunning(null);
    await logTimeAction(orgSlug, itemId, mins);
    onChanged();
  }
  async function saveEst() {
    const v = est.trim() === "" ? null : Number(est);
    if (v !== estimateMinutes) { await setEstimateAction(orgSlug, itemId, v); onChanged(); }
  }
  async function log() {
    const m = Number(logMin);
    if (!(m > 0)) return;
    await logTimeAction(orgSlug, itemId, m);
    setLogMin("");
    onChanged();
  }

  const elapsedSec = running != null ? Math.floor((Date.now() - running) / 1000) : 0;
  const pct = estimateMinutes && estimateMinutes > 0 ? Math.round((100 * spentMinutes) / estimateMinutes) : 0;
  const over = estimateMinutes != null && spentMinutes > estimateMinutes;

  return (
    <section>
      <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500"><Clock size={13} /> Time</h3>

      <div className="mb-2 flex items-center gap-3 text-sm">
        <label className="flex items-center gap-1.5 text-slate-500">
          Estimate
          <input ref={estRef} type="number" min={0} value={est} onChange={(e) => setEst(e.target.value)} onBlur={saveEst} placeholder="—" className="w-16 rounded-lg border border-slate-200 px-2 py-1 text-sm outline-none focus:border-indigo-400" />
          <span className="text-xs text-slate-400">min</span>
        </label>
        <span className="text-slate-300">·</span>
        <span className="text-slate-600">Spent <b>{fmt(spentMinutes)}</b></span>
      </div>

      {estimateMinutes != null && estimateMinutes > 0 && (
        <div className="mb-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
          <div className={cn("h-full rounded-full", over ? "bg-red-500" : "bg-indigo-500")} style={{ width: `${Math.min(100, pct)}%` }} />
        </div>
      )}

      <div className="mb-2 flex items-center gap-2">
        {running != null ? (
          <button onClick={stop} className="flex h-8 items-center gap-1.5 rounded-lg bg-red-50 px-2.5 text-sm font-medium text-red-700 hover:bg-red-100">
            <Square size={13} /> Stop · {clock(elapsedSec)}
          </button>
        ) : (
          <button onClick={start} className="flex h-8 items-center gap-1.5 rounded-lg bg-indigo-50 px-2.5 text-sm font-medium text-indigo-700 hover:bg-indigo-100">
            <Play size={13} /> Start timer
          </button>
        )}
        <div className="flex items-center gap-1">
          <input type="number" min={1} value={logMin} onChange={(e) => setLogMin(e.target.value)} onKeyDown={(e) => e.key === "Enter" && log()} placeholder="mins" className="w-16 rounded-lg border border-slate-200 px-2 py-1 text-sm outline-none focus:border-indigo-400" />
          <button onClick={log} disabled={!(Number(logMin) > 0)} className="flex h-8 items-center gap-1 rounded-lg px-2 text-sm text-slate-600 hover:bg-slate-100 disabled:opacity-40"><Plus size={13} /> Log</button>
        </div>
      </div>

      {entries.length > 0 && (
        <ul className="space-y-0.5">
          {entries.map((e) => (
            <li key={e.id} className="group flex items-center gap-2 text-xs text-slate-500">
              <span className="font-medium text-slate-700">{fmt(e.minutes)}</span>
              <span className="truncate">· {e.userName ?? "Someone"}{e.note ? ` — ${e.note}` : ""}</span>
              <button onClick={async () => { await deleteTimeEntryAction(orgSlug, e.id); onChanged(); }} className="ml-auto text-slate-300 opacity-0 hover:text-red-600 group-hover:opacity-100"><X size={12} /></button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
