"use client";

import { Plus, Trash2, Zap } from "lucide-react";
import { useState } from "react";
import type { ItemStatus, Priority } from "@/db/schema";
import {
  createAutomationAction,
  deleteAutomationAction,
  listAutomationsAction,
  runDueAutomationsAction,
  toggleAutomationAction,
  type ClientAutomation,
} from "@/lib/actions/automations";
import { ACTIONS, NOTIFY_TARGETS, TRIGGERS, type ActionType, type TriggerType } from "@/lib/automations-meta";
import { STATUS_META, STATUS_ORDER } from "@/lib/board/palette";
import type { SnapshotMember } from "@/lib/board/types";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/field";
import { Modal } from "@/components/ui/overlay";

const PRIORITIES: Priority[] = ["urgent", "high", "medium", "low"];

export function AutomationsButton({ orgSlug, boardId, members }: { orgSlug: string; boardId: string; members: SnapshotMember[] }) {
  const [open, setOpen] = useState(false);
  const [rules, setRules] = useState<ClientAutomation[]>([]);
  const [busy, setBusy] = useState(false);
  const [dueMsg, setDueMsg] = useState<string | null>(null);

  // builder state
  const [trigger, setTrigger] = useState<TriggerType>("status_changed");
  const [trigStatus, setTrigStatus] = useState<ItemStatus>("submitted");
  const [action, setAction] = useState<ActionType>("notify");
  const [notifyTarget, setNotifyTarget] = useState("assigner");
  const [userId, setUserId] = useState(members[0]?.id ?? "");
  const [priority, setPriority] = useState<Priority>("high");

  async function load() {
    setRules(await listAutomationsAction(orgSlug, boardId));
  }
  function openModal() {
    setOpen(true);
    setDueMsg(null);
    load();
  }

  const memberName = (id?: string) => members.find((m) => m.id === id)?.name ?? members.find((m) => m.id === id)?.email ?? "someone";
  function describe(r: ClientAutomation): string {
    const t =
      r.triggerType === "status_changed"
        ? `When status → ${STATUS_META[(r.triggerConfig.toStatus as ItemStatus) ?? "submitted"]?.label ?? "any"}`
        : r.triggerType === "item_created"
          ? "When a task is created"
          : "When a task is overdue";
    const a =
      r.actionType === "notify"
        ? `notify ${r.actionConfig.target === "user" ? memberName(r.actionConfig.userId as string) : r.actionConfig.target === "assigner" ? "the delegator" : "the assignee"}`
        : r.actionType === "set_priority"
          ? `set priority to ${r.actionConfig.priority}`
          : `assign to ${memberName(r.actionConfig.userId as string)}`;
    return `${t}, ${a}`;
  }

  async function addRule() {
    setBusy(true);
    const triggerConfig = trigger === "status_changed" ? { toStatus: trigStatus } : {};
    const actionConfig =
      action === "notify"
        ? { target: notifyTarget, ...(notifyTarget === "user" ? { userId } : {}) }
        : action === "set_priority"
          ? { priority }
          : { userId };
    const name = describePreview();
    const res = await createAutomationAction(orgSlug, boardId, { name, triggerType: trigger, triggerConfig, actionType: action, actionConfig });
    setBusy(false);
    if (res.ok) await load();
  }

  function describePreview(): string {
    const t = trigger === "status_changed" ? `When status → ${STATUS_META[trigStatus].label}` : trigger === "item_created" ? "When a task is created" : "When a task is overdue";
    const a = action === "notify" ? `notify ${notifyTarget === "user" ? memberName(userId) : notifyTarget === "assigner" ? "the delegator" : "the assignee"}` : action === "set_priority" ? `set priority to ${priority}` : `assign to ${memberName(userId)}`;
    return `${t}, ${a}`;
  }

  return (
    <>
      <button onClick={openModal} className="flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100" title="Automations">
        <Zap size={15} /> Automate
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title="⚡ Automations" width={560}>
        <div className="space-y-4 p-5">
          {/* existing rules */}
          <div className="space-y-2">
            {rules.length === 0 && <p className="text-sm text-slate-400">No automations yet. Create one below.</p>}
            {rules.map((r) => (
              <div key={r.id} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2">
                <Zap size={14} className={r.enabled ? "text-indigo-500" : "text-slate-300"} />
                <span className={`flex-1 text-sm ${r.enabled ? "text-slate-700" : "text-slate-400 line-through"}`}>{describe(r)}</span>
                <button
                  onClick={async () => { await toggleAutomationAction(orgSlug, r.id, !r.enabled); load(); }}
                  className="text-xs text-slate-500 hover:text-indigo-600"
                >
                  {r.enabled ? "Disable" : "Enable"}
                </button>
                <button onClick={async () => { await deleteAutomationAction(orgSlug, r.id); load(); }} className="text-slate-400 hover:text-red-600">
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>

          {/* builder */}
          <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/50 p-3">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Select value={trigger} onChange={(e) => setTrigger(e.target.value as TriggerType)} className="h-9 w-auto">
                {TRIGGERS.map((t) => <option key={t.type} value={t.type}>{t.label}</option>)}
              </Select>
              {trigger === "status_changed" && (
                <Select value={trigStatus} onChange={(e) => setTrigStatus(e.target.value as ItemStatus)} className="h-9 w-auto">
                  {STATUS_ORDER.map((s) => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
                </Select>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-xs font-semibold text-slate-400">THEN</span>
              <Select value={action} onChange={(e) => setAction(e.target.value as ActionType)} className="h-9 w-auto">
                {ACTIONS.map((a) => <option key={a.type} value={a.type}>{a.label}</option>)}
              </Select>
              {action === "notify" && (
                <Select value={notifyTarget} onChange={(e) => setNotifyTarget(e.target.value)} className="h-9 w-auto">
                  {NOTIFY_TARGETS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </Select>
              )}
              {action === "set_priority" && (
                <Select value={priority} onChange={(e) => setPriority(e.target.value as Priority)} className="h-9 w-auto">
                  {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
                </Select>
              )}
              {(action === "assign" || (action === "notify" && notifyTarget === "user")) && (
                <Select value={userId} onChange={(e) => setUserId(e.target.value)} className="h-9 w-auto">
                  {members.map((m) => <option key={m.id} value={m.id}>{m.name ?? m.email}</option>)}
                </Select>
              )}
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs italic text-slate-400">{describePreview()}</span>
              <Button size="sm" onClick={addRule} disabled={busy}><Plus size={14} /> Add rule</Button>
            </div>
          </div>

          <div className="flex items-center justify-between border-t border-slate-100 pt-3">
            <span className="text-xs text-slate-400">&quot;When overdue&quot; rules run on demand:</span>
            <Button
              size="sm"
              variant="secondary"
              onClick={async () => { const r = await runDueAutomationsAction(orgSlug, boardId); setDueMsg(`Checked overdue tasks — fired ${r.fired}.`); }}
            >
              Run overdue checks
            </Button>
          </div>
          {dueMsg && <p className="text-xs text-green-700">{dueMsg}</p>}
        </div>
      </Modal>
    </>
  );
}
