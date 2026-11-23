# Phase 4 later & Phase 3 deferred — Implementation Plan

> **For agentic workers:** REQUIRED: execute this plan task-by-task in order, test-first (failing test → minimal implementation → passing test → `npm run check` → one Conventional Commit per task).

**Goal:** Deliver the deferred interactive and organizational features from Phase 4 core (§2.3) and Phase 3 core (§2.3): Gantt Canvas drag-and-drop (`move`, `resize`, `progress`, `link-draw`), `Ctrl+K` Command Palette, `/library` Schedule Library page, Project Files Folders / Schedule Duplication (`copySchedule` with `ScheduleDocument` snapshot copy) / Search & Filters / Bulk Bar / Import Report `.xlsx` download, and Projects Programs grouping & self-contained interactive `Map` layout.

**Architecture:** Follows `CLAUDE.md` rules 1–9 and `docs/superpowers/specs/2026-11-23-phase4-later-design.md` ("the spec"). Zero new runtime npm dependencies.

**Tech Stack:** React 19 · Vite 8 · TypeScript strict · Tailwind CSS v4 · shadcn/ui (Radix) · `cmdk` · `lucide-react` ·SheetJS CE (`vendor/xlsx-0.20.3.tgz`) · `@tanstack/react-query` · `@tanstack/react-table` · `@tanstack/react-virtual` · Vitest · Playwright · Supabase (Postgres + Storage + pgTAP).

---

## Global Constraints

1. **Test-first (TDD):** Every task begins by writing the failing test before writing production code.
2. **Never edit earlier migrations:** Add one new migration `supabase/migrations/20261123120000_p4_later_programs_folders_copy.sql` and update `src/data/supabase/database.types.ts` in the same commit.
3. **ESLint boundaries:**
   - `src/import/xlsx-export.ts` statically imports `xlsx` inside `src/import/**`, and `src/hooks/useImportReport.ts` loads it strictly via dynamic `await import('@/import/xlsx-export')`.
   - `src/features/schedule/gantt/{hit-test,drag,renderer}.ts` remain pure TypeScript (zero React, hooks, adapters, or runtime `@/engine` imports; zero `#hex` literals in `renderer.ts` / `theme.ts`).
4. **Green at every task:** `npm run check` (`0 errors, 13 warnings` on lint, `Contrast OK: 51 checks passed`, all Vitest suites & 4-timezone engine checks) must pass before committing any task.

---

## Task Table

