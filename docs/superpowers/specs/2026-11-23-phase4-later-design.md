# Phase 4 later & Phase 3 deferred — Gantt Drag-and-Drop, Command Palette, Library, Folders/Copy, Programs and Map — Design Spec

| | |
|---|---|
| **Date** | 2026-11-23 |
| **Status** | Approved 2026-11-23 by the product owner (built from owner decisions 2026-11-23 on scope and self-contained map layout) |
| **Builds on** | Phase 4 core complete (`main`): `2026-11-20-phase4-core-design.md` (§2.3 deferred list), `2026-11-05-phase3-core-design.md` (§2.3 deferred list), `2026-11-03-phase3-projects-files-library-design.md` ("P3 full"); `docs/product/app-map.md` (§1, §2.1, §5); `docs/product/roadmap.md` (§2 rows P3–P4) |
| **Plan** | `docs/superpowers/plans/2026-11-23-phase4-later.md` (23 test-first tasks across 4 batches; verification ledger `docs/superpowers/plans/2026-11-23-phase4-later-verification.md`) |
| **Supersedes** | Delivers the deferred items of P4 core §2.3 (Gantt drag-and-drop bar move/resize/progress and drag-to-link drawing; `Ctrl+K` command palette) and the user-selected deferred items of P3 core §2.3 (`/library` page; project `programs` and self-contained `Map` layout; project file `folders`, `copySchedule` with `ScheduleDocument` snapshot copy, Files search/filters/sorting/bulk actions, and Import Report `.xlsx` download). Replaces P3 full D16's external Cloudflare R2 PMTiles requirement with a zero-config, self-contained interactive SVG/Canvas coordinate map (D2) |
| **Numbering** | This spec's S, R, V and D numbers are its own and start at 1 |
| **Readers** | Implementer and product owner |
| **Language** | All UI copy, code and docs in English |

---

## 1. Summary

This phase completes the deferred interactive polish of Phase 3 and Phase 4 without adding any external cloud setup or new runtime dependencies:

1. **Gantt Canvas Drag-and-Drop & Link Drawing (`src/features/schedule/gantt/`):** In Edit mode, planners can drag a task bar or milestone horizontally on the Canvas 2D Gantt to move its start date (setting or updating an `SNET` constraint), drag a task bar's right edge to resize its duration in working days, drag its progress handle to update `% complete`, or drag from a bar's connector port to another bar to draw an `FS`, `SS`, `FF` or `SF` relationship. A live ghost overlay previews the snapped date, duration, percent or link on the canvas, and dropping commits a single atomic command into the 100-step Undo/Redo stack.
2. **Command Palette (`Ctrl+K` / `Cmd+K`):** Available globally from the TopBar and keyboard shortcut using `cmdk` (already installed). Searches activities and WBS nodes in the active schedule (jumping Grid + Gantt to the chosen row), runs schedule editor commands (`Edit`, `Save`, `Calculate`, `Undo`, `Redo`, `+ Activity`, `+ WBS`, timeline toggles, zoom), switches schedules within the project, or navigates across pages and creation dialogs.
3. **Schedule Library Page (`/library`):** Replaces the `/library` placeholder with a cross-workspace schedule browser grouping schedules by `Workspace → Project` (plus `"Shared with me"`), with folder badges, search, filters (`Workspace`, `Tag`, `Source`, `Show archived`, `Hide empty`), and one-click `Open` into the Schedule Editor.
4. **Project Files Enhancements (Folders, Duplicate Schedule, Search/Filters, Bulk Bar & `.xlsx` Report):** Projects gain hierarchical **Folders** (up to 3 levels deep) in a collapsible left sidebar on the Files page, a **Files toolbar** (search, tag filter, sortable column headers), row multi-select with a **Bulk action bar** (`Move to folder`, `Archive`, `Restore`, owner-only `Delete`), a **`"Duplicate…"`** row action that copies both the schedule metadata and its gzipped `ScheduleDocument` snapshot, and **`"Download Excel"`** (`.xlsx`) on the Import Report dialog.
5. **Projects Page — Programs & Self-Contained Map Layout:** Workspaces gain **Programs** (`programs` table, project assignment in New/Edit Project wizard and row menu, and `"Group by program"` view on the Projects page). The Projects toolbar gains a third layout toggle — **`Map`** — rendering a self-contained SVG/Canvas coordinate map (Türkiye & world graticule, pan/zoom/fit, status-colored project pins, pin popover card, and a `"Not on the map"` side panel for projects without coordinates).

---

## 2. Goals, success criteria, non-goals

### 2.1 Goals

