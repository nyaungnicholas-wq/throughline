"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, Flag, Link2, Paperclip, Plus, Repeat, Sparkles, Trash2, UserPlus, X } from "lucide-react";
import { useRef, useState } from "react";
import type { ItemStatus, Priority } from "@/db/schema";
import { aiSuggestDelegationAction, aiSummarizeThreadAction } from "@/lib/actions/ai";
import type { DelegationSuggestion } from "@/lib/ai/features";
import { addCommentAction } from "@/lib/actions/comments";
import { transitionAction } from "@/lib/actions/delegation";
import { deleteItemAction, setDescriptionAction, setDueDateAction, setPriorityAction, setRecurrenceAction, updateItemTitleAction } from "@/lib/actions/items";
import { renderMarkdown } from "@/lib/markdown";
import { uploadAttachmentAction } from "@/lib/actions/attachments";
import { addChecklistItemAction, deleteChecklistItemAction, toggleChecklistItemAction } from "@/lib/actions/checklist";
import { addDependencyAction, removeDependencyAction } from "@/lib/actions/dependencies";
import { ACTION_TONE, availableActions, type TransitionAction } from "@/lib/delegation-meta";
import type { SnapshotMember } from "@/lib/board/types";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/field";
import { Menu, MenuItem } from "@/components/ui/menu";
import { Spinner } from "@/components/ui/misc";
import { PriorityPill, StatusPill } from "@/components/board/pills";
import { TimeSection } from "@/components/board/TimeSection";
import { PRIORITY_META } from "@/lib/board/palette";
import { fmtDateTime, timeAgo, toDateInput } from "@/lib/time";

type Detail = {
  item: {
    id: string;
    title: string;
    description: string | null;
    status: ItemStatus;
    priority: Priority | null;
    dueDate: string | null;
    assigneeId: string | null;
    assigneeName: string | null;
    assignerName: string | null;
    reviewerName: string | null;
    reviewNotes: string | null;
    recurrence: string | null;
    estimateMinutes: number | null;
    version: number;
  };
  comments: { id: string; body: string; authorName: string | null; createdAt: string }[];
  activity: { id: string; type: string; actorName: string | null; data: Record<string, unknown>; createdAt: string }[];
  attachments: { id: string; filename: string; mimeType: string; sizeBytes: number; uploaderName: string | null; createdAt: string }[];
  checklist: { id: string; text: string; done: boolean }[];
  blockers: { depId: string; id: string; title: string; status: ItemStatus }[];
  blocking: { depId: string; id: string; title: string; status: ItemStatus }[];
  timeEntries: { id: string; minutes: number; note: string | null; userName: string | null }[];
  spentMinutes: number;
};

const TONE_CLASS: Record<string, string> = {
  primary: "bg-indigo-600 text-white hover:bg-indigo-700",
  approve: "bg-green-600 text-white hover:bg-green-700",
  changes: "bg-amber-500 text-white hover:bg-amber-600",
  neutral: "bg-slate-100 text-slate-700 hover:bg-slate-200",
};

function activityText(a: Detail["activity"][number]): string {
  const who = a.actorName ?? "Someone";
  const d = a.data ?? {};
  switch (a.type) {
    case "item_created": return `${who} created this task`;
    case "comment_added": return `${who} commented`;
    case "attachment_added": return `${who} attached ${(d.filename as string) ?? "a file"}`;
    case "status:assign": return `${who} assigned this`;
    case "status:reassign": return `${who} reassigned this`;
    case "status:accept": return `${who} accepted`;
    case "status:start": return `${who} started work`;
    case "status:submit": return `${who} submitted for review`;
    case "status:approve": return `${who} approved ✅`;
    case "status:requestChanges": return `${who} requested changes`;
    default: return `${who} updated this`;
  }
}

function bytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function ItemDrawer({
  orgSlug,
  boardId,
  itemId,
  members,
  viewer,
  boardOwnerId,
  boardItems,
  onClose,
  onBoardChanged,
}: {
  orgSlug: string;
  boardId: string;
  itemId: string;
  members: SnapshotMember[];
  viewer: { id: string; role: "owner" | "manager" | "member" };
  /** The board's lead (counts as a manager here for delegation). */
  boardOwnerId?: string | null;
  /** Other items on the same board, for the dependency picker (omitted on My Work / Dashboard). */
  boardItems?: { id: string; title: string }[];
  onClose: () => void;
  onBoardChanged: () => void;
}) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [changesOpen, setChangesOpen] = useState(false);
  const [changesNote, setChangesNote] = useState("");
  const [editTitle, setEditTitle] = useState(false);
  const [newCheck, setNewCheck] = useState("");
  const [depPick, setDepPick] = useState("");
  const [editDesc, setEditDesc] = useState(false);
  const [descDraft, setDescDraft] = useState("");
  const [aiBusy, setAiBusy] = useState<"summary" | "suggest" | null>(null);
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState<DelegationSuggestion | null>(null);

  const { data, isLoading } = useQuery<Detail>({
    queryKey: ["item", orgSlug, itemId],
    queryFn: async () => {
      const res = await fetch(`/api/${orgSlug}/items/${itemId}`, { cache: "no-store" });
      if (!res.ok) throw new Error("failed");
      return res.json();
    },
    refetchInterval: 15_000,
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["item", orgSlug, itemId] });
    onBoardChanged();
  };

  async function run<T extends { ok: boolean; error?: string }>(fn: () => Promise<T>) {
    setBusy(true);
    setError(null);
    try {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "Something went wrong.");
      else refresh();
      return res;
    } finally {
      setBusy(false);
    }
  }

  async function doTransition(action: TransitionAction, extra?: { assigneeId?: string; reviewNotes?: string }) {
    if (!data) return;
    await run(() =>
      transitionAction(orgSlug, boardId, itemId, action, { ...extra, expectedVersion: data.item.version }),
    );
  }

  const item = data?.item;
  const actions = item ? availableActions(item, viewer, boardOwnerId).filter((a) => a !== "assign" && a !== "reassign") : [];
  const canAssign = item ? availableActions(item, viewer, boardOwnerId).some((a) => a === "assign" || a === "reassign") : false;
  const isManager = viewer.role === "owner" || viewer.role === "manager" || viewer.id === boardOwnerId;

  async function summarize() {
    setAiBusy("summary");
    setAiSummary(null);
    const res = await aiSummarizeThreadAction(orgSlug, itemId);
    setAiBusy(null);
    setAiSummary(res.ok ? res.summary ?? "" : `⚠️ ${res.error}`);
  }
  async function suggest() {
    setAiBusy("suggest");
    setSuggestion(null);
    const res = await aiSuggestDelegationAction(orgSlug, itemId);
    setAiBusy(null);
    if (res.ok && res.suggestion) setSuggestion(res.suggestion);
    else setError(res.error ?? "AI suggestion failed.");
  }
  async function applySuggestion(s: DelegationSuggestion) {
    if (!item) return;
    if (s.assigneeId) await doTransition(item.status === "unassigned" ? "assign" : "reassign", { assigneeId: s.assigneeId });
    await run(() => setPriorityAction(orgSlug, itemId, s.priority));
    if (s.dueInDays != null) {
      await run(() => setDueDateAction(orgSlug, itemId, new Date(Date.now() + s.dueInDays * 86400_000).toISOString()));
    }
    setSuggestion(null);
  }

  return (
    <>
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
        {item ? <StatusPill status={item.status} /> : <span />}
        <div className="flex items-center gap-1">
          {isManager && item && (
            <Menu
              align="right"
              trigger={({ toggle }) => (
                <button onClick={toggle} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100" aria-label="More">
                  <span className="text-lg leading-none">⋯</span>
                </button>
              )}
            >
              {(close) => (
                <MenuItem
                  className="text-red-600 hover:bg-red-50"
                  onClick={async () => {
                    close();
                    await deleteItemAction(orgSlug, itemId);
                    onBoardChanged();
                    onClose();
                  }}
                >
                  <Trash2 size={14} /> Delete task
                </MenuItem>
              )}
            </Menu>
          )}
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100" aria-label="Close">
            <X size={18} />
          </button>
        </div>
      </div>

      {isLoading || !item ? (
        <div className="flex flex-1 items-center justify-center"><Spinner size={22} /></div>
      ) : (
        <div className="flex-1 space-y-5 px-5 py-4">
          {/* Title */}
          {editTitle ? (
            <Input
              autoFocus
              defaultValue={item.title}
              onBlur={async (e) => {
                setEditTitle(false);
                if (e.target.value.trim() && e.target.value !== item.title) {
                  await updateItemTitleAction(orgSlug, itemId, e.target.value);
                  refresh();
                }
              }}
              onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
              className="text-lg font-semibold"
            />
          ) : (
            <h2 className="cursor-text text-lg font-semibold leading-snug text-slate-900" onClick={() => setEditTitle(true)}>
              {item.title}
            </h2>
          )}

          {/* Description (lightweight markdown) */}
          {editDesc ? (
            <Textarea
              autoFocus
              rows={5}
              value={descDraft}
              onChange={(e) => setDescDraft(e.target.value)}
              onBlur={async () => {
                setEditDesc(false);
                if (descDraft !== (item.description ?? "")) {
                  await setDescriptionAction(orgSlug, itemId, descDraft);
                  refresh();
                }
              }}
              placeholder="Add a description… (**bold**, *italic*, - lists, [links](https://…))"
              className="text-sm"
            />
          ) : item.description ? (
            <div
              onClick={() => { setDescDraft(item.description ?? ""); setEditDesc(true); }}
              className="cursor-text space-y-1.5 text-sm leading-relaxed text-slate-700 [&_a]:break-words [&_li]:ml-0 [&_p]:my-0"
              dangerouslySetInnerHTML={{ __html: renderMarkdown(item.description) }}
            />
          ) : (
            <button onClick={() => { setDescDraft(""); setEditDesc(true); }} className="text-sm text-slate-400 hover:text-slate-600">
              + Add a description
            </button>
          )}

          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

          {/* AI helpers */}
          <div className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-3">
            <div className="flex flex-wrap gap-2">
              <button
                onClick={summarize}
                disabled={aiBusy !== null}
                className="flex h-8 items-center gap-1.5 rounded-lg bg-white px-2.5 text-xs font-medium text-indigo-700 ring-1 ring-indigo-200 hover:bg-indigo-50 disabled:opacity-50"
              >
                <Sparkles size={13} /> {aiBusy === "summary" ? "Summarizing…" : "Summarize"}
              </button>
              {canAssign && isManager && (
                <button
                  onClick={suggest}
                  disabled={aiBusy !== null}
                  className="flex h-8 items-center gap-1.5 rounded-lg bg-white px-2.5 text-xs font-medium text-indigo-700 ring-1 ring-indigo-200 hover:bg-indigo-50 disabled:opacity-50"
                >
                  <Sparkles size={13} /> {aiBusy === "suggest" ? "Thinking…" : "Suggest assignee"}
                </button>
              )}
            </div>
            {aiSummary && <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{aiSummary}</p>}
            {suggestion && (
              <div className="mt-2 rounded-lg bg-white p-2.5 ring-1 ring-indigo-100">
                <p className="text-sm text-slate-800">
                  <b>{suggestion.assigneeName ?? "Unassigned"}</b> · {suggestion.priority} · due in {suggestion.dueInDays}d
                </p>
                <p className="mt-0.5 text-xs text-slate-500">{suggestion.reason}</p>
                {suggestion.description && <p className="mt-1 text-xs italic text-slate-500">{suggestion.description}</p>}
                <div className="mt-2 flex gap-2">
                  <Button size="sm" onClick={() => applySuggestion(suggestion)}>Apply</Button>
                  <Button size="sm" variant="secondary" onClick={() => setSuggestion(null)}>Dismiss</Button>
                </div>
              </div>
            )}
          </div>

          {/* Action buttons */}
          {(actions.length > 0 || changesOpen) && (
            <div className="flex flex-wrap gap-2">
              {actions.map((a) =>
                a === "requestChanges" ? (
                  <button
                    key={a}
                    disabled={busy}
                    onClick={() => setChangesOpen((v) => !v)}
                    className={`inline-flex h-9 items-center rounded-lg px-3 text-sm font-medium disabled:opacity-50 ${TONE_CLASS[ACTION_TONE[a]]}`}
                  >
                    Request changes
                  </button>
                ) : (
                  <button
                    key={a}
                    disabled={busy}
                    onClick={() => doTransition(a)}
                    className={`inline-flex h-9 items-center rounded-lg px-3 text-sm font-medium disabled:opacity-50 ${TONE_CLASS[ACTION_TONE[a]]}`}
                  >
                    {a === "approve" ? "✓ Approve" : a === "accept" ? "Accept" : a === "start" ? "Start work" : a === "submit" ? "Submit for review" : a}
                  </button>
                ),
              )}
            </div>
          )}
          {changesOpen && (
            <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50/60 p-3">
              <Textarea
                rows={2}
                placeholder="What needs to change?"
                value={changesNote}
                onChange={(e) => setChangesNote(e.target.value)}
              />
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="secondary" onClick={() => setChangesOpen(false)}>Cancel</Button>
                <Button
                  size="sm"
                  disabled={busy}
                  className="bg-amber-500 hover:bg-amber-600"
                  onClick={async () => {
                    await doTransition("requestChanges", { reviewNotes: changesNote });
                    setChangesOpen(false);
                    setChangesNote("");
                  }}
                >
                  Send back for changes
                </Button>
              </div>
            </div>
          )}

          {item.status === "changes_requested" && item.reviewNotes && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <span className="font-semibold">Changes requested{item.reviewerName ? ` by ${item.reviewerName}` : ""}:</span>{" "}
              {item.reviewNotes}
            </div>
          )}

          {/* Fields */}
          <div className="space-y-3 rounded-xl border border-slate-100 bg-slate-50/50 p-3">
            <Field label="Assignee" icon={<UserPlus size={14} />}>
              {canAssign ? (
                <Menu
                  width={220}
                  trigger={({ toggle }) => (
                    <button onClick={toggle} className="flex items-center gap-2 rounded-lg px-2 py-1 hover:bg-white">
                      {item.assigneeId ? (
                        <>
                          <Avatar name={item.assigneeName} email={item.assigneeName ?? ""} size={22} />
                          <span className="text-sm text-slate-700">{item.assigneeName}</span>
                        </>
                      ) : (
                        <span className="text-sm text-indigo-600">Assign…</span>
                      )}
                    </button>
                  )}
                >
                  {(close) => (
                    <>
                      {members.map((m) => (
                        <MenuItem
                          key={m.id}
                          onClick={() => {
                            close();
                            doTransition(item.status === "unassigned" ? "assign" : "reassign", { assigneeId: m.id });
                          }}
                        >
                          <Avatar name={m.name} email={m.email} size={22} />
                          <span className="truncate">{m.name ?? m.email}</span>
                        </MenuItem>
                      ))}
                    </>
                  )}
                </Menu>
              ) : item.assigneeId ? (
                <span className="flex items-center gap-2 px-2 py-1">
                  <Avatar name={item.assigneeName} email={item.assigneeName ?? ""} size={22} />
                  <span className="text-sm text-slate-700">{item.assigneeName}</span>
                </span>
              ) : (
                <span className="px-2 text-sm text-slate-400">Unassigned</span>
              )}
            </Field>

            <Field label="Priority" icon={<Flag size={14} />}>
              <Menu
                width={150}
                trigger={({ toggle }) => (
                  <button onClick={toggle} className="px-2 py-1"><PriorityPill priority={item.priority} /></button>
                )}
              >
                {(close) => (
                  <>
                    {(Object.keys(PRIORITY_META) as Priority[]).map((p) => (
                      <MenuItem key={p} onClick={async () => { close(); await run(() => setPriorityAction(orgSlug, itemId, p)); }}>
                        <PriorityPill priority={p} />
                      </MenuItem>
                    ))}
                    <div className="my-1 border-t border-slate-100" />
                    <MenuItem className="text-slate-400" onClick={async () => { close(); await run(() => setPriorityAction(orgSlug, itemId, null)); }}>Clear</MenuItem>
                  </>
                )}
              </Menu>
            </Field>

            <Field label="Due date" icon={<CalendarClock size={14} />}>
              <input
                type="date"
                defaultValue={toDateInput(item.dueDate)}
                onChange={(e) => run(() => setDueDateAction(orgSlug, itemId, e.target.value ? new Date(e.target.value).toISOString() : null))}
                className="rounded-lg bg-transparent px-2 py-1 text-sm text-slate-700 outline-none hover:bg-white"
              />
            </Field>

            <Field label="Repeat" icon={<Repeat size={14} />}>
              <select
                value={item.recurrence ?? ""}
                onChange={(e) => run(() => setRecurrenceAction(orgSlug, itemId, e.target.value || null))}
                className="rounded-lg bg-transparent px-2 py-1 text-sm text-slate-700 outline-none hover:bg-white"
              >
                <option value="">Never</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="biweekly">Every 2 weeks</option>
                <option value="monthly">Monthly</option>
              </select>
            </Field>
          </div>

          {/* Checklist */}
          <section>
            <div className="mb-1.5 flex items-center gap-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Checklist</h3>
              {data.checklist.length > 0 && (
                <span className="text-xs text-slate-400">{data.checklist.filter((c) => c.done).length}/{data.checklist.length}</span>
              )}
            </div>
            {data.checklist.length > 0 && (
              <div className="mb-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-green-500" style={{ width: `${Math.round((100 * data.checklist.filter((c) => c.done).length) / data.checklist.length)}%` }} />
              </div>
            )}
            <ul className="space-y-1">
              {data.checklist.map((c) => (
                <li key={c.id} className="group flex items-center gap-2">
                  <input type="checkbox" checked={c.done} onChange={() => run(() => toggleChecklistItemAction(orgSlug, boardId, c.id, !c.done))} className="h-4 w-4 rounded border-slate-300 text-indigo-600" />
                  <span className={`flex-1 text-sm ${c.done ? "text-slate-400 line-through" : "text-slate-700"}`}>{c.text}</span>
                  <button onClick={() => run(() => deleteChecklistItemAction(orgSlug, boardId, c.id))} className="text-slate-300 opacity-0 hover:text-red-600 group-hover:opacity-100"><X size={13} /></button>
                </li>
              ))}
            </ul>
            <div className="mt-2 flex items-center gap-2">
              <Plus size={14} className="text-slate-400" />
              <input
                value={newCheck}
                onChange={(e) => setNewCheck(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && newCheck.trim()) { run(() => addChecklistItemAction(orgSlug, boardId, itemId, newCheck)); setNewCheck(""); } }}
                placeholder="Add a subtask…"
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400"
              />
            </div>
          </section>

          {/* Dependencies */}
          <section>
            <h3 className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500"><Link2 size={13} /> Dependencies</h3>
            {data.blockers.length > 0 && (
              <div className="mb-2">
                <p className="mb-1 text-xs text-slate-400">Blocked by</p>
                {data.blockers.map((b) => (
                  <div key={b.depId} className="group flex items-center gap-2 py-0.5">
                    <StatusPill status={b.status} />
                    <span className="flex-1 truncate text-sm text-slate-700">{b.title}</span>
                    <button onClick={() => run(() => removeDependencyAction(orgSlug, boardId, b.depId))} className="text-slate-300 opacity-0 hover:text-red-600 group-hover:opacity-100"><X size={13} /></button>
                  </div>
                ))}
              </div>
            )}
            {boardItems && (
              <select
                value={depPick}
                onChange={(e) => { const v = e.target.value; setDepPick(""); if (v) run(() => addDependencyAction(orgSlug, boardId, itemId, v)); }}
                className="h-8 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-600"
              >
                <option value="">+ Mark as blocked by…</option>
                {boardItems.filter((bi) => bi.id !== itemId && !data.blockers.some((b) => b.id === bi.id)).map((bi) => <option key={bi.id} value={bi.id}>{bi.title}</option>)}
              </select>
            )}
            {data.blocking.length > 0 && (
              <div className="mt-2">
                <p className="mb-1 text-xs text-slate-400">Blocks</p>
                {data.blocking.map((b) => (
                  <div key={b.depId} className="flex items-center gap-2 py-0.5">
                    <StatusPill status={b.status} />
                    <span className="flex-1 truncate text-sm text-slate-600">{b.title}</span>
                  </div>
                ))}
              </div>
            )}
            {data.blockers.length === 0 && data.blocking.length === 0 && !boardItems && <p className="text-sm text-slate-400">No dependencies.</p>}
          </section>

          {/* Time tracking */}
          <TimeSection orgSlug={orgSlug} itemId={itemId} estimateMinutes={item.estimateMinutes} spentMinutes={data.spentMinutes} entries={data.timeEntries} onChanged={refresh} />

          {/* Attachments */}
          <section>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Attachments</h3>
              <button onClick={() => fileRef.current?.click()} className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800">
                <Paperclip size={13} /> Add
              </button>
              <input
                ref={fileRef}
                type="file"
                className="hidden"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  const fd = new FormData();
                  fd.set("file", f);
                  await run(() => uploadAttachmentAction(orgSlug, boardId, itemId, fd));
                  if (fileRef.current) fileRef.current.value = "";
                }}
              />
            </div>
            {data.attachments.length === 0 ? (
              <p className="text-sm text-slate-400">No files yet.</p>
            ) : (
              <ul className="space-y-1">
                {data.attachments.map((a) => (
                  <li key={a.id}>
                    <a href={`/api/attachments/${a.id}`} target="_blank" rel="noreferrer" className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2 text-sm hover:bg-slate-50">
                      <span className="truncate text-slate-700">{a.filename}</span>
                      <span className="ml-2 shrink-0 text-xs text-slate-400">{bytes(a.sizeBytes)}</span>
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Comments */}
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Comments</h3>
            <div className="space-y-3">
              {data.comments.map((c) => (
                <div key={c.id} className="flex gap-2">
                  <Avatar name={c.authorName} email={c.authorName ?? ""} size={26} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <span className="text-sm font-medium text-slate-800">{c.authorName ?? "Someone"}</span>
                      <span className="text-xs text-slate-400">{timeAgo(c.createdAt)}</span>
                    </div>
                    <p className="whitespace-pre-wrap text-sm text-slate-600">{c.body}</p>
                  </div>
                </div>
              ))}
              {data.comments.length === 0 && <p className="text-sm text-slate-400">No comments yet.</p>}
            </div>
            <div className="mt-3 space-y-2">
              <Textarea rows={2} placeholder="Write a comment…" value={comment} onChange={(e) => setComment(e.target.value)} />
              <div className="flex justify-end">
                <Button
                  size="sm"
                  disabled={busy || !comment.trim()}
                  onClick={async () => {
                    const res = await run(() => addCommentAction(orgSlug, boardId, itemId, comment));
                    if (res?.ok) setComment("");
                  }}
                >
                  Comment
                </Button>
              </div>
            </div>
          </section>

          {/* Activity */}
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Activity</h3>
            <ul className="space-y-2">
              {data.activity.map((a) => (
                <li key={a.id} className="flex items-baseline gap-2 text-sm">
                  <span className="h-1.5 w-1.5 shrink-0 translate-y-1.5 rounded-full bg-slate-300" />
                  <span className="text-slate-600">{activityText(a)}</span>
                  <span className="ml-auto shrink-0 text-xs text-slate-400">{fmtDateTime(a.createdAt)}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}
    </>
  );
}

function Field({ label, icon, children }: { label: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-center">
      <span className="flex w-28 shrink-0 items-center gap-1.5 text-xs font-semibold text-slate-500">
        {icon} {label}
      </span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
