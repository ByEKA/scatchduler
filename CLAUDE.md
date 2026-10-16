# CLAUDE.md

Project memory for Claude Code. Read it at the start of every session.

**Status:** Phase 1 complete; `v0.1.0` is tagged after the owner reviews the screenshots and `docs/superpowers/plans/2026-10-14-phase1-verification.md`. Next: Phase 2, following its approved spec and plan (listed below).

## What this is

A construction-scheduling web app (our own product, first used as a lab tool). Phase 1 builds the signed-in app shell and the Home screen on mock data; Phase 2 moves the data layer to Supabase.

Sources of truth — read both before writing code:

- Spec: `docs/superpowers/specs/2026-10-14-home-shell-design.md`
- Plan: `docs/superpowers/plans/2026-10-14-home-shell-phase1.md`

Product context for later phases (read when designing them; nothing in these is in Phase 1's scope):

- `docs/product/app-map.md` — every module of the full product, the domain model, the scheduling-engine rules and how modules depend on each other
- `docs/product/roadmap.md` — phases P2–P7 and the improvement options
- `docs/superpowers/specs/2026-10-14-phase2-supabase-design.md` and `docs/superpowers/plans/2026-10-15-phase2-supabase.md` — the approved Phase 2 (Supabase) design and its plan; start them only after Phase 1 is merged

If code and spec disagree, the spec wins. The plan's exact names, labels and copy strings (as pinned in its tests) count as part of the spec. If the spec looks wrong, or a task's tests can't pass without changing it, stop and ask the owner; never change the spec silently.

## Stack

React 19 · Vite · TypeScript (strict) · Tailwind CSS v4 (CSS-first; tokens in `src/index.css`) · shadcn/ui (Radix) · lucide-react · React Router ≥ 7 (declarative) · TanStack Query v5 · react-hook-form + zod · date-fns · sonner · Vitest + Testing Library · Playwright · npm

## Commands

| Command | Use |
|---|---|
| `npm run dev` | dev server on http://localhost:5173 |
| `npm run build` / `npm run preview` | production build / serve it |
| `npm run typecheck` · `npm run lint` · `npm run format` | static checks / formatting |
| `npm run test` · `npm run test:watch` | unit and component tests (Vitest) |
| `npm run test:e2e` | Playwright end-to-end tests + screenshots |
| `npm run check:contrast` | WCAG contrast check over the design tokens |
| `npm run check` | typecheck + lint + tests + contrast |

A task is done only when `npm run check` passes; once Task 19 has added `npm run test:e2e`, it must pass too for changes to UI flows. Never leave `npm run dev` running in the foreground of an agent session; visual checks are for the owner.

## Architecture rules

1. Components → hooks (`src/hooks`) → `DataRepository` / `AuthService` (`src/data`). Components never call a repository or an adapter directly.
2. Only `src/data/index.ts` (and `src/test/**`) may import `src/data/mock/**` or `src/data/supabase/**`. ESLint enforces this.
3. `src/data/types.ts` is the contract for every adapter; changing it is a design change.
4. Query keys come only from `src/hooks/query-keys.ts`.
5. Creation dialogs open through `useDialogs().openDialog(kind, options)`; `DialogHost` renders them.
6. `localStorage` is accessed only through `src/lib/storage.ts`.
7. No hard-coded colors: use token utilities (`bg-card`, `text-muted-foreground`, `text-link`, `ring-edge`, …). The brand color changes by editing the six `--brand-*` values only.

## TypeScript

- `import type` for type-only imports (`verbatimModuleSyntax`).
- No `enum`, `namespace` or constructor parameter properties (`erasableSyntaxOnly`); use union types and `as const`.
- No `any`; use `unknown` and narrow it.
- Path alias `@/` → `src/`.
- Date-only values (`'YYYY-MM-DD'`) are parsed with `parseISO`, never `new Date(value)`. Timestamp offsets use exact milliseconds, not `addDays` / `subDays`.

## React (the react-hooks lint rules are errors)

- No `setState` inside an effect: derive the value, or subscribe with `useSyncExternalStore`.
- No `new Date()`, `Date.now()` or `Math.random()` during render: time-dependent UI reads `useNow()`.
- No `autoFocus` attributes: dialogs focus their first field on open; use RHF `setFocus` to select a default value.
- Forms use `noValidate`; zod schemas own validation and error copy.

## UI

- shadcn components live in `src/components/ui`; wrap them instead of changing their API.
- Copy is English, sentence case, verbatim from the spec; no exclamation marks.
- Every icon-only control has an `aria-label`; focus stays visible; everything works with the keyboard.
- Base text is 13 px (`text-sm`); the full type scale is in spec §6.2.
- IP: no third-party logos, illustrations, screenshots, images or copy. Icons come from lucide only. Brand placeholders live in `src/config/brand.ts` and the `--brand-*` tokens.

## Tests

- TDD: write the failing test first, exactly as the plan's steps show.
- Tests sit next to the code (`*.test.ts` / `*.test.tsx`). Helpers: `renderWithProviders`, `renderApp`, `OpenDialog` (`src/test/render.tsx`), `createTestDataLayer`, `makeNewProjectInput` (`src/test/fakes.ts`), `mockViewport` (`src/test/viewport.ts`).
- Unit tests run in the `America/Los_Angeles` time zone on purpose; it exposes date-only bugs.
- Query by role, label or text. Test ids are only for skeletons and the location / dialog probes.

## Mock data

`VITE_DATA_SOURCE=mock` (the only value implemented in Phase 1), `VITE_MOCK_SCENARIO=default|empty`, `VITE_MOCK_LATENCY_MS` (default `400`), `VITE_MOCK_FAIL_RATE` (`0`–`1`). Put local overrides in `.env.local` (git-ignored). In development, `window.__resetMockDb()` reseeds the store.

## Git

- One commit per plan task, Conventional Commits (`feat:`, `fix:`, `test:`, `chore:`, `docs:`).
- Never commit `.env.local` or secrets.
