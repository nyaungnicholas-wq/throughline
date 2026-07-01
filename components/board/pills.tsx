import type { ItemStatus, Priority } from "@/db/schema";
import { Pill } from "@/components/ui/misc";
import { PRIORITY_META, STATUS_META, swatch } from "@/lib/board/palette";

export function StatusPill({ status }: { status: ItemStatus }) {
  const meta = STATUS_META[status];
  const sw = swatch(meta.swatch);
  return (
    <Pill bg={sw.bg} color={sw.text} dot={sw.dot}>
      {meta.label}
    </Pill>
  );
}

export function PriorityPill({ priority }: { priority: Priority | null }) {
  if (!priority) return <span className="text-xs text-slate-300">—</span>;
  const meta = PRIORITY_META[priority];
  const sw = swatch(meta.swatch);
  return (
    <Pill bg={sw.bg} color={sw.text} dot={sw.dot}>
      {meta.label}
    </Pill>
  );
}

export function LabelPill({ label, color }: { label: string; color: number }) {
  const sw = swatch(color);
  return (
    <Pill bg={sw.bg} color={sw.text} dot={sw.dot}>
      {label}
    </Pill>
  );
}
