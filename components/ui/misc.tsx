import { Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";

export function Spinner({ className, size = 16 }: { className?: string; size?: number }) {
  return <Loader2 className={cn("animate-spin text-slate-400", className)} size={size} />;
}

export function EmptyState({
  icon,
  title,
  hint,
  action,
}: {
  icon?: React.ReactNode;
  title: string;
  hint?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="tl-fade flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white/60 px-6 py-14 text-center">
      {icon && (
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-slate-50 to-slate-100 text-slate-400 ring-1 ring-inset ring-slate-200">
          {icon}
        </div>
      )}
      <p className="font-semibold text-slate-700">{title}</p>
      {hint && <p className="mt-1 max-w-sm text-sm leading-relaxed text-slate-500">{hint}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Pill({
  children,
  bg,
  color,
  dot,
  className,
}: {
  children: React.ReactNode;
  bg?: string;
  color?: string;
  dot?: string;
  className?: string;
}) {
  return (
    <span
      className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold", className)}
      style={{ background: bg, color }}
    >
      {dot && <span className="h-2 w-2 rounded-full" style={{ background: dot }} />}
      {children}
    </span>
  );
}
