"use client";

import { Plus } from "lucide-react";
import { useState } from "react";
import type { ColumnType } from "@/db/schema";
import { addColumnAction } from "@/lib/actions/boards";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/field";
import { Modal } from "@/components/ui/overlay";

const TYPES: Array<{ value: ColumnType; label: string }> = [
  { value: "text", label: "Text" },
  { value: "number", label: "Number" },
  { value: "date", label: "Date" },
  { value: "timeline", label: "Timeline (start → end)" },
  { value: "person", label: "Person" },
  { value: "select", label: "Dropdown" },
  { value: "checkbox", label: "Checkbox" },
  { value: "link", label: "Link" },
];

export function AddColumnButton({ orgSlug, boardId, onChanged }: { orgSlug: string; boardId: string; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState<ColumnType>("text");
  const [labels, setLabels] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const res = await addColumnAction(orgSlug, boardId, {
      name,
      type,
      labels: type === "select" ? labels.split(",").map((s) => s.trim()).filter(Boolean) : undefined,
    });
    setBusy(false);
    if (res.ok) {
      setOpen(false);
      setName("");
      setLabels("");
      setType("text");
      onChanged();
    }
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className="flex h-8 items-center gap-1 rounded-lg px-2 text-sm text-slate-500 hover:bg-slate-100" title="Add column">
        <Plus size={15} /> Column
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Add column">
        <form onSubmit={submit} className="space-y-4 p-5">
          <div>
            <Label htmlFor="cn">Column name</Label>
            <Input id="cn" value={name} onChange={(e) => setName(e.target.value)} placeholder="Status, Owner, Budget…" required autoFocus />
          </div>
          <div>
            <Label htmlFor="ct">Type</Label>
            <Select id="ct" value={type} onChange={(e) => setType(e.target.value as ColumnType)}>
              {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </Select>
          </div>
          {type === "select" && (
            <div>
              <Label htmlFor="cl">Options (comma-separated)</Label>
              <Input id="cl" value={labels} onChange={(e) => setLabels(e.target.value)} placeholder="Todo, Doing, Done" />
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" size="sm" disabled={busy || name.trim().length < 1}>{busy ? "Adding…" : "Add column"}</Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