| Task | Batch | Subject | Commit message |
|---|---|---|---|
| 1 | A | Database migration `p4_later_programs_folders_copy`, types & pgTAP `12` | `feat: add programs, folders and copy_schedule migration with pgTAP tests` |
| 2 | A | Domain types, `MockRepository` (`MOCK_DB_VERSION` → 5) & contract tests | `feat: add programs, folders, copySchedule and library to MockRepository and contract` |
| 3 | A | `SupabaseRepository` programs, folders, `copySchedule` & `getLibraryData` + integration tests | `feat: implement programs, folders, copySchedule and library in SupabaseRepository` |
| 4 | A | React Query hooks (`usePrograms`, `useFolders`, `useLibrary`, `useCopySchedule`, `useMoveSchedulesToFolder`) | `feat: add hooks for programs, folders, schedule duplication and library` |
| 5 | A | Import Report Excel (`.xlsx`) writer (`src/import/xlsx-export.ts`) & `"Download Excel"` UI | `feat: add Excel xlsx export for import reports` |
| 6 | A | Batch A verification ledger update | `docs: record Batch A verification counts` |
| 7 | B | Extended Gantt hit-testing (`hitTestGanttTarget` for move, resize, progress & link ports) | `feat: add Gantt hit-testing for resize, progress and link connector ports` |
| 8 | B | Pure Gantt drag state machine (`src/features/schedule/gantt/drag.ts`) | `feat: add pure Gantt drag state machine for move, resize, progress and link drawing` |
| 9 | B | `GanttInteractionOverlay` ghost bar, badge & rubber-band link rendering in `renderer.ts` | `feat: render Gantt drag ghost previews and link rubber-band overlay` |
| 10 | B | Pointer drag handlers & cursor feedback in `ScheduleGantt.tsx` | `feat: wire interactive drag-and-drop and link drawing in ScheduleGantt` |
| 11 | B | `Ctrl+K` Command Palette (`CommandPalette.tsx`, `TopBar.tsx`, `SchedulePage.tsx`) | `feat: add Ctrl+K command palette for activity jump, editor commands and navigation` |
| 12 | B | Playwright mock E2E for Gantt drag-and-drop & `Ctrl+K` command palette | `test: add e2e coverage for Gantt drag-and-drop and Ctrl+K command palette` |
| 13 | C | Project Files `FolderSidebar.tsx` & `FolderDialog.tsx` | `feat: add hierarchical FolderSidebar and FolderDialog on ProjectFilesPage` |
| 14 | C | `CopyScheduleDialog.tsx` (`"Duplicate…"`) and `"Move to folder"` in `ScheduleMenu.tsx` | `feat: add schedule duplication dialog and Move to folder menu actions` |
| 15 | C | `FilesToolbar.tsx`, `files-list.ts` & `BulkSchedulesBar.tsx` on `ProjectFilesPage.tsx` | `feat: add Files search, tag filter, column sorting and bulk actions bar` |
| 16 | C | Cross-workspace Schedule Library page (`LibraryPage.tsx`, `LibraryToolbar.tsx`, `LibraryTree.tsx`) | `feat: implement cross-workspace Schedule Library page at /library` |
| 17 | C | Playwright E2E for Folders, Duplicate, Bulk actions, Excel report & `/library` | `test: add e2e tests for folders, schedule copy, bulk bar, xlsx report and library` |
| 18 | C | Batch C verification ledger update | `docs: record Batch C verification counts` |
| 19 | D | Workspace Programs (`ProgramDialog.tsx`, wizard/menu assignment & `"Group by program"` on `ProjectsPage.tsx`) | `feat: add workspace programs and Group by program view on ProjectsPage` |
| 20 | D | Self-contained interactive coordinate map (`ProjectsMap.tsx`) | `feat: add self-contained interactive coordinate map and Not on the map panel` |
| 21 | D | Wire `Map` layout toggle in `ProjectsToolbar.tsx`, `useProjectsLayout.ts` and `ProjectsPage.tsx` | `feat: wire Map layout toggle on ProjectsPage` |
| 22 | D | Playwright E2E for Programs, Map layout and Supabase folder/copy/library flows | `test: add Playwright e2e coverage for programs, map layout and Supabase folders/copy` |
| 23 | D | Final verification (`V1–V5`, `S1–S10`) & docs (`CLAUDE.md`, `production.md`) | `test: verify phase 4 later and update docs` |

---

## Batch A — Database, Storage, Contract & `.xlsx` Export (Tasks 1–6)

### Task 1: Database migration `p4_later_programs_folders_copy`, types & pgTAP `12`

**Spec:** §4.1–§4.4, R1–R7, S2, V2.

**Files:**
- Create: `supabase/migrations/20261123120000_p4_later_programs_folders_copy.sql`
- Create: `supabase/tests/12_programs_folders_library.test.sql`
- Modify: `supabase/tests/01_schema.test.sql`, `supabase/tests/02_privileges.test.sql`, `supabase/tests/08_projects.test.sql`, `supabase/tests/09_schedule_tags.test.sql`, `src/data/supabase/database.types.ts`

**Steps:**
1. Write `supabase/tests/12_programs_folders_library.test.sql` testing:
   - `programs` table RLS & `create_program` / `rename_program` / `delete_program` (editor can create/rename, only owner can delete, duplicate case-insensitive name rejected, deleting sets `projects.program_id = null` without bumping `projects.updated_at`).
   - `projects.program_id` cross-workspace rejection and `project_summaries.program_id` / `program_name`.
   - `folders` table RLS & `create_folder` / `rename_folder` / `delete_folder` (3-level max depth check, sibling case-insensitive unique name, deleting folder re-parents child folders and schedules to parent/root without bumping `schedules.updated_at`).
   - `move_schedules_to_folder` (1–500 schedules of one project, all-or-nothing, viewer forbidden).
   - `copy_schedule` (creates independent schedule with `is_current = false`, `baseline = 'none'`, `update_number = null`, `copied_from_id`, copies import fields and validates `p_data_file_path` pattern).
