# Phase 4 core — Verification

Filled in during execution of `docs/superpowers/plans/2026-11-20-phase4-core.md` against `docs/superpowers/specs/2026-11-20-phase4-core-design.md` ("the spec").

## Assumptions (`V1–V8`)

| # | Assumption (spec §8) | Verified at | Result | Notes |
|---|---|---|---|---|
| V1 | `@tanstack/react-virtual` (MIT) and `fast-check` (MIT, dev) have zero prod advisories and appear in `dist/third-party-licenses.txt` | Task 1 | Passed | `@tanstack/react-virtual@3.14.26` (MIT, in `dist/third-party-licenses.txt`), `fast-check@4.10.3` (MIT, dev); `npm audit --omit=dev` = 0 advisories |
| V2 | `src/engine/worker.ts` builds as a second Vite worker chunk independent of `src/import/worker.ts` without bundling parser libraries | Task 1 / Task 18 | Pending | |
| V3 | Engine solves 10k activities / 15k links in < 300 ms (< 1 s CI) and 50k / 150k in < 2 s (< 5 s CI) without stack overflow | Task 16 | Pending | |
| V4 | Oracle fidelity against committed fixtures and local `real-exports/` P6-calculated XERs achieves ratcheted parity on `es/ef/ls/lf/tf/ff` and driving path | Task 17 | Pending | |
| V5 | Supabase `schedule-data` storage RLS subquery against `public.schedules` works cleanly for both workspace members and share recipients without recursion | Task 3 / Task 6 (CI) | Passed | Verified in `supabase/tests/11_schedule_data.test.sql` and `integration/schedule-data.itest.ts` (PR #4 CI run 44905395452) |
| V6 | A 50,000-activity `ScheduleDocument` compresses to ≤ 10 MB gzipped and completes open + save round-trip cleanly within 10 s on local/CI Supabase | Task 6 (CI) | Passed | `integration/schedule-data.itest.ts` 50k/150k gzipped ≤ 10 MB and full test completed in 5.79 s on CI (PR #4 run 44905395452) |
| V7 | Canvas 2D Gantt renders 10,000-row schedule frames in < 16 ms in Chromium with viewport culling | Task 29 / Task 36 | Pending | |
| V8 | Lock release on tab close + 15-min TTL prevents stuck locks in normal use | Task 31 / Task 37 | Pending | |

## Batch test counts

Baseline at `4216215`: `npm run check` 123 files / 831 tests, `Contrast OK: 43 checks passed`; `test:db` 10 files / 272; `test:integration` 9 files / 92; `test:e2e` 25 passed; `test:e2e:supabase` 6 passed.

| Batch | PR | `check` (files / tests / contrast) | `test:db` | `test:integration` | `test:e2e` | `test:e2e:supabase` |
|---|---|---|---|---|---|---|
| A (Tasks 1–6) | #4 | 125 / 867 / 51 | 11 / 323 | 10 / 102 | 25 | 6 |
| B (Tasks 7–10) | | | | | | |
| C (Tasks 11–17) | | | | | | |
| D (Tasks 18–22) | | | | | | |
| E (Tasks 23–30) | | | | | | |
| F (Tasks 31–38) | | | | | | |

## Owner checklist

- [ ] **1. Oracle check on real exports (optional, owner machine):** run `npx tsx scripts/check-cpm-oracle.ts` against git-ignored `real-exports/` and review aggregate mismatch summary (no file names or project content committed).
- [ ] **2. Visual spot-check of Gantt and Grid:** open a real schedule in both dark and light themes; check 32 px row alignment, WBS brackets, milestones, critical path and driving path spotlight.
- [ ] **3. Lock contention spot-check:** open the same schedule in two browser sessions (two accounts); confirm lock pill, refused Edit, and owner Force Unlock.
- [ ] **4. Production rollout (`docs/runbooks/production.md`):** apply `p4_core_schedule_data` with `npx supabase db push` after merge and verify the private `schedule-data` bucket exists.

## Final results (`S1–S12`)

| # | Criterion (spec §2.2) | Verified by | Result |
|---|---|---|---|
| S1 | Repository contract passes on both `MockRepository` and `SupabaseRepository` | `npm test`, `npm run test:integration` | Pending |
| S2 | Database and storage isolation (pgTAP) | `npm run test:db` | Pending |
| S3 | Rules R1–R12 hold identically on Postgres and `MockRepository` | `test:db`, contract suite | Pending |
| S4 | CPM engine batteries and `fast-check` invariants pass across 4 time zones | `npm run test:engine:tz` | Pending |
| S5 | Oracle fidelity ratchet passes on committed fixtures | `src/engine/oracle.test.ts` | Pending |
| S6 | Performance budgets (10k/50k solve, 50k snapshot ≤ 10 MB, 10k Gantt frame < 16 ms) | `budget.test.ts`, `schedule-data.itest.ts`, V7 | Pending |
| S7 | Architecture and ESLint boundaries + separate engine worker chunk | `npm run lint`, `import-boundaries.test.mjs`, `check-worker-chunks.mjs` | Pending |
| S8 | End-to-end flows on mock and Supabase | `npm run test:e2e`, `npm run test:e2e:supabase` | Pending |
| S9 | All local and CI checks green (`check`, `build`, licences, `db:types`, `check:secrets`, e2e) | GitHub Actions | Pending |
| S10 | Zero hard-coded Gantt/grid colors; new token pairs pass contrast in both themes | `npm run check:contrast` | Pending |
| S11 | Keyboard navigation, shortcuts, ARIA rows and `aria-live` announcements | component tests, `e2e/schedule.spec.ts` | Pending |
| S12 | Clean hand-over seams (`Draw2D` headless, serializable `forward` patches, stable codes) | `renderer.test.ts`, `commands.test.ts` | Pending |
