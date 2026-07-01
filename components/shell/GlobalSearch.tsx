"use client";

import { CornerDownLeft, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { ItemStatus } from "@/db/schema";
import { StatusPill } from "@/components/board/pills";
import { cn } from "@/lib/cn";

type Result = { id: string; title: string; status: ItemStatus; boardId: string; boardName: string };
type Command = { label: string; manager?: boolean; run: () => void };

export function GlobalSearch({ orgSlug, isManager }: { orgSlug: string; isManager: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const seq = useRef(0);

  const allCommands: Command[] = [
    { label: "Go to Boards", run: () => router.push(`/${orgSlug}`) },
    { label: "Go to My Work", run: () => router.push(`/${orgSlug}/my-work`) },
    { label: "Go to Approvals", manager: true, run: () => router.push(`/${orgSlug}/approvals`) },
    { label: "Go to Dashboard", manager: true, run: () => router.push(`/${orgSlug}/dashboard`) },
    { label: "Go to Reports", manager: true, run: () => router.push(`/${orgSlug}/reports`) },
    { label: "Go to Goals", manager: true, run: () => router.push(`/${orgSlug}/goals`) },
    { label: "Go to Members", run: () => router.push(`/${orgSlug}/members`) },
    {
      label: "Toggle dark mode",
      run: () => {
        const next = !document.documentElement.classList.contains("dark");
        document.documentElement.classList.toggle("dark", next);
        try {
          localStorage.setItem("tl-theme", next ? "dark" : "light");
        } catch {
          /* ignore */
        }
      },
    },
  ];
  const commands = allCommands.filter((c) => !c.manager || isManager);
  const cmdMatches = commands.filter((c) => q.trim() === "" || c.label.toLowerCase().includes(q.toLowerCase()));
  const showTasks = q.trim().length >= 2;

  // Single flat list the keyboard navigates, in render order.
  const navItems: Array<{ kind: "cmd"; cmd: Command } | { kind: "task"; result: Result }> = [
    ...cmdMatches.map((cmd) => ({ kind: "cmd" as const, cmd })),
    ...(showTasks ? results.map((result) => ({ kind: "task" as const, result })) : []),
  ];
  const activeIdx = Math.min(active, Math.max(0, navItems.length - 1));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(true);
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 30);
    else {
      setQ("");
      setResults([]);
    }
  }, [open]);

  // Reset the highlight whenever the query changes or the palette (re)opens.
  useEffect(() => {
    setActive(0);
  }, [q, open]);

  useEffect(() => {
    if (!open || q.trim().length < 2) {
      setResults([]);
      return;
    }
    const my = ++seq.current; // ignore responses that arrive out of order
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/${orgSlug}/search?q=${encodeURIComponent(q)}`, { cache: "no-store", signal: ctrl.signal });
        const data = await res.json();
        if (my === seq.current) setResults(data.results ?? []);
      } catch {
        /* aborted or failed — keep prior results */
      } finally {
        if (my === seq.current) setLoading(false);
      }
    }, 180);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q, open, orgSlug]);

  function go(r: Result) {
    setOpen(false);
    router.push(`/${orgSlug}/boards/${r.boardId}?item=${r.id}`);
  }

  function runItem(item: (typeof navItems)[number] | undefined) {
    if (!item) return;
    if (item.kind === "cmd") {
      setOpen(false);
      item.cmd.run();
    } else {
      go(item.result);
    }
  }

  function onInputKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, navItems.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      runItem(navItems[activeIdx]);
    }
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className="flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 text-sm text-slate-400 hover:bg-slate-100">
        <Search size={15} /> <span className="hidden sm:inline">Search</span>
        <kbd className="hidden rounded bg-white px-1.5 py-0.5 text-[10px] font-medium text-slate-400 ring-1 ring-slate-200 sm:inline">⌘K</kbd>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex justify-center pt-[12vh]" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-slate-900/30" />
          <div className="tl-fade relative h-fit w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 border-b border-slate-100 px-4">
              <Search size={17} className="text-slate-400" />
              <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onInputKey} placeholder="Search tasks, or jump to a page…" className="h-12 flex-1 bg-transparent text-sm text-slate-800 outline-none" />
            </div>
            <div className="max-h-80 overflow-y-auto tl-scroll p-2">
              {cmdMatches.length > 0 && (
                <div className="mb-1">
                  <div className="px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Jump to</div>
                  {cmdMatches.map((c, i) => (
                    <button
                      key={c.label}
                      onMouseEnter={() => setActive(i)}
                      onClick={() => { setOpen(false); c.run(); }}
                      className={cn("flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-slate-700", activeIdx === i ? "bg-slate-100" : "hover:bg-slate-100")}
                    >
                      <CornerDownLeft size={14} className="text-slate-300" /> {c.label}
                    </button>
                  ))}
                </div>
              )}

              {showTasks && (
                <div>
                  <div className="px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Tasks</div>
                  {loading && results.length === 0 ? (
                    <p className="px-3 py-4 text-center text-sm text-slate-400">Searching…</p>
                  ) : results.length === 0 ? (
                    <p className="px-3 py-4 text-center text-sm text-slate-400">No matching tasks.</p>
                  ) : (
                    results.map((r, j) => {
                      const idx = cmdMatches.length + j;
                      return (
                        <button
                          key={r.id}
                          onMouseEnter={() => setActive(idx)}
                          onClick={() => go(r)}
                          className={cn("flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left", activeIdx === idx ? "bg-slate-100" : "hover:bg-slate-100")}
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium text-slate-800">{r.title}</span>
                            <span className="text-xs text-slate-400">{r.boardName}</span>
                          </span>
                          <StatusPill status={r.status} />
                        </button>
                      );
                    })
                  )}
                </div>
              )}

              {q.trim().length < 2 && cmdMatches.length === 0 && <p className="px-3 py-6 text-center text-sm text-slate-400">Type to search tasks…</p>}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
