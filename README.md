# Throughline

**A multi-tenant work manager built around delegation** — managers hand out work, watch it move through an accountable approval flow, and sign it off, all on one board-shaped surface.

**[Live demo → throughline.nicholasnyaung.com](https://throughline.nicholasnyaung.com)** · Built by **[Nicholas Nyaung](https://nicholasnyaung.com)**

---

## 60-second local start

```bash
npm install
npm run dev
```

Open <http://localhost:3000>. There is **nothing else to configure** — no Docker, no database to provision, no API keys. The app boots an in-process Postgres (PGlite) under `.data/`, runs its own migrations, and the login page offers **Seed demo data** followed by one-click dev sign-in as any seeded account. AI features fall back to a deterministic offline provider, and email is a no-op that prints the magic link to your console.

---

## What it does

- **Delegation engine** — a 7-state item machine (`unassigned → assigned → accepted → in_progress → submitted → changes_requested / approved`). Every transition is authorised server-side, and **no one can approve their own work** — not even an owner, and not by dragging a card.
- **Four views, one dataset** — Table, Kanban, Calendar and Gantt over the same items, with filters, grouping and saved views.
- **Flexible columns** — user-defined per-board fields (status, person, date, timeline, number, text, select, checkbox, link) on a typed EAV store.
- **Collaboration** — comments with @mentions, file attachments, checklists, task dependencies with cycle detection, recurring tasks, notifications, and live updates over SSE.
- **AI assist** — board generation from a prompt, item/board summaries, a delegation helper and chat. Pluggable provider: Gemini, NVIDIA NIM, or the built-in mock.
- **Integrations** — Slack mirroring, iCal feeds, a read-only public REST API with per-org API keys, SSRF-guarded outbound webhooks, CSV/Trello import and CSV export.
- **The rest** — passwordless magic-link auth, ⌘K command palette, Recharts dashboards, XSS-safe rich text, public share links, dark mode, mobile-responsive.

---

## Architecture decisions worth reading the code for

**Tenant isolation through a single chokepoint.** Every page and server action resolves its tenant via `requireMember(orgSlug)` in [`lib/authz.ts`](lib/authz.ts), which returns an `OrgContext` carrying the org and role; API routes use the non-redirecting `getMemberContext`. Non-members get a `404`, not a `403`, so an org's existence is never revealed. Because a chokepoint only works if nothing bypasses it, a **custom ESLint rule** (`eslint.config.mjs`) bans importing the raw unscoped `getDb()` from anywhere under `app/` or `components/` — the guardrail is mechanical, not a code-review convention. `tests/tenant-isolation.test.ts` proves both the chokepoint and the separate API-key path (`lib/api-auth.ts`, which the lint rule can't cover) refuse cross-org reads and writes.

**Typed EAV for flexible columns.** Per-board custom fields are stored in `item_value` with one typed slot per kind (`value_text`, `value_number`, `value_date`/`value_date_end`, `value_bool`, `value_user`, `value_label_id`) plus a unique `(item_id, column_id)` index — so custom fields stay indexable, sortable and referentially intact instead of collapsing into an untyped JSON blob.

**One codebase, two Postgres drivers.** [`lib/db.ts`](lib/db.ts) picks **PGlite** when `DATABASE_URL` is absent and **postgres-js** when it's present, behind one Drizzle `Db` type. Serverless cold starts can race each other into the migrator, so production migrations run on a dedicated `max:1` connection wrapped in a `pg_advisory_lock` — on a pool, the lock and unlock could land on different connections and leak the lock.

**Storage that survives serverless.** [`lib/storage.ts`](lib/storage.ts) is a three-function object store (`putObject` / `getObject` / `deleteObject`) with a local-filesystem backend for dev and a Vercel Blob backend when `BLOB_READ_WRITE_TOKEN` is set. `@vercel/blob` is loaded through a runtime import so the app builds and runs without it installed. Attachments are never served from a public URL: downloads go through `/api/attachments/[id]`, which re-checks org membership, forces `application/octet-stream` for anything outside a small non-scriptable allowlist, and deliberately excludes SVG (an inline SVG executes its own `<script>`).

**Security posture.** Magic-link tokens and sessions are stored hashed and rate-limited; the cron endpoint compares its secret in constant time and accepts it only from a request header; outbound webhooks pass an SSRF guard that blocks loopback, private and link-local addresses; a strict CSP, `nosniff`, frame-ancestor and HSTS headers are set in `next.config.ts`.

## Stack

Next.js 16 (App Router) · React 19 · TypeScript (strict) · Drizzle ORM · PGlite locally / Neon Postgres in production · Tailwind v4 · Vitest.

---

## Tests

```bash
npm test    # 61 tests across 11 files
```

Covering tenant isolation (authz chokepoint + API keys), delegation transitions and no-self-approval, dependency cycle detection, the attachment upload/download path and storage-key traversal, the SSRF guard, rate limiting, crypto helpers, markdown sanitisation, CSV import/export, and filtering. The tenant, dependency and attachment specs run against a throwaway in-memory PGlite with the real migrations applied, so they exercise actual SQL rather than mocks.

Also: `npx tsc --noEmit` · `npm run lint` · `npm run build`.

---

## Deploying (Vercel + Neon, both free tier)

1. **Database** — create a Neon project and copy its pooled connection string.
2. **Blob** — in the Vercel project, create a Blob store; Vercel injects `BLOB_READ_WRITE_TOKEN`. Then `npm install @vercel/blob`. Without it, uploads fall back to the ephemeral local disk and will be lost.
3. **Env** — set the variables from [`.env.example`](.env.example): `DATABASE_URL`, `APP_SECRET` (`openssl rand -base64 32`), `APP_URL`, plus any optional keys. Each one is documented there with what happens if it's missing.
4. **Deploy** — import the repo on Vercel. Migrations run automatically on first boot, under an advisory lock.
5. **Cron** — [`vercel.json`](vercel.json) registers a daily run of `/api/cron/run-due` for "when overdue" automations. Set `CRON_SECRET`; Vercel Cron sends it as `Authorization: Bearer`. The Hobby plan allows daily cron only — for finer granularity, point any external scheduler at the same URL with an `x-cron-secret` header.
6. **Email** — set `RESEND_API_KEY` and `EMAIL_FROM`, otherwise magic links can't be delivered and nobody can sign in to a production deployment.

---

Built by **Nicholas Nyaung** — [nicholasnyaung.com](https://nicholasnyaung.com) · MIT licensed.
