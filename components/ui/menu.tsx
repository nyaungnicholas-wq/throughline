"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";

/** Lightweight click-to-open dropdown with click-outside + Escape handling. */
export function Menu({
  trigger,
  children,
  align = "left",
  width = 220,
}: {
  trigger: (props: { open: boolean; toggle: () => void }) => React.ReactNode;
  children: (close: () => void) => React.ReactNode;
  align?: "left" | "right";
  width?: number;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      {trigger({ open, toggle: () => setOpen((v) => !v) })}
      {open && (
        <div
          className={cn(
            "tl-fade absolute z-40 mt-1 rounded-xl border border-slate-200 bg-white p-1 shadow-xl",
            align === "right" ? "right-0" : "left-0",
          )}
          style={{ minWidth: width }}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

/** Polymorphic menu row — renders a <button> by default, or any element (e.g. Next's
    Link) via `as`, so we never nest a <button> inside an <a>. */
export function MenuItem<T extends React.ElementType = "button">({
  as,
  className,
  ...props
}: { as?: T } & Omit<React.ComponentPropsWithoutRef<T>, "as">) {
  const Comp = (as ?? "button") as React.ElementType;
  return (
    <Comp
      className={cn(
        "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-40",
        className,
      )}
      {...props}
    />
  );
}