2. Update existing pgTAP schema/privilege/view column pins in `01_schema.test.sql`, `02_privileges.test.sql`, `08_projects.test.sql`, `09_schedule_tags.test.sql` for the added tables (`programs`, `folders`), columns (`projects.program_id`, `schedules.folder_id`, `schedules.copied_from_id`), view columns and 8 new RPCs.
3. Write `supabase/migrations/20261123120000_p4_later_programs_folders_copy.sql` and update `src/data/supabase/database.types.ts`.
4. Run `npm run check` and commit:
   `git add -A && git commit -m "feat: add programs, folders and copy_schedule migration with pgTAP tests"`

---

### Task 2: Domain types, `MockRepository` (`MOCK_DB_VERSION` → 5) & contract tests

**Spec:** §4.1–§4.3, R1–R7, S1, S3.

**Files:**
- Modify: `src/data/types.ts`, `src/data/repository.ts`, `src/data/mock/seed.ts`, `src/data/mock/store.ts`, `src/data/mock/MockRepository.ts`, `src/test/fakes.ts`, `src/test/contract/repository.contract.ts`

**Steps:**
1. Extend `src/test/contract/repository.contract.ts` with contract cases for `listPrograms`, `createProgram`, `renameProgram`, `deleteProgram`, `createProject`/`updateProject` with `programId`, `listFolders`, `createFolder` (including 3-level limit and sibling conflict), `renameFolder`, `deleteFolder` (re-parenting), `moveSchedulesToFolder`, `copySchedule` (both blank/materialized snapshot copy and imported schedule report/mapping/original copy), and `getLibraryData`.
2. Add `Program`, `Folder`, `LibraryData`, `CopyScheduleInput`, `Project.programId`, `ProjectSummary.programName`, `Schedule.folderId`, and `Schedule.copiedFromId` to `src/data/types.ts` and `src/data/repository.ts`.
3. Bump `MockDb.version` to `5` in `src/data/mock/seed.ts` & `store.ts`; seed one program (`"Port & Industrial Program"` on `Harbor Logistics Hub`) and two folders (`"Baselines"`, `"Monthly Updates"`) on `Harbor Logistics Hub`; implement all new methods in `MockRepository.ts`.
4. Run `npm run check` and commit:
   `git add -A && git commit -m "feat: add programs, folders, copySchedule and library to MockRepository and contract"`

---

### Task 3: `SupabaseRepository` programs, folders, `copySchedule` & `getLibraryData` + integration tests

**Spec:** §4.2–§4.4, R1–R7, S1, V2.

**Files:**
- Modify: `src/data/supabase/mappers.ts`, `src/data/supabase/errors.ts`, `src/data/supabase/SupabaseRepository.ts`, `integration/seed-loader.ts`
- Create: `integration/programs-folders-library.itest.ts`

**Steps:**
1. Write `integration/programs-folders-library.itest.ts` testing `copySchedule` with a materialized `ScheduleDocument` snapshot in `schedule-data` (verifying the copied schedule downloads an identical `ScheduleDocument` and editing the copy does not mutate the original), folder tree operations, program operations, and `getLibraryData()` isolation including a share recipient.
2. Update `mappers.ts`, `errors.ts`, `SupabaseRepository.ts` and `integration/seed-loader.ts` to map `program_id`/`program_name`, `folder_id`/`copied_from_id`, and implement all 11 new `DataRepository` methods.
3. Run `npm run check` and commit:
   `git add -A && git commit -m "feat: implement programs, folders, copySchedule and library in SupabaseRepository"`

---

### Task 4: React Query hooks (`usePrograms`, `useFolders`, `useLibrary`, `useCopySchedule`, `useMoveSchedulesToFolder`)

**Spec:** §3, §4.2.

**Files:**
- Modify: `src/hooks/query-keys.ts`, `src/hooks/useSchedules.ts`
- Create: `src/hooks/usePrograms.ts`, `src/hooks/useFolders.ts`, `src/hooks/useLibrary.ts`, `src/hooks/usePrograms.test.tsx`, `src/hooks/useFolders.test.tsx`, `src/hooks/useLibrary.test.tsx`

