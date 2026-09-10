# Orbit

**Orbit** is a project management platform for software teams — issue tracking, kanban, cycles
(sprints), projects, analytics, an inbox, and a keyboard-first command palette.

It is a complete, runnable full-stack application: a Fastify + Prisma + SQLite/PostgreSQL API and a
React + TypeScript single-page client, with unit, API-integration and Playwright end-to-end tests.

<p align="center">
  <em>Built from scratch — no third-party product branding or assets.</em>
</p>

---

## Table of contents

- [Screenshots](#screenshots)
- [Product overview](#product-overview)
- [Architecture](#architecture)
- [Tech stack](#tech-stack)
- [Quick start](#quick-start)
- [Environment variables](#environment-variables)
- [Database setup](#database-setup)
- [Development commands](#development-commands)
- [Test commands](#test-commands)
- [Production build](#production-build)
- [Deployment](#deployment)
- [Demo accounts](#demo-accounts)
- [Project structure](#project-structure)
- [Security](#security)
- [Known limitations](#known-limitations)

---

## Screenshots

Screenshots are produced by the E2E suite and the walkthrough script. Generate them locally with:

```bash
pnpm --filter @orbit/e2e exec playwright test tests/smoke.spec.ts --headed
pnpm --filter @orbit/e2e run screenshots      # writes apps/e2e/screenshots/*.png
```

| View | What it shows |
| --- | --- |
| Issue list | Grouped, filterable Linear-style list with keyboard nav and bulk actions |
| Board | Drag & drop kanban with optimistic updates and error rollback |
| Issue detail | Editable title/description, metadata sidebar, comments, activity, sub-issues |
| Analytics | Charts computed from live issue data |
| Command palette | `Ctrl/Cmd+K` search, navigation and commands |

---

## Product overview

### Authentication
Register, log in, log out, persistent sessions (opaque server-side tokens in an httpOnly cookie),
a full password-reset flow with single-use expiring tokens, profile editing, avatar upload/removal
and password change (which revokes every other session).

### Workspaces and permissions
A user can belong to multiple workspaces with a role per workspace: **Owner**, **Admin**,
**Member**, **Viewer**. The matrix lives in one place (`packages/shared/src/permissions.ts`) and is
enforced by the API on every request — the UI only mirrors it.

| | Viewer | Member | Admin | Owner |
| --- | :-: | :-: | :-: | :-: |
| Read issues / export CSV | ✅ | ✅ | ✅ | ✅ |
| Comment | ✅ | ✅ | ✅ | ✅ |
| Create / edit / move / delete issues | — | ✅ | ✅ | ✅ |
| Manage labels | — | ✅ | ✅ | ✅ |
| Import CSV | — | ✅ | ✅ | ✅ |
| Manage projects, cycles and members | — | — | ✅ | ✅ |
| Rename workspace | — | — | ✅ | ✅ |
| Delete workspace | — | — | — | ✅ |

### Projects
Name, icon, colour, description, status, lead, members, start/target dates and derived progress.
Includes a list view (grid + table), a detail page with tabs (overview / issues / cycles /
settings), project settings and project analytics.

### Issues
`ORB-123` identifiers, title, markdown description, status, priority, assignee, creator, labels,
project, cycle, estimate, due date, created/updated timestamps, sub-issues, relations,
attachments, comments and an immutable activity history. Create, edit, delete, duplicate, assign,
move status, change priority, label, filter, sort, search and paginate.

Statuses: Backlog · Todo · In Progress · In Review · Done · Cancelled
Priorities: No priority · Low · Medium · High · Urgent

### Kanban
Columns by status with native HTML5 drag & drop. Dropping a card persists the new column **and** a
fractional `boardOrder`, applies an optimistic cache patch, shows a loading indicator, and restores
the previous order with an error toast if the request fails.

### Realtime
One WebSocket per tab (`/api/realtime`), authenticated with the session cookie. Issue creation,
status changes, assignments, comments, labels, projects and notifications are broadcast to every
member of the workspace. Reconnects use exponential backoff with jitter; a heartbeat detects
half-open sockets, and the header shows a *Reconnecting* badge rather than silently breaking.

### Command palette, shortcuts and search
`Ctrl/Cmd+K` opens a grouped palette (recent issues, search results, navigation, actions, workspace
switching). Global shortcuts: `C` create, `/` search, `G`+`I/P/B/C/N/A/S` navigation, `?` help,
`T` theme, `Esc` close. The issue list adds `J`/`K`, `X`, `⌘/Ctrl+A`, `Enter`. Global search covers
issues, projects, people, cycles and labels with a debounced request.

### Notifications and inbox
Assignment, mention, comment and status-change notifications with unread badges, mark-as-read,
mark-all-as-read and an inbox that also surfaces recent workspace activity.

### Cycles, analytics, import/export
Cycles with progress, scope, completed points, time elapsed, burndown and velocity. Analytics with
created-vs-completed, throughput, status/priority breakdowns, workload per member, project
completion, cycle velocity and label usage — all from real rows. CSV import validates row by row
and reports per-field errors; CSV export streams the current issue set.

### UI/UX
Responsive layout, dark/light theme persisted across reloads and applied before first paint,
sidebar with workspace switcher, breadcrumbs, context menus, modals, tooltips, toasts, skeleton
loading states, empty states and error states.

---

## Architecture

```
┌─────────────────────────────┐        ┌──────────────────────────────────────┐
│  apps/web (React + Vite)    │        │  apps/server (Node + Fastify)        │
│                             │        │                                      │
│  React Router routes        │  HTTP  │  routes/      → HTTP + validation    │
│  React Query cache ─────────┼───────▶│  services/    → domain + permissions │
│  Session cookie + WS        │   WS   │  lib/         → guards, errors, DTOs │
│                             │◀───────│  prisma/      → schema, migrations,  │
│  Tailwind design tokens     │ events │                 deterministic seed    │
└─────────────────────────────┘        └───────────────┬──────────────────────┘
                                                       │ Prisma Client
                                       ┌───────────────▼──────────────────────┐
                                       │  SQLite (default) / PostgreSQL        │
                                       │  17 tables, indexed for list queries  │
                                       └──────────────────────────────────────┘
                    packages/shared  —  Zod schemas, permission matrix,
                                        workflow constants, CSV/markdown utils
                                        (imported by BOTH server and web)
```

Key decisions:

- **One source of truth for contracts.** `@orbit/shared` holds the Zod schemas, the role/permission
  matrix and the workflow constants. The server validates with them; the client uses the same
  matrix to disable actions, and the same parsing helpers. The compiled package is consumed by Node;
  Vite/Vitest alias it to the TypeScript sources.
- **Authorization in the service layer.** `requireWorkspace(request, id, permission)` resolves the
  caller's membership and checks the permission before any query runs. Cross-workspace access
  returns 404 (not 403) so the existence of other workspaces is never leaked.
- **Optimistic UI with real rollback.** Kanban moves and bulk edits patch the React Query cache
  first, then reconcile; on failure the snapshot is restored and the server state re-fetched.
- **Immutable activity trail.** Every mutation appends an `Activity` row inside the same transaction
  as the change, with `{ field: { from, to } }` deltas rendered into sentences by the server.

---

## Tech stack

| Layer | Choice | Why |
| --- | --- | --- |
| Language | TypeScript 5.7 (strict, `noUncheckedIndexedAccess`) | End-to-end type safety |
| Client | React 18 + Vite 6 + React Router 6 | Fast dev server, simple deployment |
| Server state | TanStack Query 5 | Caching, optimistic updates, rollback |
| Styling | Tailwind CSS 3 + CSS custom properties | Themeable without re-rendering React |
| Charts | Recharts | Accessible SVG charts |
| API | Fastify 5 | Fast, schema-friendly, first-class WebSockets |
| Validation | Zod 3 | Shared client/server schemas |
| ORM | Prisma 6 | Typed queries + migrations |
| Database | SQLite (default) / PostgreSQL | Zero-setup locally, production-ready parity |
| Realtime | `@fastify/websocket` | One socket per tab, cookie-authenticated |
| Auth | bcryptjs + opaque session tokens (SHA-256 hashed at rest) | No JWT revocation problem |
| Unit/integration | Vitest 3 | Fast, works for both packages |
| E2E | Playwright 1.49 | Real browser, real API, real database |

---

## Quick start

Requirements: **Node 20.11+** (22 recommended) and **pnpm 10+**.

```bash
git clone <your-repo-url> orbit
cd orbit

corepack enable                 # or: npm i -g pnpm@10
pnpm install

# configure the server (SQLite by default — no external services needed)
cp apps/server/.env.example apps/server/.env
cp apps/web/.env.example apps/web/.env      # optional; defaults already point at :4000

# create the schema and load the demo data
pnpm db:generate
pnpm db:migrate
pnpm db:seed

# run the API (:4000) and the client (:5173) together
pnpm dev
```

Open <http://localhost:5173> and sign in with a [demo account](#demo-accounts).

> `pnpm setup` runs install + generate + migrate + seed in one step.

---

## Environment variables

### `apps/server/.env`

| Variable | Default | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | `file:./dev.db` | SQLite file or a `postgresql://` URL |
| `NODE_ENV` | `development` | `development` \| `test` \| `production` |
| `PORT` | `4000` | API port |
| `HOST` | `0.0.0.0` | Bind address |
| `APP_URL` | `http://localhost:5173` | Public client origin (reset links, CORS default) |
| `AUTH_SECRET` | — (**required**, 16+ chars) | Session/reset token pepper. Production refuses the dev default |
| `SESSION_TTL_DAYS` | `30` | Session lifetime |
| `RESET_TOKEN_TTL_MINUTES` | `60` | Password reset link lifetime |
| `CORS_ORIGINS` | `http://localhost:5173` | Comma-separated allow-list |
| `UPLOAD_DIR` | `uploads` | Avatar/attachment directory (served at `/uploads`) |
| `EXPOSE_RESET_TOKEN` | `false` | Dev/demo: return the reset link instead of emailing it |
| `COOKIE_SECURE` | auto | Force the `Secure` cookie flag. Auto = on only when `APP_URL` is `https://` |
| `LOG_LEVEL` | `info` | Pino level |

Generate a real secret with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

### `apps/web/.env`

| Variable | Default | Purpose |
| --- | --- | --- |
| `VITE_API_URL` | `http://localhost:4000` | API base URL |
| `VITE_WS_URL` | `ws://localhost:4000/api/realtime` | Realtime socket URL |

Commit only `.env.example` files — real `.env` files are git-ignored.

---

## Database setup

SQLite is the default so the project runs with zero external services.

```bash
pnpm db:generate   # prisma generate
pnpm db:migrate    # apply prisma/migrations (idempotent)
pnpm db:seed       # deterministic demo data
pnpm db:reset      # drop everything, re-apply migrations, re-seed
pnpm db:studio     # optional: Prisma Studio
```

The canonical migration SQL lives in `apps/server/prisma/migrations/0001_init/migration.sql`,
generated with `prisma migrate diff`. It is applied by `apps/server/scripts/migrate.ts`, a small
runner built on Node's `node:sqlite`; this keeps migrations reproducible in environments where
Prisma's schema-engine subprocess cannot be spawned (piped stdio is blocked in some sandboxes/CI).
`prisma generate` and the `prisma` CLI still work normally for schema work.

### Seeded data

| Entity | Count |
| --- | --- |
| Users | 8 |
| Workspaces | 2 (`Orbit Labs`, `Northwind Studio`) |
| Projects | 8 (5 + 3) |
| Issues | 118 |
| Cycles | 12 (7 + 5) |
| Labels | 15 |
| Comments | ~220 |
| Activity events | ~460 |
| Notifications | ~46 |

The seed is deterministic (seeded RNG) and back-dates `createdAt`/`completedAt` so the analytics
charts, cycle burndowns and throughput charts have a realistic history.

### PostgreSQL

SQLite is used because no Docker/PostgreSQL server was available in the development environment.
PostgreSQL is fully supported and verified by a schema-parity test:

```bash
# 1. point DATABASE_URL at your server
export DATABASE_URL="postgresql://orbit:orbit@localhost:5432/orbit?schema=public"

# 2. swap the datasource + enums
pnpm db:use-postgres

# 3. generate and apply
pnpm db:generate
pnpm db:migrate          # or: npx prisma migrate deploy
pnpm db:seed
```

`pnpm db:use-postgres sqlite` switches back. `apps/server/tests/schema-parity.test.ts` fails the
build if `schema.prisma` and `schema.postgres.prisma` drift apart (same models, same fields, same
indexes; only providers, enum types and JSON columns differ).

---

## Development commands

```bash
pnpm dev            # API + client together
pnpm dev:server     # API only (tsx watch)
pnpm dev:web        # client only (Vite)

pnpm typecheck      # tsc --noEmit across every package
pnpm lint           # ESLint (0 warnings allowed)
pnpm format         # Prettier write
pnpm build          # shared → server → web production build
pnpm start          # run the compiled API
```

---

## Test commands

```bash
pnpm test              # unit + API integration (shared, server, web)
pnpm test:unit         # shared + web component/unit tests
pnpm test:integration  # server API tests (real Fastify + real SQLite)
pnpm test:e2e          # Playwright end-to-end (boots its own API + client)
pnpm test:e2e:ui       # Playwright UI mode
```

The E2E suite uses its own database (`apps/server/prisma/e2e.db`) and its own ports
(API `4100`, client `5174`), created and seeded by `apps/e2e/tests/global-setup.ts`.
It never touches your development database.

**What the tests cover**

- `packages/shared` — CSV parsing/quoting, markdown-adjacent helpers, slug/key derivation, mention
  extraction, date/percent helpers, and every cell of the permission matrix.
- `apps/server/tests/auth.test.ts` — registration, duplicate/weak-password rejection, identical
  responses for unknown accounts (no enumeration), session persistence and logout, the full reset
  flow (including replay and session revocation), profile updates, password change, session listing
  and revocation, and cross-workspace read/write/delete isolation.
- `apps/server/tests/permissions.test.ts` — the complete role matrix enforced through the API:
  viewer cannot create/edit/move/delete/bulk-update but can comment; member cannot manage members,
  projects or the workspace; admin can manage members and projects but not delete the workspace;
  owner protection (no demotion/removal); cross-workspace project/cycle/label/parent references are
  rejected.
- `apps/web/src/test/*` — markdown rendering including XSS escaping, date/format helpers, and
  component behaviour (Select/Menu/Modal keyboard and dismissal, avatar fallbacks, progress
  semantics, accessible icon labels).
- `apps/e2e/tests/journey.spec.ts` — the mandated journey: **login → create project → create issue →
  edit issue → drag on the kanban → comment → verify persistence after reload → search → verify role
  permissions (including a raw 403 from the API) → logout**.
- `apps/e2e/tests/smoke.spec.ts` — every route renders with real data and zero console errors.
- `apps/e2e/tests/realtime.spec.ts` — two independent browser sessions converge on moves and
  comments without a manual refresh.
- `apps/e2e/tests/features.spec.ts` — workspace creation/switching, CSV import validation and
  error reporting, CSV template/export downloads, cycle creation, command palette search and
  navigation, shortcuts help, theme persistence, profile updates, member invites and viewer UI
  restrictions.
- `apps/e2e/tests/issues.spec.ts` — list filtering (URL-persisted), text search, bulk status change
  and bulk delete, keyboard navigation, CSV export, and optimistic status changes with rollback.

---

## Production build

```bash
pnpm install
pnpm build            # type-checks and builds shared, server and web
pnpm --filter @orbit/server start   # serves the compiled API from apps/server/dist
pnpm --filter @orbit/web preview    # serves the built client from apps/web/dist
```

Outputs: `apps/server/dist` (ESM Node), `apps/web/dist` (static assets), `packages/shared/dist`
(CommonJS + type declarations consumed by the server).

For a single-origin deployment, serve `apps/web/dist` from any static host and point it at the API
with `VITE_API_URL`/`VITE_WS_URL` (remember to allow the client origin in `CORS_ORIGINS` and to set
`COOKIE_SECURE=true` when using HTTPS).

---

## Deployment

The repository is deployment-ready; the only external requirement is a host that can run Node.

**Render / Railway / Fly.io (API + client)**

1. Build command: `pnpm install --frozen-lockfile && pnpm build`
2. Start command: `pnpm --filter @orbit/server start`
3. Set `DATABASE_URL` (PostgreSQL), `AUTH_SECRET`, `APP_URL`, `CORS_ORIGINS`, `COOKIE_SECURE=true`
4. Publish the client: `apps/web/dist` on Netlify/Vercel/Cloudflare Pages with
   `VITE_API_URL=https://<api-host>` and `VITE_WS_URL=wss://<api-host>/api/realtime`
5. Run migrations once: `pnpm db:use-postgres && pnpm db:generate && npx prisma migrate deploy`

`render.yaml` and a multi-stage `Dockerfile` are included for convenience.

> **Did I deploy it here?** No. This environment has no Docker daemon, no PostgreSQL server and no
> cloud credentials, so an external deployment could not be performed or verified. Everything above
> was verified locally against the production build (`node apps/server/dist/index.js` with
> `NODE_ENV=production`, serving real authenticated responses) and the configuration is ready for a
> one-command deploy on any of those platforms.

---

## Demo accounts

All accounts use the password **`Orbit1234`** (created by `pnpm db:seed`).

| Email | Role in `Orbit Labs` | Role in `Northwind Studio` |
| --- | --- | --- |
| `javi@orbit.dev` | Owner | Member |
| `maria@orbit.dev` | Admin | — |
| `carlos@orbit.dev` | Member | — |
| `ana@orbit.dev` | Member | Admin |
| `lucia@orbit.dev` | Member | Member |
| `nina@orbit.dev` | Viewer | — |
| `sam@orbit.dev` | — | Owner |
| `diego@orbit.dev` | — | Member |

Sign in as **Nina** (`nina@orbit.dev`) to see the viewer experience: read-only issue editing, no
"New issue" button and a read-only board.

---

## Project structure

```
orbit/
├── apps/
│   ├── server/                     # Fastify API
│   │   ├── prisma/
│   │   │   ├── schema.prisma          # SQLite datasource (default)
│   │   │   ├── schema.postgres.prisma # PostgreSQL parity schema
│   │   │   ├── migrations/            # canonical SQL (prisma migrate diff)
│   │   │   ├── seed.ts / seed-data.ts # deterministic demo data
│   │   ├── scripts/migrate.ts         # node:sqlite migration runner
│   │   ├── src/
│   │   │   ├── config/env.ts          # validated environment
│   │   │   ├── lib/                   # errors, guards, crypto, http, serializers
│   │   │   ├── plugins/               # cookies, CORS, rate limit, multipart, static, WS
│   │   │   ├── routes/                # auth, users, workspaces, projects, issues,
│   │   │   │                          # labels, cycles, notifications, analytics,
│   │   │   │                          # search, import/export, uploads, realtime
│   │   │   ├── services/              # auth, issue, activity, notification, analytics, realtime
│   │   │   ├── app.ts                 # app factory + error handler
│   │   │   └── index.ts               # entrypoint
│   │   └── tests/                     # API integration tests + schema parity
│   ├── web/                         # React client
│   │   ├── src/
│   │   │   ├── components/             # layout, issues, ui kit, command palette, auth
│   │   │   ├── context/                # auth, theme, realtime, composer
│   │   │   ├── hooks/                  # popover, shortcuts, issue filters
│   │   │   ├── lib/                    # api client, query keys, types, utils
│   │   │   ├── pages/                  # every route (lazy-loaded)
│   │   │   └── test/                   # component + unit tests
│   │   └── vite.config.ts / vitest.config.ts
│   └── e2e/                         # Playwright suite
│       ├── playwright.config.ts        # boots its own API + client on isolated ports
│       └── tests/                      # journey, smoke, realtime, features, issues
├── packages/shared/                 # Zod schemas, permissions, constants, utils
└── scripts/                         # use-postgres, maintenance helpers
```

---

## Security

- **Password hashing** with bcrypt (cost 11; 4 in tests). Hashes never leave the server — asserted
  by tests that scan raw response bodies for `passwordHash`.
- **Sessions** are opaque 32-byte random tokens; only their SHA-256 (peppered with `AUTH_SECRET`)
  is stored. Cookies are `httpOnly`, `SameSite=Lax`, `Secure` when served over HTTPS, and revoked
  on logout or password change.
- **Authorization** is enforced server-side for every workspace-scoped route. Non-members receive
  404 so workspace existence is not leaked. Roles are re-read from the database on each request, so
  a demoted user loses access immediately.
- **Input validation** with Zod on every mutating route; unknown fields are rejected and errors are
  returned per field. Query parameters are normalized before validation.
- **Cross-tenant references are rejected**: a project, cycle, label, assignee or parent issue from
  another workspace fails validation.
- **Rate limiting** on login, registration, password reset, issue creation, comments, bulk and
  import endpoints.
- **Uploads** are renamed to random server-side filenames, type/size checked (5 MB) and only
  accepted from members of the target workspace.
- **No secrets in git**: `.env` files are ignored; only `.env.example` is committed. Production
  refuses to boot with the development `AUTH_SECRET`.

---

## Known limitations

- **SQLite by default.** PostgreSQL is supported and parity-tested, but a live PostgreSQL run was
  not executed here because no Docker daemon or PostgreSQL server was available in the environment.
- **Realtime is single-process.** The hub is in-memory; running multiple API instances needs Redis
  pub/sub (the swap point is `RealtimeHub.broadcast`). A polling fallback exists at
  `GET /api/workspaces/:id/events`.
- **Password reset does not send email.** Without a mail transport, `EXPOSE_RESET_TOKEN=true`
  returns the single-use link in the API response (development/demo only).
- **Rich text is a small markdown subset** (headings, emphasis, lists, quotes, code, links,
  mentions) rendered with escaping; there is no WYSIWYG editor.
- **List pagination fetches up to 200 rows per request** and groups client-side; very large
  workspaces would want server-side grouping and cursor pagination.
- **Attachments are unencrypted local files**; production should use object storage with signed
  URLs.
- **No email verification, 2FA or SSO.**
- **Analytics scans issue rows in memory** (capped at 5,000) rather than pushing aggregation into
  SQL; fine at the seeded scale, not at millions of rows.

---

## License

MIT — see [LICENSE](LICENSE).
