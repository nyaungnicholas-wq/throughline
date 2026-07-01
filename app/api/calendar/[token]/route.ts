import { and, eq, isNull } from "drizzle-orm";
import { items, membership } from "@/db/schema";
import { verifySignedToken } from "@/lib/crypto";
// eslint-disable-next-line no-restricted-imports -- token-authenticated feed; scoped by the token's org+user
import { getDb } from "@/lib/db";

const pad = (n: number) => String(n).padStart(2, "0");
const dateOnly = (d: Date) => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`;
const stamp = (d: Date) => `${dateOnly(d)}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
const esc = (s: string) => s.replace(/([,;\\])/g, "\\$1").replace(/\n/g, "\\n");

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const payload = verifySignedToken(token);
  if (!payload) return new Response("Invalid token", { status: 401 });
  const [userId, orgId] = payload.split(":");
  if (!userId || !orgId) return new Response("Invalid token", { status: 401 });

  const db = await getDb();
  const [m] = await db
    .select({ id: membership.id })
    .from(membership)
    .where(and(eq(membership.orgId, orgId), eq(membership.userId, userId), isNull(membership.deletedAt)))
    .limit(1);
  if (!m) return new Response("Not a member", { status: 403 });

  const rows = await db
    .select({ id: items.id, title: items.title, dueDate: items.dueDate, status: items.status })
    .from(items)
    .where(and(eq(items.orgId, orgId), eq(items.assigneeId, userId), isNull(items.deletedAt)));

  const now = stamp(new Date());
  const events = rows
    .filter((r) => r.dueDate)
    .map((r) =>
      ["BEGIN:VEVENT", `UID:${r.id}@throughline`, `DTSTAMP:${now}`, `DTSTART;VALUE=DATE:${dateOnly(r.dueDate!)}`, `SUMMARY:${esc(r.title)} [${r.status}]`, "END:VEVENT"].join("\r\n"),
    );

  const ics = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Throughline//EN", "CALSCALE:GREGORIAN", "X-WR-CALNAME:Throughline – My Work", ...events, "END:VCALENDAR"].join("\r\n");

  return new Response(ics, {
    headers: { "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": 'inline; filename="throughline.ics"', "Cache-Control": "private, max-age=300" },
  });
}