**Steps:**
1. Write unit tests in `usePrograms.test.tsx`, `useFolders.test.tsx` and `useLibrary.test.tsx` verifying query key caching and invalidations across `programs(workspaceId)`, `folders(projectId)`, `schedules(projectId)`, `allProjects()`, and `library()`.
2. Add `programs`, `folders` and `library` keys to `src/hooks/query-keys.ts`, add `useCopySchedule` and `useMoveSchedulesToFolder` to `src/hooks/useSchedules.ts`, and create `usePrograms.ts`, `useFolders.ts`, `useLibrary.ts`.
3. Run `npm run check` and commit:
   `git add -A && git commit -m "feat: add hooks for programs, folders, schedule duplication and library"`

---

### Task 5: Import Report Excel (`.xlsx`) writer (`src/import/xlsx-export.ts`) & `"Download Excel"` UI

**Spec:** §3 rule 3, §7.2.5, S8, V1.

**Files:**
- Create: `src/import/xlsx-export.ts`, `src/import/xlsx-export.test.ts`
- Modify: `src/hooks/useImportReport.ts`, `src/features/import/ReportView.tsx`, `src/features/import/ReportView.test.tsx`

**Steps:**
1. Write `src/import/xlsx-export.test.ts` verifying that `reportToXlsx(report, scheduleName)` produces a readable 4-sheet workbook (`Summary`, `Counts`, `Checks`, `Issues`) via SheetJS, escapes formula-Injection prefixes (`=`, `+`, `-`, `@`, `\t`, `\r`) with a leading `'`, and creates no formula cells (`cell.f === undefined`).
2. Implement `src/import/xlsx-export.ts`.
3. Update `useDownloadImportReport` in `src/hooks/useImportReport.ts` to support `'csv' | 'xlsx'` (dynamically importing `@/import/xlsx-export`) and add `"Download Excel"` button next to `"Download CSV"` in `ReportView.tsx` + test in `ReportView.test.tsx`.
4. Run `npm run check && npm run build && npm run check:workers` to confirm V1 (SheetJS stays out of main & engine chunks) and commit:
   `git add -A && git commit -m "feat: add Excel xlsx export for import reports"`

---

### Task 6: Batch A verification ledger update

**Files:**
- Modify: `docs/superpowers/plans/2026-11-23-phase4-later-verification.md`

**Steps:**
1. Record V1 result and Batch A test counts in `docs/superpowers/plans/2026-11-23-phase4-later-verification.md` and commit:
   `git add -A && git commit -m "docs: record Batch A verification counts"`

---

## Batch B — Gantt Drag-and-Drop & `Ctrl+K` Command Palette (Tasks 7–12)

### Task 7: Extended Gantt hit-testing (`hitTestGanttTarget`)

**Spec:** §5.1, S4.

**Files:**
- Modify: `src/features/schedule/gantt/hit-test.ts`, `src/features/schedule/gantt/hit-test.test.ts`

**Steps:**
1. Write failing tests in `src/features/schedule/gantt/hit-test.test.ts` for `hitTestGanttTarget(x, y, rows, timescale, scrollLeft, scrollTop, editMode)` covering:
   - View mode returns `'bar-select'` only;
   - Edit mode distinguishes `'link-port-start'`, `'link-port-finish'`, `'bar-resize'`, `'bar-progress'`, and `'bar-move'`;
   - WBS summary rows never return editable drag targets.
2. Implement `GanttHitTarget` and `hitTestGanttTarget` in `src/features/schedule/gantt/hit-test.ts` (preserving `hitTestBar` for backward compatibility).
3. Run `npm run check` and commit:
   `git add -A && git commit -m "feat: add Gantt hit-testing for resize, progress and link connector ports"`

---

### Task 8: Pure Gantt drag state machine (`src/features/schedule/gantt/drag.ts`)

**Spec:** §5.2, S4, V3.

**Files:**
- Create: `src/features/schedule/gantt/drag.ts`, `src/features/schedule/gantt/drag.test.ts`

**Steps:**
1. Write `src/features/schedule/gantt/drag.test.ts` testing:
   - `startGanttDrag`, `updateGanttDrag`, `commitGanttDrag` for:
     - `'bar-move'` → snaps start to working-day `08:00` boundary, emits ghost preview with `DD.MM.YYYY`, commits `updateActivity` with `SNET` constraint;
     - `'bar-resize'` → snaps finish to working-day boundary (min 1 working day), emits ghost preview with `{days} d`, commits `updateActivity` with `originalDuration` & `remainingDuration`;
     - `'bar-progress'` → clamps `0..100%`, emits ghost preview with `{pct}%`, commits `updateActivity` with `percentComplete`;
     - `'link-draw'` → maps `(finish→start)=FS`, `(start→start)=SS`, `(finish→finish)=FF`, `(start→finish)=SF`, emits rubber-band overlay, commits `addRelationship` with `lagMinutes: 0` (and returns `null` when dropped on self or empty space).
