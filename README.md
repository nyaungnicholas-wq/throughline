# Throughline

A multi-tenant work manager built around **delegation** — managers assign work, track it through an approval flow, and sign off, all on one clean surface.

Built by **[Nicholas Nyaung](https://nicholasnyaung.com)**

## Highlights
- **Delegation engine** — a 7-state workflow (assigned → in-progress → submitted → approved / changes-requested), with no-self-approval enforced server-side.
- **Multi-tenant** — every query runs through a `requireMember` tenant chokepoint (plus a lint rule banning raw DB access) so data can't leak across orgs.
- **Views** — Table, Kanban, Calendar, and Gantt over the same tasks; typed "flexible columns" for custom fields.
- **AI (Gemini)** — board generation, summaries, a delegation helper, and chat.
- **Collaboration** — comments, @mentions, attachments, checklists, dependencies (with cycle detection), recurring tasks, notifications, and SSE real-time updates.
- **Integrations** — Slack, iCal, a public read API, and SSRF-guarded webhooks; CSV/Trello import + export.
- Passwordless **magic-link auth**, a ⌘K command palette, saved views, Recharts reporting, XSS-safe rich-text, public share links, full dark mode, mobile-responsive.

## Stack
Next.js 16 (App Router, TypeScript) · Drizzle ORM · **PGlite** (zero-config local Postgres, Neon in production) · Tailwind · Gemini.

## Run
```bash
npm install
npm run dev     # zero-config on PGlite; no external database needed for local dev
```

## Tests
`npm test` — Vitest specs covering tenant isolation, delegation transitions, and dependency cycles.

---
Built by **Nicholas Nyaung** — [nicholasnyaung.com](https://nicholasnyaung.com) · MIT licensed.