1. **Direct manipulation on the Gantt canvas.** Moving, resizing, progressing and linking bars on the Canvas 2D timeline works at 60 fps and flows through the exact same pure command/undo layer (`commands.ts`) as grid and inspector edits.
2. **Keyboard-first speed.** `Ctrl+K` lets a planner jump to any of 50,000 activities or trigger any editor/navigation action without leaving the keyboard.
3. **Complete project & file organization.** Programs group projects at the workspace level; Folders organize schedule versions inside a project; `Duplicate` clones any schedule (with its materialized `ScheduleDocument`) for what-if scenarios or new updates; `/library` provides a single cross-workspace view of every accessible schedule.
4. **Zero-config map & Excel report.** The Map layout works immediately offline and in CI without external tile buckets, and Import Reports download as clean multi-sheet `.xlsx` workbooks with formula-injection protection.

### 2.2 Success criteria (all must hold)

| # | Criterion | Verified by |
|---|---|---|
| S1 | Repository contract passes on both `MockRepository` and `SupabaseRepository` for all new program, folder, schedule-copy, bulk-move and library methods | `npm test`, `npm run test:integration` |
| S2 | Database & Storage isolation (pgTAP): non-members read nothing; viewers and share recipients receive `forbidden` on all program, folder, schedule-move and schedule-copy writes; only workspace owners can delete programs; `copy_schedule` and `schedule-data` RLS allow editors/owners to copy snapshots within the project | `npm run test:db` (`12_programs_folders_library.test.sql`) |
| S3 | Rules R1–R12 hold identically on Postgres and `MockRepository` | `npm run test:db`, repository contract suite |
| S4 | Gantt drag-and-drop hit-testing (`hitTestGanttTarget`) and drag state machine (`drag.ts`) are pure TypeScript, unit-tested for bar move (`SNET`), duration resize, `% complete` drag and 4-port (`FS`/`SS`/`FF`/`SF`) link drawing, and commit a single undoable command on pointer release | `src/features/schedule/gantt/drag.test.ts`, `ScheduleGantt.test.tsx` |
| S5 | `Ctrl+K` Command Palette opens from keyboard and TopBar, filters commands and schedule activities, jumps to the selected activity in `SchedulePage`, and triggers editor/navigation actions | `CommandPalette.test.tsx`, `e2e/schedule.spec.ts` |
| S6 | `/library` lists all accessible schedules grouped by workspace and project plus `"Shared with me"`, supports URL-persisted search and filters, and opens schedules directly in the editor | `LibraryPage.test.tsx`, `e2e/library.spec.ts` |
| S7 | Project Files page supports folder tree CRUD, moving schedules to folders, duplicating a schedule (including its `ScheduleDocument` snapshot), searching/filtering/sorting schedules, and bulk archive/restore/move/delete | `ProjectFilesPage.test.tsx`, `e2e/files.spec.ts`, `e2e-supabase/supabase.spec.ts` |
| S8 | Import Report `"Download Excel"` generates a multi-sheet `.xlsx` workbook (`Summary`, `Counts`, `Checks`, `Issues`) with formula cells escaped (`'=` prefix) and keeps SheetJS out of the main bundle via dynamic `import()` | `src/import/xlsx-export.test.ts`, ESLint boundary tests |
| S9 | Projects page supports Program CRUD, `"Group by program"` view, and the self-contained `Map` layout with interactive pins, pan/zoom/fit and `"Not on the map"` side list | `ProjectsPage.test.tsx`, `ProjectsMap.test.tsx`, `e2e/projects.spec.ts` |
| S10 | All local and CI checks green (`npm run check`, `npm run build`, `third-party-licenses.txt`, `check:workers`, `test:db`, `test:integration`, `test:e2e`, `test:e2e:supabase`, `check:secrets`, `db:types` diff) | GitHub Actions (`app` & `supabase` jobs) |

### 2.3 Non-goals (left to Phase 5–7)

- **Phase 5 (Views & Assets):** custom column sets, multi-condition activity filters, grouping by activity codes, calendar editor UI, resources, assignments, curves, custom fields, `/assets` page.
- **Phase 6 (Analysis & Dashboard):** activity-by-activity version diff, baseline ghost bars on Gantt, DCMA 14-point quality engine, `/dashboard` page.
- **Phase 7 (Collaboration & Output):** activity comments, persisted audit `HistoryEntry`, sharing management UI, vector PDF print, full schedule XER/Excel export, `/settings` pages.

---

## 3. Architecture & Layer Boundaries

