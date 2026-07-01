"use client";

import { Plus, Target, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createGoalAction, deleteGoalAction } from "@/lib/actions/goals";
import type { ClientGoal } from "@/lib/goals";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/field";
import { Modal } from "@/components/ui/overlay";
import { EmptyState } from "@/components/ui/misc";
import { fmtDate, isOverdue } from "@/lib/time";

export function GoalsClient({
  orgSlug,
  goals,
  boards,
}: {
  orgSlug: string;
  goals: ClientGoal[];
  boards: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [due, setDue] = useState("");
  const [busy, setBusy] = useState(false);

  const toggle = (id: string) => setPicked((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const r = await createGoalAction(orgSlug, { name, boardIds: [...picked], dueDate: due ? new Date(due).toISOString() : null });
    setBusy(false);
    if (r.ok) { setOpen(false); setName(""); setPicked(new Set()); setDue(""); router.refresh(); }
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Goals</h1>
          <p className="text-sm text-slate-500">Roll up progress across boards for the bigger picture.</p>
        </div>
        <Button onClick={() => setOpen(true)}><Plus size={15} /> New goal</Button>
      </div>

      {goals.length === 0 ? (
        <EmptyState icon={<Target size={40} />} title="No goals yet" hint="Create a goal and link a few boards to track combined progress." action={<Button onClick={() => setOpen(true)}>New goal</Button>} />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {goals.map((g) => (
            <div key={g.id} className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-3 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="truncate font-semibold text-slate-900">{g.name}</h3>
                  {g.dueDate && <p className={`text-xs ${isOverdue(g.dueDate) && g.pct < 100 ? "font-medium text-red-600" : "text-slate-400"}`}>due {fmtDate(g.dueDate)}</p>}
                </div>
                <button onClick={async () => { if (confirm(`Delete goal “${g.name}”?`)) { await deleteGoalAction(orgSlug, g.id); router.refresh(); } }} className="text-slate-300 opacity-0 hover:text-red-600 group-hover:opacity-100"><Trash2 size={15} /></button>
              </div>
              <div className="mb-1 flex items-baseline justify-between">
                <span className="text-2xl font-bold text-slate-900">{g.pct}%</span>
                <span className="text-xs text-slate-400">{g.done}/{g.total} tasks done</span>
              </div>
              <div className="mb-3 h-2 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-indigo-500" style={{ width: `${g.pct}%` }} />
              </div>
              <div className="flex flex-wrap gap-1">
                {g.boards.map((b) => <span key={b.id} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">{b.name}</span>)}
                {g.boards.length === 0 && <span className="text-xs text-slate-400">No boards linked</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="New goal" width={480}>
        <form onSubmit={create} className="space-y-4 p-5">
          <div>
            <Label>Goal name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ship Q3 roadmap" required autoFocus />
          </div>
          <div>
            <Label>Due date (optional)</Label>
            <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
          </div>
          <div>
            <Label>Boards to roll up</Label>
            <div className="max-h-44 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2">
              {boards.length === 0 && <p className="px-1 text-sm text-slate-400">No boards yet.</p>}
              {boards.map((b) => (
                <label key={b.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-slate-50">
                  <input type="checkbox" checked={picked.has(b.id)} onChange={() => toggle(b.id)} className="h-4 w-4 rounded border-slate-300 text-indigo-600" />
                  {b.name}
                </label>
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" size="sm" disabled={busy || name.trim().length < 2}>{busy ? "Creating…" : "Create goal"}</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
