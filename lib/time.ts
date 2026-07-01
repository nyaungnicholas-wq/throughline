import { format, formatDistanceToNowStrict, isValid } from "date-fns";

function toDate(v: string | Date | null | undefined): Date | null {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return isValid(d) ? d : null;
}

export function timeAgo(v: string | Date | null | undefined): string {
  const d = toDate(v);
  return d ? formatDistanceToNowStrict(d, { addSuffix: true }) : "";
}

/** "Mar 4" or "Mar 4, 2026" if a different year. */
export function fmtDate(v: string | Date | null | undefined): string {
  const d = toDate(v);
  if (!d) return "";
  return format(d, d.getFullYear() === new Date().getFullYear() ? "MMM d" : "MMM d, yyyy");
}

export function fmtDateTime(v: string | Date | null | undefined): string {
  const d = toDate(v);
  return d ? format(d, "MMM d, h:mma") : "";
}

/** ISO date (yyyy-MM-dd) for <input type="date">. */
export function toDateInput(v: string | Date | null | undefined): string {
  const d = toDate(v);
  return d ? format(d, "yyyy-MM-dd") : "";
}

export function isOverdue(v: string | Date | null | undefined): boolean {
  const d = toDate(v);
  return d ? d.getTime() < Date.now() : false;
}