```
pages: ProjectsPage (Tiles · List · Map · Programs) · ProjectFilesPage (Folders · Bulk · Copy) · LibraryPage · SchedulePage
  ├─ features/schedule/
  │    ├─ CommandPalette.tsx (Ctrl+K global & editor commands + activity jump)
  │    └─ gantt/
  │         ├─ hit-test.ts (pure bar, resize-handle, progress-handle & connector-port hit testing)
  │         ├─ drag.ts     (pure drag state machine: move, resize, progress, link-draw → ScheduleCommand)
  │         └─ renderer.ts (pure Draw2D scene + GanttInteractionOverlay ghost preview)
  ├─ features/projects/
  │    ├─ ProgramsSection.tsx · ProgramDialog.tsx
  │    └─ ProjectsMap.tsx (pure SVG/Canvas coordinate map + pan/zoom + "Not on the map" panel)
  ├─ features/files/
  │    ├─ FolderSidebar.tsx · FolderDialog.tsx · CopyScheduleDialog.tsx
  │    └─ FilesToolbar.tsx · BulkSchedulesBar.tsx · files-list.ts
  ├─ features/library/
  │    └─ LibraryToolbar.tsx · LibraryTree.tsx · library-list.ts
  └─ import/xlsx-export.ts (pure TS SheetJS writer, dynamically imported by useDownloadImportReport)
```

### Layer rules
1. **Zero new runtime npm dependencies:** `cmdk`, `xlsx` (SheetJS CE in `vendor/`), `lucide-react`, `@tanstack/react-table` and `@tanstack/react-virtual` are already installed.
2. **`src/features/schedule/gantt/{hit-test,drag,renderer}.ts` stay pure TypeScript:** no React, hooks, or adapter imports; `renderer.ts` and `theme.ts` contain zero `#hex` literals.
3. **`src/import/xlsx-export.ts` stays inside `src/import/**`:** statically imports `xlsx` inside `src/import/xlsx-export.ts`, and is loaded from `src/hooks/useImportReport.ts` strictly via dynamic `await import('@/import/xlsx-export')` so SheetJS never enters the main application chunk (ESLint rule 8).

---

## 4. Data Model, Database Rules (`R1–R12`) and Repository Contract

### 4.1 Type additions (`src/data/types.ts` & `src/data/repository.ts`)

```ts
export interface Program {
  id: ID;
  workspaceId: ID;
  name: string;
  createdAt: ISODateTime;
}

export interface Folder {
  id: ID;
  projectId: ID;
  parentId: ID | null;
  name: string;
  createdAt: ISODateTime;
}

// Added to Project:
export interface Project {
  // ... existing fields ...
  programId: ID | null;
}

// Added to ProjectSummary:
export interface ProjectSummary extends Project {
  // ... existing fields ...
  programName: string | null;
}

// Added to Schedule:
export interface Schedule {
  // ... existing fields ...
  folderId: ID | null;
  copiedFromId: ID | null;
}

export interface LibraryData {
  workspaces: WorkspaceSummary[];
  projects: ProjectSummary[];
  folders: Folder[];
  schedules: Schedule[];
  sharedWithMe: SharedScheduleRow[];
}

export interface CopyScheduleInput {
  scheduleId: ID;
  name: string;
  code: string;
  folderId?: ID | null;
}
```

`NewProjectInput` and `UpdateProjectInput` gain optional `programId?: ID | null`. `NewScheduleInput` and `ImportScheduleInput` gain optional `folderId?: ID | null`.

### 4.2 New `DataRepository` methods (`src/data/repository.ts`)

```ts
  // Programs
  listPrograms(workspaceId: ID): Promise<Program[]>;
  createProgram(input: { workspaceId: ID; name: string }): Promise<Program>;
  renameProgram(input: { programId: ID; name: string }): Promise<Program>;
  deleteProgram(programId: ID): Promise<void>;

  // Folders
  listFolders(projectId: ID): Promise<Folder[]>;
  createFolder(input: { projectId: ID; parentId?: ID | null; name: string }): Promise<Folder>;
  renameFolder(input: { folderId: ID; name: string }): Promise<Folder>;
  deleteFolder(folderId: ID): Promise<void>;
  moveSchedulesToFolder(input: { scheduleIds: ID[]; folderId: ID | null }): Promise<void>;

  // Schedule duplication
  copySchedule(input: CopyScheduleInput): Promise<Schedule>;

  // Cross-workspace library
  getLibraryData(): Promise<LibraryData>;
```

### 4.3 Domain rules (`R1–R12`)

