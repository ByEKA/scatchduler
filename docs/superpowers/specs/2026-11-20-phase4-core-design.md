# Phase 4 core — Schedule Engine, Grid, Gantt and Editor — Design Spec

| | |
|---|---|
| **Date** | 2026-11-20 |
| **Status** | Approved 2026-11-20 by the product owner (built from owner decisions 2026-11-20 on scope, snapshot storage, calculation mode, Canvas Gantt, date format, explicit save/lock and dependencies) |
| **Builds on** | Phase 3 core complete (`4216215`): `2026-11-05-phase3-core-design.md` (§5.8 P4 hand-over), `2026-10-14-phase2-supabase-design.md`, `2026-10-14-home-shell-design.md`; `docs/product/app-map.md` (§1, §2.1–§2.3, §3.1–§3.3, §5 Schedule editor); `docs/product/roadmap.md` (§2 row P4, §3); `docs/product/ops-study.md` Part 1 (rules reference only; never copy code, P3 core D58) |
| **Plan** | One plan of about 36–42 test-first tasks, written after owner approval (§2.4) |
| **Supersedes** | Enables P3 core's disabled "Open" (row menu) and "Open current schedule" (files page) controls (§6.1 / D16) and replaces `ProjectPlaceholderPage` on `/w/:workspaceId/p/:projectId/schedule`. Revises `roadmap.md §3` (Canvas 2D from the start with a `Draw2D` seam instead of dual SVG + Canvas renderers; typed `postMessage` worker without Comlink, matching `src/import/client.ts`). Resolves the `app-map.md §3.1` vs P6 lag-calendar conflict (ops-study Part 1) by making lag calendar a profile-driven schedule setting read from the source file |
| **Numbering** | This spec's S, R, V and D numbers are its own and start at 1; "P3 core §5.8" or "P3 core R6" cites the Phase 3 core spec |
| **Readers** | Implementer and product owner |
| **Language** | All UI copy, code and docs in English |

---

## 1. Summary

Phase 4 core turns the app into a working construction scheduling tool. Opening any schedule from the Files page, Home, or the new TopBar **Schedule switcher** lands on `/w/:workspaceId/p/:projectId/schedule?scheduleId=…`. Every schedule carries a versioned, gzipped **`ScheduleDocument`** snapshot stored in a private `schedule-data` bucket (created at import time for new imports, materialized on first open for P3-era imports, or started empty for blank schedules). A pure-TypeScript **CPM engine** (`src/engine/**`) runs in its own Web Worker with explicit scheduling profiles (`p6`, `msp`, `default`), minute-precision calendars, iterative cycle detection, forward/backward passes, floats, critical path, driving-path trace, and WBS rollups. Imported schedules open in **"As imported"** display mode so source dates remain intact until the planner recalculates (`F5` / **Calculate**, or opt-in Auto-calculate). The **Schedule editor** pairs a virtualized WBS/Activity grid (`@tanstack/react-table` + `@tanstack/react-virtual`) with a 60 fps pure **Canvas 2D Gantt** (`Draw2D` abstraction ready for Phase 7 vector PDF), a docked **Details & Relationships** inspector, fast activity search, and explicit-save **Edit mode** guarded by database-enforced version locks, optimistic concurrency (`data_revision`), and patch-based Undo/Redo.

The reference product and Open Planner Studio stay functional/rules guides only (P3 core D2, D58); every line of code, copy and visual token is our own.

---

## 2. Goals, success criteria, non-goals

### 2.1 Goals

1. **Zero-friction opening of real schedules.** A planner opens any imported XER, MSPDI XML, Excel or CSV schedule — up to 50,000 activities and 150,000 relationships — and sees its exact WBS hierarchy, activities, relationships, dates, floats and Gantt timeline in under 2 seconds (for 10,000 activities).
2. **Trustworthy, transparent CPM.** Imported dates stay untouched on open ("As imported") until recalculated; explicit scheduling profiles (`p6`, `msp`, `default`) govern progress, float, lag-calendar and milestone boundary rules with zero source-format branching in the solver; first-calculation dates are checked against source-file oracle dates with a regression ratchet.
3. **Smooth editing without accidental breakage.** Editors acquire an exclusive lock to enter Edit mode, edit activities, WBS nodes, relationships and schedule settings through pure validated commands with 100-step Undo/Redo, recalculate on demand (`F5`) or automatically, and commit atomically with explicit **Save** (`Ctrl+S`) or **Discard**.
4. **Clean seams for P5–P7.** `ScheduleDocument`, `SolveResult`, `Draw2D` and the command `forwardPatch` format feed Phase 5 (views/filters/calendars/resources/custom fields), Phase 6 (version diff & DCMA quality), and Phase 7 (comments by activity code, audit `HistoryEntry`, vector PDF, XER/Excel export) without rewriting Phase 4 core.

### 2.2 Success criteria (all must hold)

