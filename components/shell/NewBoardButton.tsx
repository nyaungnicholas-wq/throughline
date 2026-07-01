"use client";

import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createBoardAction } from "@/lib/actions/boards";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/field";
import { Modal } from "@/components/ui/overlay";

export function NewBoardButton({ orgSlug, variant = "subtle" }: { orgSlug: string; variant?: "subtle" | "primary" }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [template, setTemplate] = useState("task-tracker");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await createBoardAction(orgSlug, { name, template });
    setBusy(false);
    if (res.ok) {
      setOpen(false);
      setName("");
      router.push(`/${orgSlug}/boards/${res.boardId}`);
      router.refresh();
    } else {
      setError(res.error);
    }
  }

  return (
    <>
      <Button variant={variant} size="sm" onClick={() => setOpen(true)}>
        <Plus size={15} /> New board
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Create a board">
        <form onSubmit={submit} className="space-y-4 p-5">
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <div>
            <Label htmlFor="bn">Board name</Label>
            <Input id="bn" value={name} onChange={(e) => setName(e.target.value)} placeholder="Q3 Roadmap" required autoFocus />
          </div>
          <div>
            <Label htmlFor="tpl">Start from</Label>
            <Select id="tpl" value={template} onChange={(e) => setTemplate(e.target.value)}>
              <option value="task-tracker">Task tracker (Notes, Estimate, Tag)</option>
              <option value="sprint">Sprint (Story Points, Component, Notes)</option>
              <option value="content-calendar">Content calendar (Channel, Publish, Notes)</option>
              <option value="bug-tracker">Bug tracker (Severity, Steps, Environment)</option>
              <option value="blank">Blank board</option>
            </Select>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" size="sm" disabled={busy || name.trim().length < 2}>
              {busy ? "Creating…" : "Create board"}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