- **R1 (Program names & roles):** Editors and owners of a workspace can create or rename a program; only workspace owners can delete a program (`'forbidden'` for others). Program `name` is trimmed, required (`1..80` chars, `'validation'` `"Enter a program name."` / `"Use 80 characters or fewer."`), and unique per workspace ignoring case (`'conflict'` `"A program with this name already exists."`). Deleting a program sets `program_id = null` on its projects without changing their `updated_at`.
- **R2 (Project program assignment):** `createProject` and `updateProject` accept `programId?: ID | null`. If non-null, the program must belong to the same workspace (`'validation'` `"Choose a program in this workspace."`).
- **R3 (Folder hierarchy, names & roles):** Editors and owners of a project's workspace can create, rename or delete folders (`'forbidden'` for viewers/non-members). Folder `name` is trimmed, required (`1..80` chars, `'validation'` `"Enter a folder name."` / `"Use 80 characters or fewer."`), and unique among siblings in the same `(project_id, parent_id)` ignoring case (`'conflict'` `"A folder with this name already exists here."`). Folders support up to **3 levels** of nesting (`root → child → grandchild`; creating a 4th level rejects `'validation'` `"Folders can be nested up to 3 levels deep."`).
- **R4 (Folder deletion):** Deleting a folder re-parents any child folders and schedules inside it to the deleted folder's `parent_id` (or `null` when root) in one transaction so no schedules are lost, and leaves schedules' `updated_at` unchanged.
- **R5 (Moving schedules to a folder):** Editors and owners can move 1–500 schedules of one project into a target folder of that project (or `folderId: null` for Unfiled) all-or-nothing (`move_schedules_to_folder`). Moving does not change `schedules.updated_at`.
- **R6 (Copying / duplicating a schedule):** Editors and owners can copy any existing schedule (`copySchedule`) into the same project with a new `name` (`1..120` chars) and unique `code` (`1..80` chars, R8 of P3 core). The copy:
  - Starts with `isCurrent: false`, `baseline: 'none'`, `updateNumber: null`, `archivedAt: null`, `lock: null`, `copiedFromId: source.id`, `folderId: input.folderId === undefined ? source.folderId : input.folderId`, `statusDate: source.statusDate`, `notes: source.notes`, `source: source.source`, `sourceFileName: source.sourceFileName`, `sourceFormat: source.sourceFormat`, `activityCount: source.activityCount`, `calculationMode: source.calculationMode`.
  - If the source schedule has a materialized `ScheduleDocument` snapshot (`data_file_path !== null`), `copySchedule` copies the gzipped snapshot bytes to a new path `{workspaceId}/{projectId}/{newScheduleId}/{uuid}.json.gz` in `schedule-data` with `data_revision = 1`.
  - If the source schedule is an import, `import_mapping`, `import_report`, `source_project_code`, `source_file_path`, `source_file_size` and `source_file_sha256` are copied so the duplicate can also view its import report or download the original file; `schedule_imports_delete` storage RLS already protects any `source_file_path` referenced by at least one row in `public.schedules`.
- **R7 (Library visibility):** `getLibraryData()` returns all member workspaces (in `compareWorkspaces` order), their projects, their folders, and all their schedules (including archived), plus `sharedWithMe` rows for schedules shared directly with the current user. Non-members never see projects or folders of workspaces they don't belong to.

### 4.4 Database migration (`supabase/migrations/<ts>_p4_later_programs_folders_copy.sql`)

1. **`public.programs` table:** `id uuid primary key default gen_random_uuid()`, `workspace_id uuid not null references public.workspaces(id) on delete cascade`, `name text not null`, `created_at timestamptz not null default now()`, check constraints for trimmed non-empty name ≤ 80 chars, unique index `programs_workspace_name_lower_uq on public.programs (workspace_id, lower(trim(name)))`. RLS: `select` for workspace viewers+; writes via RPCs.
2. **`public.projects.program_id`:** `alter table public.projects add column program_id uuid references public.programs(id) on delete set null;` + trigger check ensuring `program_id` belongs to `new.workspace_id`. Recreate `public.project_summaries` adding `program_id` and `program_name`.
3. **`public.folders` table:** `id uuid primary key default gen_random_uuid()`, `project_id uuid not null references public.projects(id) on delete cascade`, `parent_id uuid references public.folders(id) on delete set null`, `name text not null`, `created_at timestamptz not null default now()`, unique index on `(project_id, coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(trim(name)))`, trigger checking depth ≤ 3 and same `project_id` on `parent_id`. RLS: `select` for project viewers+; writes via RPCs.
4. **`public.schedules.folder_id` & `copied_from_id`:** `alter table public.schedules add column folder_id uuid references public.folders(id) on delete set null, add column copied_from_id uuid references public.schedules(id) on delete set null;`. Update `public.schedule_items` view to expose `folder_id` and `copied_from_id`.
5. **RPCs (`security definer set search_path = ''`):**
   - `public.create_program(p_workspace_id uuid, p_name text)`
   - `public.rename_program(p_program_id uuid, p_name text)`
   - `public.delete_program(p_program_id uuid)`
   - `public.create_folder(p_project_id uuid, p_parent_id uuid, p_name text)`
   - `public.rename_folder(p_folder_id uuid, p_name text)`
   - `public.delete_folder(p_folder_id uuid)`
   - `public.move_schedules_to_folder(p_schedule_ids uuid[], p_folder_id uuid)`
   - `public.copy_schedule(p_schedule_id uuid, p_new_schedule_id uuid, p_name text, p_code text, p_folder_id uuid, p_keep_source_folder boolean, p_data_file_path text)`