2. Implement `src/features/schedule/gantt/drag.ts` as pure TypeScript.
3. Run `npm run check` and commit:
   `git add -A && git commit -m "feat: add pure Gantt drag state machine for move, resize, progress and link drawing"`

---

### Task 9: `GanttInteractionOverlay` ghost bar, badge & rubber-band link rendering in `renderer.ts`

**Spec:** §5.2, S4.

**Files:**
- Modify: `src/features/schedule/gantt/renderer.ts`, `src/features/schedule/gantt/renderer.test.ts`

**Steps:**
1. Add unit tests in `src/features/schedule/gantt/renderer.test.ts` verifying that `renderGantt` draws:
   - Connector ports on the hovered/selected activity row in Edit mode;
   - A ghost bar + readout badge when `scene.interactionOverlay` is a move/resize/progress preview;
   - A rubber-band line + target port circle + relationship badge (`FS`/`SS`/`FF`/`SF`) when `scene.interactionOverlay` is a link-draw preview.
2. Implement `interactionOverlay?: GanttInteractionOverlay | null` and `hoveredActivityId?: string | null` / `editMode?: boolean` in `GanttScene` and `renderGantt` (zero `#hex` literals).
3. Run `npm run check` and commit:
   `git add -A && git commit -m "feat: render Gantt drag ghost previews and link rubber-band overlay"`

---

### Task 10: Pointer drag handlers & cursor feedback in `ScheduleGantt.tsx`

**Spec:** §5.1–§5.2, S4, V3.

**Files:**
- Modify: `src/features/schedule/ScheduleGantt.tsx`, `src/features/schedule/ScheduleGantt.test.tsx`, `src/pages/SchedulePage.tsx`

**Steps:**
1. Write tests in `src/features/schedule/ScheduleGantt.test.tsx` verifying that in Edit mode:
   - Dragging a bar's resize handle dispatches `updateActivity` with the new duration;
   - Dragging a bar's body dispatches `updateActivity` with an `SNET` constraint;
   - Dragging from one activity's finish port to another activity's start port dispatches `addRelationship` (`FS`);
   - Pressing `Escape` cancels an active drag without dispatching.
2. Pass `mode={editor.mode}` and `onDispatch={editor.dispatch}` from `SchedulePage.tsx` into `ScheduleGantt.tsx` and wire pointer down/move/up/cancel + dynamic cursor styles (`ew-resize`, `grab`, `crosshair`, `pointer`).
3. Run `npm run check` and commit:
   `git add -A && git commit -m "feat: wire interactive drag-and-drop and link drawing in ScheduleGantt"`

---

### Task 11: `Ctrl+K` Command Palette (`CommandPalette.tsx`, `TopBar.tsx`, `SchedulePage.tsx`)

**Spec:** §6, S5, V4.

**Files:**
- Create: `src/features/schedule/CommandPalette.tsx`, `src/features/schedule/CommandPalette.test.tsx`
- Modify: `src/components/layout/TopBar.tsx`, `src/components/layout/AppShell.tsx`, `src/pages/SchedulePage.tsx`

**Steps:**
1. Write `src/features/schedule/CommandPalette.test.tsx` testing:
   - Opening the palette via `Ctrl+K` or the TopBar `"Command palette"` button;
   - Searching and selecting an activity (`A1040 · Foundation concrete pour`) jumps to and selects that activity;
   - Executing editor commands (`Calculate schedule`, `Toggle critical path`, `Enter edit mode`) and navigation commands (`Go to Library`, `Go to Home`).
2. Create `CommandPaletteProvider` + `CommandPalette` in `src/features/schedule/CommandPalette.tsx`, mount in `AppShell.tsx`, add the trigger button in `TopBar.tsx`, and register active schedule items/commands in `SchedulePage.tsx`.
3. Run `npm run check` and commit:
   `git add -A && git commit -m "feat: add Ctrl+K command palette for activity jump, editor commands and navigation"`

