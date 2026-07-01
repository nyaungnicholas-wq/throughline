import { eq } from "drizzle-orm";
import {
  activityLog,
  appUser,
  boardColumns,
  boards,
  columnLabels,
  comments,
  itemValues,
  items,
  membership,
  notifications,
  organizations,
  type ItemStatus,
  type Priority,
  type Role,
} from "@/db/schema";
import type { Db } from "@/lib/db";

const DAY = 86400_000;

/** Idempotent demo seed. Two orgs (to prove isolation) + a seeded reviewer (so a
    solo user can exercise the full assign→submit→approve loop). */
export async function seedDemo(db: Db): Promise<{ seeded: boolean; accounts: string[] }> {
  const [existing] = await db.select({ id: organizations.id }).from(organizations).where(eq(organizations.slug, "acme")).limit(1);
  if (existing) {
    return { seeded: false, accounts: ACCOUNTS };
  }

  async function user(email: string, name: string): Promise<string> {
    const [u] = await db.insert(appUser).values({ email, name }).returning({ id: appUser.id });
    return u.id;
  }
  async function org(slug: string, name: string): Promise<string> {
    const [o] = await db.insert(organizations).values({ slug, name }).returning({ id: organizations.id });
    return o.id;
  }
  async function member(orgId: string, userId: string, role: Role) {
    await db.insert(membership).values({ orgId, userId, role });
  }

  // ── Users ──
  const maya = await user("manager@acme.test", "Maya Manager");
  const devin = await user("dev@acme.test", "Devin Dev");
  const riley = await user("reviewer@acme.test", "Riley Reviewer");
  const gloria = await user("owner@globex.test", "Gloria Globex");

  // ── Org A: Acme ──
  const acme = await org("acme", "Acme Studio");
  await member(acme, maya, "owner");
  await member(acme, riley, "manager");
  await member(acme, devin, "member");

  const [board] = await db
    .insert(boards)
    .values({ orgId: acme, name: "Website Relaunch", description: "Q3 marketing site rebuild", createdBy: maya })
    .returning({ id: boards.id });

  // custom columns
  const [notes] = await db.insert(boardColumns).values({ orgId: acme, boardId: board.id, name: "Notes", type: "text", position: 0 }).returning({ id: boardColumns.id });
  const [estimate] = await db.insert(boardColumns).values({ orgId: acme, boardId: board.id, name: "Estimate (h)", type: "number", position: 1 }).returning({ id: boardColumns.id });
  const [tag] = await db.insert(boardColumns).values({ orgId: acme, boardId: board.id, name: "Tag", type: "select", position: 2 }).returning({ id: boardColumns.id });
  const tagLabels = await db
    .insert(columnLabels)
    .values([
      { orgId: acme, columnId: tag.id, label: "Design", color: 3, position: 0 },
      { orgId: acme, columnId: tag.id, label: "Dev", color: 1, position: 1 },
      { orgId: acme, columnId: tag.id, label: "QA", color: 8, position: 2 },
    ])
    .returning({ id: columnLabels.id, label: columnLabels.label });
  const labelByName = Object.fromEntries(tagLabels.map((l) => [l.label, l.id]));

  type Seed = {
    title: string;
    status: ItemStatus;
    assignee?: string;
    assigner?: string;
    priority?: Priority;
    dueInDays?: number;
    notes?: string;
    estimate?: number;
    tag?: string;
    submitted?: boolean;
  };
  const seeds: Seed[] = [
    { title: "Design new homepage hero", status: "in_progress", assignee: devin, assigner: maya, priority: "high", dueInDays: 3, notes: "Match the new brand deck", estimate: 12, tag: "Design" },
    { title: "Set up CI/CD pipeline", status: "submitted", assignee: devin, assigner: maya, priority: "medium", dueInDays: 1, estimate: 6, tag: "Dev", submitted: true },
    { title: "Write API documentation", status: "assigned", assignee: devin, assigner: maya, priority: "low", dueInDays: 7, tag: "Dev" },
    { title: "Fix checkout login bug", status: "approved", assignee: devin, assigner: maya, priority: "urgent", dueInDays: -2, tag: "Dev", estimate: 4 },
    { title: "Plan Q3 content calendar", status: "unassigned", priority: "medium", dueInDays: 10, tag: "Design" },
    { title: "Migrate to new database", status: "changes_requested", assignee: devin, assigner: riley, priority: "high", dueInDays: 5, notes: "Add rollback plan", estimate: 16, tag: "Dev" },
  ];

  let pos = 0;
  for (const s of seeds) {
    const now = Date.now();
    const [it] = await db
      .insert(items)
      .values({
        orgId: acme,
        boardId: board.id,
        title: s.title,
        position: pos++,
        status: s.status,
        priority: s.priority ?? null,
        assigneeId: s.assignee ?? null,
        assignerId: s.assigner ?? null,
        dueDate: s.dueInDays != null ? new Date(now + s.dueInDays * DAY) : null,
        submittedAt: s.submitted ? new Date(now - DAY) : null,
        reviewedById: s.status === "approved" ? maya : s.status === "changes_requested" ? riley : null,
        reviewNotes: s.status === "changes_requested" ? "Looks close — please add a rollback plan before resubmitting." : null,
        statusEnteredAt: new Date(now - DAY),
        createdBy: maya,
      })
      .returning({ id: items.id });

    if (s.notes) await db.insert(itemValues).values({ orgId: acme, itemId: it.id, columnId: notes.id, valueText: s.notes });
    if (s.estimate != null) await db.insert(itemValues).values({ orgId: acme, itemId: it.id, columnId: estimate.id, valueNumber: String(s.estimate) });
    if (s.tag && labelByName[s.tag]) await db.insert(itemValues).values({ orgId: acme, itemId: it.id, columnId: tag.id, valueLabelId: labelByName[s.tag] });

    await db.insert(activityLog).values({ orgId: acme, itemId: it.id, actorId: maya, type: "item_created" });

    if (s.submitted) {
      await db.insert(notifications).values({
        orgId: acme,
        userId: maya,
        actorId: devin,
        type: "submitted",
        itemId: it.id,
        data: { title: s.title },
        dedupeKey: `seed:submitted:${it.id}`,
      });
      await db.insert(comments).values({ orgId: acme, itemId: it.id, authorId: devin, body: "Ready for your review — pipeline is green ✅" });
    }
  }

  // a second, lighter board
  await db.insert(boards).values({ orgId: acme, name: "Marketing", description: "Campaigns & content", createdBy: maya });

  // ── Org B: Globex (isolation check — Acme users must never see this) ──
  const globex = await org("globex", "Globex Corp");
  await member(globex, gloria, "owner");
  const [gboard] = await db.insert(boards).values({ orgId: globex, name: "Secret Project", createdBy: gloria }).returning({ id: boards.id });
  await db.insert(items).values({ orgId: globex, boardId: gboard.id, title: "Globex confidential roadmap", status: "in_progress", assigneeId: gloria, createdBy: gloria, position: 0 });

  return { seeded: true, accounts: ACCOUNTS };
}

export const ACCOUNTS = [
  "manager@acme.test (Owner)",
  "reviewer@acme.test (Manager)",
  "dev@acme.test (Member)",
  "owner@globex.test (other org)",
];
