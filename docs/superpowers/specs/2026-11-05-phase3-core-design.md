# Phase 3 core — Projects, Files and Import — Design Spec

| | |
|---|---|
| **Date** | 2026-11-05 |
| **Status** | Approved 2026-11-05: written after the owner's decision "usability first" (D1), revised after a builder check; the owner said to continue to the plan |
| **Builds on** | Phase 2 complete (`v0.2.0`): `2026-10-14-phase2-supabase-design.md` and `2026-10-14-home-shell-design.md` (every decision in both stands unless the Supersedes row or §9 says otherwise); the full Phase 3 spec `2026-11-03-phase3-projects-files-library-design.md` ("P3 full"), whose decisions, names, types, schema, copy and tests this spec copies wherever they fall inside the core; `docs/product/roadmap.md` §2 row P3; `docs/product/app-map.md` §2.1 and §2.3 |
| **Plan** | One plan of about 24 test-first tasks, written with superpowers:writing-plans after approval (§2.4) |
| **Supersedes** | For the work this spec covers: P3 full §2.4 (five plans P3a–P3e) and the plan `2026-11-04-phase3a-projects.md` (written, never executed). P3 full stays the design reference for "Phase 3 later" (§2.3) and is not edited. From P1: the `ProjectType` list (§5.1; new values go before "Other"), §5.7's rows "New schedule" (a required Code; the copy "Use 80 characters or fewer") and "Import schedule", §6.7 "Import schedule dialog" (formats, steps, landing page), §6.7 "New schedule dialog" (a required Code; it lands on the files page). From P2: §6.5's `updated_at` triggers (now limited to user-editable columns, R11), §6.7's grant lists for `projects` and `schedules` and the pgTAP pin "exactly the four RPCs" (now nine), §7.3's `schedule-imports` delete policy (§4.9) and §8.2's `importSchedule` (stores a compressed copy, the mapping and the report); `project_summaries.schedule_count` now counts schedules that aren't archived. |
| **Numbering** | This spec's S, R, V and D numbers are its own and start at 1; "P3 full §5.5" and "P3 full D15" cite the full spec; "P1 §6.7" and "P2 §8.2" cite the earlier specs |
| **Readers** | Claude Code (implementer) and the product owner |
| **Language** | All UI copy, code and docs in English |

---

## 1. Summary

Phase 3 core makes the app usable for its first job: getting a real schedule in. The Projects placeholder becomes a working page: projects gain a status, a stage, three more project types, a sector (ownership), map coordinates kept as data, show as tiles or a list, can be searched, filtered by status and stage, sorted, edited in the New project wizard's edit mode, and deleted by owners with everything they hold. A project's **files page** lists its schedules with a code, exactly one current schedule, baselines with one primary, update numbers, notes and archive, all enforced by the database. **Import** reads one Primavera P6 XER, Microsoft Project XML (MSPDI), Excel (.xlsx) or CSV file per run in a Web Worker, recognizes the format from the content, lets the user choose one project of a multi-project XER, asks for a column mapping when the file is a table, handles Turkish encodings, decimal commas and Turkish dates, and always creates a new schedule that keeps the original file, the mapping and an **import report** (counts, checks, what was used, kept or not read, every issue). Opening a schedule is Phase 4's: P4 core builds activities, WBS, relationships and calendars from what this phase stores (§5.8), and its editor turns the disabled "Open" entries on.

The owner's reference product stays a functional guide only (D2); every word of copy here is our own.

---

## 2. Goals, success criteria, non-goals

### 2.1 Goals

1. A workspace's projects carry the attributes of app map §2.1 that the core needs (status, stage, type, sector, client, location with coordinates) and can be found by search, status and stage filters and sort, as tiles or a list.
2. A project's schedules carry the file-level data the rest of the product builds on: a code, exactly one current schedule, baselines with one primary, update numbers, notes and archive, each rule enforced by the database and mirrored by the mock.
3. A planner imports a real export from P6, Microsoft Project or Excel into a project. Calendars, WBS elements, activities and links are read faithfully enough to count, check and report every one; nothing is dropped without an entry in the report (§5.9).
4. P4 core turns stored imports into its tables without asking the user again (§5.8 "P4 hand-over"), and a clean import stays readable: later parser versions never add an error to a schemaVersion-1 mapping that imported without one (§5.8 "Compatibility rule").
5. Every feature deferred to "Phase 3 later" (§2.3) can be added by new migrations and code without changing what this phase ships.

### 2.2 Success criteria (all must hold)

| # | Criterion | Verified by |
|---|---|---|
| S1 | The repository contract (Phase 2 cases plus §7's new ones) passes on the mock and the Supabase adapters | `npm test` (mock), `npm run test:integration` (local stack) |
| S2 | Isolation on every changed table, view, RPC, trigger and storage policy: a non-member reads nothing; a viewer or a share recipient writes nothing and gets `forbidden`, never a silent 0-row success; editors can't delete schedules, projects or a stored original that a schedule names | `npm run test:db` |
| S3 | R1–R12 hold on both adapters | `npm run test:db` and the contract suite |
| S4 | Each fixture in `src/import/__fixtures__/` (our own files: XER with two projects and a derived calendar; MSPDI with a derived calendar, escaped characters, a manually scheduled task and milestones at both ends of the day; CSV in Windows-1254 with `;` and decimal commas; CSV in UTF-8; a Microsoft Project–style table export with unit durations, weekday dates and ID predecessors; xlsx in both date systems) produces its committed golden report and golden model (`durationMs` and `parserVersion` left out); the §5.9 count rules hold for every fixture; damaged copies (cut short or with flipped bytes after the leading signature, P3 full §7) give a report, with `FILE_UNREADABLE` when the damage stops the read, or for xlsx the refusal "This file isn't a readable Excel workbook.", never an exception or a hang; each refused type of §5.2 gives its own message | `npm test` |
| S5 | A generated XER with 10,000 activities and 15,000 links parses and checks in under 5 s (15 s on CI); a generated 20 MB XER is stored compressed at 4 MB or less and its import completes on the local stack inside the 60 s client timeout (P2 D18) | `npm test` (budget test), `npm run test:integration`, V8 |
| S6 | Projects (tiles, list) and Project files work end to end on mock and Supabase data; filters live in the URL; an imported CSV (Windows-1254, mapped) and an XER (one of its two projects chosen) show on the files page, one of them current, and their reports open from their rows | `npm run test:e2e`, `npm run test:e2e:supabase` |
| S7 | No component imports an adapter or `src/import/**`; `src/import/**` imports no React, hooks or adapters; within `src/**`, `xlsx`, `papaparse`, `fast-xml-parser` and `fflate` are imported statically only inside `src/import/**` (D26); `scripts/make-xlsx-fixtures.ts` may write workbooks with SheetJS (D42) | ESLint |
| S8 | `npm run check`, both e2e suites, `test:db`, `test:integration` and `check:secrets` pass and the generated database types are current, locally and in CI | GitHub Actions |
| S9 | Viewers see every write action disabled with the P2 tooltip, and the database refuses the same writes with `forbidden` | component tests, contract suite, `npm run test:db` |
| S10 | Every build ships `third-party-licenses.txt` with each production dependency's name, version, licence and licence or NOTICE text | `scripts/third-party-licenses.test.mjs`, the CI build |
| S11 | Hand-over round trip: after an import, `getScheduleSourceFile` and `getImportMapping` fed to `src/import`'s `analyze` give the same `ImportModel` as at import time (models only: the report's checks depend on the status date passed in, §5.8) | contract suite (mock), `integration/imports.itest.ts` (local stack) |
| S12 | The owner's real exports read without errors, and their counts match the source tools' own totals, or each gap is listed with the owner's consent (V9) | V9 notes |

### 2.3 Non-goals

**Deferred to "Phase 3 later"** (owner decision 2026-11-05, D1). P3 full stays their design; each keeps a seam here:

| Deferred | In P3 full (its ids) | Seam in the core |
|---|---|---|
| Programs | §4.1 `Program`, R13, §6.2 "By program", §6.6 program dialogs | the project columns are additive; `program_id` arrives later as a nullable column |
| Folders | R11, §4.6 `folders`, §6.4 folder panel | `schedules` has no `folder_id`; it arrives later as a nullable column; the code suggestion and table helpers take no folder |
| Map layout and its R2 hosting | §6.3, D16 | latitude and longitude are stored, validated and edited (§6.4) |
| Project visits and "Recently opened" | §4.6 `project_visits`, D17 | the Projects sort list gains "Recently opened" then (D24) |
| Duplicate-project hint | §6.6, D52 | `foldForMatch` exists (§5.4) |
| The wizard's Review step | §6.6 | edit mode already reaches every step |
| Project time zone, per-project date and time format | R20, R22, D41, D66 | none needed: they are new columns with defaults. The owner approved the Turkish date format; P4 core decides how schedule dates display (D3) |
| Library page | §6.5, D20, D26 | `/library` keeps its placeholder; `schedule_items` is the view it will read |
| Saved versions, copies, detach | R16, D33, §4.7 `copy_schedule` | schedules keep their ids; `parent_id` and `copied_from_id` arrive as nullable columns |
| Protection and the edit lock | R9, R10, R17, D10, D34 | imports arrive unprotected in the core; the migration that adds protection protects existing imports with an unknown holder, as P3 full §4.6 does for P2-era imports (D29) |
| Several files per import, replace, reload, replace preview | §5.1, R21, §5.13, D44, D45, D64 | `ImportMapping`, the stored original and `ImportFormat` are P3 full's; P2-era imports keep a null mapping (§5.8) |
| The report as an .xlsx download | §5.9, D65 | CSV and JSON downloads ship (§5.9) |
| The blocked-reason system beyond P2's viewer pattern | §6.1 "Blocked actions", D35 | menus leave out what the row's state forbids and the database refuses it with its R copy (D11) |
| Update-order checks and renumbering | §6.4 notices, D36 | update numbers are stored and unique (R7) |
| The main-chunk check script | §3, S7 | ESLint import rules (D26) |

**Also left for later (our call, D27):** reuse of a project's earlier column mapping (P3 full §5.7 "Earlier mappings"); selection and the bulk bar on the files page (P3 full §6.4; the core's RPCs already take id arrays, R9); the files page's search, tag and notes filters and sortable headers (P3 full §6.4); the "Archive the current schedule" dialog (P3 full §6.6, P3 full D51); the setup list in the empty files page (P3 full §6.4); the Projects page's "Shared with me" link (P3 full §6.2); "Import and open" (P3 full §6.6). **Later phases** (P3 full §2.3 stands): the schedule model and editor, opening a schedule, CPM, grid and timeline (P4); calendars as an editor, custom fields, resources, the import's custom-field mapping (P5); version diff and dashboard (P6); sharing UI, comments, history, settings pages, printing and exports (P7); templates; MPP import (G3); every roadmap §4 option.

### 2.4 Delivery: one plan

The owner chose one plan of about 20–25 tasks (D1). Our estimate is **24 tasks** (range 23–26; the top of the range if the interim import path below needs a task of its own). Every task ends with `npm run check`, `test:db`, `test:integration`, `test:e2e` and `test:e2e:supabase` green, so a task also changes every caller its change breaks (D36). In plan order:

| Group | Tasks | Contents |
|---|---|---|
| Setup | 1 | V1–V7; dependencies, `vendor/xlsx-0.20.3.tgz`, ESLint rules (§3), `/real-exports/` in `.gitignore`, the licence script (S10) |
| Migrations, each with the code that adapts to it | 3 | `p3_core_projects` with pgTAP `08`, the regenerated types and the `projectFrom` / `mapProject` row-type change (§4.10); `p3_core_schedules` with pgTAP `09`, the types, `code` in `NewScheduleInput` and `ImportScheduleInput`, both adapters sending it, "Code" in New schedule and in the P2 import dialog (`codes.ts`), the contract's schedule cases passing codes and P2's `04_rls` change (§9); `p3_core_imports` with pgTAP `10`, the types, the storage policy and the interim import path below |
| Contract on both adapters, with hooks | 4 | project attributes, `getProject`, `updateProject` (callers such as `toNewProjectInput` send the new fields' defaults until the wizard task); `deleteProject` (+ integration); `listSchedules`, current, details; archive and delete (+ integration) |
| Parser (`src/import`) | 6 | detection, encoding, numbers, durations, dates and `search.ts`; XER; MSPDI; tables with the zip guard; model, checks, outcomes, report, CSV export and `pack` with goldens, damaged files and the budget; worker, protocol, client and `useImportParser` |
| Import contract | 1 | import storage, report, mapping and original file on both adapters (+ integration, S11); after the parser, because S11 runs `analyze` |
| Projects UI | 4 | wizard fields and coordinates; wizard edit mode and "Project details"; list rules, toolbar, `StatusBadge` and filter chips; Projects page with `DataTable`, menu, delete and e2e `projects` |
| Files UI | 2 | files page, table and counters; row menu, Schedule details, delete and e2e `files` |
| Import UI | 2 | File and Columns steps; Review, commit, Import report dialog, the end of the interim path, e2e `import`, the Supabase e2e import test and V8 |
| Real exports | 1 | V9 over the owner's files (**the controller stops here and asks the owner for them**), fixes, final verification |

**Interim import path** (our call, D36). From `p3_core_schedules` until the Review task, the P2 import dialog keeps working, so Home's import and `e2e/home.spec.ts` stay green: it gains a required "Code" field, filled with the file-name suggestion of §6.4, and sends it. From `p3_core_imports` on, the Supabase adapter sends `source_format` derived from the file's extension (`.xer` → `xer`, `.xml` → `mspdi`, `.csv` → `csv`, the only types the P2 dialog takes) and uploads the file gzipped (`import('fflate')`) under the §4.9 path; the mock derives the format the same way once `Schedule.sourceFormat` exists. From the import contract task on, `ImportScheduleInput`'s `stored`, `statusDate`, `activityCount`, `sourceProjectCode`, `mapping` and `report` are optional, and without them the adapters keep the interim behavior and store no mapping or report, as for a P2-era import. The Review task makes them required, removes the interim branch and the P2 dialog, and pins that in the contract.

Parsing is the largest part, as P3 full §2.4 found; the plan may merge two small tasks but keeps the parser test-first, fixture by fixture.

---

## 3. Architecture

```
pages ProjectsPage · ProjectFilesPage → features projects/ · files/ · import/ → hooks (src/hooks)
  ├─ DataRepository ─ MockRepository | SupabaseRepository        (only src/data/index.ts imports them)
  └─ src/import/client.ts → module Web Worker → src/import/** (pure TypeScript readers, model, checks, report)
Supabase: no new tables; projects and schedules gain columns; project_summaries (recreated), schedule_items (new);
  5 new RPCs (§4.7); triggers for R1–R11; schedule-imports (P2 bucket) keeps the original files, compressed
```

- **Layer rules** (P3 full §3, enforced by ESLint): `src/import/**` imports nothing from React, `@/hooks`, `@/components`, `@/features`, `@/pages`, `@/data/mock`, `@/data/supabase` or `@/data/index`, and may `import type` from `@/data/types`. Only hooks import `src/import/client.ts`; `client.ts` statically imports only `./protocol` and types, and loads its in-thread fallback with `import('./in-thread')`. Only `useDownloadImportReport` loads `src/import/csv-export.ts`, through `import()`. Within `src/**`, `xlsx`, `papaparse`, `fast-xml-parser` and `fflate` are imported statically only inside `src/import/**`, and elsewhere in `src/` only through `import()` (the Supabase adapter's gzip and gunzip, §4.10). The rule doesn't reach `scripts/`: `scripts/make-xlsx-fixtures.ts` writes the xlsx fixtures with SheetJS, in both date systems (D42). The parser runs unchanged in Node (tests, a P4 script) and in the worker.
- **Controls for later phases:** "Open" (row menu) and "Open current schedule" (files page) stay visible and disabled with the note of §6.1 until P4 core's editor exists (D16). Controls of other deferred features are left out. **Dialogs** open through `useDialogs()` (CLAUDE.md rule 5); confirmations are local `AlertDialog`s.

New and changed files:

```
src/import/  detect.ts encoding.ts numbers.ts dates.ts durations.ts zip-guard.ts safe-record.ts pack.ts
             xer/ (tokenize, calendar-data, read) · mspdi/ (read, xml-text, calendars)
             table/ (csv, xlsx, auto-map, normalize, predecessors, constraints)
             model.ts calendars.ts checks.ts outcomes.ts report.ts issues.ts csv-export.ts version.ts index.ts
             worker.ts client.ts in-thread.ts protocol.ts · __fixtures__/ (our own files, golden *.report.json, *.model.json)
src/components/common/ DataTable · StatusBadge · TagBadges · FilterChips    src/components/ui/ toggle-group · radio-group (shadcn)
src/features/projects/ project-list.ts coordinates.ts ProjectMenu DeleteProjectDialog EditProjectDialog (+ page parts)
src/features/files/    SchedulesTable ScheduleMenu ScheduleDetailsDialog DeleteScheduleDialog codes.ts (+ page parts)
src/features/import/   ImportScheduleDialog FileStep ColumnsStep ReviewStep ReportView ImportReportDialog
src/hooks/ useProjectSchedules.ts useImportParser.ts useImportReport.ts · src/lib/search.ts · src/pages/ProjectsPage.tsx ProjectFilesPage.tsx
supabase/migrations/<ts>_p3_core_{projects,schedules,imports}.sql · supabase/tests/{08_projects,09_schedule_tags,10_imports}.test.sql
vendor/xlsx-0.20.3.tgz · scripts/third-party-licenses.mjs (+ test) make-xlsx-fixtures.ts read-real-exports.ts (+ test)
integration/projects.itest.ts imports.itest.ts
```

**New dependencies** (the closed list): `fast-xml-parser` 5.x, at least 5.3.5 (MSPDI; MIT); `papaparse` 5.x + `@types/papaparse` (CSV; MIT); `xlsx` 0.20.3 from `vendor/` (SheetJS CE; npm's 0.18.5 has two CVEs; reading only; Apache-2.0 with NOTICE); `fflate` 0.8.x (zip guard, gzip of stored originals and their download; MIT); `@tanstack/react-table` 8.x (`DataTable`, the roadmap's grid library for P4; MIT). ExcelJS and Comlink are not used (P3 full §3). **Licence notices** (P3 full §3): `scripts/third-party-licenses.mjs` runs after every build and writes `dist/third-party-licenses.txt` from `npm ls --omit=dev --all --json` (name, version, licence, licence and NOTICE files), P1 and P2 dependencies included; it is served at `/third-party-licenses.txt`; a UI link waits for P7.

**Plan constraints.** CLAUDE.md and the Phase 2 plan's Global Constraints (`2026-10-15-phase2-supabase.md` lines 13–58) hold, with these specifics: every task ends with the five suites of §2.4 green (D36); P2 migrations are never edited, the three new ones are created with `npx supabase migration new`; `npm run db:types` runs in the same commit as each schema change; every migration ends by revoking `execute` on each function it creates from `public, anon, authenticated` and granting only the RPCs of §4.8; its dependency bullet is replaced by this section's closed list; Docker isn't on the Git Bash PATH, so Bash blocks that run the Supabase CLI or `docker` start with `export PATH="/c/Program Files/Docker/Docker/resources/bin:$PATH"`; adapter copy ends with a period, form copy doesn't; `MOCK_DB_VERSION` 3; seed emails `@example.com`, pgTAP emails `@test.dev`; nothing under `real-exports/` is read before V9, copied or committed (D2).

---

## 4. Data model

### 4.1 Changes to `src/data/types.ts`

```ts
export type ProjectStatus = 'active' | 'on_hold' | 'completed' | 'cancelled';
export type ProjectStage = 'pursuit' | 'preconstruction' | 'construction' | 'closeout' | 'completed';
export type ProjectType = 'building' | 'residential' | 'infrastructure' | 'industrial'
  | 'energy' | 'transportation' | 'water' | 'other';                  // three values added
export type ProjectSector = 'public' | 'private' | 'public_private';   // ownership (D2)
export interface ProjectAttributes {             // status (default 'active'), stage and sector are new
  status: ProjectStatus; stage: ProjectStage | null; projectType: ProjectType | null; sector: ProjectSector | null;
  startDate: ISODate | null; plannedFinishDate: ISODate | null;
}
export interface ProjectLocation {               // latitude, longitude new: WGS 84 decimal degrees, both set or both null
  address: string | null; city: string | null; country: string | null; latitude: number | null; longitude: number | null;
}
export interface ProjectSummary extends Project {
  scheduleCount: number;                         // schedules that aren't archived (was: all)
  totalScheduleCount: number;                    // new: archived included (Delete project dialog)
  currentSchedule: { id: ID; name: string } | null;   // new
}
export type ImportFormat = 'xer' | 'mspdi' | 'xlsx' | 'csv';
export type BaselineFlag = 'none' | 'baseline' | 'primary';
export interface Schedule {                      // the app map's ScheduleVersion (P3 full D2)
  /* P2 fields unchanged: id, projectId, name, statusDate, source, sourceFileName, createdAt, updatedAt */
  code: string | null;                           // required from the core on (R8); P2-era rows null until edited
  notes: string | null; isCurrent: boolean; baseline: BaselineFlag; updateNumber: number | null;
  archivedAt: ISODateTime | null;
  activityCount: number;                         // 0 for blank schedules; set by import; P4 maintains it later
  sourceFormat: ImportFormat | null;             // null exactly when source === 'blank' (P2 imports backfilled, §4.6)
  hasImportReport: boolean; hasImportMapping: boolean;   // false for blank schedules and P2-era imports (§5.8)
}
```

The parser's types follow in one block at the end of the file, copied from P3 full §4.1 unchanged; `src/import` names them with `import type` only:

```ts
export type TextEncodingName = 'utf-8' | 'utf-16le' | 'utf-16be' | 'windows-1254' | 'windows-1252';
export type ImportField = 'code' | 'taskId' | 'name' | 'wbs' | 'duration' | 'start' | 'finish' | 'actualStart'
  | 'actualFinish' | 'activityType' | 'calendar' | 'constraintType' | 'constraintDate' | 'percentComplete'
  | 'predecessors' | 'notes';
export type ImportDateFormat = 'DD.MM.YYYY' | 'DD/MM/YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD';
export interface TableMapping {
  sheet: string | null; headerRow: number;       // sheet: xlsx; header row 1-based, 1–50
  delimiter: ',' | ';' | '\t' | null;            // csv
  decimalSeparator: ',' | '.'; dateFormat: ImportDateFormat;
  durationUnit: 'days' | 'hours'; hoursPerDay: number;   // the unit of numbers without one (§5.7); 1–24
  predecessorRef: 'code' | 'taskId';             // what predecessor tokens name (§5.7)
  skipRowsWithIssues: boolean;                   // false: bad cells are left empty; true: the whole row is skipped
  columns: Partial<Record<ImportField, { index: number; header: string }>>;
  assumptions: TableAssumptions;                 // fixed, stored so P4 never guesses (§5.8)
}
export interface TableAssumptions {              // all values fixed in schemaVersion 1
  duration: 'original'; startFinish: 'planned'; percentComplete: 'duration'; dateOnlyStart: '08:00';
  dateOnlyFinish: '17:00'; weekUnitDays: 5;
  defaultWorkWeek: 'mon-fri';                    // calendars made from names: Mon–Fri from 08:00, hoursPerDay hours, 1 h break at 12:00 when hoursPerDay > 4; longer than 15 h starts earlier (D61)
}
export interface ImportMapping {                 // everything P4 needs to read the file again
  schemaVersion: 1; format: ImportFormat;
  encoding: TextEncodingName | null;             // xer, csv
  sourceProjectId: string | null;                // xer: the PROJECT.proj_id this schedule was made from
  activityCodeField: string | null;              // mspdi: 'UID', 'ID' or 'Text1'…'Text30'
  table: TableMapping | null;                    // xlsx, csv
}
export type ImportIssueSeverity = 'error' | 'warning' | 'info';
export interface ImportIssue {                   // every text field at most 200 characters (§5.10)
  severity: ImportIssueSeverity; code: string; message: string;
  location: string | null;                       // "TASK line 812" · "Task UID 41" · "Sheet1!B12" · "Line 40"
  original: string | null; used: string | null;
}
export interface ImportCount { entity: 'calendar' | 'wbs' | 'activity' | 'relationship'; read: number; accepted: number; adjusted: number; skipped: number; }
export type ImportOutcome = 'used' | 'kept' | 'not_read';
export type ImportCheckId = 'actual_after_status_date' | 'progress_without_actual_start'
  | 'complete_without_actual_finish' | 'status_date_fallback' | 'ambiguous_milestones' | 'percent_lags'
  | 'links_on_summaries' | 'external_links' | 'project_dates_differ';
export interface ImportReport {
  schemaVersion: 1; parserVersion: string; format: ImportFormat;
  formatVersion: string | null;                  // XER ERMHDR version, MSPDI SaveVersion
  file: { name: string; size: number; sha256: string };
  formatFromContent: boolean;                    // true when the extension named another format (§5.2)
  activityCodeField: string | null;              // mspdi; null for other formats
  sourceProject: { id: string | null; code: string | null; name: string | null; projectsInFile: number;
    rootWbsName: string | null; mustFinishBy: ISODate | null; stated: { start: ISODate | null; finish: ISODate | null } };
  encoding: { name: TextEncodingName; detectedBy: 'bom' | 'utf8' | 'byte-score' | 'user' } | null;
  table: Omit<TableMapping, 'columns'> | null;
  statusDate: { date: ISODate | null; time: string | null; source: 'file' | 'earliest-start' | 'user' | 'none' };
  dateRange: { start: ISODate | null; finish: ISODate | null };   // span of the accepted activities
  units: { minutesPerDay: number | null; calendars: Array<{ name: string; hoursPerDay: number }> };
  settings: Array<{ key: string; value: string }>;   // source scheduling options kept for P4
  counts: ImportCount[];
  breakdown: { activitiesByType: Array<{ type: string; count: number }>; activitiesStarted: number;
    activitiesCompleted: number; relationshipsByType: Array<{ type: 'FS' | 'SS' | 'FF' | 'SF'; count: number }>;
    constraints: number; calendarExceptions: number };
  outcomes: Array<{ element: string; outcome: ImportOutcome; items: number }>;
  checks: Array<{ id: ImportCheckId; findings: number }>;   // every check, 0 included
  externalLinks: Array<{ target: string; links: number }>; notImported: Array<{ table: string; rows: number }>;
  issueTotals: Record<ImportIssueSeverity, number>;        // always exact
  issues: ImportIssue[];                         // errors, warnings, then notes; stored: §5.10 caps
  durationMs: number;                            // left out of golden comparisons, as is parserVersion
}
```

`Schedule` and `schedules` keep their names (P3 full D2); the UI says "schedule" everywhere.

### 4.2 `DataRepository` changes

```ts
export type CoverChange = 'keep' | 'remove' | File;
// NewProjectInput keeps its P2 shape; its attributes and location carry the §4.1 fields.
export interface UpdateProjectInput {
  projectId: ID; code: string; name: string; description: string | null; cover: CoverChange;
  statusDate?: ISODate | null;                  // left out while the project has a current schedule (R6)
  attributes: ProjectAttributes; client: ProjectClient; location: ProjectLocation;
}
export interface NewScheduleInput { projectId: ID; name: string; code: string; }
export interface ImportScheduleInput {
  projectId: ID; name: string; code: string; file: File;
  stored: Blob;                                 // from the worker's pack: gzip of the file for xer, mspdi and csv; the file itself for xlsx
  statusDate: ISODate | null;                   // null takes the project's (P2)
  activityCount: number; sourceProjectCode: string | null;
  mapping: ImportMapping; report: ImportReport; // the stored report (§5.10); parserVersion, format and sha256 are read from it
}
export interface UpdateScheduleDetailsInput {
  scheduleId: ID; name: string; code: string; statusDate: ISODate | null;
  notes: string | null; baseline: BaselineFlag; updateNumber: number | null;
}

getProject(projectId: ID): Promise<ProjectSummary>;                  // 'not_found' when unknown (or hidden, Supabase only)
updateProject(input: UpdateProjectInput): Promise<Project>;          // 'conflict' on a taken code; R6; viewers 'forbidden'
deleteProject(projectId: ID): Promise<void>;                          // owners; R12; removes stored files and the cover
listSchedules(projectId: ID): Promise<Schedule[]>;                   // archived included; status date desc nulls last, createdAt desc, id
updateScheduleDetails(input: UpdateScheduleDetailsInput): Promise<Schedule>;
setCurrentSchedule(scheduleId: ID): Promise<void>;
setSchedulesArchived(input: { scheduleIds: ID[]; archived: boolean }): Promise<void>;   // R9
deleteSchedules(scheduleIds: ID[]): Promise<void>;                   // owners; R9; removes stored files too
getImportReport(scheduleId: ID): Promise<ImportReport | null>;       // null for blank schedules and P2-era imports
getImportMapping(scheduleId: ID): Promise<ImportMapping | null>;     // same nulls; 'not_found' when unknown (or hidden, Supabase only) (P4 hand-over)
getScheduleSourceFile(scheduleId: ID): Promise<File>;               // the original bytes under the original name (P4 hand-over)
```

`createSchedule` and `importSchedule` take the extended inputs; other methods keep their P2 contract. `listProjects` keeps its P2 order; the page sorts in the browser. `getScheduleSourceFile` on a schedule without a stored file rejects `validation` "This schedule has no original file." (our call). During the interim path (§2.4) the import fields after `file` are optional. **Hidden rows** (our call, D34): both adapters answer `not_found` for an unknown id; `not_found` for a row that RLS hides is Supabase-only, because the mock doesn't filter by membership (P2 D26) and its seed holds no workspace the test user can't see (§7).

### 4.3 Rules both adapters enforce

Each rule is enforced by the database and by the mock with the same code and copy; the contract checks both. A `forbidden` refusal shows P2's copy "You don't have permission to do that." (P3 full §4.3).

| # | Rule | Error (code — copy) |
|---|---|---|
| R1 | A project with schedules has exactly one current schedule. The first schedule of a project becomes current; `setCurrentSchedule` moves the flag in one transaction | — |
| R2 | The current schedule is never archived | `validation` — "Make another schedule current before archiving this one." |
| R3 | A delete never leaves a project with schedules but no current one: the current schedule is deleted only together with every other schedule of its project, or alone when it is the only one; checked on the state after the whole delete | `validation` — "Make another schedule current before deleting this one." |
| R4 | An archived schedule can't become current | `validation` — "Restore this schedule before making it current." |
| R5 | At most one primary baseline per project; making one primary turns the old primary into a plain baseline; a schedule that turns from "not a baseline" into a baseline while the project has no primary becomes the primary one | `conflict` — "Another change was saved at the same time. Refresh and try again." (two promotions racing) |
| R6 | While a project has a current schedule, the project's status date equals that schedule's (set when it becomes current and whenever its status date changes); `updateProject` leaves the status date alone when its input has none, and a different value is refused | `validation` — "The status date follows the current schedule." |
| R7 | Update numbers are 1–999 and unique per project; the details dialog suggests one in status-date order (§6.4) | `conflict` — "This update number is already used in this project." |
| R8 | Schedule codes match `^[A-Za-z0-9_.-]{1,24}$` and are unique per project, ignoring case. Every schedule created from the core on (new or imported) has one and a code can't be cleared; P2-era schedules keep `null` until someone saves their details, which requires a code and starts with the §6.4 suggestion; archive and make current leave a missing code alone (P3 full R8, D59) | `conflict` — "This code is already used in this project." · `validation` — "Enter a schedule code." |
| R9 | `setSchedulesArchived` and `deleteSchedules` are all-or-nothing, take 1–500 ids from one project, fail when any id is missing or hidden, and are refused whole when the caller lacks the role (P3 full R12; the UI passes one id, D13) | `validation` — "Select 500 schedules or fewer." · "Select schedules from one project." · "Some schedules are no longer available. Refresh and try again." · `forbidden` |
| R10 | Roles (P2 D7): viewers and share recipients read; editors create and edit projects and schedules, import, make current, tag, archive and restore; only owners delete schedules (P2 §7.1) and projects (P3 full D42, D43). Every refusal is `forbidden`, raised explicitly wherever RLS would only filter rows out (§4.7) | `forbidden` |
| R11 | A schedule's `updatedAt` ("Last modified") changes when a write names any of name, code, notes, status date, baseline, update number or archived, even with an unchanged value, R5's demotion included; making a schedule current and P4's later refreshes leave it alone. A project's `updatedAt` changes on `updateProject` and when a schedule is added (P2); R6's sync leaves it alone, so Home's Recent projects order isn't moved by automatic writes (P3 full R15) | — |
| R12 | **Deleting a project** (owners): its schedules and their shares go in one transaction, and its stored originals and cover are removed afterwards (best effort, as P2's import cleanup) (P3 full R19 without its folder, visit, version and lock parts) | `forbidden` · `not_found` |

### 4.4 Hooks and query keys

| Hook | Query key | Invalidates on settle |
|---|---|---|
| `useProject(workspaceId, projectId)` | `['projects', ws, 'detail', projectId]` | — |
| `useUpdateProject()` | — | `projects(ws)`, `sharedWithMe()`, `workspaces()`; a new cover is shrunk first, as in `useCreateProject` |
| `useDeleteProject()` | — | `projects(ws)`, `allSchedules()`, `sharedWithMe()`, `workspaces()`; removes `project(ws, id)` from the cache |
| `useProjectSchedules(projectId)` | `['schedules', projectId, 'list']` | — |
| schedule mutations (details, current, archive, delete), `useCreateSchedule`, `useImportSchedule` | — | `allSchedules()`, `allProjects()`, `sharedWithMe()` (P2's prefix invalidation; their inputs name no workspace) |
| `useImportReport(scheduleId)` | `['import-report', scheduleId]` | — (`staleTime: Infinity`; a report never changes in the core) |
| `useDownloadSourceFile()` | — | mutation: gets the original `File` and saves it under its name |
| `useDownloadImportReport()` | — | mutation `{ report, scheduleName, format: 'csv' \| 'json' }`: loads `csv-export.ts` with `import()`, builds the file and saves it under §5.9's name; on failure the toast "The report couldn't be downloaded. Try again." |
| `useImportParser()` | — | owns one worker session; terminates it on unmount (§5.3) |

New builders in `query-keys.ts`: `allSchedules()` → `['schedules']`, `schedules(projectId)` → `['schedules', projectId]`, `projectSchedules(projectId)`, `project(ws, id)`, `importReport(id)`.

### 4.5 Mock adapter

- `MOCK_DB_VERSION` and `MockDb['version']` become `3` (key `mock-db.v1` unchanged; a stored document of another version reseeds, as in P2). Projects and schedules gain the §4.1 fields; schedules also keep `importMapping` and `importReport` (`hasImport…` derived from them when read, as `schedule_items` does), the report with its first 50 issues only so twenty imports fit `localStorage` (P3 full D23). Original files live in an in-memory `Map<scheduleId, File>` that is not persisted; after a page reload `getScheduleSourceFile` rejects `validation` "The original file isn't available in demo mode after a reload." (not in the contract).
- R1–R9 and R11 live in pure functions in `src/data/mock/schedule-rules.ts`, unit-tested; every write applies them to the state the whole write would leave (R3 is set-based) before one `commit`.
- Seed (`default`; every name fictional; countries "Türkiye"; status dates in days before seed; activity counts 0, every seed schedule is blank):

| Project | Status · stage · type · sector | Client · city · coordinates | Schedules (code · tags · status date) |
|---|---|---|---|
| 001 Riverside Office Tower | active · construction · building · private | Riverside Holding · Istanbul · 41.0151, 28.9795 | Main schedule (MS-01 · current · 2) |
| 002 Metro Line Extension | active · preconstruction · transportation · public | City Transit Office · Ankara · 39.9334, 32.8597 | — |
| 003 Harbor Logistics Hub | active · construction · industrial · private | Aegean Ports · Izmir · 38.4192, 27.1287 | Baseline (BL-01 · primary baseline · 60); Update 1 (UP-01 · update 1 · 30); Update 2 (UP-02 · update 2 · current · 7 · notes "Includes the revised crane plan.") |
| 004 Campus Library Retrofit | on_hold · construction · building · public | Northfield University · Istanbul · none | Baseline (BL-01 · primary baseline · 120); Recovery plan (RP-01 · current · 14 · notes "Agreed with the client on site."); Recovery plan draft (RP-00 · archived 10 days before seed · 30) |
| 005 Northgate Bridge Repair | completed · completed · infrastructure · public | Regional Roads Office · Bursa · 40.1828, 29.0663 | Baseline (BL-01 · current · primary baseline · none) |
| 006 Old Mill Housing | active · pursuit · residential · private | Millstone Homes · none · none | — |
| T-01 Tunnel Ventilation Upgrade | active · construction · infrastructure · public | Tunnel Operations Agency · Istanbul · 41.0422, 29.0083 | Baseline rev. 3 (BL-03 · primary baseline · 90); Look-ahead W42 (LA-42 · current · 3) |

  Every project's status date equals its current schedule's (R6), which P2's seed already gives; 002 and 006 keep theirs. 004 has `scheduleCount` 2 and `totalScheduleCount` 3. "Recovery plan draft" is new (it gives "Show archived" its data). `integration/seed-loader.ts` loads the same rows, setting codes, tags, notes and `archived_at` through the admin client, whose calls the user-call guards skip (§4.7).

### 4.6 Schema

Three new migrations (P2's are not edited); the error mapping reads the named constraints.

| Migration | Changes |
|---|---|
| `p3_core_projects` | `projects`: `status text not null default 'active' check (status in ('active','on_hold','completed','cancelled'))`; `stage text check (stage in ('pursuit','preconstruction','construction','closeout','completed'))`; `sector text check (sector in ('public','private','public_private'))`; `projects_project_type_check` dropped and re-added with the eight values; `location_lat numeric(8,6) check (location_lat between -90 and 90)`, `location_lng numeric(9,6) check (location_lng between -180 and 180)`, `constraint projects_location_pair_check check ((location_lat is null) = (location_lng is null))`. P2's `projects_set_updated_at` dropped and recreated as `before update of` every column users may update except `status_date` (R11), still running `app.set_updated_at()` (our call: P3 full's `app.set_project_updated_at()` depth check serves programs only). `project_summaries` dropped and recreated (its `p.*` was expanded at creation) with `schedule_count` and `total_schedule_count`, both P2's count until the next migration (until then the mapper reads `currentSchedule` as null). `delete_project` (§4.7) |
| `p3_core_schedules` | `schedules`: `code text check (code ~ '^[A-Za-z0-9_.-]{1,24}$')` + unique index `schedules_project_code_uq (project_id, lower(code)) where code is not null`; `notes text check (char_length(notes) <= 2000)`; `is_current boolean not null default false` + unique index `schedules_one_current_uq (project_id) where is_current`; `baseline text not null default 'none' check (baseline in ('none','baseline','primary'))` + unique index `schedules_one_primary_uq (project_id) where baseline = 'primary'`; `update_number int check (update_number between 1 and 999)` + unique index `schedules_project_update_uq (project_id, update_number)`; `archived_at timestamptz` + `check (not (is_current and archived_at is not null))`; `activity_count int not null default 0 check (activity_count between 0 and 20000)`. P2's `schedules_set_updated_at` recreated as `before update of name, code, notes, status_date, baseline, update_number, archived_at` (R11). The §4.7 triggers and RPCs; `project_summaries` recreated with `schedule_count` (`archived_at is null`), `total_schedule_count` (all), `current_schedule_id`, `current_schedule_name`; view `schedule_items` |
| `p3_core_imports` | `schedules`: `source_format text check (source_format in ('xer','mspdi','xlsx','csv'))` + `check ((source = 'import') = (source_format is not null))` (added after the backfill); `source_file_size bigint check (source_file_size between 1 and 20971520)`; `source_file_sha256 text check (source_file_sha256 ~ '^[0-9a-f]{64}$')` (of the original, uncompressed bytes); `source_project_code text check (char_length(source_project_code) <= 100)`; `parser_version text check (char_length(parser_version) <= 20)`; `import_mapping jsonb check (jsonb_typeof(import_mapping) = 'object' and octet_length(import_mapping::text) <= 16384)`; `import_report jsonb check (jsonb_typeof(import_report) = 'object' and octet_length(import_report::text) <= 262144)`; unique index `schedules_source_file_path_uq (source_file_path) where source_file_path is not null`. `prepare_new_schedule` replaced with the path rule; `schedule_items` recreated; the storage delete policy (§4.9) |

`schedules.status_date` stays a `date` (P3 full D6); the file's time of day is kept in the report.

**Existing rows** (D18, keeping P3 full §4.6's backfills and its D30): production may hold P2 data. `p3_core_schedules` calls `app.backfill_current_schedules()`: in every project with schedules and none current, the schedule with the latest `status_date` (nulls last), then the latest `created_at`, then the highest id becomes current and the project's `status_date` takes its value (R6); R11's column lists keep `updated_at` unchanged. `p3_core_imports` calls `app.backfill_import_formats()` before adding its check: `source_format` from the extension of `source_file_name` (`.xer` → `xer`, `.xml` → `mspdi`, `.csv` → `csv`, the only types P2 accepted); any other extension raises an error naming the rows, so the owner decides before the migration goes on. P2-era imports keep mapping, report, parser version, size and hash null (§5.8).

### 4.7 Functions, triggers and views

Every function follows P2 §6.6: `p_` parameters; definer and trigger functions `security definer set search_path = ''` with qualified names; invoker functions also `set search_path = ''`; user-facing errors `check_violation` + `hint = 'app'`; permission errors `insufficient_privilege`; a project an invoker RPC can't see raises `no_data_found` (P0002), `hint = 'app'`, "Project not found" (the P3a plan's reading of P3 full §4.7). **Role checks in invoker RPCs:** RLS refuses an insert with 42501 but only filters an update or delete, so each invoker RPC checks the role itself before writing, against `app.my_project_ids('editor')` (`'owner'` for `delete_schedules` and `delete_project`), and compares the affected row count with the id count afterwards, raising `insufficient_privilege` on a difference. Order in the array RPCs: R9 count and one project → R9 all found (a select under RLS) → role check → write.

| Function | Security | Behavior |
|---|---|---|
| `app.prepare_new_schedule()` — `before insert on schedules` | definer trigger | definer triggers run before RLS's insert check, so when `(select auth.uid())` is not null it first refuses a caller who isn't an editor or owner of the row's project with `insufficient_privilege` (42501, as RLS would; our call, D35); then it locks the project row (`for update`), sets `is_current := not exists (other schedules of the project)` and, for a user call, refuses a missing `code` (R8). From `p3_core_imports` on, it also refuses a `source_file_path` other than `{workspace_id}/{project_id}/{uuid}.{xer\|xml\|csv}.gz` or `{…}/{uuid}.xlsx` for the row's project, with the extension matching `source_format` |
| `app.guard_schedule_update()` — `before update on schedules` | definer trigger | when `(select auth.uid())` is not null: R2 (archiving the current one); R4 on `is_current` false → true; a non-null `code` set to null (R8) |
| `app.apply_baseline()` — `before insert or update of baseline on schedules` | definer trigger | R5 for every caller |
| `app.check_current_after_delete()` — `after delete on schedules`, for each statement, `referencing old table as deleted_rows` | definer trigger | R3: raises when a project of `deleted_rows` still exists, still has schedules and has none current (a project's own cascade passes) |
| `app.sync_project_status_date()` — `after insert or update of is_current, status_date on schedules` | definer trigger | R6: when the row is current, sets `projects.status_date` to its status date if different (not a column of the projects trigger, so `updated_at` stays, R11) |
| `app.guard_project_status_date()` — `before update of status_date on projects` | definer trigger | R6: refuses a value different from the current schedule's |
| `app.backfill_current_schedules()`, `app.backfill_import_formats()` | definer | §4.6; called by the migrations, executable by no API role |
| `public.delete_project(p_project_id uuid) returns table (bucket text, path text)` | invoker | not visible → P0002; role check (owner); collects the schedules' `source_file_path`s and the cover path, then `delete from projects` (cascade to schedules and shares); the adapter removes the objects |
| `public.set_current_schedule(p_schedule_id uuid) returns void` | definer | editor of the project's workspace, else `insufficient_privilege`; R4; locks the project's schedule rows `for update`; clears the old current, sets the new one |
| `public.update_schedule_details(p_schedule_id uuid, p_name text, p_code text, p_status_date date, p_notes text, p_baseline text, p_update_number int) returns void` | invoker | not visible → R9 "no longer available"; role check (editor); trims text (empty → null); an empty `p_code` → R8 "Enter a schedule code."; validates `p_baseline`; one `update` (R5 by trigger) |
| `public.set_schedules_archived(p_schedule_ids uuid[], p_archived boolean) returns void` | invoker | R9, role check (editor), then one `update … set archived_at = case when p_archived then coalesce(archived_at, now()) end` |
| `public.delete_schedules(p_schedule_ids uuid[]) returns setof text` | invoker | R9, role check (owner), then `delete … returning source_file_path` (R3 by the statement trigger) |

Views (`security_invoker = true`; select to `authenticated`, all to `service_role`): **`project_summaries`** (§4.6). **`schedule_items`** lists schedule columns explicitly, never `import_mapping`, `import_report` or `source_file_path`, and from `p3_core_imports` on adds `source_format`, `has_import_report` (`import_report is not null`) and `has_import_mapping` (`import_mapping is not null`).

### 4.8 Grants

- **`projects`:** P2's table-level insert stays and covers the new columns; the column-level update grant adds `status, stage, sector, location_lat, location_lng` (our call, D40). `02_privileges` keeps its `projects` table assertion and adds one per new column (`INSERT`, `SELECT`, `UPDATE`).
- **`schedules`:** P2's table-level insert is replaced by a column-level insert on `project_id, name, status_date, source, source_file_name, source_file_path, code, notes, baseline, update_number`, plus `source_format, source_file_size, source_file_sha256, source_project_code, parser_version, import_mapping, import_report, activity_count` from `p3_core_imports`; column update on `name, status_date, code, notes, baseline, update_number, archived_at`. Never granted: `id`, `is_current`, `created_at`, `updated_at`, `project_id` (update) and every `source_*`, `import_*`, `parser_version` and `activity_count` column (update).
- **Functions:** the five RPCs of §4.7 to `authenticated`; pgTAP `02_privileges` pins nine `public` RPCs (P2's four plus these) and the two RLS helpers; the `app` functions and triggers are executable by no API role.

### 4.9 Row-level security and storage

No new tables; P2's policies on `projects`, `schedules` and `schedule_shares` stand. Storage: no new bucket; `schedule-imports` keeps P2's size limit and read and insert policies. New objects are stored as `{workspace_id}/{project_id}/{uuid}.{xer|xml|csv}.gz` (gzip) or `{…}/{uuid}.xlsx`; the insert trigger refuses any other path for the row's project, and `schedules_source_file_path_uq` keeps each object to one schedule. `p3_core_imports` replaces P2's `schedule_imports_delete` (P3 full §4.9): owners of the workspace in the first path segment delete any object; an editor deletes only an object they uploaded (`owner_id = (select auth.uid())::text`, V7) that no `schedules.source_file_path` names, which is P2's cleanup after a failed insert. So no editor can remove an original P4 will read. Deleting schedules or a project removes their objects after the database delete (best effort).

### 4.10 Supabase adapter

**Writes RLS only filters:** an update that returns no row reads the row by id: visible → `forbidden`; not visible → `not_found` (`updateProject`).

| Method | Implementation |
|---|---|
| `getProject` | `project_summaries` by id (PGRST116 → `not_found`), cover signed with P2's batch helper |
| `updateProject` | a cover `File` → upload the prepared image (P2 §8.3), update the row, then delete the old object (best effort); `'remove'` → path null, then delete the old object; `toProjectUpdate` mirrors `toProjectInsert` and leaves `status_date` out when `statusDate` is absent (R6) |
| `deleteProject` | `rpc('delete_project')`, then `storage.remove` per bucket, ignoring errors |
| `listSchedules` | `schedule_items` by project, `order status_date desc nulls last, created_at desc, id` |
| `updateScheduleDetails`, `setCurrentSchedule`, `setSchedulesArchived` | RPCs; `updateScheduleDetails` then reads the row from `schedule_items` |
| `deleteSchedules` | `rpc('delete_schedules')`, then `storage.remove(paths)` ignoring errors |
| `createSchedule` | P2 flow with `code`; reads the row from `schedule_items` |
| `importSchedule` | uploads `input.stored` to the §4.9 path, inserts with `code`, `status_date`, `activity_count`, `source_format` (`report.format`), `source_file_size` (`file.size`), `source_file_sha256` (`report.file.sha256`), `source_project_code`, `parser_version`, `import_mapping` and `import_report`; removes the upload when the insert fails; reads the row from `schedule_items`. During the interim path (§2.4) it derives `source_format` from the extension and gzips the file itself |
| `getImportReport` / `getImportMapping` | `schedules.import_report` / `import_mapping` by id (`maybeSingle`; no row → `not_found`) |
| `getScheduleSourceFile` | reads `source_file_path` and `source_file_name`; `storage.download(path)`; a `.gz` path is decompressed with `fflate` loaded by `import('fflate')`; returns `new File([bytes], source_file_name)` |

`mappers.ts` gains `mapScheduleItem` (replaces `mapSchedule`; `baseline` text → `BaselineFlag`), `numeric` coordinates → `number`, `toProjectUpdate`; `projectFrom` takes the recreated view's row type and carries the new columns.

### 4.11 Error mapping additions (`toRepositoryError`)

| Source | Code — message |
|---|---|
| 23505 on `schedules_project_code_uq` / `schedules_project_update_uq` | `conflict` — R8 / R7 copy |
| 23505 on `schedules_one_primary_uq` / `schedules_one_current_uq` (two writes racing) | `conflict` — "Another change was saved at the same time. Refresh and try again." |
| P0002 with `hint = 'app'` | `not_found` — the raised message |

`errorMessage()` is unchanged: `conflict` and `validation` show the adapter's message; `forbidden` shows P2's copy.

---

## 5. Import pipeline

### 5.1 Flow

1. **File step:** the destination project is fixed when the dialog opens from the files page and chosen first when it opens from Home (import never creates a project). The user adds one file (picker or drop); the dialog checks its extension and size (§6.5), then `useImportParser().inspect(file)` reads it.
2. **Worker `inspect`:** reads the bytes, detects the format from the content (§5.2) and the encoding (§5.4), computes SHA-256, and returns either the projects in the file (XER, MSPDI) or the sheets, a header guess, an automatic mapping and the first 10 rows (xlsx, CSV). A refused file shows its message under the dropzone with "Copy details" and can't go on.
3. **Columns step** (xlsx and CSV only): the user confirms options and the mapping; the worker re-reads the preview on each change.
4. **Worker `analyze(mapping, { statusDate })`:** builds the `ImportModel` (§5.8) for one source schedule (the file, or one project of an XER), runs the checks against the status date it is given and returns the dry-run report with up to 5,000 issues.
5. **Review step:** for an XER holding several projects, the step lists one row per project, each with a radio button; every row is analyzed so its issues show, and a row with errors can't be chosen. At first the step chooses the first row without errors in this order: the projects P6 flagged for export, in file order, then the others in file order (D15); only when every row has errors is none chosen. Then, for the chosen schedule: Name, Code, Status date and its details. Changing the encoding (XER), the activity-code field (MSPDI) or the status date runs `analyze` again; the checks use the status date the schedule will get, which is the field's value, or the project's when the field is empty, so the stored checks match the schedule (D37).
6. **Commit:** the worker's `pack` returns the stored copy (the file gzipped for XER, MSPDI and CSV; xlsx as it is, P3 full D29) and the stored report (§5.10); `importSchedule` uploads it and inserts the schedule with its code, activity count, mapping and report. No parsed rows are written in P3 (D6). The 60 s client timeout (P2 D18) covers one upload and one write.
7. **Afterwards:** the toast "Schedule imported" with the action "View report", and the app opens the project's files page (P3 full D22).

Import is one file per run and always creates a new schedule; replace, reload and several files wait for "Phase 3 later" (D15).

### 5.2 Formats and detection

The dropzone takes files named `.xer`, `.xml`, `.xlsx` or `.csv`, and `.mpp` and `.xls` only to refuse them with their messages below. The format then comes from the content, checked in this order on the first bytes after any byte-order mark (P3 full §5.2, D46):

| Content | Format, or refusal message |
|---|---|
| starts with `ERMHDR` | `xer` |
| `<?xml` or `<`, root element `Project` in namespace `http://schemas.microsoft.com/project`; or a root `Project` in no namespace whose first 64 KB hold a `<Tasks>` or `<Calendars>` element (`MSPDI_NO_NAMESPACE`, D52) | `mspdi` |
| XML whose root element is `APIBusinessObjects` (Primavera P6 XML) | "This is a Primavera P6 XML file. In P6, export the project as XER and import that." |
| any other XML | "This XML file isn't a Microsoft Project XML file." |
| `PK\x03\x04` with `xl/workbook.xml` in the archive | `xlsx` |
| any other zip archive | "This file isn't a readable Excel workbook." |
| `D0 CF 11 E0 A1 B1 1A E1` (a compound file) holding an `EncryptionInfo` stream | "This workbook is protected with a password. Remove the password in Excel, save it and import it again." |
| a compound file named `.mpp`, or holding Microsoft Project streams | "MPP files can't be imported. In Microsoft Project, save the file as XML and import that." |
| any other compound file (an `.xls` workbook among them) | "Older Excel workbooks (.xls) can't be imported. In Excel, save the file as .xlsx and import that." |
| starts with `SQLite format 3` | "This is a database file, not a schedule export. Export the project as XER from P6 or as XML from Microsoft Project." |
| text in a supported encoding, in a file named `.csv` | `csv` |
| anything else | "This file type can't be imported. Use a P6 XER, a Microsoft Project XML, an Excel .xlsx or a CSV file." |

A supported format under another format's extension is read as what it holds, with `FORMAT_FROM_CONTENT`. A file that passes detection but can't be read through (cut short, `%R` before `%F`, malformed XML, nesting deeper than 100 levels, a workbook part SheetJS can't parse) gives `FILE_UNREADABLE`, except an xlsx whose archive can't be inflated through safely, which gets "This file isn't a readable Excel workbook." and never reaches a report (P3 full D61, D69). The parser's entry points catch everything: any file gives a report or a pinned message, never an exception or a hang.

### 5.3 Where parsing runs

- **A module Web Worker** (`new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })`), started by `useImportParser` when the dialog opens and terminated when it closes; it keeps the file's bytes between `inspect`, `preview`, `analyze` and `pack`.
- **Protocol** (`protocol.ts`): `inspect`, `preview`, `analyze`, `pack`, `cancel`; each request carries an id; responses are `{ ok: true, result } | { ok: false, issue }`; results are plain JSON, except `pack`'s bytes, which are transferred.
- **Watchdog:** 30 s per request; on expiry the client terminates the worker and reports "This file took too long to read. Try a smaller export." Edge Functions are not used (their CPU limit is far below what a 20 MB file needs).
- **Fallback:** where `Worker` is missing (jsdom), `client.ts` runs the same functions in the calling thread through `import('./in-thread')`; tests use this path.

### 5.4 Encoding, numbers, durations, dates and matching

P3 full §5.4 applies unchanged; in short:

- **Encoding (XER, CSV):** a byte-order mark decides (UTF-8, UTF-16 LE/BE) and can't be overridden. Otherwise `TextDecoder('utf-8', { fatal: true })` succeeding means UTF-8; when at least one multi-byte sequence is valid and at least 99 % of the bytes above `0x7F` belong to valid sequences, it is UTF-8 with the rest as U+FFFD (`ENCODING_INVALID_BYTES`); otherwise a single-byte page is chosen by scoring `0xD0 0xDD 0xDE 0xF0 0xFD 0xFE` (Turkish letters in Windows-1254) against `0x8E 0x9E` (Windows-1252 only), defaulting to Windows-1254 (`ENCODING_GUESSED`), which also reads ISO-8859-9. The detected value and how it was found go into the report; the user overrides any encoding not set by a byte-order mark (CSV in the Columns step, whose preview shows decoded names; XER in the Review step, which shows the first five activity names as decoded). MSPDI uses its XML declaration; xlsx needs none.
- **Numbers (CSV, xlsx text cells):** the decimal separator is guessed per file (`2,5`, `1.234,5`) and confirmed in the Columns step; grouping separators are removed only when the other separator is the decimal one; a `%` sign is dropped; xlsx number cells formatted with `%` are multiplied by 100.
- **Durations (tables):** a number with an optional unit, spaces allowed, English or Turkish: minutes (`m`, `min`, `mins`, `minute`, `minutes`, `dk`, `dakika`), hours (`h`, `hr`, `hrs`, `hour`, `hours`, `sa`, `saat`), days (`d`, `dy`, `dys`, `day`, `days`, `g`, `gün`) (D50), weeks (`w`, `wk`, `wks`, `week`, `weeks`, `hf`, `hafta`), months (`mo`, `mon`, `mons`, `month`, `months`, `ay`). A day is `hoursPerDay` hours, a week 5 days, a month 20 days. A bare number uses the Duration unit option; a trailing `?` is dropped (`TABLE_ESTIMATED_DURATION`); an `e` before the unit is elapsed time (`ELAPSED_DURATION`); anything else is `TABLE_BAD_DURATION`.
- **Dates:** source timestamps are wall-clock times without a zone, parsed by regex into `'YYYY-MM-DDTHH:mm'`, never with `new Date(string)`. XER accepts `yyyy-M-d[ H[:mm[:ss]]]`, MSPDI `yyyy-MM-ddTHH:mm:ss` with optional fractional seconds and an optional zone (`Z`, `±hh:mm`) that are dropped, the wall clock as written being read (`MSPDI_DATE_ZONE_DROPPED` once), and `NA` as empty (D52). Table cells use the chosen `ImportDateFormat` for the order of day, month and year and accept one- or two-digit days and months, four- or two-digit years (two → 20yy; a two-digit year only where the year comes last, so `YYYY-MM-DD` needs four digits, D49), an optional weekday name in front in English or Turkish (`Mon`, `Monday`, `Pzt`, `Pazartesi`, …), English or Turkish month names, full or three letters, in the month's place (`15 Mart 2026`), and an optional time (`08:00`, `8:00 AM`); or real xlsx dates (1900 system including the false 29 Feb 1900, or 1904). Date-only cells take the times of `TableAssumptions`.
- **Matching (`foldForMatch` in `src/lib/search.ts`):** `trim()`, `toLocaleLowerCase('tr')`, then `ı` → `i`, then canonical decomposition without combining marks, so "Activity ID", "ID" and "İŞ KODU" match lower-case aliases, and in search "istanbul" finds "İSTANBUL" and "ISTANBUL" and "insaat" finds "İnşaat". Header aliases, activity types, constraint names and every search box use it; sorting keeps P2 D21's collator.

### 5.5 XER

P3 full §5.5 applies, with the choice of one project per run:

- Tables are read by their `%F` field names into `Object.create(null)` records; unknown fields are ignored, missing optional fields tolerated; a record whose first token is empty continues the previous one; `%E` ends the file. `CALENDAR.clndr_data` is a nested `(key|value(…)())` structure whose entries may be separated by line breaks or `0x7F`; both are accepted.
- **Several projects:** each project is a Review row "{proj_short_name} · {name}"; the chosen one becomes the schedule (§5.1) and the report carries `XER_MULTIPLE_PROJECTS`. The schedule reads only its project's WBS, activities and links; links to another project are skipped (`XER_CROSS_PROJECT_LINK`) and counted per project in `externalLinks`. Global and project calendars the project uses are read; resource calendars are read as `kind: 'resource'` and never assigned to activities.
- **Schedule level:** short name, name and code, the root WBS node's name (`sourceProject.rootWbsName`), `PROJECT.last_recalc_date` as the status date, the must-finish-by date, the default calendar, the stated start and finish, and in `settings` the progress mode, `sched_calendar_on_relationship_lag` (P3 full D40) and the four resource unit and cost calculation flags, as written.
- **Mapping:** `PROJWBS` → WBS (code, name, tree by `parent_wbs_id`, order `seq_num`, the project node skipped as a level but kept as `rootWbsName`); `TASK` → activities, code `task_code` (a code used twice: `DUPLICATE_CODE`), source key `task_id`; `TT_Task` → task, `TT_Rsrc` → task on its own calendar (`XER_RESOURCE_TASK`), `TT_Mile` → start milestone, `TT_FinMile` → finish milestone, `TT_LOE` → level of effort, `TT_WBS` → WBS summary; status, physical % and the % complete type; original and remaining duration; actual, early, late and remaining (restart and re-end) dates; total and free float as written; `TASKPRED` `PR_FS/SS/FF/SF` with `lag_hr_cnt`, positive or negative, an unknown type becoming FS (`LINK_TYPE_UNKNOWN`); constraints `CS_MSO`, `CS_MSOA`, `CS_MSOB`, `CS_MEO`, `CS_MEOA`, `CS_MEOB`, `CS_MANDSTART`, `CS_MANDFIN`, `CS_ALAP` and none, primary and secondary, with dates; `clndr_data` for the work week (days 1–7, 1 = Sunday; several periods a day; 24-hour and `h:mm AM` shift times) and exceptions (`d|<days since 1899-12-30>`); each calendar's hours per day, week, month and year.
- **Expected finish** is not used: activities with one give one `XER_EXPECTED_FINISH` warning with their count. Baselines held in the file are never turned into tags.
- **Calendar inheritance:** a calendar with `base_clndr_id` inherits the exceptions of its base that it doesn't define, down the chain (cycle-safe, at most 5 levels); a missing, self-referencing or cyclic base is a warning and the calendar is read as written, since P6 exports the inherited week and exceptions with it (`XER_CALENDAR_BASE_MISSING`, D51); known damage in `clndr_data` is repaired with `CALENDAR_DATA_REPAIRED` (D53); a task without a known `clndr_id` uses the project's (`CALENDAR_MISSING`). Hours become working minutes with the activity's calendar; a `day_hr_cnt` that disagrees with the work week gives way to it (`CALENDAR_HOURS_MISMATCH`).
- **Unknown values, numbers and baselines:** an unknown `task_type` reads as task and a blank or unknown `status_code` is derived from the actual dates and % complete, each with `XER_UNKNOWN_VALUE` (D54); numbers use the decimal symbol of the `CURRTYPE` row that `ERMHDR` names, and comma decimals the file doesn't declare are read as decimals with `XER_DECIMAL_COMMA` (D55); the row's grouping symbol applies only to a number that also has the declared decimal symbol after its groups, so a lone separator is always a decimal (D59); a project named in another project's `sum_base_proj_id` is that project's baseline: it is never chosen by default and its Review row says so (D56).
- **Calendar problems** (P3 full D47): a calendar something uses that can't be read completely stops the import with an error naming it (`CALENDAR_UNREADABLE`; for MSPDI also `CALENDAR_BASE_MISSING`); in a calendar nothing uses it is a warning and the calendar is skipped (`CALENDAR_UNUSED_SKIPPED`). No calendar is ever replaced with a standard week.
- **Counted, not read:** RSRC, RSRCRATE, TASKRSRC, ACTVTYPE, ACTVCODE, TASKACTV, UDFTYPE, UDFVALUE, TASKMEMO, CURRTYPE and any other table (`notImported`; P5 reads them from the stored original, P3 full D39).

### 5.6 MSPDI

P3 full §5.6 applies unchanged:

- `fast-xml-parser` with `parseTagValue: false`, `processEntities: false`, `removeNSPrefix: true` and `isArray` for `Task`, `PredecessorLink`, `Calendar`, `WeekDay`, `WorkingTime`, `Exception`; values converted explicitly. `mspdi/xml-text.ts` decodes the five predefined entities and decimal and hex character references; a reference to U+0000, a surrogate or above U+10FFFF becomes U+FFFD (`XML_BAD_CHARACTER`).
- **Tasks:** `Summary = 1` tasks become WBS elements (tree from `OutlineLevel` in file order; UID 0 skipped; code = the last segment of `OutlineNumber`); values on summary rows aren't read. Other tasks become activities with their GUID kept. Skipped and reported: `IsNull` rows with their links, inactive tasks (`MSPDI_INACTIVE_TASK`), external tasks and inserted subprojects (`ExternalTask = 1` or `IsSubproject = 1`, `MSPDI_EXTERNAL_TASK`), links on summary tasks (`MSPDI_SUMMARY_LINK`), external links (`MSPDI_EXTERNAL_LINK`, counted in `externalLinks`).
- **Status:** an actual finish means completed; else an actual start means started; else `PercentComplete` ≥ 100 completed and > 0 started; else not started. `PercentComplete` is kept as duration % and `PhysicalPercentComplete` as physical %; % work complete isn't read.
- **Activity codes:** `UID` by default. The Review step's "Activity codes" also offers "ID" (with a hint that IDs shift when rows are inserted) and each `Text1`–`Text30` field filled and unique on at least 90 % of activities (`activityCodeField`). With a Text field, an empty or shared value uses the UID (`CODE_FALLBACK`); codes are cut to 40 characters (`TEXT_TRUNCATED`); a code still used twice is `DUPLICATE_CODE`.
- **Dates and floats:** start, finish, early and late (falling back to start and finish), actual dates, the remaining window from `Resume` to the finish (empty without `Resume`; `Stop` isn't kept, D60), total and free slack as written.
- **Milestones** (P3 full D48): a zero-duration task is a start milestone at its calendar's first working minute and a finish milestone at the last; any other time becomes a start milestone with `MSPDI_MILESTONE_AMBIGUOUS`. `Milestone = 1` with a duration → task (`MSPDI_MILESTONE_WITH_DURATION`); zero duration without the flag also gives `MSPDI_ZERO_DURATION`.
- **Manually scheduled tasks:** without a constraint they get "start on or after" at `ManualStart`, or `Start` when blank (`MSPDI_MANUAL_TASK`); with one, the manual start is dropped (`MSPDI_MANUAL_START_DROPPED`). Manual finish and text durations aren't read.
- **Durations:** working time on the task's calendar; an elapsed `DurationFormat` gives the activity the generated calendar "24 hours" (kind `task`, every day from 00:00 to 24:00), added to the model once (`ELAPSED_DURATION` per activity, `CALENDAR_GENERATED_ELAPSED` once; our call, D43). Durations use the project's `MinutesPerDay` (default 480), recorded in `units`.
- **Links:** `Type` 0 FF, 1 FS, 2 SF, 3 SS (else FS, `LINK_TYPE_UNKNOWN`); `LinkLag` in tenths of a minute, stored as minutes; elapsed lag formats keep a 24-hour lag (`ELAPSED_LAG`); percentage lags become working time of the predecessor's duration once (`PERCENT_LAG`).
- **Constraints:** 0 none, 1 as late as possible, 2 mandatory start, 3 mandatory finish, 4 start on or after, 5 start on or before, 6 finish on or after, 7 finish on or before; one per activity. Deadlines aren't read.
- **Calendars:** `WeekDays` (DayType 1–7 = Sunday–Saturday, several periods; DayType 0 legacy exceptions) and 2007+ `Exceptions` (single days, date ranges, custom working hours) with recurrences (daily, weekly, monthly, yearly, fixed date or relative weekday) expanded from the schedule's start to 20 years after its finish, at most 10,000 dates per calendar (`CALENDAR_RECURRENCE_CAPPED`); `WorkWeeks` → default week only (`MSPDI_WORK_WEEKS`). A derived calendar inherits every weekday and exception it doesn't list, down the chain (cycle-safe, at most 5 levels). `BaseCalendarUID` -1, 0 or -65533 means a calendar has no base (D51); `CalendarUID` -1 or none means the project calendar; task and resource calendars keep their assignments in the model. A recurrence we can't expand gives `CALENDAR_RECURRENCE_UNSUPPORTED`; calendar problems follow §5.5.
- **Project level and settings kept for P4:** name, start, finish, status date, project calendar; `ScheduleFromStart`, `CalendarUID`, `MinutesPerDay`, `MinutesPerWeek`, `DaysPerMonth`, `DefaultStartTime`, `DefaultFinishTime`; currency, fiscal-year, critical-slack, default task type and earned-value settings aren't read. **Status date:** `StatusDate`; when absent or invalid, the Review step's field takes the earliest task start and says so (`STATUS_DATE_FALLBACK`). **Not read** (listed in `outcomes`): recurring task definitions, leveling and priority, hyperlinks, custom and enterprise fields, outline codes, baselines, costs, earned value, timephased data, split segments. Task notes are read.

### 5.7 Excel and CSV: the Columns step

P3 full §5.7 applies, without "Earlier mappings" (D27):

- **Reading:** CSV through Papa Parse on the decoded text with the chosen or detected delimiter (among `,` `;` tab, the one giving the most rows with a constant field count). xlsx through SheetJS with `dense: true`, `cellFormula: false`, `cellDates: false`, `sheets` limited to the chosen sheet and `sheetRows` 20,051; hidden rows are read; merged cells take the top-left value.
- **Options** (defaults from detection): Sheet, Header row (1–50), Text encoding (CSV), Delimiter, Decimal separator, Date format, Duration unit (Days / Hours), Hours per day (1–24, default 8), Predecessors refer to ("Activity code" or "Task ID"; "Task ID" by default when that field is mapped), Rows with problems ("Import them, leaving bad cells empty" by default, or "Skip them", `TABLE_ROW_SKIPPED`).
- **Fields:** Activity code and Activity name are required; Task ID (used only to resolve predecessors), WBS (a code, or a path split on `.`, `/` or `>`), Duration, Start, Finish, Actual start, Actual finish, Activity type, Calendar (every distinct name becomes a calendar of kind `global` with `TableAssumptions`' default week, `CALENDAR_GENERATED_FROM_NAME`), Constraint, Constraint date, % complete, Predecessors and Notes are optional; each column maps to at most one field. Every table import also gets the generated calendar "Standard" (kind `project`, the project's default calendar: Monday to Friday from 08:00, `hoursPerDay` hours with the 1-hour break at 12:00 when `hoursPerDay` > 4; a day of more than 15 hours starts early enough to end at 24:00 and keeps the break only while it fits (D61); `CALENDAR_GENERATED_STANDARD`), which activities without a calendar name use; a name that folds to "standard" is that calendar (our call, D43).
- **Automatic mapping:** English and Turkish header aliases in `auto-map.ts`, compared with `foldForMatch` (e.g. code: "activity id", "unique id", "code", "kod", "aktivite kodu"; Task ID: "id", "kimlik"; name: "activity name", "task name", "name", "ad", "aktivite adı"; duration: "duration", "süre"; start: "start", "başlangıç"; finish: "finish", "bitiş"; predecessors: "predecessors", "öncüller").
- **Values:** numbers, durations and dates as §5.4; % complete 0–100 (else `TABLE_BAD_NUMBER`). Activity types: task, milestone / start milestone, finish milestone, level of effort, Turkish "görev", "kilometre taşı"; anything else → task (`TABLE_UNKNOWN_TYPE`). Constraints (`constraints.ts`, compared with `foldForMatch`): the app map's names, which P6 also uses ("Start on", "Start on or after", "Start on or before", "Finish on", "Finish on or after", "Finish on or before", "Mandatory start", "Mandatory finish", "As late as possible"); Microsoft Project's names and abbreviations: "As soon as possible" / "ASAP" → no constraint, "As late as possible" / "ALAP", "Must start on" / "MSO" → mandatory start, "Must finish on" / "MFO" → mandatory finish, "Start no earlier than" / "SNET" → start on or after, "Start no later than" / "SNLT" → start on or before, "Finish no earlier than" / "FNET" → finish on or after, "Finish no later than" / "FNLT" → finish on or before; and the Turkish names V9 records. Anything else → `CONSTRAINT_UNSUPPORTED`.
- **Predecessors cell:** tokens separated by `;` (or `,` when the decimal separator is `.`), each `<ref> [type] [lag]` with spaces allowed; `<ref>` an activity code or a Task ID; type `FS`, `SS`, `FF` or `SF` (default FS); lag `+`/`-`, a number and an optional unit, or a percentage (`PERCENT_LAG`). Examples: `A100FS+2d; A120SS`, `3FS+2 days`, `12SS-1 hafta`, `7FS-25%`. Unknown references, self-links, duplicates and unreadable tokens are skipped and reported.
- **Preview:** the first 10 data rows, mapped columns emphasized and invalid cells marked, from the same normalizer as `analyze`. Duplicate activity codes are errors (`DUPLICATE_CODE`).

### 5.8 What P3 core stores, and what P4 receives

P3 stores per imported schedule: the original file in `schedule-imports` (§4.9), `source_file_name`, `source_format`, `source_file_size`, `source_file_sha256`, `source_project_code`, `parser_version`, `import_mapping`, `import_report`, `activity_count` and the status date. Parsing is deterministic: the same bytes and mapping always give the same model, pinned by golden `*.model.json` files. P3 uses the model for counts, checks and the report only (P3 full D3).

**P4 hand-over.** P4 core receives, for every schedule imported from the core on:

1. **The original**, through `getScheduleSourceFile(id)` (or, for a Node script with the service key, the object at `source_file_path`, gunzipped when the path ends in `.gz`), never changed: the bucket has no update policy, users can't update `source_file_path`, and only owners, or the uploader of an unreferenced object, can delete it (§4.9).
2. **The mapping**, through `getImportMapping(id)`: every choice the user made (encoding, the XER `sourceProjectId`, the MSPDI `activityCodeField`, the table mapping with its fixed `TableAssumptions`).
3. **The reader:** `analyze(bytes: Uint8Array, fileName: string, mapping: ImportMapping, options?: { statusDate?: ISODate | null }) → { model: ImportModel; report: ImportReport }` from `src/import/index.ts`, pure, running in Node and in the worker. The status date is an option, not part of the mapping: it is the schedule's own (`schedules.status_date`), the checks run against it, and without it they use the file's (D37). The model doesn't depend on it, so S11 compares models only. Its model:

```ts
type WallClock = string;                        // 'YYYY-MM-DDTHH:mm', no zone, as written in the file (§5.4)
interface Period { start: number; finish: number }   // minutes from midnight, 0–1440
interface Window { start: WallClock | null; finish: WallClock | null }
type ImportConstraintType = 'start_on' | 'start_on_or_after' | 'start_on_or_before' | 'finish_on'
  | 'finish_on_or_after' | 'finish_on_or_before' | 'mandatory_start' | 'mandatory_finish' | 'as_late_as_possible';
export interface ImportModel {
  schemaVersion: 1; format: ImportFormat;
  project: { code: string | null; name: string | null; rootWbsName: string | null; statedStart: WallClock | null;
    statedFinish: WallClock | null; mustFinishBy: WallClock | null; statusDate: WallClock | null; defaultCalendarId: string | null };
  calendars: Array<{ id: string; name: string; kind: 'project' | 'global' | 'resource' | 'task';
    week: Period[][];                           // 7 entries, 0 = Sunday; [] = non-working day
    exceptions: Array<{ date: ISODate; periods: Period[] }>;   // [] = non-working; after inheritance
    hoursPerDay: number; hoursPerWeek: number | null; hoursPerMonth: number | null; hoursPerYear: number | null }>;
  wbs: Array<{ id: string; parentId: string | null; code: string; name: string; order: number }>;
  activities: Array<{
    keys: { taskId: string | null; uid: string | null; guid: string | null };   // XER task_id · MSPDI UID and GUID
    code: string; name: string; wbsId: string | null; calendarId: string;
    type: 'task' | 'start_milestone' | 'finish_milestone' | 'level_of_effort' | 'wbs_summary';
    originalDuration: number | null; remainingDuration: number | null;   // working minutes
    planned: Window; early: Window; late: Window; actual: Window; remaining: Window;
    constraint: { type: ImportConstraintType; date: WallClock | null } | null;
    secondaryConstraint: { type: ImportConstraintType; date: WallClock | null } | null;
    status: 'not_started' | 'in_progress' | 'completed';
    percent: { duration: number | null; physical: number | null; type: 'duration' | 'physical' | 'units' | null };
    totalFloat: number | null; freeFloat: number | null;   // working minutes as written; kept, never inputs
    notes: string | null; flags: { manual: boolean; elapsed: boolean; resourceDependent: boolean } }>;
  relationships: Array<{ predecessorCode: string; successorCode: string; type: 'FS' | 'SS' | 'FF' | 'SF';
    lagMinutes: number; lagElapsed: boolean }>;   // working minutes unless lagElapsed (24-hour time); lag calendar per settings (P3 full D40)
  settings: Array<{ key: string; value: string }>;
}
```

The field names are our call; their content is P3 full §5.8's. Generated calendars (§5.6, §5.7) sit in `calendars` with deterministic ids that start with `gen:` (our call, D43). Source floats and early and late dates are for display and for comparing with P4's first calculation, never inputs.

**Compatibility rule** (Goal 4; our call, D44). A schemaVersion-1 `ImportMapping` whose import had no errors keeps producing a model without errors in every later parser version: a new check or reader rule may add warnings or info only. A change that would turn a clean file into an error waits for a new `schemaVersion` with its own path for stored mappings. Each change to a golden model raises `parserVersion` (`version.ts`), and the goldens of §7 fail on any new error in a fixture that had none.

**What P4 decides:** how stored imports become its tables (materializing on the first open by an editor, or a one-off Node script with the service key reusing `src/import`; viewers can't write and share recipients can't read `schedule-imports`); the grants or functions to refresh `import_report` and `activity_count` (the core grants no update on them); how an import's source dates are kept before its first recalculation, since protection waits for "Phase 3 later" (D29); and, for P2-era imports (null mapping and report), asking for what P2 didn't record before reading them: a column mapping for a CSV, the source project for an XER holding several projects. Blank schedules start empty.

### 5.9 Import report

The report (§4.1) is the Review step's dry run and is stored with the schedule. The Import report dialog's report view reads only the stored report; its description takes the schedule's `createdAt` from `useProjectSchedules` (§6.4). Downloads: "Download CSV" (one row per issue: severity, code, message, location, original, used; cells starting with `=`, `+`, `-`, `@`, tab or CR, full-width forms included, get a leading `'`, and every cell is quoted) and "Download JSON" (the report object), named `{schedule name} - import report.csv` / `.json` (the Review step uses the Name field). Issue texts are at most 200 characters, cut with "…".

- **Count rules,** per entity in `counts`: `read = accepted + skipped`; `adjusted ≤ accepted`; every skipped or adjusted item has at least one issue naming it; a parser test asserts them for every fixture. Calendar counts cover only the calendars the file defines (XER `CALENDAR` rows, MSPDI `Calendar` elements); the generated calendars ("Standard" and the name-made ones for tables, "24 hours" for elapsed MSPDI durations) stay outside the counts and are reported by their info issues (D43).
- **Summary** (`breakdown`): activities by type, started and completed, relationships by type, constraints and calendar exceptions over accepted items; `dateRange` is the accepted activities' span as written.
- **Outcomes** (`outcomes.ts`): a fixed catalog per format of every source element we know, each **used** ("Used for dates"), **kept** ("Kept for display and export") or **not read** ("Not read; still in the original file"); the report lists the elements present with their item counts.
- **Checks** (`checks.ts`), each run on every import with its findings counted, zeros included, and each finding also an issue: `actual_after_status_date`, `progress_without_actual_start`, `complete_without_actual_finish`, `status_date_fallback`, `ambiguous_milestones` (`MSPDI_MILESTONE_AMBIGUOUS`), `percent_lags`, `links_on_summaries` (`MSPDI_SUMMARY_LINK`), `external_links` (`XER_CROSS_PROJECT_LINK`, `MSPDI_EXTERNAL_LINK`), `project_dates_differ`.
- **Issues** are grouped by code (one row per code with its group title and count, expanding to every issue with its message and location). **Fatal errors** (any `error`) stop the import with no partial result. Refusals and errors offer "Copy details" (message, code, file name, size, detected format, parser version as plain text) → toast "Details copied".

### 5.10 Limits

| Limit | Value | Where enforced |
|---|---|---|
| File size | 20 MB (20,971,520 bytes); the stored copy is never larger | form, bucket, `source_file_size` check |
| Files per import | 1 | form |
| Activities / relationships / WBS elements / calendars | 20,000 / 40,000 / 10,000 / 200 | parser (`FILE_TOO_MANY_*`), `activity_count` check |
| Table rows / columns | 20,000 data rows / 200 columns | parser (`FILE_TOO_MANY_ROWS`, `FILE_TOO_MANY_COLUMNS`) |
| xlsx archive | total uncompressed ≤ 200 MB, any entry ≤ 100 MB, ratio ≤ 100 per entry, measured on the real inflated bytes | `zip-guard.ts` before SheetJS; an overrun refuses the file with "This file isn't a readable Excel workbook." |
| Text fields | activity name 255, code 40, WBS name 255, notes 4,000 characters; longer values shortened (`TEXT_TRUNCATED`); codes equal after shortening are `DUPLICATE_CODE` | parser |
| Worker request | 30 s | `client.ts` watchdog |
| Recurrence dates | 10,000 per calendar | parser (`CALENDAR_RECURRENCE_CAPPED`) |
| Calendar exception dates | 100,000 across all calendars, read and expanded (D57) | parser (`FILE_TOO_MANY_EXCEPTIONS`) |
| xlsx archive entries | 1,000 (D57) | `zip-guard.ts`; more refuses the file with "This file isn't a readable Excel workbook." |
| Issues | 5,000 in the dry run. Stored: the first 500, then notes and then warnings dropped from the end until the stored report is at most 200 KB as UTF-8 JSON; built by `pack` (our call); a stored report holds no errors | worker `pack`, column check |
| Report / mapping | 256 KB / 16 KB on `jsonb::text` | column checks |

### 5.11 Security

- Compound files are recognized from their header and directory entry names only; nothing inside them is parsed.
- Any XML with `<!DOCTYPE` is refused before parsing ("This XML file isn't a Microsoft Project XML file."); the library expands no entities; `fast-xml-parser` is at least 5.3.5 (V1).
- xlsx: `zip-guard.ts` streams every entry through `fflate`'s `Unzip`, counts the real inflated bytes, discards them and aborts past a limit; an archive that ends early or holds an entry that can't be inflated is refused with the same message; only then does SheetJS read it. The watchdog stops anything left.
- Records keyed by names from the file use `Object.create(null)` or `Map` (`safe-record.ts`); names, notes and messages render as React text only, with no `dangerouslySetInnerHTML`.
- The server trusts nothing: column checks bound sizes and enums; the path rule ties each object to its row's project; P4 rebuilds data from the stored original, never from the report.
- Fixtures are our own files, written by hand or by `scripts/make-xlsx-fixtures.ts`. Real exports are read only by V9, by path, never copied or committed, not even anonymized (D2).

### 5.12 Issue catalog (copy pinned)

`{…}` are filled by the parser; locations go in `location`. "Group" titles the issue's group (§5.9). §5.2's refusals are messages, not issues.

| Code | Severity | Group | Message |
|---|---|---|---|
| `FILE_EMPTY` | error | "Empty file" | "The file is empty." |
| `FILE_UNREADABLE` | error | "File couldn't be read" | "This file couldn't be read. It may be damaged or incomplete. Export it again from your planning tool and retry." |
| `FILE_NO_ACTIVITIES` | error | "No activities" | "No activities were found in this file." |
| `FILE_TOO_MANY_ACTIVITIES` | error | "Too many activities" | "The file has {n} activities. The limit is 20,000." |
| `FILE_TOO_MANY_RELATIONSHIPS` | error | "Too many relationships" | "The file has {n} relationships. The limit is 40,000." |
| `FILE_TOO_MANY_WBS` | error | "Too many WBS elements" | "The file has {n} WBS elements. The limit is 10,000." |
| `FILE_TOO_MANY_CALENDARS` | error | "Too many calendars" | "The file has {n} calendars. The limit is 200." |
| `FILE_TOO_MANY_EXCEPTIONS` | error | "Too many calendar exceptions" | "The file's calendars hold more than 100,000 exception dates." |
| `FILE_TOO_MANY_ROWS` | error | "Too many rows" | "The sheet has more than 20,000 rows." |
| `FILE_TOO_MANY_COLUMNS` | error | "Too many columns" | "The sheet has more than 200 columns." |
| `DUPLICATE_CODE` | error | "Repeated activity codes" | "Activity code {code} is used more than once." |
| `CALENDAR_UNREADABLE` | error | "Calendars that couldn't be read" | "Calendar {name} couldn't be read, and dates that use it would be wrong. Fix it in your planning tool and export again." |
| `CALENDAR_BASE_MISSING` | error | "Calendars without their base" | "Calendar {name} is based on a calendar that isn't in the file. Export the file with that calendar included." |
| `CALENDAR_RECURRENCE_UNSUPPORTED` | error | "Repeating exceptions we can't read" | "Calendar {name} has a repeating exception we can't read. Replace it with single dates in your planning tool and export again." |
| `FORMAT_FROM_CONTENT` | info | "File type taken from the content" | "The file's name ends in .{ext}, but it holds {format}. It was read as {format}." |
| `ENCODING_GUESSED` | info | "Text encoding" | "Text encoding detected as {encoding}. If letters look wrong, choose another encoding." |
| `ENCODING_INVALID_BYTES` | info | "Text encoding" | "{n} bytes aren't valid UTF-8 and were replaced with �. If letters look wrong, choose another encoding." |
| `XER_MULTIPLE_PROJECTS` | info | "Several projects in the file" | "The file holds {n} projects. This schedule is made from {code}." |
| `XER_CROSS_PROJECT_LINK` | warning | "Links to other projects" | "The link {predecessor} → {successor} points to another project and was skipped." |
| `XER_RESOURCE_TASK` | warning | "Resource-dependent activities" | "{code} is resource dependent. It is imported as a task on its own calendar." |
| `XER_EXPECTED_FINISH` | warning | "Expected finish dates" | "{n} activities have an expected finish date. Expected finish isn't used, so their remaining durations decide their dates." |
| `XER_CALENDAR_BASE_MISSING` | warning | "Calendars read without their base" | "Calendar {name} is based on a calendar that isn't in the file. It was read as written, with the days P6 exported for it." |
| `XER_UNKNOWN_VALUE` | warning | "Unknown values" | "{code} has a {field} we don't know ({value}). {used} is used." |
| `XER_DECIMAL_COMMA` | warning | "Decimal commas" | "Numbers in this file use a decimal comma the file doesn't declare. They were read as decimals; check durations and percentages." |
| `CALENDAR_UNUSED_SKIPPED` | warning | "Unused calendars skipped" | "Calendar {name} couldn't be read completely. Nothing uses it, so it was skipped." |
| `CALENDAR_RECURRENCE_CAPPED` | warning | "Long repeating exceptions" | "Calendar {name} repeats an exception more than 10,000 times. Dates after {date} were left out." |
| `CALENDAR_MISSING` | warning | "Activities without a calendar" | "{code} has no calendar. The project's default calendar is used." |
| `CALENDAR_HOURS_MISMATCH` | info | "Calendar hours" | "Calendar {name} states {stated} hours a day, but its work week has {actual}. {actual} is used." |
| `CALENDAR_DATA_REPAIRED` | info | "Repaired calendars" | "Calendar {name} had damaged data that was repaired." |
| `CALENDAR_GENERATED_STANDARD` | info | "Generated calendars" | "Calendar Standard was added as the default calendar: Monday to Friday from {start}, {n} hours a day." |
| `CALENDAR_GENERATED_FROM_NAME` | info | "Generated calendars" | "Calendar {name} was made from its name with the standard week: Monday to Friday from {start}, {n} hours a day." |
| `CALENDAR_GENERATED_ELAPSED` | info | "Generated calendars" | "Calendar 24 hours was added for elapsed durations. It works every day, around the clock." |
| `MSPDI_SUMMARY_LINK` | warning | "Links on summary tasks" | "The link on summary task {name} was skipped. Summary tasks can't have links." |
| `MSPDI_MILESTONE_WITH_DURATION` | warning | "Milestones with a duration" | "{code} is flagged as a milestone but has a duration. It is imported as a task." |
| `MSPDI_MILESTONE_AMBIGUOUS` | warning | "Milestones at an unclear time" | "{code} is a milestone at {time}, neither the start nor the end of its working day. It is imported as a start milestone." |
| `MSPDI_ZERO_DURATION` | info | "Tasks without a duration" | "{code} has no duration. It is imported as a milestone." |
| `MSPDI_MANUAL_TASK` | info | "Manually scheduled tasks" | "{code} is manually scheduled in the file. It starts on or after {date}." |
| `MSPDI_MANUAL_START_DROPPED` | warning | "Manually scheduled tasks" | "{code} is manually scheduled and already has a constraint. Its manual start {date} was dropped." |
| `MSPDI_INACTIVE_TASK` | warning | "Inactive tasks" | "Inactive task {name} was skipped." |
| `MSPDI_EXTERNAL_TASK` | warning | "External tasks" | "{name} is an external task or an inserted project and was skipped." |
| `MSPDI_EXTERNAL_LINK` | warning | "Links outside the file" | "The link to {target} points outside this file and was skipped." |
| `MSPDI_WORK_WEEKS` | warning | "Alternate work weeks" | "Calendar {name} has alternate work weeks. Only its default week is used." |
| `MSPDI_NO_NAMESPACE` | info | "Non-standard Microsoft Project XML" | "The file has no Microsoft Project namespace. It was read as Microsoft Project XML." |
| `MSPDI_DATE_ZONE_DROPPED` | info | "Non-standard Microsoft Project XML" | "Some dates carry a time zone or fractions of a second. They were read as the times written." |
| `CODE_FALLBACK` | warning | "Activities without a usable code" | "{name} has no usable code in {field}. Its unique ID {uid} is used." |
| `XML_BAD_CHARACTER` | warning | "Invalid characters" | "“{value}” isn't a valid character. It was replaced with �." |
| `ELAPSED_DURATION` | info | "Elapsed durations" | "{code} has an elapsed duration. It uses a 24-hour, 7-day calendar." |
| `ELAPSED_LAG` | info | "Elapsed lags" | "The lag on {predecessor} → {successor} is in elapsed time. It uses a 24-hour calendar." |
| `PERCENT_LAG` | warning | "Percentage lags" | "The lag on {predecessor} → {successor} is a percentage. It was converted to {value}." |
| `LINK_TYPE_UNKNOWN` | warning | "Unknown link types" | "The link {predecessor} → {successor} has a type we don't know ({value}). It is imported as finish to start." |
| `STATUS_DATE_MISSING` | info | "Status date" | "The file has no status date." |
| `STATUS_DATE_FALLBACK` | warning | "Status date" | "The file has no valid status date. The earliest task start, {date}, was filled in. Check it before importing." |
| `STATUS_TIME_KEPT` | info | "Status date" | "The file's status date is {date} {time}. The schedule keeps the date; the time is kept in this report." |
| `ACTUAL_AFTER_STATUS_DATE` | warning | "Actual dates after the status date" | "{code} has an actual {start or finish} on {date}, after the status date." |
| `PROGRESS_WITHOUT_ACTUAL_START` | warning | "Progress without an actual start" | "{code} shows progress but has no actual start." |
| `COMPLETE_WITHOUT_ACTUAL_FINISH` | warning | "Completed without an actual finish" | "{code} is complete but has no actual finish." |
| `PROJECT_DATES_DIFFER` | info | "Project dates" | "The file states the project runs {start} – {finish}, but its activities run {activityStart} – {activityFinish}." |
| `TABLE_MISSING_CODE` | warning | "Rows without an activity code" | "This row has no activity code and was skipped." |
| `TABLE_MISSING_NAME` | warning | "Activities without a name" | "{code} has no name. Its code is used as the name." |
| `TABLE_BAD_NUMBER` | warning | "Unreadable numbers" | "“{value}” isn't a number. The cell was left empty." |
| `TABLE_BAD_DURATION` | warning | "Unreadable durations" | "“{value}” isn't a duration we can read. The cell was left empty." |
| `TABLE_ESTIMATED_DURATION` | info | "Estimated durations" | "The duration of {code} is marked as estimated. The mark was dropped." |
| `TABLE_BAD_DATE` | warning | "Unreadable dates" | "“{value}” isn't a date in {format}. The cell was left empty." |
| `TABLE_UNKNOWN_TYPE` | warning | "Unknown activity types" | "“{value}” isn't a known activity type. Task is used." |
| `TABLE_BAD_LINK` | warning | "Unreadable links" | "“{token}” isn't a link we can read and was skipped." |
| `TABLE_ROW_SKIPPED` | warning | "Rows skipped" | "This row was skipped because “{value}” in {column} couldn't be read." |
| `LINK_UNKNOWN_ACTIVITY` | warning | "Links to missing activities" | "The link {predecessor} → {successor} names an activity that isn't in the file and was skipped." |
| `LINK_SELF` | warning | "Activities linked to themselves" | "{code} links to itself. The link was skipped." |
| `LINK_DUPLICATE` | warning | "Repeated links" | "The link {predecessor} → {successor} appears more than once. One copy was kept." |
| `CONSTRAINT_UNSUPPORTED` | warning | "Unsupported constraints" | "{code} has a constraint we don't support ({value}). It was dropped." |
| `TEXT_TRUNCATED` | info | "Shortened text" | "The {field} of {code} was longer than {n} characters and was shortened." |

With "Rows with problems: Skip them", `TABLE_ROW_SKIPPED` replaces `TABLE_BAD_NUMBER`, `TABLE_BAD_DURATION` and `TABLE_BAD_DATE` for that row.

---

## 6. Screens (copy is pinned)

### 6.1 Shared pieces

- **`DataTable`** (TanStack Table v8): props `columns`, `data`, `getRowId`, `caption` (visually hidden), `state` (`loading` / `error` / `ready`), `onRetry`, `empty` (node), optional `rowLink(row) → { to, label, title }`. It keeps `SharedSchedulesTable`'s look (header classes, the stretched row link with a multi-line `title`, menus lifted above the link, 5 skeleton rows while loading, one full-width row for empty and error). Selection, sorting and sub-rows wait for their features (our call). Home's table isn't migrated.
- **`StatusBadge`:** "Active" · "On hold" · "Completed" · "Cancelled" on an opaque chip. Tokens (P3 full §6.1): Active — `bg-card`, `text-foreground`, a 6 px `bg-success` dot; On hold — `text-warning-foreground` and `border-warning-border` on a `bg-card` chip with a `bg-warning-bg` layer over it (the dark `--warning-bg` is translucent, and the card underneath keeps the chip opaque; our call, D41); Completed — `bg-muted`, `text-muted-foreground`; Cancelled — `bg-card`, `text-destructive`, `border-destructive`; `check-contrast.mjs` keeps its pair `--warning-foreground` on `--warning-bg` over `--card`, which is this layering, and adds `--muted-foreground` on `--muted` and `--success` on `--card` and `--background` (non-text). **`TagBadges`:** "Current", "Primary baseline" or "Baseline", read-only. **`FilterChips`:** one chip per active filter, "{filter}: {value}", each with a remove button (aria-label "Remove filter {filter}"), then the link-button "Clear filters".
- **Viewer rule** (P2 §5.9): write buttons get `aria-disabled="true"` and the Tooltip "Viewers can't make changes in this workspace"; menus leave out actions the role can't take.
- **State rule** (our call, D11): a row menu also leaves out what the row's state forbids — "Make current" on the current or an archived schedule (R4), "Archive" on the current schedule (R2), "Delete" on the current schedule while the project has other schedules (R3); the database still refuses each with its copy.
- **Editor not available** (D16; the copy is our call): the row menu's "Open" stays, disabled, with the muted second line "The schedule editor isn't available yet." linked by `aria-describedby`; the "Open current schedule" button has `aria-disabled` and the same text as its Tooltip.
- **Formats:** dates and relative times as P1 §6.10 (P4 core decides schedule date display, D3); "—" for empty cells; a count with a noun goes through `pluralize` ("1 schedule", "2 schedules"), as in "{n} projects" and "its {n} schedules"; search uses `matchesSearch`; list rules are pure functions with unit tests that fail when a rule is removed (P2 D22).

### 6.2 Projects — `/w/:workspaceId/projects`

An unknown or inaccessible `workspaceId` shows `NotFoundPage`.

| Region | Content | Behavior |
|---|---|---|
| Header | h1 "Projects"; muted line "{workspace name} · {n} projects · {m} schedules"; buttons "Members" (`UserCog`, team workspaces only) and "+ New project" (primary) | {m} sums `scheduleCount`. "Members" opens the P2 dialog; "+ New project" opens `newProject` |
| Toolbar | search "Search projects…" (aria-label "Search projects"; name and code); "Filters" button ("Filters · {n}" when active) opening a popover with "Status" and "Stage" selects, first option "Any", footer "Clear filters"; "Sort by" select: "Last updated", "Name", "Status date"; layout toggle (aria-label "Layout"): "Tiles" (`LayoutGrid`), "List" (`List`); `FilterChips` under it | URL `q`, `status`, `stage`, `sort` (`updated` default, `name`, `status-date`); unknown or malformed values are ignored (our call); the layout is stored in `ui.projectsLayout` via `storage.ts` |
| Tiles | P1 `ProjectCard` with a `StatusBadge` on the cover when the status isn't active and the project menu in the top-right corner, lifted above the stretched link; grid 4 / 3 / 2 / 1 columns at ≥ 1280 / ≥ 1024 / ≥ 640 / < 640 px | card links unchanged |
| List | `DataTable` columns "Project" (name + code chip), "Status", "Stage", "Type", "Client", "City", "Status date", "Schedules", project menu | row link → files page; `title` = name, code, client and city on separate lines |
| Project menu (`MoreHorizontal`, aria-label "Actions for {project}") | "Open" · "Edit project" (editors) or "Project details" (viewers) · separator · "Delete project" (owners) | "Open" → files page; "Delete project" → the confirmation below |

Sort rules: Last updated = `updatedAt` desc, then id (D24); Name = `compareText(name)`, then code; Status date = desc nulls last, then name. Filters combine with AND.

**Delete project** (owners; R12): AlertDialog "Delete {project}?" / "This deletes its {n} schedules and their stored files. It can't be undone." ({n} is `totalScheduleCount`; with none: "This deletes the project. It can't be undone.", our call) / field "Type the project ID to confirm" (aria-label "Project ID") / "Cancel" · "Delete project" (destructive; aria-disabled until the field equals the project's code, ignoring case and outer spaces) → toast "Project deleted"; when the user is on one of that project's pages, the app opens the workspace's Projects page.

**Empty states** (`EmptyState`): no projects — editors: `FolderKanban`, "No projects yet", "Create a project to organize its schedules." + "New project"; viewers: "No projects yet" / "Projects in this workspace will appear here." · no match: "No matching projects" / "Try other words or clear the filters." + "Clear filters". Load errors: `SectionError` with Retry.

### 6.3 Project files — `/w/:workspaceId/p/:projectId/files`

Loads `useProject` and `useWorkspaces`. Shows `NotFoundPage` when the project is unknown, its `workspaceId` differs from `:workspaceId`, or that workspace isn't one of mine (a project seen only through a share). While loading, the h1 holds a skeleton and the visually hidden text "Loading project…". The sidebar's Files item keeps its P1 link and now opens this page.

| Region | Content | Behavior |
|---|---|---|
| Header | cover thumbnail 96×64 (photo or `coverFor`); h1 "{project name}" + code chip + `StatusBadge`; muted line "{client} · {city}" (missing parts left out); buttons "Edit project" (`Pencil`; viewers: "Project details"), "Import schedule" (`FileUp`), "+ New schedule" (primary) | `editProject`, `importSchedule` and `newSchedule` with `{ projectId }` |
| Counters | "Status date" {date or "—"} · "Schedules" {n} · "Current schedule" {name or "None"} + "Open current schedule" (hidden without one; disabled, §6.1) | {n} is `scheduleCount` |
| Toolbar | checkbox "Show archived" | URL `archived=1` |
| Table | `DataTable` columns "Name" (plain text until P4; `title` = name, code and the notes' first 200 characters; archived rows muted with an "Archived" badge after the name), "Code", "Tags" (`TagBadges`), "Status date", "Update" ("Update {n}" / "—"; tags and update number in two columns, as the owner's list names them, our call), "Last modified" (relative, R11), "Activities", "Source" ("Imported · {file name}" or "Blank"), "Notes" (`StickyNote` + first line, truncated; empty without notes), actions menu (aria-label "Actions for {name}") | order as `listSchedules`; archived rows only with "Show archived" |
| Row menu | "Open" (disabled, §6.1) · "Make current" (editors) · "Edit details" (editors) · "Archive" / "Restore" (editors) · "Download original file" (imports with a stored file, P2-era ones included) · "View import report" (when it has one) · separator · "Delete" (owners); each subject to the state rule (§6.1) | toasts "Schedule is now current", "Schedule archived", "Schedule restored"; "Edit details" opens `scheduleDetails`; "View import report" opens `importReport`; "Delete" → the confirmation below |

**Delete schedule** → AlertDialog "Delete {name}?" / "This can't be undone. Stored original files are deleted too." / "Cancel" · "Delete" → toast "Schedule deleted".

**Empty states:** no schedules — editors: `ChartGantt`, "No schedules yet", "Create a blank schedule or import one from your planning tool." + "New schedule" and "Import schedule"; viewers: "No schedules yet" / "Schedules in this project will appear here." (R1 and R2 keep at least one schedule visible whenever there are any.)

### 6.4 Dialogs

All use the P1 dialog shell, P1 D11 discard confirmation and P1 D12 submit rules. `DialogKind` adds `editProject`, `scheduleDetails` and `importReport`; `DialogOptions` gains `scheduleId`. `scheduleDetails` and `importReport` open with `{ projectId, scheduleId }` and read the schedule from `useProjectSchedules(projectId)` (our call, D39).

| Dialog (`DialogKind`, width) | Copy | Behavior |
|---|---|---|
| New project / Edit project (`newProject`, `editProject`, 640) | New keeps P1's header and four steps. Edit: title "Edit project", description "In {workspace name}"; every step reachable from the stepper; footer "Cancel" · "Back" · "Next" · primary "Save changes" / "Saving…" on every step. Viewers: title "Project details", every field read-only, footer "Close". **Attributes:** "Status" (no "None"; default "Active") \| "Stage"; "Project type" \| "Sector"; "Status date"; "Start date" \| "Planned finish date". Status options "Active", "On hold", "Completed", "Cancelled"; Stage "None", "Pursuit", "Preconstruction", "Construction", "Closeout", "Completed"; Type "None", "Building", "Infrastructure", "Industrial", "Residential", "Energy", "Transportation", "Water", "Other"; Sector "None", "Public", "Private", "Public–private partnership". **Location** adds "Latitude" \| "Longitude" with the hint "Decimal degrees, for example 41.0151 and 28.9795. Paste both into Latitude to fill the two fields." Photo in edit: current thumbnail with "Remove" | Edit → toast "Project updated". With a current schedule, "Status date" is disabled with the hint "Follows the current schedule ({name})" and the input leaves `statusDate` out (R6). A Project ID equal to the original after trimming and lower-casing skips the availability check |
| New schedule (`newSchedule`, P1 width) | P1 copy; adds "Code" after "Name" (required, R8; hint "Letters, numbers, ., - or _ · up to 24 characters"; suggested, following the chosen project until edited) | toast "Schedule created", then the project's files page (our call, D16) |
| Schedule details (`scheduleDetails`, 560) | Title "Schedule details"; fields "Name", "Code" (required; same hint; a P2-era schedule starts with the suggestion), "Status date", "Baseline" (radio: "Not a baseline", "Baseline", "Primary baseline"), "Update number" (hint "Leave empty if this isn't a status update."; when empty, the link-button "Use {n}"), "Notes" (counter "{n}/2000"); read-only lines "Source" ("Imported from {file name}" or "Blank"), "Created {date}", "Last modified {relative}"; "Cancel" · "Save" / "Saving…" | toast "Details saved". Muted hints: making this the primary baseline while another is — "Comparisons against the primary baseline will use this schedule instead of {name}."; clearing the primary baseline — "The project will have no primary baseline until you choose one." `{n}` for "Use {n}": 1 + the number of the project's other numbered updates whose status date is on or before this one's, or the highest number + 1 when this one has none; when taken, the next free number above it |
| Import schedule (`importSchedule`, 640; Columns 760, Review 880) | Title "Import schedule"; on every step, once the project is known, the line "Into {workspace} › {code} {project}". Stepper "File" · "Columns" · "Review" ("Columns" only for xlsx and CSV; "File" for one file, our call). Descriptions: File "Upload a schedule exported from your planning tool."; Columns "Match the file's columns to schedule fields."; Review "Check what will be imported." **File:** "Project" (combobox from Home; read-only line from the files page); `FileDropzone` with the hint "Primavera P6 (.xer), MS Project XML (.xml), Excel (.xlsx) or CSV · up to 20 MB"; under it the status "Reading…", "{format}" or the refusal with "Copy details"; primary "Next" / "Reading file…". **Columns:** title "Columns · {file name}"; options "Sheet", "Header row", "Text encoding" ("UTF-8", "Turkish (Windows-1254)", "Western European (Windows-1252)", muted "Detected: {name}"; with a byte-order mark the read-only line "UTF-8 (byte-order mark)", "UTF-16 LE (byte-order mark)" or "UTF-16 BE (byte-order mark)"), "Delimiter" ("Comma", "Semicolon", "Tab"), "Decimal separator" ("Comma (2,5)", "Period (2.5)"), "Date format" ("DD.MM.YYYY", "DD/MM/YYYY", "MM/DD/YYYY", "YYYY-MM-DD"), "Duration unit" ("Days", "Hours"; hint "For durations without a unit"), "Hours per day", "Predecessors refer to" ("Activity code", "Task ID"), "Rows with problems" ("Import them, leaving bad cells empty", "Skip them"); section "Columns" with one select per field ("Not used" + "{column letter} · {header}"): "Activity code", "Activity name", "Task ID", "WBS", "Duration", "Start", "Finish", "Actual start", "Actual finish", "Activity type", "Calendar", "Constraint", "Constraint date", "% complete", "Predecessors", "Notes"; section "Preview" ("First 10 rows"); "Back" · "Next" / "Checking…". **Review:** for an XER of several projects, the table "Projects in this file" (our call), one row per project: radio (aria-label "Use {source name}"), "Source" ("{file name} · {project code}"), "Activities", "Issues" ("{e} errors · {w} warnings"); the first row without errors that isn't another project's baseline starts chosen (§5.1), and a baseline's "Source" reads "{file name} · {project code} · Baseline of {code}" (D56); a row with errors can't be chosen and shows "Fix the errors before importing. This schedule can't be imported as it is." Then fields "Name" (default the file name without extension, or the XER project's name), "Code" (suggested), "Status date" (hint "From the file", "Not in the file. The earliest task start is filled in." or "Not in the file. Leave it empty to use the project's status date."; a change runs the checks again, §5.1), and the **report view**: lines "File" ({name} · {size}), "Format" ("Primavera P6 XER {version}", "Microsoft Project XML", "Excel workbook", "CSV file"; "(read from the content)" when `formatFromContent`), "Activity codes" (MSPDI select: "Unique ID", "ID", "Text1"…; with "ID" the hint "IDs change when rows are inserted, so later updates may not match."), "Text encoding" (XER: a select as in Columns with "Detected: {name}"; CSV: a line; a byte-order mark: the read-only line), "First activities" (XER and CSV: the first five names as decoded), "Dates" ("{start} – {finish}"), "Scheduling settings" ("{setting}: {value}" per `settings` entry); counts table, rows "Calendars", "WBS elements", "Activities", "Relationships", columns "Read", "Accepted", "Adjusted", "Skipped"; section "Summary" ("Activities by type", "Started", "Completed", "Relationships by type", "Constraints", "Calendar exceptions"); section "Checks" (each with "No findings" or "{n} findings", linking to its issue group): "Actual dates after the status date", "Progress without an actual start", "Completed without an actual finish", "Status date filled in", "Milestones at an unclear time", "Percentage lags", "Links on summary tasks", "Links to other projects or files", "Project dates differ from activity dates"; section "What happened to each part of the file" (lists "Used for dates", "Kept for display and export", "Not read; still in the original file", each "{element} ({n})"); muted note "The original file is kept with the schedule."; section "Issues" with "{e} errors · {w} warnings · {i} notes" and the groups (the first 50 issues across groups, then "Show all {n}"); link-buttons "Download CSV" · "Download JSON"; footer "Back" · "Import" / "Importing…" | With no project chosen, which happens only when every project of the XER has errors, "Import" shows the alert "Choose at least one schedule to import." and focuses it; when the file's only schedule has errors (any file but a multi-project XER), it shows the alert "Fix the errors before importing. This schedule can't be imported as it is." the same way (P1 D12; D38). A `conflict` with R8's copy shows under "Code" (our call). Success → toast "Schedule imported" with the action "View report", then the project's files page |
| Import report (`importReport`, 640) | Title "Import report"; description "{file name} · imported {relative time}" (the report's file name; the time from the schedule's `createdAt`); the report view, read-only (its selects become lines; "Activity codes" from the report's `activityCodeField`), without "First activities"; when the stored list is shorter than the totals, "Showing {k} of {n} issues. The totals count every issue."; "Download CSV" · "Download JSON"; footer "Close" | a failed download → toast "The report couldn't be downloaded. Try again." |

**Code suggestions** (`src/features/files/codes.ts`, pure, P3 full §6.6): a new schedule gets the first free `S01`…`S99`, then `S100`…; an import gets the XER project's short name, or else the file name without extension, with every character outside `[A-Za-z0-9_.-]` turned into `-` and cut to 24 characters, when free, else the `S` rule; a P2-era schedule without a code gets the import rule from its file name when it is an import, else the `S` rule. The server's R8 check is authoritative.

### 6.5 Validation copy

| Form · field | Rule | Error copy |
|---|---|---|
| Project · Latitude / Longitude | optional; both or neither; −90…90 / −180…180; up to 6 decimals; `.` or `,` as decimal mark | "Enter a latitude between -90 and 90" · "Enter a longitude between -180 and 180" · "Enter both latitude and longitude" · "Use up to 6 decimal places" |
| Project · Status | required (default Active) | — |
| Delete project · Project ID | equals the project's code, ignoring case and outer spaces | — (the button stays aria-disabled) |
| Schedule name (new, details, import) | trimmed, 1–80 | "Enter a schedule name" · "Use 80 characters or fewer" |
| Schedule code (same forms) | required, `^[A-Za-z0-9_.-]{1,24}$`; not a code of another schedule of the project, ignoring case (checked against the cached list; our call) | "Enter a schedule code" · "Use letters, numbers, ., - or _" · "Use 24 characters or fewer" · "This code is already used in this project" |
| Schedule details · Update number / Notes | optional whole number 1–999 / ≤ 2000 | "Enter a whole number from 1 to 999" / "Use 2000 characters or fewer" |
| Import · File | one file; `.xer`, `.xml`, `.xlsx` or `.csv`; ≤ 20 MB | "Choose a file to import" · "Use a .xer, .xml, .xlsx or .csv file" · "File must be 20 MB or smaller" · `.mpp`, `.xls`: §5.2 copy |
| Import · Columns | code and name mapped; Task ID mapped when predecessors refer to it; each column once; header row 1–50; hours per day 1–24 | "Map a column to Activity code" · "Map a column to Activity name" · "Map a column to Task ID" · "Each column can be used once" · "Enter a row number from 1 to 50" · "Enter hours per day from 1 to 24" |
| Import · Status date | optional ISO date | "Enter a valid date" (P1 D12) |

### 6.6 Responsive behavior and accessibility

Projects: below 768 px the toolbar wraps (search full width); the List hides Stage and Client below 1024 px, Type and City below 640 px. Files: the table hides Activities, Notes and Source below 1024 px and Code, Update and Last modified below 768 px. Import: below 768 px the Review step's project table becomes a list of cards. The layout toggle and radio groups use the Radix roles; every icon-only control has an aria-label; new menus reuse `MENU_ITEM_FOCUS_CLASSES`.

---

## 7. Testing

TDD as before: failing test first, exactly as the plan's steps show.

| Layer | Tool | Coverage |
|---|---|---|
| Parser | Vitest on `src/import/**` (in-thread) | P3 full §7's parser cases without the second-version, compare and Excel-writing ones: the detection table and each §5.2 refusal from small byte builders; `FORMAT_FROM_CONTENT`; XER with two projects giving one model per chosen project with its `externalLinks`; XER schedule-level fields and `XER_EXPECTED_FINISH`; MSPDI milestones (first, last, mid-day), manual tasks, status rules, `ID` and Text codes with `CODE_FALLBACK`, `STATUS_DATE_FALLBACK`, recurrences and the 10,000 cap, entities and DOCTYPE refusal, `1.10` stays text; calendar problems used and unused; inheritance and a missing base; encoding (BOM, UTF-8, mostly valid UTF-8, 1254 vs 1252, override); numbers, durations, dates (both xlsx date systems, weekday prefixes, Turkish months, two-digit years; no `new Date(string)`); `foldForMatch`; tokenizer (continuations, quotes, unknown fields, `__proto__` names); CSV and xlsx (delimiters with decimal commas, Turkish and English auto-map, predecessor tokens, constraint names, duplicates, `skipRowsWithIssues`); the zip guard with understated sizes; each `FILE_TOO_MANY_*` just past its limit; every check with and without findings, and again with a status date passed to `analyze`; the generated calendars and their info issues, outside the calendar counts; CSV export escaping; 200-character issue texts and a stored report under 200 KB with 500 long Turkish issues; `pack` round trip; goldens and count rules for every fixture (S4); damaged files (S4); determinism; the budget test (S5) |
| Worker client | Vitest | request ids, watchdog terminates and reports, cancel, fallback without `Worker` |
| Repository contract | `runRepositoryContract` on both adapters | `getProject` and `not_found` for an unknown id; attributes and coordinates round trip, both-or-neither refused; `scheduleCount` leaves out archived schedules and `totalScheduleCount` counts them; `currentSchedule`; `updateProject` (attributes, code conflict, cover change, R6 refusal, input without `statusDate` keeps the synced date); `deleteProject` (owners only; afterwards `getProject` is `not_found` and Deniz's `listSharedWithMe` no longer lists its schedules); `listSchedules` order (fails without the tie-breaks); first schedule current; `setCurrentSchedule` swap and R4; R5 demotion and first baseline becoming primary; update number and code conflicts; codes required on create and import and by `updateScheduleDetails`, not clearable (R8); archive R2; R3 as sets; R9 count, one project and missing ids; editors can't delete; R11 (`updatedAt` moves on a details save, an archive and a demotion, stays on make current; a project's stays on its current schedule's status-date change); import stores mapping, report, counts and format with `hasImport…` true (false on a blank schedule); `getImportReport`, `getImportMapping` (`not_found` for an unknown id; a viewer reads them); `getScheduleSourceFile` right after import returns the original bytes and name; S11's round trip on the mock; viewers get `forbidden` from every new write. **Supabase only** (D34): `not_found` for rows RLS hides (`getProject`, `getImportReport`, `getImportMapping` and `updateProject` on another workspace's project or schedule) in the Supabase-only block of `integration/supabase.contract.itest.ts`, backed by pgTAP |
| Database | pgTAP | `01_schema` (new columns); `02_privileges` (nine RPCs; `projects` keeps its table-level insert and gains an assertion per new column; `schedules`' column-level insert and update; view grants); P2's `04_rls` (§9); `06_storage` (owners delete any object; an editor deletes an unreferenced object they uploaded, not a referenced one); new `08_projects` (checks, coordinate pair, `projects_set_updated_at` column list, `delete_project`: owners only, hidden project `not_found`, cascade, returned paths), `09_schedule_tags` (R1–R9 and R11 on RPCs and direct PATCHes, R3 in both row orders, role checks raising 42501 never a silent 0-row success, the insert trigger's role check before RLS, guards skipping without `auth.uid()`, `backfill_current_schedules` on P2-shaped rows inserted with triggers off), `10_imports` (column checks, path rule, `schedules_source_file_path_uq`, `backfill_import_formats` and its error on an unknown extension, `schedule_items` hiding the three columns with `has_import_*` true exactly when set) |
| Integration | Vitest on the local stack | `getScheduleSourceFile` for a `.gz` and an `.xlsx` object; `deleteSchedules` and `deleteProject` remove their objects and the cover (P2-era imports included); cover replacement deletes the old object; the 20 MB generated XER import (S5, V8); a report near 200 KB of Turkish text passes the 256 KB check; S11's round trip on a stored XER |
| Components | Vitest + Testing Library | Projects page (loading, error, empty, no match, filters and sort in the URL with unknown values ignored, chips, both layouts, viewer and owner menus, the delete confirmation's count and typed check); wizard (new fields and options, coordinates and paste, edit mode, read-only details, R6's disabled status date); files page (NotFound for another workspace's and a shared-only project, counters, Show archived, the state rule, the disabled "Open" entries, empty states, viewer tooltips); Schedule details (suggestion, "Use {n}", baseline hints); New schedule's code; `codes.ts`; import steps with a fake parser client (refusals with "Copy details", Columns validation, the XER project radio and its default rule, rows with errors, conflict under Code, toast and landing page); report view and Import report dialog; downloads and their failure toast |
| Scripts | Vitest | `third-party-licenses.test.mjs`; `check-contrast.test.mjs` covers the new pairs; `read-real-exports.test.ts` runs the script over `src/import/__fixtures__/` and checks its output holds formats, versions, counts, issue codes and check findings but no activity names or codes, and that it exits with an error naming the folder when it is missing or empty |
| E2E (mock) | Playwright | `projects.spec.ts` (layouts, filters persist on reload, edit a project's attributes, delete a project); `files.spec.ts` (make current, details with baseline and update number, archive, show archived, restore, delete); `import.spec.ts` (a Windows-1254 CSV with mapping; an XER with two projects, choosing the second; the report from the row; CSV download); `home.spec.ts` updated (import with a real fixture lands on the files page) |
| E2E (Supabase) | Playwright | import an XER → current on the files page → view report → download the original; viewer Elif sees disabled actions |

---

## 8. Verify at execution time

Task 1 checks V1–V7 and records them in the plan's verification notes; V8 runs with the import integration test; V9 is the last task. Each has a fallback that keeps the design.

| # | Assumption | Fallback |
|---|---|---|
| V1 | Dependencies and licences: `fast-xml-parser` ≥ 5.3.5 (MIT; carries the 2026 fixes for out-of-range numeric entities and DOCTYPE entities overriding built-ins), `papaparse` 5.x (MIT), `fflate` 0.8.x (MIT), `@tanstack/react-table` 8.x (MIT) and SheetJS CE 0.20.3 from `https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz` (Apache-2.0, NOTICE) have no open advisory, and the licence script finds each licence and NOTICE file | pin the last fixed version; for SheetJS, ExcelJS 4.4 behind the same `table/xlsx.ts` interface with the fflate guard as its only size defense |
| V2 | SheetJS CE installs from `vendor/` with `npm ci` offline (integrity in `package-lock.json`), runs in a module worker and honors `dense`, `sheets`, `sheetRows` and the 1904 flag; for `scripts/make-xlsx-fixtures.ts` (P3 full V1's write half), it writes workbooks with `utils.aoa_to_sheet` and `write({ bookType: 'xlsx', type: 'array' })` in both date systems (`Workbook.WBProps.date1904`), which SheetJS reads back with the same serials and current Excel and LibreOffice open without a repair prompt | as V1; for writing, the script builds the workbook parts itself and zips them with `fflate` |
| V3 | `fast-xml-parser`: `processEntities: false` leaves `&amp;` and character references as written; `parseTagValue: false`, `isArray`, `removeNSPrefix` behave as §5.6 in a worker | if it decodes entities anyway, `xml-text.ts` decodes nothing and the fixtures pin that |
| V4 | Papa Parse parses a decoded string in a worker with an explicit delimiter | always pass our scorer's delimiter |
| V5 | `TextDecoder` supports `windows-1254`, `windows-1252`, `utf-16le/be` with `fatal` in Chromium, Firefox and Safari workers and in Node 22 | 128-entry decode tables for the two single-byte pages |
| V6 | A Vite module worker builds, loads under the CSP (`default-src 'self'`) and has `crypto.subtle` | `worker.format: 'iife'`; hash in the main thread |
| V7 | Supabase Storage: `storage.download(path)` returns the bytes of an object the reader may select; `storage.objects.owner_id` holds the uploader's id as text and policies can read it; SQL deletes of `storage.objects` are refused, so the adapter removes objects | the older `owner` uuid column; removal stays in the adapter |
| V8 | The 20 MB generated XER compresses to 4 MB or less, and its upload and insert finish inside 60 s on the local stack (production with the next rollout) | report to the owner before changing P2 D18 |
| V9 | **Real exports — the controller stops here and asks the owner for the files** (D2, D25). `scripts/read-real-exports.ts [folder]` runs the parser over the folder given, or the main checkout's git-ignored `real-exports/` (found from any worktree as the parent of `git rev-parse --path-format=absolute --git-common-dir`): P6 XER files from two P6 versions, a Microsoft Project XML, an Excel export in Turkish and one in English (the owner names the tool that wrote each), and one file of about 10,000 activities. Their counts match the source tool's totals, which the owner reads from that tool (activities, links, WBS elements, calendars); the XER field names of §5.5 are the ones real files use; MSPDI milestone times sit on the first or last working minute; the 10,000-activity file stays inside S5's budget; and the Turkish export shows how its tool writes link types, lags, duration units, dates and constraint names (P3 full V11). Only formats, versions, counts, issue codes, check findings and those tokens go into the notes, never names, codes or other content. A missing folder or file stops the task until the owner adds it or says to go on without it; the notes then list the gap | each difference becomes a fixture written from scratch that reproduces it, and a fix; new tokens join `durations.ts`, `dates.ts`, `predecessors.ts` and `constraints.ts`, each with a fixture row |

---

## 9. Changes to Phase 1 / Phase 2 artifacts

- **Contract and adapters:** `types.ts` and `repository.ts` (§4.1–4.2; `scheduleCount` changes meaning, so Home's `ProjectCard` count follows it); `MockRepository`, new `src/data/mock/schedule-rules.ts`; `SupabaseRepository`; `mappers.ts` (`mapScheduleItem` replaces `mapSchedule`; `projectFrom` and `mapProject` take the recreated view's row type in the `p3_core_projects` task; `toProjectInsert`, new `toProjectUpdate`); `errors.ts` (§4.11); `MockDb` and `MOCK_DB_VERSION` 3, `seed.ts` (§4.5), `integration/seed-loader.ts`; `makeNewProjectInput` (the new fields), a new `makeImportScheduleInput` in `src/test/fakes.ts` (a valid stored blob, mapping and report from a fixture) and the contract's existing `createSchedule` and `importSchedule` cases, which now pass a code and the import fields.
- **Database:** three new migrations; `database.types.ts` regenerated after each; P2's `projects_set_updated_at` and `schedules_set_updated_at` recreated with column lists (R11); P2's `schedule_imports_delete` replaced (§4.9); `project_summaries` recreated twice; pgTAP `01_schema`, `02_privileges` (nine RPCs, the new column assertions, `projects`' table assertion unchanged), `06_storage` and three new files; P2's `supabase/tests/04_rls.test.sql`: the viewer's schedule insert still expects 42501, now raised by the insert trigger's role check, and the editor's schedule insert gains a code (without one it would get R8's `validation`); `integration/storage.itest.ts`' `schedule-imports` delete cases follow §4.9.
- **Hooks:** `query-keys.ts`; `useProjects.ts` (`useProject`, `useUpdateProject`, `useDeleteProject`); `useSchedules.ts` (new mutations; P2's `allProjects()` prefix kept, plus `allSchedules()` and `sharedWithMe()`); new `useProjectSchedules.ts`, `useImportParser.ts`, `useImportReport.ts` (with `useDownloadImportReport` and `useDownloadSourceFile`).
- **Routes and pages:** `router.tsx` — `/w/:workspaceId/projects` and `/w/:workspaceId/p/:projectId/files` render the new pages; `ProjectPlaceholderPage` stays for Dashboard and Schedule (its Files cases move to the new page's tests); `router.test.tsx` (the Projects h1) changes; `SidebarNav` is unchanged.
- **Dialogs:** `DialogKind` and `DialogOptions` (§6.4); `DialogHost` renders the new kinds.
- **Wizard:** `project-schema.ts` (`ProjectFormValues`, `STEP_FIELDS`, option lists, `PROJECT_TYPES`, coordinate rules, `toNewProjectInput`, new `toUpdateProjectInput`); `NewProjectWizard` edit and read-only modes; `AttributesStep`, `LocationStep`.
- **Schedules and import:** `schedule-schema.ts` (`SCHEDULE_EXTENSIONS` adds `.xlsx`; `.mpp` and `.xls` refused with §5.2 copy; the required code); `NewScheduleDialog` gains "Code" and lands on the files page; the P2 `ImportScheduleDialog` gains "Code" for the interim path (§2.4) and is then replaced by the stepped dialog in `src/features/import/`; `FileDropzone` accepts the xlsx MIME type.
- **Home:** `ProjectCard` shows the status badge and takes an optional actions slot (used on the Projects page only); its links are unchanged.
- **E2E:** `e2e/home.spec.ts` (the Code field during the interim path, then the stepped import with a real fixture landing on the files page); `e2e-supabase/supabase.spec.ts` gains the import test of §7; its other tests are unchanged.
- **Config:** `package.json` dependencies and `vendor/`; ESLint rules (§3, scoped to `src/**`); `.gitignore` adds `/real-exports/` in Task 1; the `storage.ts` key list adds `ui.projectsLayout`; `scripts/third-party-licenses.mjs` runs in CI after the build; `scripts/check-contrast.mjs` adds the §6.1 pairs; new `scripts/make-xlsx-fixtures.ts` and `scripts/read-real-exports.ts`.
- **Runbook** (`docs/runbooks/production.md`): the privacy-notice line added to the ITU data-protection check: stored original files can hold third parties' personal data (resource names and rates, the exporting user, email addresses), are readable by every member of the workspace and are kept until their schedule is deleted; the storage policy change ships with the next rollout.
- **CLAUDE.md:** Phase 3 core status and sources of truth (this spec and its plan; P3 full as the reference for "Phase 3 later"), the parser layer rule, the new dependencies, and the rule that real exports are read only by V9, by path, and never copied or committed.

---

## 10. Left to the builder

- File and component splits inside §3's folders; worker message types beyond `inspect`, `preview`, `analyze`, `pack`, `cancel`; the exact signature of `inspect`'s result.
- The contents of the hand-written fixtures and the generator for the budget files, as long as they cover §7's cases.
- Skeleton shapes, spacing and token choices within the P1 design system.
- The alias word lists in `auto-map.ts` beyond §5.7's examples; the element names in the `outcomes.ts` catalog, in our own words, as long as every table and element the readers read, count or know of has one outcome.
- Internal helpers for the mock rules.

---

## 11. Decisions log

| # | Decision | Reason |
|---|---|---|
| D1 | **Owner decision 2026-11-05:** usability first. No one-to-one copy of the reference product, like a paid edition with every feature; the app should reach a functionally usable level. Stage 1 is this Phase 3 core, about 20–25 test-first tasks in one plan; stage 2 is a Phase 4 core of about 35–45 tasks, specified later; "usable" means a planner imports a real XER, MS Project XML or Excel schedule, sees it in a grid and Gantt, calculates CPM and edits it, which is P4's job on this phase's data. Everything else of P3 full goes to "Phase 3 later" (§2.3) | Owner instruction 2026-11-05, replacing P3 full D31's five plans |
| D2 | **Earlier owner decisions that still apply:** sector means ownership — public, private, public–private partnership (P3 full D15, Q5); the owner's real exports are used only locally from a git-ignored folder and never committed, not even anonymized (P3 full D68, Q4); the reference product is a functional guide only, with our own copy and visual identity (owner 2026-11-05, revising P3 full D32's function-by-function match) | Owner decisions 2026-11-03 and 2026-11-05 |
| D3 | The owner approved the Turkish date format; P4 core decides how schedule dates display. The core stores no time zone or date format and keeps P1 §6.10's formats on its own screens | Owner decision 2026-11-05; P3 full R20 and R22 wait for "Phase 3 later" |
| D4 | The core's scope is the owner's list of 2026-11-05: the Projects page, project attributes and edit mode, project deletion, the files page with tags, notes, details, archive and delete, single-file import of the four formats with §5's decisions, and the infrastructure under them | Owner decision 2026-11-05 |
| D5 | Keep `Schedule` / `schedules` (P3 full D2) | URLs, shares and P2 tests use the name |
| D6 | An import keeps the original file, its details, the mapping and the report; P4 materializes activities from the file (P3 full D3); the core pins the `ImportModel` type and the `analyze` entry point P4 calls (§5.8; field names our call) | The owner asked for a precise hand-over; a pinned type lets P4 core be specified against it |
| D7 | Parse in a module Web Worker; the parser is pure TypeScript in `src/import` behind a lint boundary; typed `postMessage` (P3 full D4) | 20 MB files must not block the page; the same code runs in tests and in a P4 script |
| D8 | Libraries: fast-xml-parser, papaparse, SheetJS CE 0.20.3 from a vendored tarball (reading only), fflate, `@tanstack/react-table` (P3 full D5, D19) | Maintained, permissive licences; npm's `xlsx` 0.18.5 has known CVEs |
| D9 | Status dates stay `date`; the file's time of day stays in the report (P3 full D6) | Every screen and trigger uses date-only values |
| D10 | The project's status date follows its current schedule (R6, P3 full D7) | One status date per project for filters, sort and the counters |
| D11 | One current schedule per project, the first one current; it can't be archived, nor deleted while others exist (P3 full D8). In the core, menus leave out what the row's state forbids and the database refuses it with the R copy, instead of P3 full's blocked reasons (P3 full D35) and its "Archive the current schedule" dialog (P3 full D51) (our call) | The owner deferred the blocked-reason system; P2's viewer pattern already leaves out what can't be done |
| D12 | Tags: `is_current`, `baseline` with one primary (the first baseline becomes primary), `update_number` 1–999 unique with a status-date suggestion (P3 full D9, D37) | App map §2.3 |
| D13 | Archive and delete are invoker RPCs over id arrays with R9's checks; the UI passes one id; invariants live in triggers so direct calls obey them; R3 is checked per statement (P3 full D11, D27, D28) | The bulk bar arrives later without a migration |
| D14 | Deleting schedules stays owner-only (P2 §7.1); deleting a project is owner-only with a typed confirmation (P3 full D12, D42, D43) | P2's RLS stands |
| D15 | One file per import, always a new schedule; an XER of several projects shows one radio row per project, and the first row without errors starts chosen, flagged projects before the others, each in file order; none is chosen only when every row has errors (owner 2026-11-05 for one project per run; the order extends P3 full D57's rule, our call) | Owner decision; a default that skips rows with errors never starts the user on a row they can't import |
| D16 | "Open" and "Open current schedule" are disabled with a note until P4 core's editor exists (owner 2026-11-05, superseding P3 full D21 for them). After an import or a new schedule the app opens the project's files page (P3 full D22; for New schedule our call) | The schedule route is a placeholder until P4 |
| D17 | Stored originals are gzipped for XER, MSPDI and CSV; xlsx as it is (P3 full D29) | Keeps P2 D18's 60 s timeout workable on slow site connections |
| D18 | The migrations carry P2 data over: a current schedule per project, source formats from file names (P3 full D30) | Production may hold P2 data before this phase |
| D19 | Schedule codes are required for every schedule created from the core on, with suggestions; P2-era ones get a code when someone saves their details (P3 full D50, D59) | One rule and one zod schema for every form |
| D20 | "Edit project" is the wizard in edit mode; viewers see it read-only as "Project details" (P3 full D25) | Older projects need a way to get the new attributes |
| D21 | Filters and sort live in the URL, the layout in `ui.projectsLayout` (P3 full D18) | URLs survive reloads and can be shared |
| D22 | The mock keeps original files in memory only and stores each report with its first 50 issues (P3 full D23) | `localStorage` can't hold 20 MB files or twenty full reports |
| D23 | Parser rules carried over unchanged: detection by content with its refusals (P3 full D46), calendar problems (P3 full D47), MSPDI milestones, manual tasks, codes and status (P3 full D48), the report's summary, outcomes, checks and "Copy details" (P3 full D49), pinned codes for every limit and one message for every unreadable workbook (P3 full D61, D69) | Decided in P3 full; nothing in them depends on a deferred feature |
| D24 | Projects sort by "Last updated" by default (`updatedAt`, Home's order) until visits arrive with "Phase 3 later" and bring back "Recently opened" (our call) | P3 full's default needs `project_visits`, which is deferred |
| D25 | One stop point for real exports: P3 full V11's Turkish-token check is folded into V9 at the plan's end, and the exports may sit in any folder outside the repository, given to the script as its argument (our call) | One plan, one place where the controller asks the owner; the folder argument avoids an untracked folder in `main` before the ignore rule is merged |
| D26 | No main-chunk script: ESLint keeps `src/import/**` out of components, forbids static imports of the parser libraries outside it, and makes `client.ts` load its fallback with `import()` (our call) | The owner deferred the script unless needed; the import rules prevent what it would detect |
| D27 | Also left for later, beyond the owner's deferred list (our call): earlier column mappings, the files page's selection and bulk bar, its search, tag and notes filters and sortable headers, the archive-current dialog, the setup list, the Projects page's "Shared with me" link and "Import and open" | Keeps the plan at about 24 tasks; each is additive and keeps its seam (§2.3) |
| D28 | `getImportMapping` and `getScheduleSourceFile` ship in the core, with the "Download original file" row action (our call) | They complete P4's hand-over (S11) and prove the stored copy round trip on both adapters |
| D29 | Imports arrive unprotected in the core; the "Phase 3 later" migration that adds protection protects existing imports with an unknown holder (our call, P3 full §4.6's pattern) | Protection is deferred; no column is needed now |
| D30 | P3 full R18 (archived schedules read-only in content) waits with protection and saved versions (our call) | In the core it would guard only the status date of an archived schedule |
| D31 | The projects `updated_at` trigger keeps `app.set_updated_at()` with a column list that leaves out `status_date`; P3 full's depth-checking `app.set_project_updated_at()` waits for programs (our call) | Without programs, no trigger or foreign-key action writes a listed column |
| D32 | The worker's `pack` builds the stored report (§5.10 caps); a code conflict shows under the Code field; a schedule without a stored file refuses `getScheduleSourceFile` with "This schedule has no original file."; the Delete project dialog has its own line for a project without schedules; the one-schedule Review layout (a project table only for multi-project XER, then the fields and the report view) (our calls) | Small gaps the full spec left open for the core's single-file flow |
| D33 | The storage delete policy follows P3 full §4.9: owners delete any object, editors only their own unreferenced uploads | No editor can remove an original that P4 will read |
| D34 | Contract cases for rows hidden by RLS run on Supabase only; both adapters keep `not_found` for unknown ids (our call) | The mock doesn't filter by membership (P2 D26) and its seed has no workspace the test user can't see |
| D35 | `prepare_new_schedule` checks that a user caller is an editor or owner of the row's project before anything else, raising 42501 (our call) | A definer `before insert` trigger runs before RLS's check, so without it a viewer would meet R8 or the path rule first, or take the project lock |
| D36 | Every task ends with all five suites green; each migration task carries the code that adapts to it; the P2 import dialog keeps working through the interim import path of §2.4 until the Review task (our call) | One commit per task stays releasable, and Home's import never breaks between tasks |
| D37 | The status date reaches `analyze` as an option outside `ImportMapping`; the Review step re-runs the checks when it changes, so the stored checks use the schedule's own date (our call) | The status date is the schedule's, not a reading choice; keeping it out of the mapping lets P4 re-read with the schedule's current date |
| D38 | "Import" names what blocks it: "Fix the errors before importing. This schedule can't be imported as it is." when the chosen or only schedule has errors, and "Choose at least one schedule to import." only when every project of an XER has errors, so none could be chosen (§5.1, §6.4; our call) | With D15's default, an empty choice can only mean that no row is importable |
| D39 | `scheduleDetails` and `importReport` open with `{ projectId, scheduleId }` and read the schedule from `useProjectSchedules` (our call) | The dialog needs the schedule's name and `createdAt`, which the stored report doesn't hold, from a query the files page has already cached |
| D40 | `projects` keeps P2's table-level insert; only the column-level update grant grows (our call) | The new columns are safe to insert; keeping P2's grant leaves `02_privileges`' table assertion unchanged |
| D41 | The On hold badge layers `bg-warning-bg` over an opaque `bg-card` chip (our call) | The dark `--warning-bg` is translucent; the layering needs no new token, and `check-contrast.mjs` already checks that exact pair |
| D42 | The S7 import rule covers `src/**` only; `scripts/make-xlsx-fixtures.ts` writes the xlsx fixtures with SheetJS, in both date systems (our call) | The fixtures need real workbooks of both systems, and scripts never reach the browser bundle |
| D43 | Generated calendars ("Standard" and name-made ones for tables, "24 hours" for elapsed MSPDI durations) stay outside the calendar counts, carry `gen:` ids and are each reported by an info issue (our call) | The count rule describes what the file holds; the issues still say what the import added |
| D44 | Compatibility rule: a clean schemaVersion-1 import never gains an error in a later parser version; new checks add warnings or info only (our call) | P4 re-reads stored originals with newer parsers (Goal 4, §5.8); an import that worked must keep working |
| D45 | `analyze` is asynchronous and returns `Promise<AnalyzeOutcome>`, a union that also covers a refused file; §5.8's synchronous signature is read that way, and P4 awaits it (our call, while writing the plan) | The source hash uses `crypto.subtle`, which only exists as a promise, and a damaged xlsx is refused rather than reported |
| D46 | Where this spec is silent, the plan decides: empty table rows are ignored, not counted as read; archiving an empty list does nothing; an unknown id in `set_current_schedule` gets R9's copy; an unknown schedule gets "Schedule not found"; `STATUS_DATE_MISSING` applies to XER only; elapsed table durations use the "24 hours" calendar; the remembered Projects layout `ui.projectsLayout` lives in its hook like the other remembered settings (our call, while writing the plan) | Each is the reading a planner would make; V9 checks the format guesses (MSPDI exception types, the XER settings fields, `plan_end_date` as must-finish-by, the project name from the root WBS node) against the real exports |
| D47 | Test files under `src/**` outside `src/import/**` and `src/test/**` get their own ESLint block: it keeps the adapter rule but allows `@/import/**` (the client and `?bytes` fixtures) and the parser libraries, pinned by a row in `scripts/import-boundaries.test.mjs`; Task 22 adds it (our call, after Task 1's review) | S7 is about components; Task 22's pinned dialog test imports the import client and fixtures, which block 1 would otherwise refuse |
| D48 | SheetJS CE 0.20.3 ships a LICENSE and no NOTICE file, so its licence entry has no NOTICE section; two MIT packages (`@nodable/entities`, `react-remove-scroll-bar`) ship no licence file and are listed with their licence name only (recorded in V1, Task 1) | Apache-2.0 §4(d) asks for a NOTICE only when the work includes one |
| D49 | In table dates a two-digit year is read only where the year comes last (`DD.MM.YYYY`, `DD/MM/YYYY`, `MM/DD/YYYY`); `YYYY-MM-DD` needs a four-digit year (owner, 2026-11-10, after Task 9's review) | `15-Mar-26`, Excel's `d-mmm-yy` and P6's `dd-Mon-yy`, was otherwise read as 26 March 2015 without any issue; two-digit year-first dates are practically unused |
| D50 | Table duration units add `mins`, `minute`, `minutes` (minutes) and `dy`, `dys` (days); the `e` prefix makes them elapsed (`30 emins`) (owner, 2026-11-10, after Task 9's review) | Microsoft Project writes these spellings in table exports; without them every such cell got `TABLE_BAD_DURATION` |
| D51 | XER: a missing, self-referencing or cyclic `base_clndr_id` is a warning (`XER_CALENDAR_BASE_MISSING`) and the calendar is read as written; inheritance from a base that is present still applies. MSPDI: `BaseCalendarUID` -1, 0 or -65533 means no base; any other UID not in the file is still `CALENDAR_BASE_MISSING` (owner, 2026-11-10, after the Open Planner Studio study, D58) | P6 writes a derived calendar's inherited week and exceptions into its own `clndr_data`; Project 2013 and later write 0 for a base calendar |
| D52 | MSPDI tolerance: dates may carry fractional seconds and a zone, both dropped (the wall clock as written is read, `MSPDI_DATE_ZONE_DROPPED` once per import); `NA` is an empty value; a root `Project` in no namespace whose first 64 KB hold `<Tasks>` or `<Calendars>` is MSPDI (`MSPDI_NO_NAMESPACE`) (owner, 2026-11-10, D58) | Third-party writers produce these files; refusing them gives the user nothing to act on |
| D53 | XER `clndr_data` repairs, each reported once per calendar as `CALENDAR_DATA_REPAIRED`: one stray `)` before `Exceptions`, several `Exceptions` containers merged, a date listed twice (the working entry wins), compact `(s|…|f|…)` and `d|epoch(…)` records; overlapping periods, non-zero seconds and 24:00 as a start stay `CALENDAR_UNREADABLE` (owner, 2026-11-10, D58) | Hand-edited and older exports carry these; the repaired calendar is the one P6 shows |
| D54 | XER: an unknown `task_type` reads as task; a blank or unknown `status_code` is derived from the actual dates and % complete (as MSPDI's status rule); each gives `XER_UNKNOWN_VALUE` with {field} "type" or "status", {value} the raw value or "empty", {used} the value used (owner, 2026-11-10, D58) | The import goes on with the closest reading and says what it did |
| D55 | XER numbers use the decimal and grouping symbols of the `CURRTYPE` row named by `ERMHDR`'s currency field; a numeric field with a decimal comma and no such row is read with a decimal comma and gives `XER_DECIMAL_COMMA` once (owner, 2026-11-10, D58) | P6 writes numbers in the currency's format; Turkish installations may use a decimal comma |
| D56 | XER: a project named in another project's `sum_base_proj_id` is that project's baseline: never chosen by default, and its Review "Source" ends "· Baseline of {code}" (owner, 2026-11-10, D58) | A baseline project is not a schedule the user means to import |
| D57 | Limits: at most 100,000 calendar exception dates across all calendars, read and expanded (`FILE_TOO_MANY_EXCEPTIONS`); an xlsx archive of more than 1,000 entries is refused like any other unreadable workbook (owner, 2026-11-10, D58) | 200 calendars × 10,000 dates allowed 2 million; a normal workbook has about 20 entries |
| D58 | Open Planner Studio (OpenAEC, LGPL-3.0) is a rules reference: its readers and engine are studied and the rules are written here in our words; none of its code is copied (owner, 2026-11-10, option A; study in `docs/product/ops-study.md`). Readings taken from it within this spec (our call): XER hour values with six-decimal noise round to the whole minute (26.666667 h → 1600 min) while real fractions stay; a raw line break inside an XER cell is rejoined only when the field count then matches (at most 8 lines); in XER notes two `0x7F` bytes are a line break and NUL and BOM characters are dropped; WBS siblings order by `seq_num`, then numeric `wbs_id`, then line; an activity whose `wbs_id` lies outside its project goes to the top level; `data_date` is the status date only when `last_recalc_date` is absent; `CS_MANSTART`/`CS_MANFINISH` and bare `FS`/`SS`/`FF`/`SF` are aliases; MSPDI booleans may be `true`/`false`; an MSPDI link with `CrossProject` 1 is external before its UID is looked up; `LagFormat` 19 and 20 are percentages in tenths of a percent, and the elapsed formats are 4, 6, 8, 10, 12 and 20; legacy `DayType 0` exceptions are read only when there is no `Exceptions` element; an exception period of 00:00–00:00 is the whole day; an exception record without both dates is skipped (`CALENDAR_DATA_REPAIRED`); the project calendar is `Project/CalendarUID`, else the first `Calendar`; an xlsx integer serial is date-only unless the cell's number format shows a time; `LINK_DUPLICATE` keys on predecessor, successor and type (an SS and an FF between the same two activities are two links); a recurrence that adds no date stops after 100,000 steps (`CALENDAR_RECURRENCE_UNSUPPORTED`) | These come from real files the reference was tuned on (about 93 XER, 160 MSPDI); each sits inside what this spec already allows, and V9 checks them against the owner's exports |
| D59 | XER digit grouping: the `CURRTYPE` grouping symbol is applied only when the declared decimal symbol follows the groups (`1,234.5` with `.`/`,` is 1234.5); a number with only one separator reads it as a decimal, so `26,667` with `.`/`,` is 26.667 with `XER_DECIMAL_COMMA`, and `26.667` with `,`/`.` is 26.667. Refines D55 (owner, 2026-11-10, Task 10 quality review) | Whether P6 writes digit groups in XER is unknown until V9; a grouping read wrongly is off by a factor of 1,000 with no warning, a decimal read wrongly is flagged |
| D60 | MSPDI: an activity's remaining window runs from `Resume` to its finish; without `Resume` it is empty, and `Stop` isn't kept. Replaces the reading "`Stop` and `Resume` as the remaining window" (owner, 2026-11-11, Task 11 review) | In Microsoft Project `Stop` ends the actual part and `Resume` restarts the remaining work, so this matches the XER remaining window (restart to re-end) that Phase 4's progress rules read; P4 re-reads stored originals for anything more (D44) |
| D61 | The generated standard day starts at 08:00 up to 15 hours; a longer day starts early enough to end at 24:00 (16 h: 07:00–12:00 and 13:00–24:00; 24 h: the whole day) and keeps the 1-hour break only while it fits. `CALENDAR_GENERATED_STANDARD` and `CALENDAR_GENERATED_FROM_NAME` say "from {start}" with the real start (owner, 2026-11-11, Task 11 review) | Hours per day allows 1–24, and a day from 08:00 can't hold more than 15 hours and a break; the copy must stay true |