---

### Task 12: Playwright mock E2E for Gantt drag-and-drop & `Ctrl+K` command palette

**Spec:** §5, §6, S4, S5.

**Files:**
- Modify: `e2e/schedule.spec.ts`, `docs/superpowers/plans/2026-11-23-phase4-later-verification.md`

**Steps:**
1. Add a Playwright test in `e2e/schedule.spec.ts` verifying `Ctrl+K` command palette search & activity jump and Gantt canvas bar resize / link creation with Undo.
2. Run `npm run check && npm run test:e2e -- e2e/schedule.spec.ts`, update Batch B verification notes, and commit:
   `git add -A && git commit -m "test: add e2e coverage for Gantt drag-and-drop and Ctrl+K command palette"`

---

## Batch C — Project Files Enhancements & `/library` Page (Tasks 13–18)

### Task 13: Project Files `FolderSidebar.tsx` & `FolderDialog.tsx`

**Spec:** §7.2.1, R3, R4, S7.

**Files:**
- Create: `src/features/files/FolderSidebar.tsx`, `src/features/files/FolderDialog.tsx`, `src/features/files/FolderSidebar.test.tsx`
- Modify: `src/features/dialogs/DialogsProvider.tsx`

**Steps:**
1. Write `src/features/files/FolderSidebar.test.tsx` testing `"All schedules"`, `"Unfiled"`, 3-level folder tree rendering, schedule counts per folder, folder creation/renaming/deletion, and viewer disabled states.
2. Implement `FolderSidebar.tsx` and `FolderDialog.tsx`.
3. Run `npm run check` and commit:
   `git add -A && git commit -m "feat: add hierarchical FolderSidebar and FolderDialog on ProjectFilesPage"`

---

### Task 14: `CopyScheduleDialog.tsx` (`"Duplicate…"`) and `"Move to folder"` in `ScheduleMenu.tsx`

**Spec:** §7.2.4, R5, R6, S7.

**Files:**
- Create: `src/features/files/CopyScheduleDialog.tsx`, `src/features/files/CopyScheduleDialog.test.tsx`
- Modify: `src/features/files/codes.ts`, `src/features/files/ScheduleMenu.tsx`, `src/features/files/ScheduleMenu.test.tsx`, `src/features/dialogs/DialogsProvider.tsx`

**Steps:**
1. Write tests in `CopyScheduleDialog.test.tsx` and `ScheduleMenu.test.tsx` for `"Duplicate…"` (pre-filling `"{name} (copy)"`, suggested code from `suggestCopyCode`, folder selection, and duplicating snapshot data) and `"Move to folder"` menu actions.
2. Add `suggestCopyCode` to `src/features/files/codes.ts`, implement `CopyScheduleDialog.tsx`, wire into `DialogsProvider.tsx` and `ScheduleMenu.tsx`.
3. Run `npm run check` and commit:
   `git add -A && git commit -m "feat: add schedule duplication dialog and Move to folder menu actions"`

---

### Task 15: `FilesToolbar.tsx`, `files-list.ts` & `BulkSchedulesBar.tsx` on `ProjectFilesPage.tsx`

**Spec:** §7.2.2–§7.2.3, R5, S7.

**Files:**
- Create: `src/features/files/files-list.ts`, `src/features/files/files-list.test.ts`, `src/features/files/FilesToolbar.tsx`, `src/features/files/BulkSchedulesBar.tsx`
- Modify: `src/features/files/SchedulesTable.tsx`, `src/pages/ProjectFilesPage.tsx`, `src/pages/ProjectFilesPage.test.tsx`

**Steps:**
1. Write `files-list.test.ts` and extend `ProjectFilesPage.test.tsx` testing folder filtering (`all`, `unfiled`, `<folderId>`), search (`q`), tag filter (`current`, `baseline`, `primary`, `update`), sorting (`statusDate`, `name`, `updatedAt`, `activityCount`), multi-row selection checkboxes, and bulk `Move to folder`, `Archive`, `Restore`, and owner-only `Delete`.
2. Implement `files-list.ts`, `FilesToolbar.tsx`, `BulkSchedulesBar.tsx`, selection support in `SchedulesTable.tsx`, and mount `FolderSidebar`, `FilesToolbar`, and `BulkSchedulesBar` in `ProjectFilesPage.tsx`.
3. Run `npm run check` and commit:
   `git add -A && git commit -m "feat: add Files search, tag filter, column sorting and bulk actions bar"`

