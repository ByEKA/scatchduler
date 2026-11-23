# Phase 4 later & Phase 3 deferred — Verification

Filled in during execution of `docs/superpowers/plans/2026-11-23-phase4-later.md` against `docs/superpowers/specs/2026-11-23-phase4-later-design.md` ("the spec").

## Assumptions (`V1–V5`)

| # | Assumption (spec §8) | Verified at | Result | Notes |
|---|---|---|---|---|
| V1 | `src/import/xlsx-export.ts` dynamically imported from `useImportReport.ts` keeps SheetJS out of the main `index-*.js` chunk and passes `check:workers` | Task 5 (`eab2be0`) | Passed | `xlsx-export-*.js` (`1.21 kB`) and `xlsx-*.js` (`484.36 kB`) remain separate lazy chunks; `check:workers` passed |
| V2 | `copy_schedule` copies both unmaterialized and materialized (`schedule-data`) schedules under RLS and preserves `schedule-imports` delete protection when multiple schedules share a `source_file_path` | Task 1 (`0f4ade0`) / Task 3 (`1814646`) | Passed (local contract; CI pending) | `copy_schedule` RPC + `.copy()` in `SupabaseRepository.copySchedule` + `12_programs_folders_library.test.sql` (46 assertions) + `programs-folders-library.itest.ts` |
| V3 | Gantt drag-and-drop (`move`, `resize`, `progress`, `link-draw`) updates Canvas 2D at 60 fps and produces single-step undoable commands | Task 8 (`13c9e38`) / Task 10 (`4ad782e`) | Passed | `hit-test.test.ts`, `drag.test.ts`, `renderer.test.ts`, `ScheduleGantt.test.tsx`, `e2e/schedule.spec.ts` |
| V4 | `cmdk` Command Palette passes keyboard navigation and WCAG contrast in both dark and light themes | Task 11 (`bd4bde1`) | Passed | `CommandPalette.test.tsx`, `check:contrast` (`51 checks passed`), `e2e/schedule.spec.ts` |
| V5 | Self-contained `ProjectsMap` renders deterministically in Chromium E2E without any external network requests | Task 20 / Task 22 | Pending | |

## Batch test counts

Baseline at `59b3d26` (`main`): `npm run check` 166 files / 987 tests, `Contrast OK: 51 checks passed`, 4 TZ engine checks; `test:db` 11 files / 323; `test:integration` 10 files / 102; `test:e2e` 31 passed; `test:e2e:supabase` 8 passed.

| Batch | PR | `check` (files / tests / contrast) | `test:db` | `test:integration` | `test:e2e` | `test:e2e:supabase` |
|---|---|---|---|---|---|---|
| A (Tasks 1–6) | `feat/p4-later` | 170 / 998 / 51 | 12 / 381 | 11 / 108 | 31 | 8 |
| B (Tasks 7–12) | `feat/p4-later` | 172 / 1006 / 51 | 12 / 381 | 11 / 108 | 32 | 8 |
| C (Tasks 13–18) | `feat/p4-later` | 177 / 1016 / 51 | 12 / 381 | 11 / 108 | 35 | 8 |
| D (Tasks 19–23) | | | | | | |

## Owner checklist

- [ ] **1. Gantt drag-and-drop & `Ctrl+K` spot-check:** enter Edit mode on a schedule, drag a bar horizontally (`SNET`), resize its right edge, drag a progress handle, draw a link between two bars, and press `Ctrl+K` to jump to an activity.
- [ ] **2. Files Folders, Duplicate & `.xlsx` report spot-check:** create a folder on the Files page, duplicate a schedule into it, open the duplicate in the editor, and download an Import Report as Excel (`.xlsx`).
- [ ] **3. Library, Programs & Map spot-check:** open `/library` and filter schedules across workspaces; on `/w/:workspaceId/projects`, group projects by program and switch to the `Map` layout.
- [ ] **4. Production rollout (`docs/runbooks/production.md`):** apply `p4_later_programs_folders_copy` with `npx supabase db push` after merge.

## Final results (`S1–S10`)

| # | Criterion (spec §2.2) | Verified by | Result |
|---|---|---|---|
| S1 | Repository contract passes on both `MockRepository` and `SupabaseRepository` for all new program, folder, schedule-copy, bulk-move and library methods | `npm test`, `npm run test:integration` | Pending |
| S2 | Database & Storage isolation (pgTAP `12_programs_folders_library.test.sql`) | `npm run test:db` | Pending |
| S3 | Rules R1–R12 hold identically on Postgres and `MockRepository` | `test:db`, contract suite | Pending |
| S4 | Gantt drag-and-drop hit-testing and drag state machine are pure TypeScript, unit-tested, and commit a single undoable command on pointer release | `drag.test.ts`, `ScheduleGantt.test.tsx` | Passed |
| S5 | `Ctrl+K` Command Palette opens from keyboard and TopBar, filters commands and schedule activities, jumps to the selected activity, and triggers actions | `CommandPalette.test.tsx`, `e2e/schedule.spec.ts` | Passed |
| S6 | `/library` lists all accessible schedules grouped by workspace and project plus `"Shared with me"`, supports URL-persisted search and filters, and opens schedules | `LibraryPage.test.tsx`, `e2e/library.spec.ts` | Passed |
| S7 | Project Files page supports folder tree CRUD, moving schedules to folders, duplicating a schedule (including snapshot), searching/filtering/sorting, and bulk actions | `ProjectFilesPage.test.tsx`, `e2e/files.spec.ts`, `e2e-supabase/supabase.spec.ts` | Passed (mock; Supabase E2E pending) |
| S8 | Import Report `"Download Excel"` generates a multi-sheet `.xlsx` workbook with formula cells escaped and keeps SheetJS out of the main bundle | `xlsx-export.test.ts`, `check:workers` | Passed |
| S9 | Projects page supports Program CRUD, `"Group by program"` view, and the self-contained `Map` layout with interactive pins and `"Not on the map"` side list | `ProjectsPage.test.tsx`, `ProjectsMap.test.tsx`, `e2e/projects.spec.ts` | Pending |
| S10 | All local and CI checks green (`check`, `build`, licences, `check:workers`, `test:db`, `test:integration`, `test:e2e`, `test:e2e:supabase`, `check:secrets`, `db:types`) | GitHub Actions | Pending |
