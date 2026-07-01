"use client";

import { Check, ClipboardList, Copy, Trash2 } from "lucide-react";
import { useState } from "react";
import { createFormAction, deleteFormAction, listFormsAction, toggleFormAction, type ClientForm } from "@/lib/actions/forms";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/field";
import { Modal } from "@/components/ui/overlay";

export function FormsButton({ orgSlug, boardId }: { orgSlug: string; boardId: string }) {
  const [open, setOpen] = useState(false);
  const [forms, setForms] = useState<ClientForm[]>([]);
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [newLink, setNewLink] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const linkFor = (token: string) => `${origin}/form/${token}`;
  const load = async () => setForms(await listFormsAction(orgSlug, boardId));

  function copy(text: string, key: string) {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 1400);
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const r = await createFormAction(orgSlug, boardId, { title, description: desc });
    setBusy(false);
    if (r.ok && r.link) { setNewLink(r.link); setTitle(""); setDesc(""); load(); }
  }

  return (
    <>
      <button onClick={() => { setOpen(true); load(); }} className="flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100" title="Intake forms">
        <ClipboardList size={15} /> Forms
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Intake forms" width={560}>
        <div className="space-y-4 p-5">
          <p className="text-sm text-slate-500">Share a public form — every submission creates a task on this board.</p>

          <form onSubmit={create} className="space-y-3 rounded-xl border border-slate-200 p-3">
            <div>
              <Label>Form title</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Request a feature" required />
            </div>
            <div>
              <Label>Description (optional)</Label>
              <Textarea rows={2} value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Tell people what this form is for" />
            </div>
            <div className="flex justify-end">
              <Button type="submit" size="sm" disabled={busy || title.trim().length < 2}>{busy ? "Creating…" : "Create form"}</Button>
            </div>
            {newLink && (
              <div className="flex items-center gap-2 rounded-lg bg-green-50 p-2">
                <code className="flex-1 truncate text-xs text-slate-700">{newLink}</code>
                <Button size="sm" variant="secondary" onClick={() => copy(newLink, "new")}>{copied === "new" ? <><Check size={13} /> Copied</> : <><Copy size={13} /> Copy</>}</Button>
              </div>
            )}
          </form>

          <div className="space-y-1.5">
            {forms.length === 0 && <p className="text-sm text-slate-400">No forms yet.</p>}
            {forms.map((f) => (
              <div key={f.id} className="flex items-center gap-2 rounded-lg border border-slate-100 px-3 py-2">
                <span className="min-w-0 flex-1 truncate text-sm text-slate-700">{f.title}</span>
                <label className="flex items-center gap-1 text-xs text-slate-500">
                  <input type="checkbox" checked={f.enabled} onChange={async (e) => { await toggleFormAction(orgSlug, f.id, e.target.checked); load(); }} className="h-3.5 w-3.5 rounded border-slate-300 text-indigo-600" />
                  Live
                </label>
                <button onClick={() => copy(linkFor(f.token), f.id)} className="text-xs text-indigo-600 hover:text-indigo-800">{copied === f.id ? "Copied" : "Copy link"}</button>
                <button onClick={async () => { await deleteFormAction(orgSlug, f.id); load(); }} className="text-slate-400 hover:text-red-600"><Trash2 size={14} /></button>
              </div>
            ))}
          </div>
        </div>
      </Modal>
    </>
  );
}