---

### Task 16: Cross-workspace Schedule Library page (`LibraryPage.tsx`, `LibraryToolbar.tsx`, `LibraryTree.tsx`)

**Spec:** §7.1, R7, S6.

**Files:**
- Create: `src/features/library/library-list.ts`, `src/features/library/library-list.test.ts`, `src/features/library/LibraryToolbar.tsx`, `src/features/library/LibraryTree.tsx`, `src/pages/LibraryPage.tsx`, `src/pages/LibraryPage.test.tsx`
- Modify: `src/app/router.tsx`, `src/app/router.test.tsx`

**Steps:**
1. Write `library-list.test.ts` and `LibraryPage.test.tsx` verifying cross-workspace grouping (`Workspace → Project → Schedules` + `"Shared with me"`), folder badges, URL-synced search/filters (`workspace`, `tag`, `source`, `archived`, `nonEmpty`), and direct `Open` links to `/w/:workspaceId/p/:projectId/schedule?scheduleId=:id`.
2. Implement `library-list.ts`, `LibraryToolbar.tsx`, `LibraryTree.tsx`, `LibraryPage.tsx`, and replace `<PlaceholderPage title="Library" />` in `src/app/router.tsx`.
3. Run `npm run check` and commit:
   `git add -A && git commit -m "feat: implement cross-workspace Schedule Library page at /library"`

---

### Task 17: Playwright E2E for Folders, Duplicate, Bulk actions, Excel report & `/library`

**Spec:** §7.1–§7.2, S6, S7, S8.

**Files:**
- Modify: `e2e/files.spec.ts`, `e2e/import.spec.ts`
- Create: `e2e/library.spec.ts`

**Steps:**
1. Add E2E tests in `e2e/files.spec.ts` (create folder, duplicate schedule into folder, bulk archive/move) and `e2e/import.spec.ts` (`"Download Excel"` produces `.xlsx`), and create `e2e/library.spec.ts` (browse `/library`, filter by tag/search, open schedule in editor).
2. Run `npm run check && npm run test:e2e` and commit:
   `git add -A && git commit -m "test: add e2e tests for folders, schedule copy, bulk bar, xlsx report and library"`

---

### Task 18: Batch C verification ledger update

**Files:**
- Modify: `docs/superpowers/plans/2026-11-23-phase4-later-verification.md`

**Steps:**
1. Record Batch C test counts in `docs/superpowers/plans/2026-11-23-phase4-later-verification.md` and commit:
   `git add -A && git commit -m "docs: record Batch C verification counts"`

---

## Batch D — Projects Programs, Self-Contained Map Layout & Final Verification (Tasks 19–23)

### Task 19: Workspace Programs (`ProgramDialog.tsx`, wizard/menu assignment & `"Group by program"` on `ProjectsPage.tsx`)

**Spec:** §7.3.1, R1, R2, S9.

**Files:**
- Create: `src/features/projects/ProgramDialog.tsx`, `src/features/projects/ProgramDialog.test.tsx`
- Modify: `src/features/projects/steps/DetailsStep.tsx`, `src/features/projects/NewProjectDialog.tsx`, `src/features/projects/EditProjectDialog.tsx`, `src/features/projects/ProjectMenu.tsx`, `src/features/projects/project-list.ts`, `src/features/projects/ProjectsToolbar.tsx`, `src/pages/ProjectsPage.tsx`, `src/pages/ProjectsPage.test.tsx`, `src/features/dialogs/DialogsProvider.tsx`

**Steps:**
1. Write tests in `ProgramDialog.test.tsx` and `ProjectsPage.test.tsx` covering creating/renaming/deleting a program, assigning a project to a program from the wizard or `ProjectMenu`, and toggling `"Group by program"` on `ProjectsPage`.
2. Implement `ProgramDialog.tsx`, add optional `Program` field in `DetailsStep.tsx`, add program assignment to `ProjectMenu.tsx`, add `"Group by program"` and `"+ New program"` to `ProjectsToolbar.tsx` and `ProjectsPage.tsx`.
3. Run `npm run check` and commit:
   `git add -A && git commit -m "feat: add workspace programs and Group by program view on ProjectsPage"`

