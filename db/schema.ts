import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/* ─────────────────────────── Enums ─────────────────────────── */

/** Three roles in V1. Owner ⊃ Manager ⊃ Member in capability. Admin/Guest deferred. */
export const roleEnum = pgEnum("role", ["owner", "manager", "member"]);

/** The delegation lifecycle — the spine of the product. Kanban groups by this. */
export const itemStatusEnum = pgEnum("item_status", [
  "unassigned",
  "assigned",
  "accepted",
  "in_progress",
  "submitted",
  "changes_requested",
  "approved",
]);

export const priorityEnum = pgEnum("priority", ["low", "medium", "high", "urgent"]);

/** Flexible-column types. V1 renders status/person/date/timeline/number/text/select/checkbox/link. */
export const columnTypeEnum = pgEnum("column_type", [
  "status",
  "person",
  "date",
  "timeline",
  "number",
  "text",
  "select",
  "checkbox",
  "link",
]);

/* ─────────────────────────── Identity ─────────────────────────── */

export const appUser = pgTable("app_user", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const organizations = pgTable(
  "organizations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    timezone: text("timezone").notNull().default("UTC"),
    /** Optional Slack Incoming Webhook URL — notifications get mirrored here. */
    slackWebhookUrl: text("slack_webhook_url"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [index("org_slug_idx").on(t.slug)],
);

export const membership = pgTable(
  "membership",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => appUser.id, { onDelete: "cascade" }),
    role: roleEnum("role").notNull().default("member"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("membership_org_user_uq").on(t.orgId, t.userId),
    index("membership_user_idx").on(t.userId),
    index("membership_org_idx").on(t.orgId),
  ],
);

export const sessions = pgTable(
  "session",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => appUser.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("session_user_idx").on(t.userId)],
);

export const magicTokens = pgTable(
  "magic_token",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tokenHash: text("token_hash").notNull().unique(),
    email: text("email").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("magic_email_idx").on(t.email)],
);

/** Invite-by-link. email NULL = open link (role capped to member). Token is hashed. */
export const invites = pgTable(
  "invite",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    email: text("email"),
    role: roleEnum("role").notNull().default("member"),
    tokenHash: text("token_hash").notNull().unique(),
    createdBy: uuid("created_by").references(() => appUser.id),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    /** Set when an admin kills the link — checked on accept so it stops working immediately. */
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("invite_org_idx").on(t.orgId)],
);

/* ─────────────────────────── Boards & columns ─────────────────────────── */

