"use client";

import { Upload } from "lucide-react";
import { useState } from "react";
import { importItemsAction } from "@/lib/actions/import-export";
import { Button } from "@/components/ui/button";
import { Label, Select, Textarea } from "@/components/ui/field";
import { Modal } from "@/components/ui/overlay";

export function ImportButton({ orgSlug, boardId, onDone }: { orgSlug: string; boardId: string; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [format, setFormat] = useState<"csv" | "trello">("csv");
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function readFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const text = await f.text();
    setContent(text);
    if (f.name.endsWith(".json") || text.trimStart().startsWith("{")) setFormat("trello");
    else setFormat("csv");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const r = await importItemsAction(orgSlug, boardId, format, content);
    setBusy(false);
    if (r.ok) {
      setMsg(`✓ Imported ${r.count} task${r.count === 1 ? "" : "s"}.`);
      setContent("");
      onDone();
      setTimeout(() => setOpen(false), 1000);
    } else {
      setMsg(r.error ?? "Import failed.");
    }
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className="flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100" title="Import tasks">
        <Upload size={15} /> Import
      </button>
      <Modal open={open} onClose={() => !busy && setOpen(false)} title="Import tasks" width={560}>
        <form onSubmit={submit} className="space-y-4 p-5">
          <div className="flex items-end gap-2">
            <div className="w-44">
              <Label>Source</Label>
              <Select value={format} onChange={(e) => setFormat(e.target.value as "csv" | "trello")}>
                <option value="csv">CSV (Asana / monday / Excel)</option>
                <option value="trello">Trello board JSON</option>
              </Select>
            </div>
            <div className="flex-1">
              <Label>Upload a file</Label>
              <input type="file" accept=".csv,.json,.txt" onChange={readFile} className="block w-full text-sm text-slate-500 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium hover:file:bg-slate-200" />
            </div>
          </div>
          <div>
            <Label>…or paste it here</Label>
            <Textarea rows={7} value={content} onChange={(e) => setContent(e.target.value)} placeholder={format === "csv" ? "Title,Priority,Due,Notes\nLaunch site,high,2026-07-01,Final QA" : "Trello board JSON export"} className="font-mono text-xs" />
            <p className="mt-1.5 text-xs text-slate-400">CSV needs a Title/Name column; Priority, Due, and Notes columns are detected automatically. Up to 500 rows.</p>
          </div>
          {msg && <p className={`text-sm ${msg.startsWith("✓") ? "text-green-700" : "text-red-700"}`}>{msg}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
            <Button type="submit" size="sm" disabled={busy || content.trim().length < 3}>{busy ? "Importing…" : "Import"}</Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
