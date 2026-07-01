import { and, eq, isNull, lt, ne } from "drizzle-orm";
import { automations, items, organizations } from "@/db/schema";
import type { OrgContext } from "@/lib/authz";
import { runAutomations } from "@/lib/automations";
import type { Db } from "@/lib/db";

/** Fire every org's `due_passed` automations against its currently-overdue tasks.
    Invoked by the secret-protected cron route; no user session. */
export async function runAllDueAutomations(db: Db): Promise<{ orgs: number; fired: number }> {
  const orgs = await db.select().from(organizations).where(isNull(organizations.deletedAt));
  let fired = 0;
  for (const org of orgs) {
    // A synthetic context — runAutomations for due_passed only uses ctx.db + ctx.org.
    const ctx = { db, org, user: { id: org.id, email: "system@throughline", name: "System" }, role: "owner" } as OrgContext;
    const rules = await db
      .select({ boardId: automations.boardId })
      .from(automations)
      .where(and(eq(automations.orgId, org.id), eq(automations.triggerType, "due_passed"), eq(automations.enabled, true), isNull(automations.deletedAt)));
    for (const boardId of [...new Set(rules.map((r) => r.boardId))]) {
      const overdue = await db
        .select({ id: items.id })
        .from(items)
        .where(and(eq(items.orgId, org.id), eq(items.boardId, boardId), isNull(items.deletedAt), lt(items.dueDate, new Date()), ne(items.status, "approved")));
      for (const it of overdue) {
        await runAutomations(ctx, { type: "due_passed", boardId, itemId: it.id });
        fired++;
      }
    }
  }
  return { orgs: orgs.length, fired };
}
