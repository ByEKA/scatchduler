# scheduler-app

A web app for planning construction schedules, built as our own product and used first as a lab tool. Phase 1 is the signed-in app shell (top bar and collapsible sidebar) and the Home screen: create or import a schedule, create a project, reopen recent projects, see schedules shared with you, switch workspace and tick off pending tasks. It runs on a mock data layer stored in `localStorage`; Phase 2 moves that layer to Supabase without changing the components.

The product name ("AppName") and the indigo brand color are placeholders. Change them in `src/config/brand.ts` and the six `--brand-*` values in `src/index.css`.

## Prerequisites

- Node.js 22 LTS or newer, and npm
- For the end-to-end tests, Playwright's Chromium: `npx playwright install chromium`

## Getting started

```bash
npm install
npm run dev
```

Open http://localhost:5173. A fresh mock database starts signed in as the demo user, Deniz Kaya. After Log out, any email address signs you back in as the same user.

## npm scripts

| Script | Command | Use |
|---|---|---|
| `dev` | `vite` | dev server on http://localhost:5173 |
| `build` | `tsc -b && vite build` | type-check, then build into `dist/` |
| `preview` | `vite preview` | serve the build in `dist/` |
| `typecheck` | `tsc -b` | TypeScript, strict |
| `lint` | `eslint .` | ESLint with typescript-eslint, react-hooks, react-refresh and jsx-a11y |
| `format` | `prettier --write .` | Prettier with the Tailwind class-sorting plugin |
| `test` | `vitest run` | unit and component tests (jsdom, time zone `America/Los_Angeles`) |
| `test:watch` | `vitest` | the same in watch mode |
| `test:e2e` | `playwright test` | end-to-end tests and screenshots, see below |
| `check:contrast` | `node scripts/check-contrast.mjs` | WCAG contrast check over the color tokens in `src/index.css` |
| `check` | `npm run typecheck && npm run lint && npm run test && npm run check:contrast` | all static checks and unit tests |

`npm run test:e2e` runs in Chromium only. It builds the app with `--mode e2e` (settings from `.env.e2e`, no mock latency) into `dist-e2e/`, serves that build on port 4174 and stops the server when the run ends. Port 4174 must be free, because the config never reuses a running server. The four Home screenshots (`home-1440.png`, `home-1024.png`, `home-768.png`, `home-375.png`) land in `test-results/screens/`, and the HTML report in `playwright-report/`. Both folders are git-ignored.

## Environment variables

Put local overrides in `.env.local`, which git ignores; `.env.example` lists every variable. A value the app doesn't recognize stops it at startup with a message that names the variable.

| Variable | Values | Default |
|---|---|---|
| `VITE_DATA_SOURCE` | `mock`. `supabase` is reserved for Phase 2 and shows "Supabase data source is not implemented yet (Phase 2). Set VITE_DATA_SOURCE=mock." | `mock` |
| `VITE_MOCK_SCENARIO` | `default` (seeded workspaces, projects, shares and tasks) or `empty` (the user, the trial subscription and a personal workspace only) | `default` |
| `VITE_MOCK_LATENCY_MS` | delay before every mock call, in milliseconds | `400` |
| `VITE_MOCK_FAIL_RATE` | `0` to `1`: the share of mock reads that fail with a simulated network error; writes never fail | `0` |

`VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` sit commented out in `.env.example` and are not read in Phase 1.

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

## Docs

- `docs/superpowers/specs/2026-10-14-home-shell-design.md`: the Phase 1 design spec. If code and spec disagree, the spec wins.
- `docs/superpowers/plans/2026-10-14-home-shell-phase1.md`: the Phase 1 plan, 20 test-first tasks.
- `docs/superpowers/plans/2026-10-14-phase1-verification.md`: check results, the owner checklist and open items.
- `docs/product/app-map.md` and `docs/product/roadmap.md`: the full product and its later phases.

## Phase 2: Supabase

Spec §9 lists the seams Phase 1 leaves for Supabase: the `supabase` branch of `createDataLayer()`, the adapters under `src/data/supabase/`, the env variables, the auth UI and the storage buckets, plus the type-to-table mapping, the error mapping and a schema draft. The approved Phase 2 design is in `docs/superpowers/specs/2026-10-14-phase2-supabase-design.md` and its plan in `docs/superpowers/plans/2026-10-15-phase2-supabase.md`. The Phase 2 spec replaces some of §9 (password and Google sign-in instead of the magic link, `VITE_SUPABASE_PUBLISHABLE_KEY` instead of `VITE_SUPABASE_ANON_KEY`, a private cover bucket, `editor` and `viewer` roles, and a sign-up bootstrap that runs when an account is confirmed); its header lists these changes.

Phase 2 develops against a local Supabase stack that `supabase start` runs in Docker, so Docker has to be installed and running first.