---

### Task 20: Self-contained interactive coordinate map (`ProjectsMap.tsx`)

**Spec:** §7.3.2, D2, S9, V5.

**Files:**
- Create: `src/features/projects/ProjectsMap.tsx`, `src/features/projects/ProjectsMap.test.tsx`

**Steps:**
1. Write `src/features/projects/ProjectsMap.test.tsx` testing:
   - Projects with coordinates render interactive pins (`role="button"`, `aria-label="{name} ({code})"`);
   - Clicking a pin opens the project popover card with status badge, city, coordinates and `"Open project"` link;
   - Zoom controls (`Zoom in`, `Zoom out`, `Fit to projects`) update the map viewport;
   - Projects without coordinates (`location.latitude === null`) appear in the `"Not on the map ({n})"` panel with `"Edit location"` (or `"Project details"` for viewers).
2. Implement `src/features/projects/ProjectsMap.tsx` as a self-contained SVG coordinate map with Türkiye & regional outlines, graticule lines, pan/zoom controls, status-colored pins, and the `"Not on the map"` side panel.
3. Run `npm run check` and commit:
   `git add -A && git commit -m "feat: add self-contained interactive coordinate map and Not on the map panel"`

---

### Task 21: Wire `Map` layout toggle in `ProjectsToolbar.tsx`, `useProjectsLayout.ts` and `ProjectsPage.tsx`

**Spec:** §7.3.2, S9.

**Files:**
- Modify: `src/hooks/useProjectsLayout.ts`, `src/hooks/useProjectsLayout.test.ts`, `src/features/projects/ProjectsToolbar.tsx`, `src/pages/ProjectsPage.tsx`, `src/pages/ProjectsPage.test.tsx`

**Steps:**
1. Update `useProjectsLayout.test.ts` and `ProjectsPage.test.tsx` to test switching between `Tiles`, `List` and `Map` layouts and persisting `'map'` in `localStorage`.
2. Extend `ProjectsLayout` to `'tiles' | 'list' | 'map'` in `useProjectsLayout.ts`, add the `Map` toggle item in `ProjectsToolbar.tsx`, and render `<ProjectsMap />` when `layout === 'map'` in `ProjectsPage.tsx`.
3. Run `npm run check` and commit:
   `git add -A && git commit -m "feat: wire Map layout toggle on ProjectsPage"`

---

### Task 22: Playwright E2E for Programs, Map layout and Supabase folder/copy/library flows

**Spec:** §7, §8, S6, S7, S9, S10.

**Files:**
- Modify: `e2e/projects.spec.ts`, `e2e-supabase/supabase.spec.ts`

**Steps:**
1. Extend `e2e/projects.spec.ts` with E2E tests for creating a program, grouping projects by program, and switching to the `Map` layout (clicking a project pin and checking `"Not on the map"`).
2. Extend `e2e-supabase/supabase.spec.ts` with a real-Supabase test creating a folder, duplicating a materialized schedule into that folder, opening the duplicated schedule in the editor to verify its copied snapshot, and verifying it appears in `/library`.
3. Run `npm run check && npm run test:e2e` and commit:
   `git add -A && git commit -m "test: add Playwright e2e coverage for programs, map layout and Supabase folders/copy"`

---

### Task 23: Final verification (`V1–V5`, `S1–S10`) & docs (`CLAUDE.md`, `production.md`)

**Spec:** §2.2 S1–S10, §8 V1–V5.

**Files:**
- Modify: `docs/superpowers/plans/2026-11-23-phase4-later-verification.md`, `CLAUDE.md`, `docs/runbooks/production.md`

**Steps:**
1. Run full local verification:
   ```bash
   npm run check && npm run build && test -s dist/third-party-licenses.txt && npm run check:workers && npm run test:e2e
   ```
2. Fill in final `V1–V5`, Batch D counts, and `S1–S10` results in `docs/superpowers/plans/2026-11-23-phase4-later-verification.md`, update `CLAUDE.md` and `docs/runbooks/production.md` (`p4_later_programs_folders_copy` migration rollout note).
3. Commit, push `feat/p4-later`, open/update PR #6 and verify both GitHub Actions jobs (`app` and `supabase`) pass 100% green:
   `git add -A && git commit -m "test: verify phase 4 later and update docs"`
