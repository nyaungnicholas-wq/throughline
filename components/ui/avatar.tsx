import { SWATCHES } from "@/lib/board/palette";
import { cn } from "@/lib/cn";

function initials(name: string | null, email: string): string {
  const src = (name ?? email).trim();
  const parts = src.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return src.slice(0, 2).toUpperCase();
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function Avatar({
  name,
  email,
  size = 28,
  className,
  title,
}: {
  name: string | null;
  email: string;
  size?: number;
  className?: string;
  title?: string;
}) {
  const sw = SWATCHES[hash(email) % SWATCHES.length];
  return (
    <span
      title={title ?? name ?? email}
      className={cn("inline-flex items-center justify-center rounded-full font-semibold select-none", className)}
      style={{
        width: size,
        height: size,
        background: sw.bg,
        color: sw.text,
        fontSize: Math.round(size * 0.4),
        border: `1px solid ${sw.dot}33`,
      }}
    >
      {initials(name, email)}
    </span>
  );
}
