"use client";

import { X } from "lucide-react";
import { useEffect } from "react";
import { cn } from "@/lib/cn";

function useEscape(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
}

/** Right-side drawer — where the delegation spine lives on a board. */
export function Drawer({
  open,
  onClose,
  children,
  width = 460,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  width?: number;
}) {
  useEscape(open, onClose);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-slate-900/30 backdrop-blur-[1px]" onClick={onClose} />
      <aside
        className="tl-slide relative h-full bg-white shadow-2xl border-l border-slate-200 flex flex-col tl-scroll overflow-y-auto"
        style={{ width: `min(${width}px, 100vw)` }}
        role="dialog"
        aria-modal="true"
      >
        {children}
      </aside>
    </div>
  );
}

export function Modal({
  open,
  onClose,
  children,
  title,
  width = 440,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  title?: string;
  width?: number;
}) {
  useEscape(open, onClose);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/40" onClick={onClose} />
      <div
        className="tl-fade relative w-full rounded-2xl bg-white shadow-2xl border border-slate-200"
        style={{ maxWidth: width }}
        role="dialog"
        aria-modal="true"
      >
        {title != null && (
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <h2 className="font-semibold text-slate-900">{title}</h2>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-700" aria-label="Close">
              <X size={18} />
            </button>
          </div>
        )}
        <div className={cn(title == null && "pt-1")}>{children}</div>
      </div>
    </div>
  );
}