---

## 5. Interactive Gantt Drag-and-Drop & Link Drawing (`src/features/schedule/gantt/`)

### 5.1 Hit-testing (`src/features/schedule/gantt/hit-test.ts`)

In `mode === 'edit'`, `hitTestGanttTarget(x, y, rows, timescale, scrollLeft, scrollTop)` inspects the row at `(x, y)` (for activity rows where `activityType !== 'wbs_summary'`):
- **`'link-port-start'` / `'link-port-finish'`:** circular connector zones (`radius = 6 px`) positioned `8 px` outside the left (`start`) and right (`finish`) edges of an activity bar or milestone diamond.
- **`'bar-resize'`:** right edge of a `'task'` bar (`[x2 - 6, x2 + 4]`).
- **`'bar-progress'`:** lower `5 px` band near the progress boundary (`x1 + width * pct / 100 ± 6 px`) of a `'task'` bar.
- **`'bar-move'`:** interior of a `'task'` bar or milestone diamond.

### 5.2 Pure Drag State Machine (`src/features/schedule/gantt/drag.ts`)

1. **Move (`'bar-move'`):**
   - Tracks pointer delta in minutes along `timescale`, snapping to whole working days (`08:00` start of day on the activity's calendar).
   - Preview: `GanttInteractionOverlay` draws a translucent ghost bar at `[snappedStart, snappedFinish]` with label `"{DD.MM.YYYY}"`.
   - Drop: dispatches `{ type: 'updateActivity', activityId, patch: { constraint: { type: 'SNET', date: snappedStartClock } } }`.
2. **Resize duration (`'bar-resize'`):**
   - Snaps new finish to working days, computing `newDurationMinutes = Math.max(hoursPerDay * 60, workingDays * hoursPerDay * 60)`.
   - Preview: ghost bar from `start` to `snappedFinish` with label `"{days} d"`.
   - Drop: dispatches `{ type: 'updateActivity', activityId, patch: { originalDuration: newDurationMinutes, remainingDuration: newDurationMinutes } }`.
3. **Progress (`'bar-progress'`):**
   - Computes `pct = clamp(Math.round(((x + scrollLeft - x1) / barWidth) * 100), 0, 100)`.
   - Preview: live progress fill + `"{pct}%"` pill.
   - Drop: dispatches `{ type: 'updateActivity', activityId, patch: { percentComplete: pct } }`.
4. **Draw relationship (`'link-port-start'` / `'link-port-finish'`):**
   - Dragging from source `(sourceId, sourcePort: 'start' | 'finish')` draws a live connector line to cursor `(x, y)` and highlights the hovered target activity's nearest port (`targetPort: 'start' | 'finish'`).
   - Port mapping: `finish → start` = `'FS'`, `start → start` = `'SS'`, `finish → finish` = `'FF'`, `start → finish` = `'SF'`.
   - Drop on a valid target (`targetId !== sourceId`): dispatches `{ type: 'addRelationship', predecessorId: sourceId, successorId: targetId, relType, lagMinutes: 0 }`. Pressing `Escape` cancels any in-progress drag.

---

## 6. Command Palette (`Ctrl+K`, `src/features/schedule/CommandPalette.tsx`)

- Mounted inside `AppShell` and opened via:
  1. Pressing `Ctrl+K` or `Meta+K` anywhere in the app, or
  2. Clicking the TopBar command trigger button (`aria-label="Command palette"`, label `"Search or run a command…"`, shortcut badge `Ctrl+K`).
- Built on `cmdk` (`Command`, `CommandInput`, `CommandList`, `CommandEmpty`, `CommandGroup`, `CommandItem`, `CommandSeparator`) styled with our semantic CSS tokens (`bg-card`, `text-foreground`, `data-[selected=true]:bg-accent`).
- When rendered on `/w/:workspaceId/p/:projectId/schedule`, `SchedulePage` registers its active editor actions and activity/WBS items via a lightweight context (`CommandPaletteProvider`):
  - **Activities & WBS group** (up to 50 top matches for the query): selecting an item expands any collapsed ancestor WBS nodes, selects the row (`editor.selectKey`), and scrolls the virtualized grid and Gantt vertically + horizontally to the activity.
  - **Editor commands group**: `Edit schedule` / `Done editing`, `Save schedule`, `Calculate schedule`, `Undo`, `Redo`, `Add activity`, `Add WBS node`, `Toggle critical path`, `Toggle driving path`, `Toggle relationship links`, `Toggle details panel`, `Zoom to fit`, `Zoom: Day`, `Zoom: Week`, `Zoom: Month`, `Zoom: Quarter`.
  - **Navigation group**: `Go to Home`, `Go to Library`, `Go to Projects`, `Go to Project files`, `Toggle theme`.

---

## 7. Screens: Library, Project Files Enhancements, and Projects Programs & Map

### 7.1 Library Page (`/library`, `src/pages/LibraryPage.tsx`)

- Replaces `<PlaceholderPage title="Library" />` in `src/app/router.tsx`.
- Header: `<h1>Library</h1>` + subtitle `"{n} schedules across {m} projects"`.
- Toolbar (`LibraryToolbar.tsx`, synced to URL search params `q`, `workspace`, `tag`, `source`, `archived`, `nonEmpty`):
  - Search input (`aria-label="Search library"`, placeholder `"Search schedules…"`),
  - `Filters` popover (`Workspace`, `Tag`: `Any` / `Current` / `Baseline` / `Primary baseline` / `Update`, `Source`: `Any` / `Blank` / `Imported`),
  - `"Show archived"` and `"Hide empty"` checkboxes,
  - `FilterChips` with `"Clear filters"`.
- Content (`LibraryTree.tsx`):
  - Groups matching schedules by **Workspace** → **Project** (`{project.name}` with `{project.code}` badge and link to its Files page), plus a **`"Shared with me"`** section when shared schedules match.
  - Each project table lists its matching schedules with: `Name` (link to `/w/:workspaceId/p/:projectId/schedule?scheduleId=:id`, folder badge `{folder.name}` when filed, lock icon when locked, `Archived` badge when archived), `Code`, `Tags` (`TagBadges`), `Status date`, `Activities`, `Source`, `Last modified`, and an `Open` link button.

### 7.2 Project Files Enhancements (`ProjectFilesPage.tsx`)

1. **Folders Sidebar (`FolderSidebar.tsx`):**
   - Left panel above/beside the schedules table (`w-56` on `lg+`, collapsible on small screens):
     - `"All schedules"` (`?folder=all`, default) with total count,
     - `"Unfiled"` (`?folder=unfiled`) with count of schedules where `folderId === null`,
     - Hierarchical folder tree (up to 3 levels) with expand/collapse chevrons, schedule counts, and a row menu (`New subfolder…`, `Rename…`, `Delete…`) for editors/owners,
     - `"+ New folder"` button for editors/owners (`FolderDialog.tsx`).
2. **Files Toolbar (`FilesToolbar.tsx`):**
   - Search box (`aria-label="Search schedules"`, placeholder `"Search schedules…"`),
   - Tag filter select (`All tags`, `Current`, `Baseline`, `Primary baseline`, `Updates`),
   - Sort select / column header sorting (`Status date`, `Name`, `Last modified`, `Activities`),
   - `"Show archived"` checkbox.
3. **Multi-select & Bulk Bar (`BulkSchedulesBar.tsx`):**
   - For editors/owners, `SchedulesTable` renders a selection checkbox column (`Select all schedules` / `Select {name}`).
   - When `selectedIds.length > 0`, a bar above the table displays `"{n} selected"` with actions:
     - `"Move to folder…"` (dropdown of folders + `"Unfiled"`),
     - `"Archive"` (when any selected non-current schedule is unarchived),
     - `"Restore"` (when any selected schedule is archived),
     - `"Delete…"` (owners only, opens `DeleteScheduleDialog` for the batch),
     - `"Clear selection"`.
4. **Duplicate Schedule (`CopyScheduleDialog.tsx`):**
   - `ScheduleMenu` gains `"Duplicate…"` (for editors/owners) and `"Move to folder…"` submenu.
   - `CopyScheduleDialog` prompts for `Name` (default `"{source.name} (copy)"`), `Code` (default `suggestCopyCode(source.code, existingCodes)` e.g. `UP-02-COPY`), and `Folder` (default source's folder), calls `copySchedule`, and shows toast `"Schedule duplicated"`.
5. **Import Report Excel Download (`src/import/xlsx-export.ts`):**
   - `ReportView.tsx` (in both the Import wizard Review step and `ImportReportDialog`) adds a `"Download Excel"` button next to `"Download CSV"`.
   - `reportToXlsx(report, scheduleName): Uint8Array` builds a 4-sheet workbook (`Summary`, `Counts`, `Checks`, `Issues`) using SheetJS (`XLSX.utils.aoa_to_sheet`, cell types forced to string `'s'` and leading `=`, `+`, `-`, `@`, `\t`, `\r` prefixed with `'` to prevent spreadsheet formula injection), downloaded as `{slug}-import-report.xlsx`.

### 7.3 Projects Page — Programs & Self-Contained Map Layout (`ProjectsPage.tsx`)

1. **Programs (`ProgramDialog.tsx`, `ProjectsPage.tsx`):**
   - Header actions gain `"+ New program"` (for editors/owners).
   - `NewProjectDialog` / `EditProjectDialog` Details step gains an optional `"Program"` select (`"None"` + workspace programs).
   - `ProjectMenu` gains a `"Program"` submenu / action to assign or clear the project's program.
   - `ProjectsToolbar` gains a `"Group by program"` toggle (`?group=program` in URL). When active, projects render under collapsible Program headers (`{program.name} · {n} projects`, with `Rename program` and owner-only `Delete program` menu) followed by `"No program"`.
2. **Self-Contained Map Layout (`ProjectsMap.tsx`):**
   - `ProjectsToolbar` layout toggle gains a third item: **`Map`** (`tiles` | `list` | `map`, persisted in `useProjectsLayout`).
   - `ProjectsMap.tsx` splits into:
     - **Interactive Map Canvas/SVG (left/main):** equirectangular / Mercator viewport with Türkiye & regional coastline/border paths and lat/lng grid lines, zoom controls (`Zoom in`, `Zoom out`, `Fit to projects`), drag-to-pan, and interactive project markers (`role="button"`, `aria-label="{project.name} ({project.code})"`). Clicking a marker opens an overlay card with the project's cover thumbnail, name, code, `StatusBadge`, client/city, coordinates, and `"Open project"` link.
     - **`"Not on the map ({n})"` panel (right, `w-72`):** lists filtered projects where `location.latitude === null` with their code, name, city and an `"Edit location"` button (or `"Project details"` for viewers) opening `EditProjectDialog`.

---

## 8. Testing & Verification (`V1–V5`)

| # | Assumption | Verification |
|---|---|---|
| V1 | `src/import/xlsx-export.ts` dynamically imported from `useImportReport.ts` keeps SheetJS out of the main `index-*.js` chunk and passes `check:workers` | `npm run build && npm run check:workers` + unit test in `xlsx-export.test.ts` |
| V2 | `copy_schedule` copies both unmaterialized and materialized (`schedule-data`) schedules under RLS and preserves `schedule-imports` delete protection when multiple schedules share a `source_file_path` | `supabase/tests/12_programs_folders_library.test.sql` + `integration/programs-folders-library.itest.ts` |
| V3 | Gantt drag-and-drop (`move`, `resize`, `progress`, `link-draw`) updates Canvas 2D at 60 fps and produces single-step undoable commands | `src/features/schedule/gantt/drag.test.ts` + `e2e/schedule.spec.ts` |
| V4 | `cmdk` Command Palette passes keyboard navigation and WCAG contrast in both dark and light themes | `CommandPalette.test.tsx` + `e2e/schedule.spec.ts` |
| V5 | Self-contained `ProjectsMap` renders deterministically in Chromium E2E without any external network requests | `ProjectsMap.test.tsx` + `e2e/projects.spec.ts` |

---

## 9. Delivery Plan Overview (23 Tasks in 4 Batches)

- **Batch A (Database, Storage, Contract & `.xlsx` Export — Tasks 1–6):**
  1. Migration `p4_later_programs_folders_copy` (`programs`, `folders`, `projects.program_id`, `schedules.folder_id`/`copied_from_id`, updated views, 8 RPCs) + regenerated `database.types.ts` + pgTAP `12_programs_folders_library.test.sql`.
  2. Types (`Program`, `Folder`, `LibraryData`, `CopyScheduleInput`), `MockRepository` implementation (`MOCK_DB_VERSION` → 5 with seeded program & folders) and contract suite cases.
  3. `SupabaseRepository` implementation for programs, folders, `copySchedule` (with `schedule-data` snapshot copy) and `getLibraryData` + integration tests (`integration/programs-folders-library.itest.ts`).
  4. Hooks (`usePrograms`, `useFolders`, `useCopySchedule`, `useMoveSchedulesToFolder`, `useLibrary`) + `query-keys.ts` updates.
  5. `src/import/xlsx-export.ts` (multi-sheet `.xlsx` report writer with formula-injection escaping) + `"Download Excel"` in `ReportView.tsx` and `useDownloadImportReport`.
  6. Batch A verification & CI check.
- **Batch B (Gantt Drag-and-Drop & `Ctrl+K` Command Palette — Tasks 7–12):**
  7. Extended Gantt hit-testing (`hitTestGanttTarget` for bar move, duration resize handle, progress handle, and start/finish link connector ports) + unit tests.
  8. Pure Gantt drag state machine (`src/features/schedule/gantt/drag.ts`) converting pointer drags into preview overlays and atomic `ScheduleCommand`s + unit tests.
  9. `GanttInteractionOverlay` rendering in `renderer.ts` (ghost bar, snapped date/duration/percent badge, rubber-band link arrow & target port highlight) + `renderer.test.ts`.
  10. Pointer drag handlers & cursor feedback in `ScheduleGantt.tsx` wired to `editor.dispatch` + component tests.
  11. `CommandPalette.tsx` (`Ctrl+K` / TopBar trigger, activity/WBS jump, editor commands, schedule switcher, global navigation) + component tests.
  12. Batch B Playwright mock E2E cases in `e2e/schedule.spec.ts` & CI check.
- **Batch C (Project Files Enhancements & `/library` Page — Tasks 13–18):**
  13. `FolderSidebar.tsx` & `FolderDialog.tsx` (3-level folder tree, create/rename/delete, schedule counts, URL `?folder=` sync) + tests.
  14. `CopyScheduleDialog.tsx` (`"Duplicate…"` in `ScheduleMenu` with code suggestion & folder picker) + `"Move to folder"` menu + tests.
  15. `FilesToolbar.tsx` & `files-list.ts` (search, tag filter, sortable column headers) + `BulkSchedulesBar.tsx` (multi-select move/archive/restore/delete) on `ProjectFilesPage.tsx` + tests.
  16. `LibraryPage.tsx`, `LibraryToolbar.tsx`, `LibraryTree.tsx` & `library-list.ts` replacing the `/library` placeholder + tests.
  17. Playwright E2E coverage for Folders, Duplicate, Bulk actions, `.xlsx` report download and `/library` (`e2e/files.spec.ts`, `e2e/library.spec.ts`).
  18. Batch C verification & CI check.
- **Batch D (Projects Programs, Self-Contained Map Layout & Final Verification — Tasks 19–23):**
  19. `ProgramDialog.tsx`, program assignment in `NewProjectDialog` / `EditProjectDialog` / `ProjectMenu`, and `"Group by program"` collapsible sections on `ProjectsPage.tsx` + tests.
  20. Self-contained interactive coordinate map (`ProjectsMap.tsx`: Türkiye & world graticule SVG/Canvas, pan/zoom/fit, status-colored pins, project popover card, `"Not on the map"` side panel) + tests.
  21. Wire `Map` layout toggle in `ProjectsToolbar.tsx`, `useProjectsLayout.ts` and `ProjectsPage.tsx` + tests.
  22. Playwright E2E coverage for Programs, Map layout and Supabase folder/copy/library flows (`e2e/projects.spec.ts`, `e2e-supabase/supabase.spec.ts`).
  23. Final verification (`V1–V5`, `S1–S10`), `CLAUDE.md` and `docs/runbooks/production.md` updates.

---

## 10. Decisions Log

| # | Decision | Reason |
|---|---|---|
| D1 | **Owner decision 2026-11-23:** Combine Phase 4 Later (Gantt drag-and-drop & link drawing, `Ctrl+K` command palette) and Phase 3 Deferred (`/library`, Files folders/copy/search/bulk/Excel report, Projects programs & map) into one cohesive spec and plan | Completes all deferred P3/P4 capabilities before moving to Phase 5 |
| D2 | **Owner decision 2026-11-23:** Build the Projects `Map` layout as a self-contained SVG/Canvas coordinate map with pan/zoom, status-colored project pins and a `"Not on the map"` panel instead of requiring external Cloudflare R2 PMTiles hosting | Works out of the box locally, in CI and in production with zero external infrastructure or new dependencies |
| D3 | Store schedule copies (`copySchedule`) as independent schedules with their own copied `ScheduleDocument` snapshot in `schedule-data` and `copied_from_id` pointer | Lets planners duplicate any schedule for what-if analysis or new status updates and edit the copy immediately |
| D4 | Keep `xlsx` out of the main bundle by placing `reportToXlsx` in `src/import/xlsx-export.ts` and loading it via dynamic `import()` inside `useDownloadImportReport` | Preserves ESLint rule 8 and keeps the main bundle size clean |
| D5 | **Owner decision 2026-11-24:** Deleting a folder always succeeds. Its child folders move up to its parent; a moved folder whose name clashes (ignoring case and surrounding spaces) with a folder already there, or with the deleted folder itself, is renamed "{name} (2)", "{name} (3)" and so on, the lowest free number. Both adapters behave the same | `delete_folder` failed with a unique-index error on such clashes, while the mock succeeded and left duplicate names |
