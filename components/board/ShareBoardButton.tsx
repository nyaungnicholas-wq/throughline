"use client";

import { Check, Copy, Globe, Share2 } from "lucide-react";
import { useState } from "react";
import { setBoardShareAction } from "@/lib/actions/boards";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/overlay";

export function ShareBoardButton({
  orgSlug,
  boardId,
  initialToken,
}: {
  orgSlug: string;
  boardId: string;
  initialToken: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [token, setToken] = useState<string | null>(initialToken);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const url = token ? `${origin}/share/${token}` : "";

  async function toggle(enable: boolean) {
    setBusy(true);
    const res = await setBoardShareAction(orgSlug, boardId, enable);
    setBusy(false);
    if (res.ok) setToken(res.shareToken);
    else window.alert(res.error);
  }

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard?.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      // Insecure origin or denied permission — leave the URL visible for manual copy.
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
        title="Share board"
      >
        <Share2 size={15} /> Share
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title="Share this board">
        <div className="space-y-4 px-5 py-5">
          <div className="flex items-start gap-3 rounded-xl bg-slate-50 p-3">
            <Globe size={18} className="mt-0.5 shrink-0 text-indigo-500" />
            <div className="text-sm">
              <p className="font-medium text-slate-800">Public read-only link</p>
              <p className="text-slate-500">Anyone with the link can view this board&apos;s tasks. They can&apos;t edit, comment, or see other boards.</p>
            </div>
          </div>

          {token ? (
            <>
              <div className="flex items-center gap-2">
                <input readOnly value={url} className="h-10 flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-700 outline-none" />
                <Button size="sm" variant="secondary" onClick={copy}>
                  {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? "Copied" : "Copy"}
                </Button>
              </div>
              <div className="flex items-center justify-between border-t border-slate-100 pt-3">
                <span className="flex items-center gap-1.5 text-sm font-medium text-green-600">
                  <span className="h-2 w-2 rounded-full bg-green-500" /> Link is active
                </span>
                <Button size="sm" variant="secondary" disabled={busy} onClick={() => toggle(false)} className="text-red-600">
                  Turn off
                </Button>
              </div>
            </>
          ) : (
            <Button disabled={busy} onClick={() => toggle(true)} className="w-full">
              {busy ? "Creating link…" : "Create share link"}
            </Button>
          )}
        </div>
      </Modal>
    </>
  );
}