export const boards = pgTable(
  "board",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    /** The board's lead — the person the whole project is delegated to. They can
        assign + approve work on this board regardless of their org-wide role. */
    ownerId: uuid("owner_id").references(() => appUser.id),
    /** When set, the board is viewable read-only at /share/<token> without auth. */
    shareToken: text("share_token").unique(),
    createdBy: uuid("created_by").references(() => appUser.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [index("board_org_idx").on(t.orgId)],
);

export const boardColumns = pgTable(
  "board_column",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    boardId: uuid("board_id")
      .notNull()
      .references(() => boards.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    type: columnTypeEnum("type").notNull(),
    position: integer("position").notNull().default(0),
    settings: jsonb("settings").$type<Record<string, unknown>>().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [index("col_board_idx").on(t.boardId)],
);

/** Options for select/status columns (label + color swatch). */
export const columnLabels = pgTable(
  "column_label",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    columnId: uuid("column_id")
      .notNull()
      .references(() => boardColumns.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    /** Index into the locked 9-swatch palette (see lib/board/palette.ts). */
    color: integer("color").notNull().default(0),
    position: integer("position").notNull().default(0),
  },
  (t) => [index("label_col_idx").on(t.columnId)],
);

/* ─────────────────────────── Items & values ─────────────────────────── */

export const items = pgTable(
  "item",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    boardId: uuid("board_id")
      .notNull()
      .references(() => boards.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    /** Long-form task body (lightweight markdown). */
    description: text("description"),
    position: integer("position").notNull().default(0),

    // ── Delegation spine (kept on the item, not in EAV, so the headline flow is fast) ──
    status: itemStatusEnum("status").notNull().default("unassigned"),
    priority: priorityEnum("priority"),
    dueDate: timestamp("due_date", { withTimezone: true }),
    assigneeId: uuid("assignee_id").references(() => appUser.id),
    assignerId: uuid("assigner_id").references(() => appUser.id),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    reviewedById: uuid("reviewed_by_id").references(() => appUser.id),
    reviewNotes: text("review_notes"),
    /** When the item entered its current status — powers time-in-status reporting later. */
    statusEnteredAt: timestamp("status_entered_at", { withTimezone: true }).notNull().defaultNow(),
    /** Optimistic-concurrency token; runTransition bumps it. */
    version: integer("version").notNull().default(0),
    /** Recurrence rule: 'daily' | 'weekly' | 'biweekly' | 'monthly' | null. On approval,
        a fresh copy is spawned with the due date advanced. */
    recurrence: text("recurrence"),
    /** Time estimate in minutes; actual time is summed from time_entry rows. */
    estimateMinutes: integer("estimate_minutes"),

    createdBy: uuid("created_by").references(() => appUser.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    index("item_board_idx").on(t.boardId),
    index("item_org_idx").on(t.orgId),
    index("item_assignee_idx").on(t.assigneeId),
    index("item_status_idx").on(t.status),
    index("item_due_idx").on(t.dueDate),
    // Full-text search index over title + description (English stemming) for ranked search.
    index("item_fts_idx").using("gin", sql`to_tsvector('english', coalesce(${t.title}, '') || ' ' || coalesce(${t.description}, ''))`),
  ],
);

/** Typed-EAV cell: one row per (item, column). Only the slot matching the column type is set. */
export const itemValues = pgTable(
  "item_value",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    itemId: uuid("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    columnId: uuid("column_id")
      .notNull()
      .references(() => boardColumns.id, { onDelete: "cascade" }),
    valueText: text("value_text"),
    valueNumber: numeric("value_number"),
    valueDate: timestamp("value_date", { withTimezone: true }),
    valueDateEnd: timestamp("value_date_end", { withTimezone: true }),
    valueBool: boolean("value_bool"),
    valueUser: uuid("value_user").references(() => appUser.id),
    valueLabelId: uuid("value_label_id").references(() => columnLabels.id),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("itemvalue_item_col_uq").on(t.itemId, t.columnId),
    index("itemvalue_col_idx").on(t.columnId),
  ],
);

/* ─────────────────────────── Collaboration ─────────────────────────── */

export const attachments = pgTable(
  "attachment",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    itemId: uuid("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    uploaderId: uuid("uploader_id").references(() => appUser.id),
    filename: text("filename").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull().default(0),
    /** Local: relative path under .data/uploads. Prod: blob key. Never a public URL. */
    storageKey: text("storage_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("attachment_item_idx").on(t.itemId)],
);

export const comments = pgTable(
  "comment",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    itemId: uuid("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    authorId: uuid("author_id").references(() => appUser.id),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [index("comment_item_idx").on(t.itemId)],
);

/** Append-only audit trail. Every transition and material edit lands here. */
export const activityLog = pgTable(
  "activity_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    itemId: uuid("item_id").references(() => items.id, { onDelete: "cascade" }),
    actorId: uuid("actor_id").references(() => appUser.id),
    type: text("type").notNull(),
    data: jsonb("data").$type<Record<string, unknown>>().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("activity_item_idx").on(t.itemId),
    index("activity_org_created_idx").on(t.orgId, t.createdAt),
  ],
);

export const notifications = pgTable(
  "notification",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => appUser.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    itemId: uuid("item_id").references(() => items.id, { onDelete: "cascade" }),
    actorId: uuid("actor_id").references(() => appUser.id),
    data: jsonb("data").$type<Record<string, unknown>>().default({}),
    readAt: timestamp("read_at", { withTimezone: true }),
    /** Idempotency key so a re-run mutation never double-notifies. */
    dedupeKey: text("dedupe_key").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("notif_user_read_idx").on(t.userId, t.readAt)],
);

/** "When [trigger] then [action]" rules, scoped to a board. */
export const automations = pgTable(
  "automation",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    boardId: uuid("board_id")
      .notNull()
      .references(() => boards.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** 'status_changed' | 'item_created' | 'due_passed' */
    triggerType: text("trigger_type").notNull(),
    triggerConfig: jsonb("trigger_config").$type<Record<string, unknown>>().default({}),
    /** 'notify' | 'set_priority' | 'assign' */
    actionType: text("action_type").notNull(),
    actionConfig: jsonb("action_config").$type<Record<string, unknown>>().default({}),
    enabled: boolean("enabled").notNull().default(true),
    createdBy: uuid("created_by").references(() => appUser.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [index("automation_board_idx").on(t.boardId)],
);

/** Lightweight subtasks: a checklist on an item. */
export const checklistItems = pgTable(
  "checklist_item",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    itemId: uuid("item_id").notNull().references(() => items.id, { onDelete: "cascade" }),
    text: text("text").notNull(),
    done: boolean("done").notNull().default(false),
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("checklist_item_idx").on(t.itemId)],
);

/** "blocked by" edges: `itemId` is blocked by `blockedById`. */
export const itemDependencies = pgTable(
  "item_dependency",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    itemId: uuid("item_id").notNull().references(() => items.id, { onDelete: "cascade" }),
    blockedById: uuid("blocked_by_id").notNull().references(() => items.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("dep_uq").on(t.itemId, t.blockedById), index("dep_item_idx").on(t.itemId), index("dep_blocker_idx").on(t.blockedById)],
);

/** A saved filter/sort/group combo for a board. */
export const savedViews = pgTable(
  "saved_view",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    boardId: uuid("board_id").notNull().references(() => boards.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    config: jsonb("config").$type<Record<string, unknown>>().notNull().default({}),
    createdBy: uuid("created_by").references(() => appUser.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("saved_view_board_idx").on(t.boardId)],
);

/** Public API keys (hashed at rest; only the prefix is shown after creation). */
export const apiKeys = pgTable(
  "api_key",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    keyHash: text("key_hash").notNull().unique(),
    prefix: text("prefix").notNull(),
    createdBy: uuid("created_by").references(() => appUser.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (t) => [index("api_key_org_idx").on(t.orgId)],
);

/** Outbound webhooks fired on org events, signed with HMAC. */
export const webhooks = pgTable(
  "webhook",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    secret: text("secret").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    createdBy: uuid("created_by").references(() => appUser.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [index("webhook_org_idx").on(t.orgId)],
);

/** Public intake forms: a shareable form whose submissions create items on a board. */
export const forms = pgTable(
  "form",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    boardId: uuid("board_id").notNull().references(() => boards.id, { onDelete: "cascade" }),
    token: text("token").notNull().unique(),
    title: text("title").notNull(),
    description: text("description"),
    enabled: boolean("enabled").notNull().default(true),
    createdBy: uuid("created_by").references(() => appUser.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [index("form_board_idx").on(t.boardId), index("form_org_idx").on(t.orgId)],
);

/** Logged time against an item (timer stops + manual entries). */
export const timeEntries = pgTable(
  "time_entry",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    itemId: uuid("item_id").notNull().references(() => items.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => appUser.id),
    minutes: integer("minutes").notNull(),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("time_entry_item_idx").on(t.itemId)],
);

/** A goal/portfolio that rolls up progress across selected boards. */
export const goals = pgTable(
  "goal",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    boardIds: jsonb("board_ids").$type<string[]>().notNull().default([]),
    dueDate: timestamp("due_date", { withTimezone: true }),
    createdBy: uuid("created_by").references(() => appUser.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [index("goal_org_idx").on(t.orgId)],
);

/** Atomic fixed-window rate-limit counters. DB-backed so the limit holds across every
    server instance (the old in-process Map reset per process / per serverless cold start).
    One row per (key, window); count is incremented via an atomic upsert. */
export const rateLimitHits = pgTable(
  "rate_limit_hit",
  {
    key: text("key").notNull(),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
    count: integer("count").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.key, t.windowStart] })],
);

/* ─────────────────────────── Inferred types ─────────────────────────── */

export type Organization = typeof organizations.$inferSelect;
export type AppUser = typeof appUser.$inferSelect;
export type Membership = typeof membership.$inferSelect;
export type Role = (typeof roleEnum.enumValues)[number];
export type ItemStatus = (typeof itemStatusEnum.enumValues)[number];
export type Priority = (typeof priorityEnum.enumValues)[number];
export type ColumnType = (typeof columnTypeEnum.enumValues)[number];
export type Board = typeof boards.$inferSelect;
export type BoardColumn = typeof boardColumns.$inferSelect;
export type ColumnLabel = typeof columnLabels.$inferSelect;
export type Item = typeof items.$inferSelect;
export type ItemValue = typeof itemValues.$inferSelect;
export type Comment = typeof comments.$inferSelect;
export type Attachment = typeof attachments.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
export type ActivityEntry = typeof activityLog.$inferSelect;
export type Automation = typeof automations.$inferSelect;
export type ChecklistItem = typeof checklistItems.$inferSelect;
export type ItemDependency = typeof itemDependencies.$inferSelect;
export type SavedView = typeof savedViews.$inferSelect;
export type ApiKey = typeof apiKeys.$inferSelect;
export type Webhook = typeof webhooks.$inferSelect;
export type Form = typeof forms.$inferSelect;
export type TimeEntry = typeof timeEntries.$inferSelect;
export type Goal = typeof goals.$inferSelect;
