# scheduler-app

A web app for planning construction schedules, built as our own product and used first as a lab tool. Phase 1 is the signed-in app shell (top bar and collapsible sidebar) and the Home screen: create or import a schedule, create a project, reopen recent projects, see schedules shared with you, switch workspace and tick off pending tasks. Phase 2 adds a Supabase backend (Postgres, Auth, Storage and one Edge Function) behind the same components: invite-only accounts with password or Google sign-in, workspace members with three roles, and workspace isolation enforced by the database. The app runs on either data layer: a mock stored in `localStorage` (the default) or Supabase.

The product name ("AppName") and the indigo brand color are placeholders. Change them in `src/config/brand.ts` and the six `--brand-*` values in `src/index.css`.

## Prerequisites

- Node.js 22 LTS or newer, and npm
- For the end-to-end tests, Playwright's Chromium: `npx playwright install chromium`
- For Supabase mode and its tests, Docker (see [Phase 2: Supabase](#phase-2-supabase))

## Getting started

```bash
npm install
npm run dev
```

Open http://localhost:5173. This runs on the mock data layer: a fresh mock database starts signed in as the demo user, Deniz Kaya. After Log out, any email address with any password except `wrong-password` signs you back in as the same user.

## npm scripts

| Script | Command | Use |
|---|---|---|
| `dev` | `vite` | dev server on http://localhost:5173 (mock data) |
| `dev:supabase` | `vite --mode supabase` | dev server on http://localhost:5173 against the local Supabase stack |
| `build` | `tsc -b && vite build` | type-check, then build into `dist/`; `npm run build -- --mode supabase` builds for Supabase |
| `preview` | `vite preview` | serve the build in `dist/` |
| `typecheck` | `tsc -b` | TypeScript, strict |
| `lint` | `eslint .` | ESLint with typescript-eslint, react-hooks, react-refresh and jsx-a11y |
| `format` | `prettier --write .` | Prettier with the Tailwind class-sorting plugin |
| `test` | `vitest run` | unit, component and contract tests on the mock, plus the Edge Function logic (jsdom, time zone `America/Los_Angeles`) |
| `test:watch` | `vitest` | the same in watch mode |
| `test:e2e` | `playwright test` | end-to-end tests and screenshots on the mock, see below |
| `test:e2e:supabase` | `playwright test -c playwright.supabase.config.ts` | end-to-end tests on the local Supabase stack, see below |
| `test:integration` | `vitest run -c vitest.integration.config.ts` | integration tests on the local stack (`integration/**/*.itest.ts`) |
| `test:db` | `supabase test db` | pgTAP database tests (`supabase/tests/`) |
| `check:contrast` | `node scripts/check-contrast.mjs` | WCAG contrast check over the color tokens in `src/index.css` |
| `check:secrets` | `node scripts/check-secrets.mjs` | fails if `dist/` contains a secret key; run it after a build |
| `check` | `npm run typecheck && npm run lint && npm run test && npm run check:contrast` | all static checks and unit tests |
| `db:start` / `db:stop` | `supabase start` / `supabase stop` | start or stop the local Supabase stack in Docker |
| `db:reset` | `supabase db reset && tsx scripts/seed-local.ts` | rebuild the local database from the migrations and load the seed |
| `db:env` | `tsx scripts/write-local-env.ts` | write `.env.supabase.local` (local API URL and publishable key) from `supabase status` |
| `db:types` | `supabase gen types typescript --local > src/data/supabase/database.types.ts` | regenerate the database types after a schema change |

`npm run test:e2e` runs in Chromium only. It builds the app with `--mode e2e` (settings from `.env.e2e`, no mock latency) into `dist-e2e/`, serves that build on port 4174 and stops the server when the run ends. Port 4174 must be free, because the config never reuses a running server. The four Home screenshots (`home-1440.png`, `home-1024.png`, `home-768.png`, `home-375.png`) land in `test-results/screens/`, and the HTML report in `playwright-report/`. Both folders are git-ignored.

`npm run test:e2e:supabase` is described under [Phase 2: Supabase](#phase-2-supabase). It also serves on port 4174, so run the two e2e suites one after the other, never at the same time.

## Environment variables

Put local overrides in `.env.local`, which git ignores; `.env.example` lists every variable. A value the app doesn't recognize, or a missing Supabase value in Supabase mode, stops it at startup with a message that names the variable.

| Variable | Values | Default |
|---|---|---|
| `VITE_DATA_SOURCE` | `mock` or `supabase` | `mock` |
| `VITE_MOCK_SCENARIO` | mock only: `default` (seeded workspaces, projects, shares and tasks) or `empty` (the user, the trial subscription and a personal workspace only) | `default` |
| `VITE_MOCK_TEAM_ROLE` | mock only: `owner`, `editor` or `viewer`, the demo user's role in the Site Operations workspace, to preview each role; changing it reseeds | `owner` |
| `VITE_MOCK_LATENCY_MS` | mock only: delay before every mock call, in milliseconds | `400` |
| `VITE_MOCK_FAIL_RATE` | mock only: `0` to `1`, the share of mock reads that fail with a simulated network error; writes never fail | `0` |
| `VITE_SUPABASE_URL` | Supabase only: the project URL. Missing → "Missing VITE_SUPABASE_URL" | — |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase only: the publishable key (`sb_publishable_…`); a legacy anon key also works. Missing → "Missing VITE_SUPABASE_PUBLISHABLE_KEY" | — |
| `VITE_GOOGLE_SIGN_IN` | `true` shows "Continue with Google" in Supabase mode; leave it unset locally unless Google is configured. Mock mode always shows the button | unset |

The Supabase secret key (or the legacy service-role key) never goes into a `VITE_*` variable or a committed file: it belongs only in the Edge Function's environment and in local scripts, which read it at runtime from `supabase status`. The Edge Function also reads `ALLOWED_ORIGINS`, its comma-separated CORS origins (locally `http://localhost:5173,http://localhost:4174`, set in `supabase/config.toml`).

The mock database is one JSON document under the `localStorage` key `mock-db.v1`. Changing `VITE_MOCK_SCENARIO` reseeds it on the next load. In a dev build, run `window.__resetMockDb()` in the browser console to reseed it and reload the page, for example after creating test records.

## Architecture rules

1. Components → hooks (`src/hooks`) → `DataRepository` / `AuthService` (`src/data`). Components never call a repository or an adapter directly.
2. Only `src/data/index.ts` (and `src/test/**`) may import `src/data/mock/**` or `src/data/supabase/**`. ESLint enforces this.
3. `src/data/types.ts` is the contract for every adapter; changing it is a design change.
4. Query keys come only from `src/hooks/query-keys.ts`.
5. Creation dialogs open through `useDialogs().openDialog(kind, options)`; `DialogHost` renders them.
6. `localStorage` is accessed only through `src/lib/storage.ts`.
7. No hard-coded colors: use token utilities (`bg-card`, `text-muted-foreground`, `text-link`, `ring-edge`, …). The brand color changes by editing the six `--brand-*` values only.

`CLAUDE.md` has the TypeScript, React, UI and test rules that go with these.

## Phase 2: Supabase

### Docker

The local Supabase stack runs in Docker, so install Docker and start it before any `db:*` script or Supabase test. On Windows, use Docker Desktop with the WSL 2 engine; if Git Bash finds no `docker` command, add Docker's folder to the path: `export PATH="/c/Program Files/Docker/Docker/resources/bin:$PATH"`.

### Local loop

```bash
npm run db:start      # start the local stack (the first run pulls the images)
npm run db:reset      # apply the migrations and load the seed
npm run db:env        # write .env.supabase.local with the local URL and publishable key
npm run dev:supabase  # dev server on http://localhost:5173 against the local stack
```

`npm run dev:supabase` uses Vite mode `supabase`: `.env.supabase` (committed, `VITE_DATA_SOURCE=supabase`) plus `.env.supabase.local` (git-ignored, written by `db:env`). `npm run dev` stays on the mock. Emails the local stack sends (invitations, password resets) land in the local mail catcher, Mailpit, whose URL `npx supabase status` prints (normally http://127.0.0.1:54324). `npm run db:stop` stops the stack and keeps its data.

### Seeded accounts

`npm run db:reset` loads the same data as the mock's `default` scenario. Sign in with one of these accounts (local stack only), all with the password `localdemo2026`:

| Account | Role in Site Operations |
|---|---|
| `deniz.kaya@example.com` | owner |
| `mert.demir@example.com` | owner |
| `elif.arslan@example.com` | viewer |

Integration and e2e runs add their own accounts and workspaces (such as "E2E crew 1"); `npm run db:reset` removes them.

### Tests

| Command | Needs the stack | Covers |
|---|---|---|
| `npm run check` | no | everything in `check`, including the repository and auth contract suites on the mock and the Edge Function logic |
| `npm run test:e2e` | no | the end-to-end flows on the mock |
| `npm run test:db` | yes | pgTAP: schema, privileges, account bootstrap, row-level security, RPCs, storage and invitations |
| `npm run test:integration` | yes | the assumption checks, account bootstrap, storage, the `invitations` Edge Function, and the repository and auth contract suites on Supabase |
| `npm run test:e2e:supabase` | yes, freshly seeded | password sign-in, data that survives a reload, a viewer's disabled actions, and an invitation accepted from the mail catcher |
| `npm run build -- --mode supabase && npm run check:secrets` | no (needs `.env.supabase.local`) | the Supabase build carries no secret key |

`npm run test:e2e:supabase` builds with `--mode supabase` into `dist-supabase/`, serves it on port 4174 and runs one test at a time, because the tests share the seeded accounts. Its reports go to `test-results-supabase/` and `playwright-report-supabase/`. Run `npm run db:reset && npm run db:env` first. After a schema change, run `npm run db:types` and commit the regenerated `src/data/supabase/database.types.ts` with it. CI (`.github/workflows/ci.yml`) runs all of these, in one job for the mock checks and one for the local stack.

### Production

`docs/runbooks/production.md` is the checklist for Supabase Cloud (Frankfurt) and Cloudflare Pages. The results of every check, the owner checklist and the open items are in `docs/superpowers/plans/2026-10-15-phase2-verification.md`.

## Docs

- `docs/superpowers/specs/2026-10-14-phase2-supabase-design.md`: the Phase 2 design spec. It replaces parts of the Phase 1 spec's §9 (its header lists them); the Phase 1 spec holds for everything else. If code and spec disagree, the spec wins.
- `docs/superpowers/plans/2026-10-15-phase2-supabase.md`: the Phase 2 plan, 19 test-first tasks.
- `docs/superpowers/plans/2026-10-15-phase2-verification.md`: the Phase 2 assumption checks, final results, owner checklist and open items.
- `docs/runbooks/production.md`: the production rollout.
- `docs/superpowers/specs/2026-10-14-home-shell-design.md`: the Phase 1 design spec.
- `docs/superpowers/plans/2026-10-14-home-shell-phase1.md`: the Phase 1 plan, 20 test-first tasks.
- `docs/superpowers/plans/2026-10-14-phase1-verification.md`: Phase 1 check results, the owner checklist and open items.
- `docs/product/app-map.md` and `docs/product/roadmap.md`: the full product and its later phases.
