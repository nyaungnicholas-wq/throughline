"use client";

import { Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { aiGenerateBoardAction } from "@/lib/actions/ai";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/field";
import { Modal } from "@/components/ui/overlay";
import { Spinner } from "@/components/ui/misc";

export function AiGenerateButton({ orgSlug, aiLive }: { orgSlug: string; aiLive: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [brief, setBrief] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await aiGenerateBoardAction(orgSlug, { name, brief });
    setBusy(false);
    if (res.ok) {
      setOpen(false);
      setName("");
      setBrief("");
      router.push(`/${orgSlug}/boards/${res.boardId}`);
      router.refresh();
    } else {
      setError(res.error);
    }
  }

  return (
    <>
      <Button variant="subtle" onClick={() => setOpen(true)}>
        <Sparkles size={15} /> Generate with AI
      </Button>
      <Modal open={open} onClose={() => !busy && setOpen(false)} title="Generate a board with AI" width={520}>
        <form onSubmit={submit} className="space-y-4 p-5">
          {!aiLive && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Running in <b>mock mode</b> — it&apos;ll create a sensible starter board. Add <code>GEMINI_API_KEY</code> or{" "}
              <code>NVIDIA_API_KEY</code> to <code>.env.local</code> for real AI planning.
            </p>
          )}
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <div>
            <Label htmlFor="bn">Board name</Label>
            <Input id="bn" value={name} onChange={(e) => setName(e.target.value)} placeholder="Product launch" required autoFocus />
          </div>
          <div>
            <Label htmlFor="brief">Describe the project</Label>
            <Textarea
              id="brief"
              rows={5}
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
              placeholder="We're launching a new pricing page in 3 weeks. Need design, copy, dev work, QA, and a marketing push…"
              required
            />
            <p className="mt-1.5 text-xs text-slate-400">AI will turn this into tasks with priorities, due dates, and suggested owners.</p>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
            <Button type="submit" size="sm" disabled={busy || brief.trim().length < 8}>
              {busy ? <><Spinner size={14} className="text-white" /> Generating…</> : <><Sparkles size={14} /> Generate board</>}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