| # | Criterion | Verified by |
|---|---|---|
| S1 | The repository contract (P2 + P3 + §4.2's new snapshot and lock methods) passes on both `MockRepository` and `SupabaseRepository` | `npm test` (mock), `npm run test:integration` (Supabase) |
| S2 | Database and storage isolation: non-members read nothing; viewers and share recipients receive `forbidden` on all lock, materialize and save writes; saves fail without an active lock held by the caller or on stale `data_revision`; only workspace owners can force-release another user's lock; `schedule-data` RLS lets members and share recipients read snapshots and prevents editors from deleting active snapshots | `npm run test:db` (pgTAP) |
| S3 | Rules R1–R12 hold identically on Postgres and `MockRepository` | `npm run test:db`, repository contract suite |
| S4 | CPM engine correctness: hand-worked JSON batteries (FS/SS/FF/SF, positive/negative/elapsed lags, 4-way lag calendars, all 9 constraints + secondary constraints, all 5 activity types, multi-period calendars + exceptions, `retained_logic` vs `progress_override`, critical path by TF & longest path, driving links & driving-path trace, WBS rollups, cycle path reporting) and `fast-check` property invariants pass deterministically across `UTC`, `America/Los_Angeles`, `Europe/Istanbul` and `Pacific/Auckland` | `npm test` (`src/engine/**`) |
| S5 | Oracle fidelity ratchet: first calculation on committed fixtures (`two-projects.xer`, `legacy-p6.xer`, `project.xml`) compares `es`, `ef`, `ls`, `lf`, `tf`, `ff` and driving path against source values under a pinned per-file ratchet that fails on any regression; optional `scripts/check-cpm-oracle.ts` checks git-ignored `real-exports/` the same way | `src/engine/oracle.test.ts`, V4 |
| S6 | Performance budgets: 10,000 activities / 15,000 links solves in **< 300 ms** (< 1 s in CI); 50,000 activities / 150,000 links solves in **< 2 s** (< 5 s in CI) with zero stack overflow; 50,000-activity gzipped snapshot ≤ **10 MB**; Canvas Gantt renders a 10,000-row viewport frame in **< 16 ms** | `src/engine/budget.test.ts`, `integration/schedule-data.itest.ts`, V3, V6, V7 |
| S7 | Architecture and ESLint boundaries: `src/engine/**` is pure TypeScript (zero React, hooks, UI, adapters, DOM/Canvas or parser libraries); `src/engine/client.ts` statically imports only `./protocol` and types; only hooks import `@/engine/client`; Gantt renderer (`src/features/schedule/gantt/renderer.ts`) imports no React, hooks or data adapters; `src/engine/worker.ts` builds as its own worker chunk without parser libraries | ESLint, `scripts/import-boundaries.test.mjs`, V2 |
| S8 | End-to-end flows work on mock and Supabase: open imported XER ("As imported") → enter Edit mode (lock visible on Files page) → edit duration & add relationship → see stale indicator → `F5` Calculate → inspect critical path & driving path → Undo/Redo → Save & reload preserves edits; blank schedule creation + editing works; viewer sees read-only editor with disabled Edit + tooltip | `npm run test:e2e`, `npm run test:e2e:supabase` |
| S9 | `npm run check`, `npm run build`, `third-party-licenses.txt`, `test:db`, `test:integration`, `test:e2e`, `test:e2e:supabase`, `check:secrets` and `db:types` diff all pass locally and in GitHub Actions CI | GitHub Actions |
| S10 | Zero hard-coded colors in grid or Canvas Gantt: Canvas reads active CSS theme tokens from `src/index.css`, and every new Gantt/grid token pair passes `scripts/check-contrast.mjs` in both light and dark themes | `npm run check:contrast`, `scripts/check-contrast.test.mjs` |
| S11 | Keyboard and screen-reader usability: grid row/WBS navigation (`↑`/`↓`/`←`/`→`), inline cell edit (`Enter`/`Escape`), `F5` calculate, `Ctrl+Z`/`Ctrl+Shift+Z` undo/redo, `Ctrl+S` save, `Ctrl+F` search; virtualized rows expose `aria-rowcount`/`aria-rowindex`; `aria-live` announces calculation result, cycle errors and lock state | component tests, `e2e/schedule.spec.ts` |
| S12 | Clean hand-over seams verified: `Draw2D` runs headless in Node tests (future vector PDF); command patches produce serializable `forwardPatch` payloads (future `HistoryEntry`); `ScheduleDocument` + `SolveResult` carry stable activity codes for P6 diff/quality and P7 comments | unit tests (`renderer.test.ts`, `commands.test.ts`) |

### 2.3 Non-goals

**Deferred to "Phase 4 later"** (owner decision 2026-11-20, D1):

| Deferred | Seam kept in P4 core |
|---|---|
| Direct drag-and-drop bar resize/move and drag-to-link drawing on Gantt canvas | Pure hit-test geometry helpers (`hitTestBar`) live next to `renderer.ts`; edits go through the same command layer |
| Command palette (`Ctrl+K`) | `cmdk` is already installed; editor commands are already declarative functions |
| P2-era legacy import recovery wizard (imports with null `import_mapping`) | Schedule page shows a clear read-only notice with "Download original file" so the user can re-import |
| Spreadsheet multi-cell range selection / copy-paste across cells | Single-row selection and inline cell edit run through the same command/plan layer |
| Multiple float paths (P6 multi-float-path analysis) | `SolveResult` keeps per-link `freeFloat` and `isDriving` so multi-path walks add cleanly later |
| P6 6.x/7.x non-working-day quirk, weekend reconstruction, `TT_FinMile +1 min`, `ImportModel` v2 additions (deadlines, dynamic percent lags, P6 expected finish, suspend/resume) | `ImportModel` and `ScheduleDocument` carry `schemaVersion: 1`; additive parser/document version bumps follow P3 core D44 |

**Later phases** (per `roadmap.md`): saved views, column sets, custom filters/grouping/sorting, calendar editor UI, resources, assignments, curves, custom fields (**P5**); version diff, baseline compare overlay on Gantt, DCMA 14-point quality engine and Dashboard (**P6**); comments, persisted audit `HistoryEntry`, sharing UI, vector PDF print, Excel/XER export, settings pages (**P7**); real-time co-editing (explicit non-goal — version lock model stands).

### 2.4 Delivery: one plan

Estimated **38 tasks** (range 36–42) in one test-first plan, following P3 core's execution model (every task ends with all applicable suites green):

| Group | Tasks | Contents |
|---|---|---|
| Setup & tokens | 2 | V1–V2 checks (`@tanstack/react-virtual`, `fast-check`, licence check); ESLint `src/engine/**` boundaries + `import-boundaries.test.mjs`; Gantt/grid CSS tokens + `check-contrast.mjs` |
| Database, storage & contract | 5 | `p4_core_schedule_data` migration (`schedule-data` bucket, lock/revision columns, 6 new RPCs, updated `delete_schedules`/`delete_project`, `schedule_items` view, pgTAP `11_schedule_data` + updates); `ScheduleDocument` types + gzip codec; `MockRepository` + contract tests; `SupabaseRepository` + integration tests (including 50k snapshot V6 & share-recipient read R12); `importSchedule` writing initial snapshot on import |
| CPM engine (`src/engine/**`) | 10 | Civil-minute wall-clock & calendar engine (multi-TZ); profile registry (`p6`/`msp`/`default`); `fromImportModel` & `createBlankDocument`; graph validation, Kahn topo sort & iterative DFS cycle finder; forward pass (4 link types, lags, calendars, constraints, progress modes); backward pass & ALAP/LOE post-passes; floats, critical path, longest path & driving-path trace; WBS rollups; hand-worked JSON batteries + `fast-check` property tests + budget test (V3); oracle fidelity ratchet (`oracle.test.ts` + `scripts/check-cpm-oracle.ts`, V4) |
| Engine worker & hooks | 3 | `src/engine/{protocol,worker,client,in-thread}.ts` + tests; `useScheduleEngine` + `useScheduleDocument` + `useScheduleLock` hooks (with 2-min heartbeat & unload release); pure command/edit-plan + 100-step Undo/Redo state (`commands.ts`) |
| Shell & Files integration | 2 | Enable "Open" / "Open current schedule" on Files page + lock badge in `SchedulesTable`; `ScheduleSwitcher` in `TopBar` + `/schedule` route wiring |
| Grid & Gantt UI | 8 | `SchedulePage` shell (loading, unmaterialized P3 auto-materialize, viewer in-memory read, P2 notice, resizable split pane); virtualized WBS/Activity Grid (`@tanstack/react-table` + `@tanstack/react-virtual`, expand/collapse, keyboard nav); inline cell editing (Code, Name, Duration, % complete, Predecessors); `Draw2D` interface + `CanvasDraw2D` + timescale math; pure Gantt `renderGantt` (bars, milestones, WBS brackets, LOE, status/today lines, weekends); right-angle link routing & critical/driving path styling; Gantt interactions (synced scroll, click select, hover tooltip, pan/zoom/zoom-to-fit) + V7 frame budget check; Search bar + match navigation/filter |
| Inspector, toolbar & edit lifecycle | 5 | Toolbar (View/Edit toggle, Save/Discard, Undo/Redo, `+ Activity`/`+ WBS`/`Delete`, Calculate `F5` + stale badge, Lock pill & owner Force Unlock); Schedule Settings popover; Warnings popover & Cycle error banner with jump-to-row; Docked Details panel (`Details` tab + driver trace jump); `Relationships` tab (predecessors/successors lists + add/edit/delete) + Status bar |
| E2E & final verification | 3 | `e2e/schedule.spec.ts` (mock E2E); `e2e-supabase/supabase.spec.ts` (full Supabase edit/lock/reload E2E); V1–V8 verification notes, `CLAUDE.md` & `production.md` updates |

---

## 3. Architecture & Layer Boundaries

```
pages SchedulePage ──▶ features/schedule/ (Grid · Gantt · Inspector · Toolbar · commands.ts)
  │                       └─ gantt/renderer.ts (pure imperative Draw2D; zero React/hooks/data)
  ├─▶ hooks/ (useScheduleDocument · useScheduleLock · useScheduleEngine · useImportParser)
  │     ├─▶ DataRepository ─ MockRepository | SupabaseRepository
  │     │     ├─ schedule-imports bucket (immutable originals, P3)
  │     │     └─ schedule-data bucket    (gzipped ScheduleDocument snapshots, P4)
  │     ├─▶ src/engine/client.ts ──▶ Engine Web Worker ──▶ src/engine/** (pure TS CPM engine)
  │     └─▶ src/import/client.ts ──▶ Import Web Worker ──▶ src/import/** (unmaterialized P3 only)
  └─▶ Supabase: schedules gains lock/revision/data_file_path/calculation_mode;
                6 new RPCs; schedule_items view updated; schedule-data bucket + RLS
```

### Layer rules (enforced by ESLint + `scripts/import-boundaries.test.mjs`)

1. **`src/engine/**` is pure TypeScript:** imports nothing from React, `react-dom`, `@/hooks`, `@/components`, `@/features`, `@/pages`, `@/data/mock`, `@/data/supabase`, `@/data/index`, `@/import/*` (runtime — `import type` from `@/import/model` is allowed strictly inside `src/engine/materialize.ts`), or parser libraries (`xlsx`, `papaparse`, `fast-xml-parser`, `fflate`), and uses no browser DOM/Canvas globals. May `import type` from `@/data/types` and `@/data/schedule-types`.
2. **`src/engine/client.ts`:** statically imports only `./protocol` and types; loads `./in-thread` lazily via `import('./in-thread')` when `Worker` is unavailable (jsdom).
3. **Hooks only:** components and features never import `@/engine` or `@/engine/*` (except `*.test.{ts,tsx}`, matching P3 core D47); hooks import only `@/engine/client` (other `@/engine/*` modules for types only).
4. **Pure Gantt renderer (`src/features/schedule/gantt/renderer.ts` and `draw2d.ts`):** imports no React, hooks, `@/data/mock`, `@/data/supabase`, or `@/engine` runtime code (types only), so the identical drawing code runs on HTML Canvas 2D today and vector PDF in Phase 7.
5. **Two independent workers:** `src/import/worker.ts` and `src/engine/worker.ts` build as separate chunks (V2), so opening a materialized schedule never downloads SheetJS, Papa Parse or `fast-xml-parser`.
6. **Closed new dependencies (D8):**
   - Runtime: `@tanstack/react-virtual` (MIT).
   - Dev-only: `fast-check` (MIT).
   - `fflate` (already installed, MIT) stays dynamically imported (`await import('fflate')`) outside `src/import/**` for snapshot gzip/gunzip.

---

## 4. Data Model, Storage, Locking and Database

### 4.1 `ScheduleDocument` (`src/data/schedule-types.ts`)

Stored compressed as UTF-8 JSON + gzip (`.json.gz`) in the `schedule-data` bucket. All timestamps inside the document are timezone-free civil wall-clock strings (`WallClock = 'YYYY-MM-DDTHH:mm'`), matching `src/import/model.ts`.

```ts
export type ScheduleProfileId = 'p6' | 'msp' | 'default';
export type ProgressMode = 'retained_logic' | 'progress_override';
export type CalculationDisplayMode = 'as_imported' | 'calculated';
export type LagCalendarMode = 'predecessor' | 'successor' | 'elapsed_24h' | 'project_default';
export type CriticalDefinition = 'total_float' | 'longest_path';
export type ActivityType =
  | 'task'
  | 'start_milestone'
  | 'finish_milestone'
  | 'level_of_effort'
  | 'wbs_summary';
export type ActivityStatus = 'not_started' | 'in_progress' | 'completed';
export type ConstraintType =
  | 'start_on'
  | 'start_on_or_after'
  | 'start_on_or_before'
  | 'finish_on'
  | 'finish_on_or_after'
  | 'finish_on_or_before'
  | 'mandatory_start'
  | 'mandatory_finish'
  | 'as_late_as_possible';
export type RelationshipType = 'FS' | 'SS' | 'FF' | 'SF';

export interface ProfileRuleOverrides {
  statusDateFloorForUnstarted?: boolean;
  inProgressResumeMode?: 'p6_remaining_from_status' | 'msp_latest_of_status_logic_elapsed';
  completedLateDates?: 'keep_actuals' | 'recalculate';
  ssLagFromInProgress?: 'remaining_from_actual_start' | 'from_start';
  completedPredLag?: 'unelapsed_only' | 'full';
  totalFloatFormula?: 'finish_float' | 'min_start_finish';
  freeFloatFloorZero?: boolean;
  finishMilestoneOnPredFinish?: boolean;
  alapBehavior?: 'within_free_float' | 'to_late_dates';
  progressOverrideLateSide?: 'ignore_link_to_started' | 'keep_late_logic';
}

export interface ScheduleSettings {
  profile: ScheduleProfileId;
  ruleOverrides: ProfileRuleOverrides;
  progressMode: ProgressMode;
  displayMode: CalculationDisplayMode;
  lagCalendar: LagCalendarMode;
  criticalDefinition: CriticalDefinition;
  criticalThresholdMinutes: number; // default 0
  nearCriticalThresholdMinutes: number; // default 4800 (10 × 8 h)
  projectStart: WallClock | null;
  mustFinishBy: WallClock | null;
  statusDate: WallClock | null; // date synced with schedules.status_date; time kept when present
  defaultCalendarId: string;
  autoCalculate: boolean; // default false (manual F5)
}

export interface ScheduleCalendar {
  id: string;
  name: string;
  kind: 'project' | 'global' | 'resource' | 'task';
  week: Array<Array<{ start: number; finish: number }>>; // 7 entries, 0 = Sunday, minutes 0–1440
  exceptions: Array<{ date: ISODate; periods: Array<{ start: number; finish: number }> }>;
  hoursPerDay: number;
  hoursPerWeek: number | null;
  hoursPerMonth: number | null;
  hoursPerYear: number | null;
}

export interface ScheduleWbsNode {
  id: string;
  parentId: string | null;
  code: string;
  name: string;
  order: number;
}

export interface SourceDateRecord {
  planned: { start: WallClock | null; finish: WallClock | null };
  early: { start: WallClock | null; finish: WallClock | null };
  late: { start: WallClock | null; finish: WallClock | null };
  remaining: { start: WallClock | null; finish: WallClock | null };
  totalFloat: number | null; // working minutes
  freeFloat: number | null; // working minutes
}

export interface ScheduleActivity {
  id: string; // stable UUID within the schedule
  code: string; // unique per schedule ignoring case, 1–40 chars
  name: string; // 1–255 chars
  wbsId: string | null;
  calendarId: string;
  type: ActivityType;
  order: number; // display order within its parent WBS
  originalDuration: number; // working minutes >= 0 (0 for milestones)
  remainingDuration: number; // working minutes >= 0
  status: ActivityStatus;
  actualStart: WallClock | null;
  actualFinish: WallClock | null;
  percent: {
    duration: number | null;
    physical: number | null;
    type: 'duration' | 'physical' | 'units';
  };
  constraint: { type: ConstraintType; date: WallClock | null } | null;
  secondaryConstraint: { type: ConstraintType; date: WallClock | null } | null;
  notes: string | null; // up to 4,000 chars
  flags: { manual: boolean; elapsed: boolean; resourceDependent: boolean };
  keys: { taskId: string | null; uid: string | null; guid: string | null };
  /** Preserved verbatim from import for "As imported" display and oracle checks; null for user-created tasks. */
  sourceDates: SourceDateRecord | null;
}

export interface ScheduleRelationship {
  id: string;
  predecessorId: string;
  successorId: string;
  type: RelationshipType;
  lagMinutes: number; // working minutes unless lagElapsed
  lagElapsed: boolean;
}

export type DriverReason =
  | { kind: 'predecessor'; relationshipId: string; predecessorId: string }
  | { kind: 'constraint'; constraint: ConstraintType }
  | { kind: 'status_date' }
  | { kind: 'project_start' }
  | { kind: 'actual' };

export interface ComputedActivityResult {
  earlyStart: WallClock;
  earlyFinish: WallClock;
  lateStart: WallClock;
  lateFinish: WallClock;
  totalFloat: number; // working minutes
  freeFloat: number; // working minutes
  isCritical: boolean;
  isNearCritical: boolean;
  isLongestPath: boolean;
  driver: DriverReason;
}

export interface ComputedRelationshipResult {
  freeFloat: number; // working minutes
  isDriving: boolean;
}

export interface ComputedWbsRollup {
  start: WallClock | null;
  finish: WallClock | null;
  durationMinutes: number;
  percentComplete: number | null;
  activityCount: number;
  hasCritical: boolean;
}

export interface SolverWarning {
  code:
    | 'OUT_OF_SEQUENCE'
    | 'NEGATIVE_FLOAT'
    | 'MISSED_MUST_FINISH_BY'
    | 'CONSTRAINT_VIOLATED'
    | 'TRUNCATED_LEAD'
    | 'LOE_UNBOUNDED'
    | 'MISSING_ACTUAL_DATE';
  activityId: string | null;
  relationshipId: string | null;
  message: string;
}

export interface ComputedScheduleSummary {
  calculatedAt: ISODateTime;
  durationMs: number;
  projectStart: WallClock | null;
  projectFinish: WallClock | null;
  activities: Record<string, ComputedActivityResult>;
  relationships: Record<string, ComputedRelationshipResult>;
  wbsRollups: Record<string, ComputedWbsRollup>;
  warnings: SolverWarning[];
}

export interface ScheduleDocument {
  schemaVersion: 1;
  sourceFormat: ImportFormat | null;
  settings: ScheduleSettings;
  calendars: ScheduleCalendar[];
  wbs: ScheduleWbsNode[];
  activities: ScheduleActivity[];
  relationships: ScheduleRelationship[];
  /** Last successful engine solve cached in the snapshot so calculated schedules paint immediately on open. */
  computed: ComputedScheduleSummary | null;
}
```

**Materialization (`src/engine/materialize.ts`):**
- `fromImportModel(model: ImportModel, options: { scheduleStatusDate: ISODate | null }): ScheduleDocument`: deterministic conversion from P3's `ImportModel`. Assigns deterministic stable IDs (`act:{index}`, `rel:{index}` or deterministic slugs on initial materialize; user-added items get `crypto.randomUUID()`). Maps source settings:
  - `xer` → `profile: 'p6'`, `progressMode` from `progress_mode` (`progress_override` → `'progress_override'`, else `'retained_logic'`), `lagCalendar` from `sched_calendar_on_relationship_lag` (`rcal_Successor` → `'successor'`, `rcal_24Hour` → `'elapsed_24h'`, `rcal_ProjDefault` → `'project_default'`, else `'predecessor'`), `displayMode: 'as_imported'`.
  - `mspdi` → `profile: 'msp'`, `lagCalendar: 'successor'`, `displayMode: 'as_imported'`.
  - `xlsx` / `csv` → `profile: 'default'`, `lagCalendar: 'predecessor'`, `displayMode: 'as_imported'` if any activity carries source start/finish dates else `'calculated'`.
  - Keeps `sourceDates` verbatim on every imported activity. Uses `scheduleStatusDate` (with source time preserved if date matches) as `settings.statusDate`.
- `createBlankDocument(statusDate: ISODate | null): ScheduleDocument`: creates a blank schedule with 1 default calendar (`Standard`, Mon–Fri 08:00–12:00 / 13:00–17:00, 8 h/day), `profile: 'default'`, `displayMode: 'calculated'`, `statusDate` at `08:00` when given.

### 4.2 Contract additions (`src/data/types.ts` and `src/data/repository.ts`)

`Schedule` gains:
```ts
export interface ScheduleLock {
  userId: ID;
  userName: string;
  lockedAt: ISODateTime;
  expiresAt: ISODateTime;
}

// Added to Schedule:
lock: ScheduleLock | null; // null when unlocked or expired
dataRevision: number; // 0 until first snapshot is stored
hasScheduleData: boolean;
calculationMode: CalculationDisplayMode;
```

`ImportScheduleInput` adds `dataStored: Blob` (gzipped initial `ScheduleDocument` produced during the import commit step, so every new import is immediately openable by editors, viewers and share recipients with zero materialization wait).

New `DataRepository` methods:
- `getScheduleDocument(scheduleId: ID): Promise<{ document: ScheduleDocument | null; dataRevision: number }>` — downloads & gunzips `data_file_path` from `schedule-data`; returns `{ document: null, dataRevision: 0 }` when `hasScheduleData` is `false`. Throws `'not_found'` for unknown/hidden schedule.
- `materializeScheduleDocument(input: MaterializeScheduleInput): Promise<{ dataRevision: number }>` — uploads gzipped initial snapshot for a P3-era import (`data_revision = 0`) and commits via `materialize_schedule_data`; idempotent if another editor already materialized it.
- `saveScheduleDocument(input: SaveScheduleDocumentInput): Promise<{ schedule: Schedule; dataRevision: number }>` — uploads new gzipped snapshot to `schedule-data`, commits via `save_schedule_data` (checks active lock held by caller + `expectedRevision`), removes superseded snapshot best-effort.
- `acquireScheduleLock(scheduleId: ID): Promise<ScheduleLock>`
- `renewScheduleLock(scheduleId: ID): Promise<ScheduleLock>`
- `releaseScheduleLock(scheduleId: ID): Promise<void>`
- `forceReleaseScheduleLock(scheduleId: ID): Promise<void>` (workspace owner only)

### 4.3 Domain & persistence rules (`R1–R12`)

| # | Rule | Enforcement & copy |
|---|---|---|
| R1 | At most one active lock (`lock_expires_at > now()`) per schedule; an expired lock is transparently replaced | `acquire_schedule_lock` takes `FOR UPDATE` on the schedule row; conflict → `"This schedule is being edited by {name}."` |
| R2 | Lock TTL is 15 minutes from acquire or renew; active editor tabs renew every 2 minutes | `renew_schedule_lock` fails with `'conflict'` `"Your edit lock expired. Copy your changes or reload the schedule."` if lost |
| R3 | Viewers and share recipients cannot acquire, renew, release, materialize or save; only workspace owners can force-release another user's lock | `insufficient_privilege` (42501) → `RepositoryError('forbidden')` |
| R4 | Archived schedules are read-only and cannot be locked or saved | `'validation'` → `"Restore this schedule before editing it."` |
| R5 | Saving requires an active lock held by the caller and `data_revision = p_expected_revision` | `'conflict'` → `"Your edit lock expired. Copy your changes or reload the schedule."` or `"This schedule was changed elsewhere. Reload and try again."` |
| R6 | Saving updates `data_file_path`, increments `data_revision`, updates `activity_count` (0–50,000), `calculation_mode`, optional `status_date` (syncing `projects.status_date` via P3 core R6 when current) and `updated_at` (P3 core R11) | `save_schedule_data` RPC + existing triggers |
| R7 | Materializing is editor/owner only, requires `data_file_path is null`, sets `data_revision = 1`, and leaves `updated_at` unchanged | `materialize_schedule_data` RPC (not in `schedules_set_updated_at` column list) |
| R8 | `data_file_path` must match `^{workspace_id}/{project_id}/{schedule_id}/{uuid}\.json\.gz$`; bucket limit 20 MB (`20,971,520` bytes), MIME `application/gzip` | Trigger/RPC validation + bucket settings |
| R9 | Superseded snapshots are deleted best-effort after commit; `delete_schedules` and `delete_project` return paths from both `schedule-imports` and `schedule-data` for cleanup | Updated `delete_schedules` / `delete_project` RPCs + adapter cleanup |
| R10 | Original import files (`source_file_path`), `import_mapping` and `import_report` are never modified by edits | Column grants unchanged |
| R11 | Archiving a schedule or changing its `status_date` via `update_schedule_details` while actively locked by another user is refused; owners may still delete a locked schedule (cascade) | `set_schedules_archived` and `update_schedule_details` check active lock held by another user → `'conflict'` `"This schedule is being edited by {name}. Try again once they finish."` |
| R12 | Workspace members and schedule share recipients can read `schedule-data` snapshots for any schedule they can select | `schedule_data_select` storage RLS checks `exists (select 1 from public.schedules s where s.data_file_path = objects.name)` |

### 4.4 Database migration (`p4_core_schedule_data`)

- New private bucket `schedule-data` (`file_size_limit = 20971520`, `allowed_mime_types = array['application/gzip']`).
- `alter table public.schedules`:
  - `data_file_path text` (+ unique index `schedules_data_file_path_uq where data_file_path is not null`)
  - `data_revision int not null default 0 check (data_revision >= 0)`
  - `calculation_mode text not null default 'calculated' check (calculation_mode in ('as_imported', 'calculated'))`
  - `locked_by uuid references auth.users(id) on delete set null`
  - `locked_at timestamptz`
  - `lock_expires_at timestamptz`
  - Check constraint: `(locked_by is null) = (locked_at is null) and (locked_by is null) = (lock_expires_at is null)`
- `prepare_new_schedule()`: validates `new.data_file_path` against R8 when provided on insert, and sets `data_revision := 1` when `data_file_path is not null`.
- `schedule_items` view recreated (`security_invoker = true`) with `data_revision`, `data_file_path is not null as has_schedule_data`, `calculation_mode`, and active lock columns (`case when s.lock_expires_at > now() then s.locked_by end as locked_by`, etc., plus `locked_by_name` via a `security definer` helper `app.display_name(uuid)` so share recipients / members see the lock holder's display name cleanly without opening `profiles` RLS).
- Six new `security definer` RPCs (`search_path = ''`, explicit role checks via `app.my_project_ids`, execute revoked from `public, anon`, granted to `authenticated`):
  1. `acquire_schedule_lock(p_schedule_id uuid)`
  2. `renew_schedule_lock(p_schedule_id uuid)`
  3. `release_schedule_lock(p_schedule_id uuid)`
  4. `force_release_schedule_lock(p_schedule_id uuid)`
  5. `materialize_schedule_data(p_schedule_id uuid, p_data_file_path text, p_activity_count int, p_calculation_mode text)`
  6. `save_schedule_data(p_schedule_id uuid, p_expected_revision int, p_data_file_path text, p_activity_count int, p_calculation_mode text, p_status_date date)` → returns previous `data_file_path` (if any) for adapter storage cleanup.
- `delete_schedules` and `delete_project`: updated to return `table(bucket text, path text)` covering both `schedule-imports`, `schedule-data` and `project-covers` (updated in `SupabaseRepository` and pgTAP in the same migration task).
- Storage RLS on `schedule-data`:
  - `SELECT`: authenticated user where `exists (select 1 from public.schedules s where s.data_file_path = objects.name)` (invoker RLS on `schedules` covers both workspace members and share recipients).
  - `INSERT`: editors/owners of `(storage.foldername(name))[1]`.
  - `DELETE`: workspace owners, OR editors for objects they uploaded (`owner_id = (select auth.uid())::text`) that no `public.schedules.data_file_path` currently references.

---

## 5. CPM Scheduling Engine (`src/engine/**`)

Pure TypeScript, deterministic, zero external runtime dependencies, runnable identically in Node and in `src/engine/worker.ts`.

### 5.1 Profile registry (`src/engine/profiles.ts`)

Every behavioural difference between P6, MS Project and our default profile is expressed as a named field in `ResolvedRules` (`resolveRules(profile, overrides)`). The solver reads `rules.*` exclusively and **never inspects `sourceFormat` or `profile` directly** (pinned by tests).

| Rule | `p6` | `msp` | `default` |
|---|---|---|---|
| `statusDateFloorForUnstarted` | `true` | `false` | `true` |
| `inProgressResumeMode` | `'p6_remaining_from_status'` | `'msp_latest_of_status_logic_elapsed'` | `'p6_remaining_from_status'` |
| `completedLateDates` | `'keep_actuals'` | `'recalculate'` | `'keep_actuals'` |
| `ssLagFromInProgress` | `'remaining_from_actual_start'` | `'from_start'` | `'remaining_from_actual_start'` |
| `completedPredLag` | `'unelapsed_only'` | `'full'` | `'unelapsed_only'` |
| `totalFloatFormula` | `'finish_float'` (`LF - EF`) | `'min_start_finish'` | `'finish_float'` |
| `freeFloatFloorZero` | `true` | `false` | `true` |
| `finishMilestoneOnPredFinish` | `false` | `true` | `false` |
| `alapBehavior` | `'within_free_float'` | `'to_late_dates'` | `'within_free_float'` |
| `progressOverrideLateSide` | `'ignore_link_to_started'` | `'keep_late_logic'` | `'ignore_link_to_started'` |
| Default `lagCalendar` (when file gives none) | `'predecessor'` | `'successor'` | `'predecessor'` |

### 5.2 Civil minute model & calendar engine (`src/engine/calendar.ts`)

- All instants inside the engine are integer **wall-clock minutes** since `1970-01-01T00:00` (Howard Hinnant's civil-day algorithm; zero `Date` calls, zero DST or timezone drift).
- Each calendar compiles into a lazy day-unrolled working-block table covering the active schedule span (expanding automatically if dates move) with cumulative working-minute prefix sums for O(log D) queries:
  - `snapForwardToWorkStart(cal, t)`: earliest working-block start or interior instant `>= t`.
  - `snapBackwardToWorkFinish(cal, t)`: latest working-block finish or interior instant `<= t`.
  - `addWorkingMinutes(cal, start, minutes)`: advances `minutes` of working time from `start` (handling negative `minutes` for leads cleanly; boundary rule: positive duration ends at a block finish e.g. `17:00`, never `08:00` the next morning; zero duration snaps per milestone/activity type).
  - `subtractWorkingMinutes(cal, finish, minutes)`: exact inverse for backward pass.
  - `workingMinutesBetween(cal, a, b)`: signed working minutes between two instants (used for `totalFloat`, `freeFloat` and link free float).
- Calendars with zero weekly working minutes and no working exceptions produce solver error `CALENDAR_NO_WORKING_TIME`.
- A built-in virtual 24h calendar (`0..1440` every day) serves `lagElapsed: true` links and `lagCalendar: 'elapsed_24h'`.

### 5.3 Graph validation & cycle detection (`src/engine/graph.ts`)

- Excludes `wbs_summary` rows from CPM nodes (rolled up post-solve).
- Validates endpoints exist, ignores self-links (warning), deduplicates identical `(pred, succ, type)` links (warning).
- Runs **Kahn topological sort** using a head-index queue (`O(V + E)`).
- If unprocessed nodes remain, runs **iterative DFS** (explicit stack, safe at 50,000-node depth) to extract one clean minimal cycle (`cycleIds`, `cycleCodes`), returning `{ ok: false, error: { code: 'SCHEDULE_CYCLE', cycleIds, cycleCodes, message } }` without overwriting calculated dates.

### 5.4 Forward pass, backward pass, float, critical and driving (`src/engine/cpm.ts`)

1. **Forward pass** (topological order):
   - Project start anchor: `settings.projectStart`, else `settings.statusDate`, else earliest activity start/actual/constraint date.
   - Evaluates incoming links (`FS`, `SS`, `FF`, `SF`) using the link's resolved lag calendar (`lagElapsed` → 24h, else `settings.lagCalendar`). Negative lags (leads) that push before project start are clamped at project start with warning `TRUNCATED_LEAD`.
   - Applies progress rules (`completed`, `in_progress`, `not_started`; `retained_logic` vs `progress_override`, emitting `OUT_OF_SEQUENCE` when an in-progress or completed successor starts before a predecessor's logical bound).
   - Applies forward-side constraints (`start_on`, `start_on_or_after`, `finish_on`, `finish_on_or_after`, `mandatory_start`, `mandatory_finish`) and secondary constraints; records the tightest driver (`driverReason`: `'predecessor'` | `'constraint'` | `'status_date'` | `'project_start'` | `'actual'`).
2. **Backward pass** (reverse topological order):
   - Project late finish anchor: `settings.mustFinishBy` if set, else `max(EF)`.
   - Evaluates outgoing links in reverse on each link's resolved lag calendar; applies late-side constraints (`start_on_or_before`, `finish_on_or_before`, `start_on`, `finish_on`, `mandatory_start`, `mandatory_finish`); warns `CONSTRAINT_VIOLATED` / `MISSED_MUST_FINISH_BY` when late dates fall before early dates.
3. **Post-passes:**
   - **ALAP (`as_late_as_possible`):** delays unstarted ALAP tasks up to free-float limit (P6) or late dates (MSP/default).
   - **LOE (`level_of_effort`):** evaluated in topological order from earliest predecessor anchor to latest successor anchor; warns `LOE_UNBOUNDED` if missing start or finish driver.
4. **Floats, Criticality & Driving Path:**
   - `totalFloat` per `rules.totalFloatFormula` on activity's calendar; warns `NEGATIVE_FLOAT` summary when `< 0`.
   - `freeFloat`: smallest non-negative (or signed per `rules.freeFloatFloorZero`) working-minute gap to any successor's early bound.
   - Per-relationship `freeFloat` and `isDriving` (`relFreeFloat === 0` on active forward logic).
   - `isLongestPath`: backward walk along driving links from activities whose `EF === projectFinish`.
   - `isCritical`: `criticalDefinition === 'longest_path' ? isLongestPath : totalFloat <= criticalThresholdMinutes`.
   - `isNearCritical`: `!isCritical && totalFloat <= nearCriticalThresholdMinutes`.
   - `traceDrivingPath(result, activityId)`: walks backward along driving links from `activityId` to root drivers, returning `{ activityIds, relationshipIds, hops }`.
5. **WBS Rollups (`src/engine/rollup.ts`):**
   - Bottom-up across the WBS tree (using active display dates: `sourceDates` in `"As imported"` mode, calculated dates in `"Calculated"` mode): earliest start, latest finish, rolled-up working duration on default calendar, duration-weighted `% complete`, total leaf activity count, and `hasCritical`.

### 5.5 Solver warnings catalog (copy pinned)

| Code | Target | Message |
|---|---|---|
| `SCHEDULE_CYCLE` (fatal error) | `cycleIds` | `"Circular logic found: {code1} → {code2} → … → {code1}. Break the loop to calculate."` |
| `CALENDAR_NO_WORKING_TIME` (fatal error) | `calendarId` | `"Calendar {name} has no working hours. Dates can't be calculated."` |
| `OUT_OF_SEQUENCE` | `relationshipId` / `activityId` | `"{code} started out of sequence before {predCode}."` |
| `NEGATIVE_FLOAT` | `activityId` | `"{code} has negative total float ({float})."` |
| `MISSED_MUST_FINISH_BY` | project | `"Projected finish ({finish}) is after must finish by ({target})."` |
| `CONSTRAINT_VIOLATED` | `activityId` | `"{code} misses its {constraint} constraint ({date})."` |
| `TRUNCATED_LEAD` | `relationshipId` | `"Lead on {predCode} → {succCode} was clamped at the project start."` |
| `LOE_UNBOUNDED` | `activityId` | `"{code} is a level of effort activity without both start and finish links."` |
| `MISSING_ACTUAL_DATE` | `activityId` | `"{code} is {status} without an actual {start/finish} date."` |

### 5.6 Engine Worker (`src/engine/worker.ts` & `client.ts`)

- Typed `postMessage` protocol (`src/engine/protocol.ts`): `solve(document)` (returns `SolveResult`: `{ ok: true; summary: ComputedScheduleSummary } | { ok: false; error: SolverError }`), `rollup(document)` (computes `wbsRollups` off the main thread for `"As imported"` schedules without running CPM), `traceDrivingPath(activityId)`, `cancel`.
- The worker caches the latest solved graph and `ComputedScheduleSummary` in memory so `traceDrivingPath(activityId)` answers immediately without re-transferring up to 50,000 activities.
- 15 s watchdog (terminates and recreates worker on hang), `onerror` / `onmessageerror` handling, sequence IDs discarding stale replies, in-thread fallback when `Worker` is absent (jsdom).

---

## 6. Command Layer & Undo/Redo (`src/features/schedule/commands.ts`)

Pure TypeScript state transitions over `ScheduleDocument` (no `immer`/`zustand`, D8). Every mutation runs through `applyCommand(doc, command) → { ok: true, document, inverse, forward, stale } | { ok: false, error }`:

- **Activity commands:** `addActivity` (auto-generates next free code, e.g. `A1010` → `A1020`, default 5 days / 40 h on project default calendar), `updateActivity`, `deleteActivities` (cascades attached relationships and stores them in `inverse` so Undo restores everything atomically), `moveActivity`.
- **WBS commands:** `addWbsNode`, `updateWbsNode`, `deleteWbsNode` (only when it has no child WBS or activities, else clear message `"Move or delete the items inside this WBS element first."`).
- **Relationship commands:** `addRelationship` (rejects self-link `"An activity can't link to itself."` and duplicate `(pred, succ, type)` `"This relationship already exists."`), `updateRelationship`, `deleteRelationship`.
- **Settings command:** `updateScheduleSettings` (changes profile, progressMode, displayMode, lagCalendar, criticalDefinition, thresholds, statusDate, mustFinishBy, autoCalculate).
- **Undo/Redo stack:** bounded at 100 commands; cleared on Save or Discard; running **Calculate (`F5`)** updates `computed` and clears `stale` **without** pushing an undo entry. Each entry keeps its serializable `forward` patch ready for Phase 7's `HistoryEntry`.

---

## 7. Screens, Visual Tokens and Interaction (copy pinned)

### 7.1 Unlocked entry points & TopBar

- **Files page (`ProjectFilesPage.tsx`, `SchedulesTable.tsx`, `ScheduleMenu.tsx`):**
  - Remove `EDITOR_NOT_AVAILABLE` everywhere.
  - `"Open current schedule"` navigates to `/w/:workspaceId/p/:projectId/schedule?scheduleId=${current.id}`.
  - Row menu `"Open"` navigates to `/w/:workspaceId/p/:projectId/schedule?scheduleId=${schedule.id}`.
  - Schedule `Name` column in `SchedulesTable` becomes a clickable link to the schedule.
  - Add a compact lock indicator next to the schedule name when `schedule.lock !== null` (`Lock` icon + tooltip `"Being edited by {userName}"`).
- **TopBar (`ScheduleSwitcher.tsx`):**
  - Shown on `/w/:workspaceId/p/:projectId/schedule` after `ProjectSwitcher`.
  - Lists non-archived schedules of the project with search, `Current` / `Primary baseline` tags, lock icon if locked, and a subtle status dot (`As imported` / `Calculated`). Selecting another schedule prompts the discard confirmation when dirty.

### 7.2 Schedule Editor — `/w/:workspaceId/p/:projectId/schedule`

Resolves `scheduleId` from `?scheduleId=`, else opens the project's current schedule. Unknown/inaccessible workspace, project or schedule → `NotFoundPage`. Project with zero schedules → `EmptyState` (`"No schedules yet"`, `"New schedule"` / `"Import schedule"`).

**Opening an unmaterialized schedule:**
- **P3-era import (`hasImportMapping && !hasScheduleData`):**
  - Editor/owner: shows `"Preparing schedule…"` skeleton, runs `getScheduleSourceFile` + `getImportMapping` → `importParser.analyze()` → `fromImportModel()` → `materializeScheduleDocument()`, then opens.
  - Workspace member viewer: runs `analyze()` → `fromImportModel()` in memory (read-only, zero DB write).
  - Share recipient without `schedule-imports` access: shows notice `"This schedule hasn't been opened by an editor yet."`.
- **P2-era import (`source === 'import' && !hasImportMapping && !hasScheduleData`):**
  - Shows notice `"This schedule was imported before the schedule editor was added. Download the original file and import it again to open it."` with `"Download original file"` button.
- **Blank schedule (`source === 'blank' && !hasScheduleData`):**
  - Opens immediately with `createBlankDocument(schedule.statusDate)`; saving persists the initial snapshot.

**Date & duration formatting (owner decision 2026-11-20, D6; resolves P3 core D3):**
- Grid dates: `DD.MM.YYYY` (e.g. `15.10.2026`), `—` when null.
- Details panel dates: `DD.MM.YYYY` + muted wall-clock time `HH:mm` when meaningful (e.g. `15.10.2026 · 08:00`).
- Durations & floats: working days derived from the activity's calendar `hoursPerDay`, formatted as `5 d`, `2.5 d`, `0 d` (up to 1 decimal place, trailing `.0` omitted); total float shows sign (`+12 d`, `0 d`, `-3 d`).

**Toolbar:**
- **Edit lifecycle:**
  - View mode: `"Edit"` button (editors/owners; disabled with P2 viewer tooltip for viewers; `"Archived · read-only"` badge for archived schedules). When locked by another user: amber pill `"Locked by {name}"` (+ owner-only `"Unlock"` button → AlertDialog `"Unlock this schedule?"` / `"{name} may lose unsaved changes if you unlock it."` / `"Cancel"` · `"Unlock"`).
  - Edit mode: `"Save"` (`Ctrl+S`, primary, disabled until dirty or while saving `"Saving…"`), `"Discard"` (secondary, confirms if dirty), `"Done editing"` (releases lock when clean), `"Undo"` (`Ctrl+Z`), `"Redo"` (`Ctrl+Shift+Z`), `"+ Activity"`, `"+ WBS"`, `"Delete"`.
  - Leaving the page or closing the tab while dirty triggers React Router blocker confirmation (`"Discard unsaved changes?"`) and `beforeunload`; releasing lock on unmount/unload fires best-effort release.
- **Calculation:** `"Calculate"` (`F5`; shows `"Calculating…"` while running; shows amber indicator `"Recalculate needed"` when edits have made calculated dates stale), `"Settings"` popover (Profile, Progress mode, Display mode `"As imported"` / `"Calculated"`, Lag calendar, Critical definition & threshold, Must finish by, Status date, Auto-calculate toggle), `"Warnings"` button with count badge (opens popover listing `SolverWarning` items with click-to-jump).
- **Timeline controls:** `"Critical path"` toggle, `"Driving path"` toggle (enabled when an activity is selected), `"Links"` toggle, Zoom select (`Day` / `Week` / `Month` / `Quarter`) + `"Zoom to fit"`, `"Details"` panel toggle.
- **Search:** `"Search activities…"` (`Ctrl+F`, aria-label `"Search activities"`), match count `"{i} of {n}"`, prev/next buttons, `"Filter"` toggle to show only matching activities + their ancestor WBS rows.

**Cycle error banner:** When `SolveResult.ok === false`, an inline `role="alert"` banner above the split pane shows the exact loop path (`A1020 → A1030 → A1010 → A1020`) with clickable activity codes to jump straight to the offending link in Relationships.

**Split pane (resizable divider, width saved in `ui.scheduleSplitPx`):**
- **Left — Virtualized Activity Grid (`@tanstack/react-table` + `@tanstack/react-virtual`):**
  - Fixed `32 px` row height, overscan 10, `aria-rowcount` / `aria-rowindex`.
  - Columns: `#`, `Code` (monospace), `Name` (WBS indentation + expand/collapse chevrons + type icon), `Duration`, `Start`, `Finish`, `Total float`, `% complete`, `Predecessors`.
  - WBS rows display rolled-up start, finish, duration and `% complete`.
  - Inline edit in Edit mode (`Enter` or double-click) on `Code`, `Name`, `Duration`, `% complete`, `Predecessors` (parses shorthand tokens `A1000`, `A1010 SS+2d` using the same syntax as P3's predecessor parser).
- **Right — Pure Canvas 2D Gantt (`src/features/schedule/gantt/`):**
  - Synchronized vertical scroll with the grid (`32 px` row height lockstep).
  - Sticky two-tier timescale header (`Day`, `Week`, `Month`, `Quarter`).
  - Pure `renderGantt(draw: Draw2D, scene: GanttScene)` drawing only visible rows + horizontal viewport window (culling for < 16 ms frames at 50,000 rows): weekend shading, horizontal row dividers, today dashed line, status-date solid line, WBS summary brackets, LOE bars, task bars with progress fill, milestone diamonds, critical highlight, driving-path spotlight (dims unrelated items), and orthogonal FS/SS/FF/SF link arrows (driving solid, non-driving dashed).
  - Click bar selects row; hover shows compact floating tooltip; horizontal wheel/drag pan; `Ctrl+Wheel` zooms centered on cursor; `"Zoom to fit"` frames the full schedule span with padding.

**Docked Details Panel (collapsible, open state saved in `ui.scheduleDetailsOpen`):**
- Tabs: **`Details`** (status, actual start/finish, `% complete` + type, original/remaining durations, calendar select, early/late dates, total/free float, `"Driven by …"` clickable driver trace, primary & secondary constraints, notes) and **`Relationships`** (Predecessors table & Successors table with Code, Name, Type, Lag, Driving badge, Link free float; inline add/edit/remove in Edit mode).

**Status bar:** `{code} · Status date {DD.MM.YYYY or "—"} · {As imported | Calculated (P6/MSP/Default) | Recalculate needed}` on the left; `{n} activities` (or `{shown} of {total}`), `{Zoom}`, and `Calculated in {ms} ms` on the right.

### 7.3 Design tokens (`src/index.css` & `scripts/check-contrast.mjs`)

All Canvas and grid colors come from CSS tokens read via `getComputedStyle(document.documentElement)` (never hard-coded hex in TS):
- `--gantt-bar`, `--gantt-bar-progress`, `--gantt-critical`, `--gantt-critical-progress`, `--gantt-summary`, `--gantt-milestone`, `--gantt-link`, `--gantt-link-driving`, `--gantt-weekend`, `--gantt-status-line`, `--gantt-today-line`, `--gantt-grid-line`.
- `scripts/check-contrast.mjs` verifies non-text ≥ 3:1 contrast for `--gantt-bar`, `--gantt-critical`, `--gantt-status-line` and `--gantt-summary` against `--card` in both themes.

---

## 8. Testing & Verification (`V1–V8`)

TDD throughout: failing test first on every task.

| Layer | Tool | Coverage |
|---|---|---|
| CPM Engine | Vitest (`src/engine/**`) | Calendar minute/boundary arithmetic across 4 time zones; profile switch matrix; Kahn topo sort & iterative DFS cycle paths; hand-worked JSON CPM batteries (all link types, lags, calendars, 9 constraints + secondary, 5 activity types, `retained_logic` vs `progress_override`, ALAP, LOE, WBS rollups, critical/longest path, driving path trace); `fast-check` property invariants; performance budget (10k < 300 ms, 50k < 2 s) |
| Oracle fidelity | Vitest + CLI script | `src/engine/oracle.test.ts` per-file ratchet on `two-projects.xer`, `legacy-p6.xer`, `project.xml`; `scripts/check-cpm-oracle.ts` for local `real-exports/` P6-calculated XERs |
| Worker & commands | Vitest | `src/engine/client.test.ts` (ids, watchdog, cancel, error, fallback); `commands.test.ts` (every command, validation, cascade delete, 100-step undo/redo, cycle guard) |
| Gantt renderer | Vitest | `renderer.test.ts` using a recording `Draw2D` spy: bar geometry, milestone diamonds, WBS brackets, orthogonal link paths, critical/driving spotlight, viewport culling on 10,000 rows |
| Database | pgTAP | `11_schedule_data.test.sql` (lock exclusivity, expiry, renew, release, owner-only force-release, `data_revision` conflict, archived refusal, viewer/share-recipient `forbidden`, `schedule-data` storage RLS incl. share-recipient read, `delete_schedules`/`delete_project` returning both buckets) + updates to `01_schema`, `02_privileges`, `06_storage`, `08_projects`, `09_schedule_tags` |
| Repository & Integration | Vitest | Contract suite on mock + Supabase; `integration/schedule-data.itest.ts` (materialize idempotency, save + old snapshot cleanup, lock contention & expiry, 50k-activity snapshot size & round-trip V6, share-recipient read R12, delete cleanup) |
| Components | Vitest + Testing Library | `SchedulePage`, `ScheduleToolbar`, `ScheduleGrid`, `DetailsPanel`, `RelationshipsTab`, `ScheduleSwitcher`, `SchedulesTable` lock indicator, unlocked Files page Open buttons |
| E2E (mock & Supabase) | Playwright | `e2e/schedule.spec.ts` (open XER, As imported → Edit → edit + add link → Calculate `F5` → critical/driving path → Undo/Redo → Save & reload; blank schedule authoring; search & filter); `e2e-supabase/supabase.spec.ts` (import → open → edit → calculate → save → reload; lock visibility to second user; viewer read-only) |

### Assumptions to verify at execution (`V1–V8`)

| # | Assumption | Fallback |
|---|---|---|
| V1 | `@tanstack/react-virtual` (MIT) and `fast-check` (MIT, dev) have zero prod advisories and appear in `dist/third-party-licenses.txt` | Pin last clean version; minimal custom fixed-height virtualizer (~80 lines) if `@tanstack/react-virtual` has React 19 issues |
| V2 | `src/engine/worker.ts` builds as a second Vite worker chunk independent of `src/import/worker.ts` without bundling parser libraries | Consolidate worker config in `vite.config.ts` while keeping separate entry points |
| V3 | Engine solves 10k activities / 15k links in < 300 ms and 50k / 150k in < 2 s without stack overflow | Profile hot loops (typed arrays for integer node indices & minute timestamps) |
| V4 | Oracle fidelity against committed fixtures and local `real-exports/` P6-calculated XERs achieves exact/ratcheted parity on `es/ef/ls/lf/tf/ff` and driving path | Document and ratchet any edge-case profile deviation with owner sign-off |
| V5 | Supabase `schedule-data` storage RLS subquery against `public.schedules` works cleanly for both workspace members and share recipients without recursion | Security-definer helper `app.can_read_schedule_data(text)` |
| V6 | A 50,000-activity `ScheduleDocument` compresses to ≤ 10 MB gzipped and completes open + save round-trip cleanly within 10 s on local/CI Supabase | Switch snapshot JSON encoding to compact columnar arrays inside `schemaVersion: 1` codec (same in-memory `ScheduleDocument` API) |
| V7 | Canvas 2D Gantt renders 10,000-row schedule frames in < 16 ms in Chromium with viewport culling | Cache static timescale/grid layer onto an offscreen canvas |
| V8 | Lock release on tab close + 15-min TTL prevents stuck locks in normal use | Owner Force Unlock UI + 15-min server TTL already guarantee recovery |

---

## 9. Changes to Phase 1–3 artifacts

- **Database:** new migration `p4_core_schedule_data`; `database.types.ts` regenerated; `delete_schedules` and `delete_project` return `(bucket, path)` pairs; `schedule_items` view gains lock/revision/data/mode fields; pgTAP tests updated + new `11_schedule_data.test.sql`.
- **Data layer:** new `src/data/schedule-types.ts`; `types.ts`, `repository.ts`, `MockRepository`, `SupabaseRepository`, `mappers.ts`, `errors.ts`, `MOCK_DB_VERSION` → 4, `src/test/fakes.ts` (`makeImportScheduleInput` also packs initial `dataStored` snapshot).
- **Hooks & UI:** `query-keys.ts`; `useSchedules.ts`, new `useScheduleDocument.ts`, `useScheduleLock.ts`, `useScheduleEngine.ts`; `TopBar.tsx` adds `ScheduleSwitcher`; `router.tsx` wires `SchedulePage`; `ProjectFilesPage.tsx`, `SchedulesTable.tsx`, `ScheduleMenu.tsx` enable Open and show lock status; `ImportScheduleDialog.tsx` sends initial snapshot on import.
- **Config & docs:** `package.json` adds `@tanstack/react-virtual` and `fast-check` (dev); `eslint.config.js` + `scripts/import-boundaries.test.mjs` add `src/engine/**` rules; `src/lib/storage.ts` adds `ui.scheduleSplitPx` and `ui.scheduleDetailsOpen`; `src/index.css` + `scripts/check-contrast.mjs` add Gantt tokens; `CLAUDE.md` adds `src/engine/**` rule; `docs/runbooks/production.md` notes the new `schedule-data` bucket rollout.

---

## 10. Left to the builder

- Exact internal file splits inside `src/engine/**` and `src/features/schedule/**`.
- Exact pixel padding, icon selection (lucide only), tooltip placement and skeleton shapes within the P1/P3 design system.
- Exact `fast-check` generator bounds and hand-worked JSON battery file grouping.

---

## 11. Decisions log

| # | Decision | Reason |
|---|---|---|
| D1 | **Owner decision 2026-11-20:** Phase 4 core ("usability first") includes opening schedules, Web Worker CPM (`p6`/`msp`/`default`), virtualized grid + Canvas 2D Gantt, docked Details + Relationships panel, search, and explicit-save Edit mode with version locks and Undo/Redo; Gantt drag-and-drop, `Ctrl+K` command palette and P2-era recovery wizard go to "Phase 4 later" | Keeps Phase 4 shippable in ~38 focused tasks while delivering full end-to-end planning utility |
| D2 | **Owner decision 2026-11-20:** Store schedule contents as versioned gzipped `ScheduleDocument` JSON snapshots in a private `schedule-data` Storage bucket + lightweight lock/revision/mode metadata in `public.schedules` | Real XER files carry 23k+ activities and 67k+ links; single-object gzipped snapshots load/save in < 1 s (~1–2 MB) without Postgres row explosion or per-row RLS overhead |
| D3 | **Owner decision 2026-11-20:** Imported schedules open in **"As imported"** display mode (preserving source dates) with manual `F5` / **Calculate** and an opt-in **Auto-calculate** setting | Matches planner expectation that opening a P6/MSP export never silently shifts dates before review |
| D4 | **Owner decision 2026-11-20:** Pure Canvas 2D Gantt behind a `Draw2D` abstraction (replacing dual SVG/Canvas); lag calendar is profile-driven and read from source settings (`p6` defaults to predecessor, `msp` to successor) | 60 fps at 50k rows, one renderer to maintain, and directly reusable for Phase 7 vector PDF; resolves the `app-map.md §3.1` vs P6 conflict |
| D5 | **Owner decision 2026-11-20:** New imports write their initial snapshot at import time; P3-era unmaterialized imports materialize on first open by an editor/owner, while workspace-member viewers render in-memory without writing | Zero latency for all new imports and seamless read access for viewers on existing P3 schedules |
| D6 | **Owner decision 2026-11-20:** Schedule dates display as `DD.MM.YYYY` (with optional `HH:mm` in Details) and durations/floats in working days (`5 d`, `+12 d`, `0 d`) using each activity's calendar `hoursPerDay` | Resolves P3 core D3 for Turkish construction scheduling conventions inside our English UI |
| D7 | **Owner decision 2026-11-20:** Explicit **Save** (`Ctrl+S`) / **Discard** in Edit mode with 15-min idle lock (2-min heartbeat) and dirty-leave confirmation | Prevents half-finished logic edits from publishing immediately |
| D8 | **Owner decision 2026-11-20:** Add only `@tanstack/react-virtual` (MIT) and dev-only `fast-check` (MIT); implement Undo/Redo as a pure TypeScript command/patch layer | Minimal bundle, minimal licence footprint, and clean serializable `forwardPatch` seam for Phase 7 `HistoryEntry` |
| D9 | Keep `src/engine/**` separate from `src/import/**` with its own Web Worker and ESLint boundary | Keeps parser libraries out of schedule-editor load path and guarantees pure, Node-testable CPM math |
| D10 | Borrow rules from `docs/product/ops-study.md` Part 1 (profile registry, minute boundaries, oracle ratchet, iterative DFS, summary rollups), never code | Closed-source product (P2 D19, P3 core D58) |
| D11 | **Owner decision 2026-11-24:** A completed activity is never critical, near-critical or on the longest path, and a WBS element's `hasCritical` never comes from completed work (as in P6 and MS Project) | The 2026-11-23 review found finished work drawn red because `keep_actuals` gives it zero float |
| D12 | **Owner decision 2026-11-24:** The free float of an activity with no active successor is the working time from its early finish to the calculated project finish on its own calendar (as in P6 and MS Project), not 0; this replaces plan Task 14's 0 | Open-ended activities showed no free float though they could slip to the project finish |
| D13 | **Owner decision 2026-11-24:** Every % complete edit (grid, Details, Gantt progress drag) goes through one progress helper that keeps the activity's status and actual dates consistent: leaving 0 % sets `actualStart` to the calculated early start (never after the status date) when it is empty; 100 % also sets `actualFinish` to the calculated early finish, capped at the status date; back to 0 % clears both; existing actual dates are kept. The P4 later spec's percent-only drag patch (§5.2.3) follows this helper | The grid and drag set a status without actual dates, so the engine moved the activity to the project start or the status date and raised false warnings |
| D14 | **Owner decision 2026-11-24:** XER scheduling options are read from the file (the project's `SCHEDOPTIONS` row, else `PROJECT`): total float type (start, finish or smallest), open ends critical, SS lags from early start, use expected finish, critical path definition (total float or longest path) and its threshold; they map to the document's rule overrides and `criticalDefinition` / `criticalThresholdMinutes`. P6's "Actual Dates" progress mode, which the engine doesn't have, is calculated as Retained logic and the document notes the substitution. The P3 reader keeps the extra fields as an additive change (P3 D44) | Imported P6 schedules otherwise calculate with fixed profile values instead of the file's own settings |
