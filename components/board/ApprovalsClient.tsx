"use client";

import { Check, Inbox, MessageSquareWarning } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { transitionAction } from "@/lib/actions/delegation";
import type { ApprovalRow } from "@/lib/approvals";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/misc";
import { timeAgo } from "@/lib/time";

export function ApprovalsClient({ orgSlug, rows }: { orgSlug: string; rows: ApprovalRow[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  // Rows already handled this render — hide them immediately so a stale-version
  // re-click can't fire in the window before router.refresh() lands.
  const [done, setDone] = useState<Set<string>>(new Set());

  async function act(r: ApprovalRow, action: "approve" | "requestChanges") {
    const input: { expectedVersion: number; reviewNotes?: string } = { expectedVersion: r.version };
    if (action === "requestChanges") {
      const notes = window.prompt("What needs to change?");
      if (notes === null) return;
      input.reviewNotes = notes;
    }
    setBusy(r.id);
    const res = await transitionAction(orgSlug, r.boardId, r.id, action, input);
    setBusy(null);
    if (res.ok) {
      setDone((prev) => new Set(prev).add(r.id));
      router.refresh();
    } else {
      window.alert(res.error);
    }
  }

  const visible = rows.filter((r) => !done.has(r.id));

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Approvals</h1>
        <p className="text-sm text-slate-500">Work your team submitted for review, in one queue.</p>
      </div>

      {visible.length === 0 ? (
        <EmptyState icon={<Inbox size={40} />} title="Nothing to approve" hint="When someone submits work for review, it lands here." />
      ) : (
        <div className="space-y-2">
          {visible.map((r) => (
            <div key={r.id} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
              <div className="min-w-0 flex-1">
                <Link href={`/${orgSlug}/boards/${r.boardId}?item=${r.id}`} className="block truncate font-medium text-slate-800 hover:text-indigo-700">
                  {r.title}
                </Link>
                <p className="truncate text-xs text-slate-400">
                  {r.boardName} · {r.assigneeName ?? "Unassigned"} · submitted {timeAgo(r.submittedAt)}
                </p>
              </div>
              <Button size="sm" variant="secondary" disabled={busy === r.id} onClick={() => act(r, "requestChanges")} className="text-amber-700">
                <MessageSquareWarning size={14} /> Changes
              </Button>
              <Button size="sm" disabled={busy === r.id} onClick={() => act(r, "approve")} className="bg-green-600 hover:bg-green-700">
                <Check size={14} /> Approve
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
