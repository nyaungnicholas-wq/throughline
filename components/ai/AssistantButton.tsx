"use client";

import { Send, Sparkles } from "lucide-react";
import { useRef, useState } from "react";
import { aiAskAction } from "@/lib/actions/ai";
import { Drawer } from "@/components/ui/overlay";
import { Spinner } from "@/components/ui/misc";

type Msg = { role: "you" | "ai"; text: string };
const SUGGESTIONS = ["What's overdue?", "What needs my approval?", "What is everyone working on?", "What's unassigned?"];

export function AssistantButton({ orgSlug, aiLive }: { orgSlug: string; aiLive: boolean }) {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  async function ask(question: string) {
    const text = question.trim();
    if (!text || busy) return;
    setMsgs((m) => [...m, { role: "you", text }]);
    setQ("");
    setBusy(true);
    const res = await aiAskAction(orgSlug, text);
    setBusy(false);
    setMsgs((m) => [...m, { role: "ai", text: res.ok ? res.answer ?? "" : `⚠️ ${res.error}` }]);
    requestAnimationFrame(() => endRef.current?.scrollIntoView({ behavior: "smooth" }));
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex h-9 items-center gap-1.5 rounded-lg bg-indigo-50 px-2.5 text-sm font-medium text-indigo-700 hover:bg-indigo-100"
      >
        <Sparkles size={15} /> Assistant
      </button>
      <Drawer open={open} onClose={() => setOpen(false)} width={440}>
        <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-3">
          <Sparkles size={16} className="text-indigo-600" />
          <span className="font-semibold text-slate-800">Workspace Assistant</span>
          <span className={`ml-auto rounded-full px-2 py-0.5 text-[11px] font-medium ${aiLive ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700"}`}>
            {aiLive ? "live" : "mock mode"}
          </span>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto tl-scroll px-5 py-4">
          {msgs.length === 0 && (
            <div className="space-y-3">
              <p className="text-sm text-slate-500">Ask about anything happening across your boards.</p>
              <div className="flex flex-wrap gap-2">
                {SUGGESTIONS.map((s) => (
                  <button key={s} onClick={() => ask(s)} className="rounded-full border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:border-indigo-300 hover:text-indigo-700">
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
          {msgs.map((m, i) => (
            <div key={i} className={m.role === "you" ? "flex justify-end" : "flex justify-start"}>
              <div className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-sm ${m.role === "you" ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-800"}`}>
                {m.text}
              </div>
            </div>
          ))}
          {busy && <div className="flex items-center gap-2 text-sm text-slate-400"><Spinner size={14} /> Thinking…</div>}
          <div ref={endRef} />
        </div>

        <form
          onSubmit={(e) => { e.preventDefault(); ask(q); }}
          className="flex items-center gap-2 border-t border-slate-100 p-3"
        >
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Ask about your work…"
            className="h-10 flex-1 rounded-lg border border-slate-200 px-3 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
          />
          <button type="submit" disabled={busy || !q.trim()} className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-600 text-white disabled:opacity-40">
            <Send size={16} />
          </button>
        </form>
      </Drawer>
    </>
  );
}
