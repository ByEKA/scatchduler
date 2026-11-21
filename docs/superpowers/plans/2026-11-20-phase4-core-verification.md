# Phase 4 core — Verification

Filled in during execution of `docs/superpowers/plans/2026-11-20-phase4-core.md` against `docs/superpowers/specs/2026-11-20-phase4-core-design.md` ("the spec").

## Assumptions (`V1–V8`)

| # | Assumption (spec §8) | Verified at | Result | Notes |
|---|---|---|---|---|
| V1 | `@tanstack/react-virtual` (MIT) and `fast-check` (MIT, dev) have zero prod advisories and appear in `dist/third-party-licenses.txt` | Task 1 | Passed | `@tanstack/react-virtual@3.14.26` (MIT, in `dist/third-party-licenses.txt`), `fast-check@4.10.3` (MIT, dev); `npm audit --omit=dev` = 0 advisories |
| V2 | `src/engine/worker.ts` builds as a second Vite worker chunk independent of `src/import/worker.ts` without bundling parser libraries | Task 1 / Task 18 | Passed | `npm run check:workers` (`--require-engine`) verified dedicated ~29.8 kB engine worker chunk separate from the ~566 kB import worker with zero parser libraries |
| V3 | Engine solves 10k activities / 15k links in < 300 ms (< 1 s CI) and 50k / 150k in < 2 s (< 5 s CI) without stack overflow | Task 16 | Passed | Measured locally: 10k/15k in ~176 ms (< 300 ms), 50k/150k in ~683 ms (< 2000 ms) in `src/engine/budget.test.ts` |
| V4 | Oracle fidelity against committed fixtures and local `real-exports/` P6-calculated XERs achieves ratcheted parity on `es/ef/ls/lf/tf/ff` and driving path | Task 17 | Passed | Committed fixture ratchet pinned in `src/engine/__fixtures__/oracle-ratchet.json` (`src/engine/oracle.test.ts`); `scripts/check-cpm-oracle.ts` ready for optional owner-machine `real-exports/` run |
| V5 | Supabase `schedule-data` storage RLS subquery against `public.schedules` works cleanly for both workspace members and share recipients without recursion | Task 3 / Task 6 (CI) | Passed | Verified in `supabase/tests/11_schedule_data.test.sql` and `integration/schedule-data.itest.ts` (PR #4 CI run 44905395452) |
| V6 | A 50,000-activity `ScheduleDocument` compresses to ≤ 10 MB gzipped and completes open + save round-trip cleanly within 10 s on local/CI Supabase | Task 6 (CI) | Passed | `integration/schedule-data.itest.ts` 50k/150k gzipped ≤ 10 MB and full test completed in 5.79 s on CI (PR #4 run 44905395452) |
| V7 | Canvas 2D Gantt renders 10,000-row schedule frames in < 16 ms in Chromium with viewport culling | Task 29 / Task 36 | Passed | `src/features/schedule/gantt/budget.test.ts` renders 10k rows / 15k links in ~1.5 ms median (< 16 ms); Chromium E2E confirmed in Task 36 |
| V8 | Lock release on tab close + 15-min TTL prevents stuck locks in normal use | Task 31 / Task 37 | Passed | `useScheduleLock.ts` renews every 2 min (`LOCK_HEARTBEAT_MS = 120_000`) and releases best-effort on unmount/`pagehide`; 15-min server TTL + owner Force Unlock verified in `11_schedule_data.test.sql`, `schedule-data.itest.ts`, `ScheduleToolbar.test.tsx` and `e2e-supabase/supabase.spec.ts` |

## Batch test counts

Baseline at `4216215`: `npm run check` 123 files / 831 tests, `Contrast OK: 43 checks passed`; `test:db` 10 files / 272; `test:integration` 9 files / 92; `test:e2e` 25 passed; `test:e2e:supabase` 6 passed.

| Batch | PR | `check` (files / tests / contrast) | `test:db` | `test:integration` | `test:e2e` | `test:e2e:supabase` |
|---|---|---|---|---|---|---|
| A (Tasks 1–6) | #4 | 125 / 867 / 51 | 11 / 323 | 10 / 102 | 25 | 6 |
| B (Tasks 7–10) | #5 | 129 / 882 / 51 | 11 / 323 | 10 / 102 | 25 | 6 |
| C (Tasks 11–17) | #5 | 137 / 920 / 51 | 11 / 323 | 10 / 102 | 25 | 6 |
| D (Tasks 18–22) | #5 | 143 / 942 / 51 | 11 / 323 | 10 / 102 | 26 | 6 |
| E (Tasks 23–30) | #5 | 159 / 977 / 51 | 11 / 323 | 10 / 102 | 26 | 6 |
| F (Tasks 31–38) | #5 | 166 / 987 / 51 | 11 / 323 | 10 / 102 | 31 | 8 |

## Owner checklist

- [ ] **1. Oracle check on real exports (optional, owner machine):** run `npx tsx scripts/check-cpm-oracle.ts` against git-ignored `real-exports/` and review aggregate mismatch summary (no file names or project content committed).
- [ ] **2. Visual spot-check of Gantt and Grid:** open a real schedule in both dark and light themes; check 32 px row alignment, WBS brackets, milestones, critical path and driving path spotlight.
- [ ] **3. Lock contention spot-check:** open the same schedule in two browser sessions (two accounts); confirm lock pill, refused Edit, and owner Force Unlock.
- [ ] **4. Production rollout (`docs/runbooks/production.md`):** apply `p4_core_schedule_data` with `npx supabase db push` after merge and verify the private `schedule-data` bucket exists.

## Final results (`S1–S12`)

| # | Criterion (spec §2.2) | Verified by | Result |
|---|---|---|---|
| S1 | Repository contract passes on both `MockRepository` and `SupabaseRepository` | `npm test` (`src/data/repository.contract.ts`), `npm run test:integration` (`integration/schedule-data.itest.ts`) | Passed |
| S2 | Database and storage isolation (pgTAP) | `npm run test:db` (`supabase/tests/11_schedule_data.test.sql`, 11 files / 323 tests) | Passed |
| S3 | Rules R1–R12 hold identically on Postgres and `MockRepository` | `test:db`, `repository.contract.ts`, `schedule-data.itest.ts` | Passed |
| S4 | CPM engine batteries and `fast-check` invariants pass across 4 time zones | `npm run test:engine:tz` (13 files / 55 tests across `UTC`, `America/Los_Angeles`, `Europe/Istanbul`, `Pacific/Auckland`) | Passed |
| S5 | Oracle fidelity ratchet passes on committed fixtures | `src/engine/oracle.test.ts` (`two-projects.xer`, `legacy-p6.xer`, `project.xml` pinned in `oracle-ratchet.json`) | Passed |
| S6 | Performance budgets (10k/50k solve, 50k snapshot ≤ 10 MB, 10k Gantt frame < 16 ms) | `src/engine/budget.test.ts` (~176 ms / ~683 ms), `integration/schedule-data.itest.ts` (5.79 s), `src/features/schedule/gantt/budget.test.ts` (~1.5 ms) | Passed |
| S7 | Architecture and ESLint boundaries + separate engine worker chunk | `npm run lint` (0 errors), `scripts/import-boundaries.test.mjs` (41 tests), `npm run check:workers` (`worker-BvkT3tMs.js` ~29.8 kB) | Passed |
| S8 | End-to-end flows on mock and Supabase | `npm run test:e2e` (`e2e/schedule.spec.ts`, 31 total), `npm run test:e2e:supabase` (`e2e-supabase/supabase.spec.ts`, 8 total) | Passed |
| S9 | All local and CI checks green (`check`, `build`, licences, `db:types`, `check:secrets`, e2e) | Local suite + GitHub Actions (`app` & `supabase` jobs) | Passed |
| S10 | Zero hard-coded Gantt/grid colors; new token pairs pass contrast in both themes | `npm run check:contrast` (`Contrast OK: 51 checks passed`), `renderer.test.ts` | Passed |
| S11 | Keyboard navigation, shortcuts, ARIA rows and `aria-live` announcements | `ScheduleGrid.test.tsx`, `ScheduleToolbar.test.tsx`, `CycleErrorBanner.test.tsx`, `e2e/schedule.spec.ts` | Passed |
| S12 | Clean hand-over seams (`Draw2D` headless, serializable `forward` patches, stable codes) | `src/features/schedule/gantt/renderer.test.ts`, `src/features/schedule/commands.test.ts` | Passed |
