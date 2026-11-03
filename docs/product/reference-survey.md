# Reference product — functional survey

| | |
|---|---|
| **Date** | 2026-11-03 |
| **Basis** | The reference product's public user documentation, read on 2026-11-03 (18 pages). No source code was read. Everything is written in our own words; the reference's wording, names and visual identity are not ours to reuse. |
| **Use** | Section 1 fed the Phase 3 spec (`docs/superpowers/specs/2026-11-03-phase3-projects-files-library-design.md`). Section 2 lists the items for later phases; read it when designing them. The owner's instruction (2026-11-03): match the reference's functions and build our own improvements on top. |

---

Source: the raw inventory of the reference product's docs (getting-started, concepts, glossary, navigation, workspaces, roles-and-access, premium-projects, projects, projects-and-files, schedules, import-schedules, p6-compatibility, microsoft-project-compatibility, schedule-library, sharing, progress-updates, submit-progress, troubleshooting). All wording below is ours. Reference terms appear only as short labels.

Our baseline: P2 roles are `owner > editor > viewer`, at workspace level only. A viewer sees disabled actions marked `aria-disabled` with a tooltip, and the server rejects them as `forbidden`. Project roles arrive in P7.

---

## 1. Phase 3 parity list

IDs are proposals for the P3 spec. "Ours" marks a rule the reference does not document, so we have to decide it.

### 1.1 Access rules for P3 actions
- **ACC-1** Creating a project or a program needs editor or owner in the active workspace. Viewers get the P2 disabled pattern, and the server rejects the call.
- **ACC-2** These file actions need editor or above: create, import, replace, reload, copy, save version, rename, move, archive, restore, delete, lock and unlock, set or clear tags, edit notes, and create or move folders. Viewers can only open, browse, search and filter.
- **ACC-3** Reading a file, creating one and editing one are three separate checks. A user may open a file they cannot change.
- **ACC-4** The server enforces every rule (RLS and RPCs). A copied URL gives no access.
- **ACC-5** Some actions belong to a project admin in the reference: detaching a version from its parent, and deleting a project. Until P7 adds project roles, we map them to owner. Editing project details stays editor and above, to match our P2 description "Creates and edits projects and schedules". This is a deliberate difference: the reference does not let Editors manage the project.
- **ACC-6** A file action can be blocked by several states, checked in this order: role, file locked, file archived, file is a child version. P4 adds view mode and P7 or F1 adds the update-cycle stage. The UI names the reason that applies (see improvement I-7).

### 1.2 Programs
- **PRG-1** An "add program" action in the Projects header creates a program: a named group of projects at workspace level. Ours: the name is required and unique per workspace.
- **PRG-2** A project belongs to no program or to one. It can be assigned or unassigned from the project's actions menu and from project settings.
- **PRG-3** A program only groups projects. Each project keeps its own files, team and settings, and the program has no effect on schedule data. Programs, folders and WBS are three separate structures.
- **PRG-4** The Projects page has a programs section that lists each program with its projects. Ours: renaming is allowed, and deleting a program ungroups its projects without deleting them.

### 1.3 Project attributes and settings
- **ATT-1** Required fields are the name and a short project code (unique per workspace). Description and cover photo are optional. P1 already has these.
- **ATT-2** The attributes step covers status, stage, project type and sector, each from a controlled pick list. P3 extends the lists for stage, type and sector.
- **ATT-3** The client and location steps capture address, city, country and coordinates. Coordinates drive placement on the map.
- **ATT-4** A review step comes before creation. The team step waits for P7.
- **ATT-5** New field: each project has a scheduling time zone. Dates are read in that zone, never shifted to the viewer's zone, and imported timestamps are treated as having no zone. P3 stores the field and P4 uses it. Ours: the default is the creator's profile time zone.
- **ATT-6** The open project has a settings and actions control, shown in the Files header, to view and edit details and attributes. Which edit controls appear depends on the user's role.
- **ATT-7** Project attributes describe the job only. Changing one, such as stage, never changes schedule data and never triggers a recalculation. Status date, calendars and calculation settings belong to each schedule file.
- **ATT-8** One project holds many schedule files: baseline, working file, monthly updates and alternatives. The UI should not encourage a new project per update. Creation should check for duplicates (see I-13).

### 1.4 Projects page and Home entry points
- **PRJ-1** The Projects page lists only the active workspace's projects. Home and the Library cover every workspace the user can reach.
- **PRJ-2** The header holds the workspace name, a workspace settings entry (owner only, with content in P7), add program, add project, and counters for projects and files.
- **PRJ-3** Search matches the project name or code.
- **PRJ-4** Filters cover status, stage, client, location (city and country), project type and sector, plus a status-date range from our app-map. Filters combine, active filters stay visible, and one action clears them all.
- **PRJ-5** Sort options are recently opened, name and status date.
- **PRJ-6** The page offers list, tile and map layouts. The last choice is remembered per viewer through `storage.ts`.
- **PRJ-7** The map places projects that have coordinates. Projects without coordinates are never dropped silently: a "no location" count opens a list of them, with a link to set the location.
- **PRJ-8** Empty states: no projects yet (with a create action for editors), and no results (with a clear-filters action).
- **PRJ-9** Each project has an actions menu: open, settings, assign to a program, and delete (owner, with confirmation).
- **PRJ-10** The create flow shows which workspace the project will be created in, because creation always targets the active workspace.
- **PRJ-11** Home has new project, new schedule and import schedule. New schedule and import first ask for the destination project, then open the same dialog or wizard as Files.
- **PRJ-12** The project-level nav has Files, Dashboard (P6), Schedule (P4, opens the current file) and Team or Progress (P7). If no file is current, Schedule points the user to Files.

### 1.5 Files list (schedule files and versions)
- **FIL-1** Files is the project's file manager. It lists every schedule file, with saved versions nested under their parent and opened by expanding the row.
- **FIL-2** Row columns: current selector, name, lock state, code, status date, baseline flag, update number, last modified, activity count, notes indicator and source (blank, copy, or import with the file name).
- **FIL-3** The header shows the project photo, name and settings, Import, Create schedule and Open current. Counters show the current file's status date, the file count and the current file's name.
- **FIL-4** Create schedule opens a dialog that asks for a name and code, with an optional folder, and creates an empty file in this project. Ours: the code is unique within the project.
- **FIL-5** A file opens from its name or from an Open row action. Open current opens the file tagged current. With no current file, Open current and the Schedule nav entry are disabled, and the hint says to set one.
- **FIL-6** Save version creates a frozen snapshot as a child of its parent. Name and code are required. The child's content is read-only.
- **FIL-7** Copy creates an independent, editable file. Name and code are required. The dialog offers an optional folder and an optional "make current". A copy never syncs with its source. Copying a version gives a standalone working file.
- **FIL-8** Detach from parent turns a child version into a standalone working file. It also works on versions that a completed update cycle created (F1).
- **FIL-9** A child version cannot be edited however it is locked. It has fewer actions than a working file: no nested versions, and it cannot be the source of an update cycle.
- **FIL-10** Rename changes a file's name or code.
- **FIL-11** Delete is permanent, needs the right role, and asks for confirmation. Ours: the confirmation names the file, its activity count and any child versions that go with it.
- **FIL-12** A search box matches name and code. Filters cover designation (current, baseline, update), has notes and folder. The list also has a hide-empty-folders setting and a show-archived toggle.
- **FIL-13** Bulk select supports archive, move to folder and delete.
- **FIL-14** When search or filters find nothing, the empty state offers to clear filters, show archived files, expand all, or search the Library.
- **FIL-15** An empty project shows a setup checklist in our own copy: add a schedule, set current, set a baseline once one is agreed, tag history files with update numbers. It also suggests file names such as working, approved baseline, and update NN with the month.
- **FIL-16** Each file stores its source: kind, original file name, the stored upload, import settings and the import report. Reload and replace need these.

### 1.6 Folders
- **FLD-1** Add folder creates a folder inside a project. Folders only help browsing: they are not WBS, not programs, and never affect logic.
- **FLD-2** Files move into a folder through a row action or bulk move. A folder can also be chosen when creating, copying or importing a file.
- **FLD-3** Files can be filtered by folder, and a setting can hide empty folders.
- **FLD-4** Ours, since the reference does not document it: folders can be renamed and nested (the app-map already has a parent field). Only an empty folder can be deleted; otherwise the dialog offers to move its contents to the parent. Archived folders stay hidden unless show archived is on.

### 1.7 Tags (current, baseline, update number)
- **TAG-1** Current: at most one file per project. Choosing another row moves the pointer and never merges or copies data. Changing a view never changes the current file. Current may point to a child version, which then opens read-only.
- **TAG-2** Baseline: the agreed reference for comparisons. It can be cleared or moved, with a warning that every baseline comparison changes. The model differs from the reference (see D-2).
- **TAG-3** Update number: places a file in the reporting sequence. Numbers can be reordered by dragging one onto another and cleared with a remove control. Ours: the next free number is suggested.
- **TAG-4** The update number and the status date are independent: setting one never sets the other. The list warns when the update order contradicts the status-date order.
- **TAG-5** Tags are independent flags, so one file can be current, baseline and update n at once. Tags never freeze or copy data. A file is protected by saving a version or by the lock.
- **TAG-6** Tags are set only on Files. The import wizard does not set them, and the Library shows them read-only.

### 1.8 Lock (protection flag)
- **LCK-1** Each file has a persistent lock, shown as a toggle in the lock column. A locked file's content cannot be changed: activities, logic, calendars, status date and recalculation. Metadata stays editable: tags, notes, folder, and (ours) the name.
- **LCK-2** Imported XER files arrive locked. Ours: lock every imported file, whatever the format (see D-6).
- **LCK-3** Lock and unlock need editor or above. Ours: record who set the lock and when. The first unlock of an imported file asks the user to confirm that recalculation may move the imported forecast dates and never changes actuals.
- **LCK-4** The lock toggle does nothing on a child version. The UI says to copy or detach instead.
- **LCK-5** This flag is separate from P4's edit-session lock (user, time and idle timeout in our app-map). The model keeps both.

### 1.9 Archive
- **ARC-1** Archive removes a file from the default list but keeps it, and it can be restored. Show archived brings archived files back into view. An archived file is read-only until it is restored.
- **ARC-2** Archive and delete are separate actions, each with its own confirmation. Bulk archive is supported.
- **ARC-3** Ours: archiving a parent also archives its versions. Archiving the current file asks the user to pick a new current file or to clear it. An archived baseline keeps its tag, and the UI warns about it.

### 1.10 Notes
- **NOT-1** Each file has a free-text notes field for context such as approval state or the reason for a reissue. It is edited from Files, shown by an indicator column, and filtered with "has notes". Ours: a length limit, such as 2,000 characters.

### 1.11 Import: general flow and wizard
- **IMP-1** Import starts from Files, where the destination is fixed, or from Home, where the user picks the destination project first. The destination stays visible through every step.
- **IMP-2** Import never creates projects. Each selected source schedule becomes a new file in the chosen project.
- **IMP-3** The upload step takes a file picker or drag and drop, and accepts several files per run.
- **IMP-4** The format is detected from the content, not the extension, and a renamed file fails with a clear message. Accepted: XER, MSPDI XML, .xlsx and .csv. Refused with a specific message: P6 XML (PMXML), SQLite, database connections, password-protected files, and MPP unless G3 ships.
- **IMP-5** A review step lists each parsed schedule with name, code, status date, counts and warnings, and a checkbox to include it.
- **IMP-6** Each selected schedule takes one of two modes:
  - New: needs a name and code, with an optional folder.
  - Replace: the user picks a target file, and the target keeps its own name and code. The wizard advises saving a version of the target first.
- **IMP-7** A custom-field mapping step appears when the source has activity codes or user-defined fields. The user picks which fields to bring in and maps each one to an existing project field or to a new one. The step checks that data types are compatible. Standard fields never need mapping. This depends on P5 custom fields (D-7).
- **IMP-8** A carry-over step copies app-only columns, such as review notes or the responsible party, from a reference file into the incoming files, matched by activity code. It reports matched and unmatched counts, and it may have nothing to copy. It depends on P5.
- **IMP-9** The wizard ends with two buttons, Import (stay on Files) and Import and open. A completion screen follows.
- **IMP-10** An imported file keeps its source dates until it is recalculated. Recalculation follows our rules (P4) and never changes recorded actuals.
- **IMP-11** Reload re-processes the stored original upload with the stored settings. Replace re-imports a new source over an existing file. Uploads go to a private storage bucket. Before either one, the user is advised to save important edits made in the app.
- **IMP-12** The activity code is the identity key across files. Source keys are also stored: the XER task id and the MSPDI task GUID.

### 1.12 Import: P6 XER
- **XER-1** One XER can hold several P6 projects. The user picks which to bring in, and each becomes one file.
- **XER-2** Schedule-level fields:
  - project short name, root WBS name and project code
  - status date, taken from the last recalculation date
  - must-finish-by date and default calendar
  - calculation mode: retained logic, progress override or actual dates
  - the four unit and cost calculation flags, stored as they are; two are kept only for export
- **XER-3** WBS: code, name, parent, sequence order and root node.
- **XER-4** Activity fields:
  - code, name, WBS, calendar, type and status
  - physical % (kept as a manual value) and % complete type
  - original and remaining duration
  - actual, early, late, restart and re-end dates
  - total and free float
  - primary and secondary constraint, each with its date
- **XER-5** Activity types: task dependent, start milestone, finish milestone, level of effort and WBS summary. A resource-dependent activity becomes task dependent on its activity calendar, with a warning.
- **XER-6** Progress semantics are stored exactly so that P4 can interpret them:
  - Actual dates are history.
  - For in-progress work, early start marks the start of the remaining-work window.
  - Completed activities under retained logic keep their actual window.
  - Original duration is kept as the planned duration.
- **XER-7** Calendars: names, default calendar, weekly patterns, several work periods per day, exceptions, and the hours-per-day, week, month and year factors. Resource calendars are stored but never drive dates.
- **XER-8** Relationships: FS, SS, FF and SF, with positive or negative lag in working time.
  - Links whose other end is in another project or outside the file are dropped and counted per source project.
  - An unknown link type maps to the nearest standard type, or to FS, with a warning.
- **XER-9** Constraints: primary and secondary, covering ten types: ASAP, ALAP, start on, start on or after, start on or before, finish on, finish on or after, finish on or before, mandatory start and mandatory finish.
- **XER-10** Activity codes (types, hierarchical values, short names, descriptions and assignments) and task UDFs (text up to 255 characters, integer, decimal, money, date, duration and boolean) are imported. Skipped: UDFs on non-activity objects, formulas and indicators.
- **XER-11** Expected finish is not used, and the report warns when the source relies on it. Baseline assignments are never inferred, and the baseline is set by hand in Files.
- **XER-12** Resources and assignments go to P5. Until then, P3 parses them and reports how many were skipped (D-7).

### 1.13 Import: MS Project XML (MSPDI)
- **MSP-1** One file becomes one schedule file.
- **MSP-2** Project-level fields: name, start, finish, status date and project calendar. With no valid status date, the earliest task start is used, with a warning. Currency, fiscal settings, critical-slack limit, default task type and earned-value settings are dropped.
- **MSP-3** Summary tasks become WBS nodes with name, a local code (the last segment of the outline number), hierarchy and order. Values stored on summary rows are dropped. Leaf tasks become activities, and blank rows are skipped along with their links.
- **MSP-4** The visible task ID becomes the activity code, and the GUID is stored. Fields:
  - name, WBS parent, task or milestone, calendar and % complete
  - total, original, remaining and actual duration
  - stop and resume dates
  - early and late dates, falling back to start and finish when blank
  - actual dates, constraint, and total and free slack (as initial float only)
- **MSP-5** Status follows this priority: an actual finish means complete; an actual start means started; 100 % or more means complete; above 0 % means started; anything else is not started.
- **MSP-6** % complete maps to physical %. % work complete is not imported.
- **MSP-7** Milestone kind comes from the time of day compared with the calendar's first working minute. An ambiguous case becomes a start milestone and is flagged in the report.
- **MSP-8** A manually scheduled task gets a start-on-or-after constraint at its manual start, or at its start when that is blank. Manual finish and free-text duration are dropped and listed.
- **MSP-9** Constraint mapping:

  | Source | Ours |
  |---|---|
  | ASAP, ALAP | ASAP, ALAP |
  | must start on | mandatory start |
  | must finish on | mandatory finish |
  | start no earlier than | start on or after |
  | start no later than | start on or before |
  | finish no earlier than | finish on or after |
  | finish no later than | finish on or before |

  One constraint per activity comes in, and a secondary can be added later. Deadlines are dropped.
- **MSP-10** Links:
  - Lag is stored in minutes, whatever unit the source displays.
  - A percent lag is frozen once into a fixed working lag.
  - Elapsed lag is treated as working lag, with a warning.
  - A link is kept only when both ends are leaf tasks. Links that touch a summary task are dropped and listed.
- **MSP-11** Calendars: weekly pattern, several periods per day, single-day and date-range exceptions, exceptions with custom hours, and recurring exceptions (daily, weekly, monthly or yearly, by fixed date or relative weekday) expanded to 20 years past the finish. Task and resource calendar assignments are kept.
- **MSP-12** A calendar error stops the whole import and names the calendar. A bad calendar is never silently replaced with a standard week.
- **MSP-13** Inactive and external leaf rows become ordinary activities and are flagged. Recurring task definitions, leveling, priority, notes, hyperlinks, custom and enterprise fields, outline codes, baselines, costs, earned-value fields, timephased data and split segments are dropped and listed.

### 1.14 Import: Excel and CSV (our own scope; the reference has none)
- **CSV-1** Accept .xlsx (with a sheet picker) and .csv, and detect the header row.
- **CSV-2** A mapping step links source columns to our fields:
  - code, name, WBS (as a path or code)
  - duration with its unit
  - start, finish, actual start and actual finish
  - predecessors in a compact text form (code, type and lag)
  - calendar name, constraint type and date, % complete, notes

  Other columns go to custom fields (P5) or are ignored.
- **CSV-3** A preview shows the first rows, with validation per row and per cell. Rows with errors can be excluded or fixed at the source.
- **CSV-4** The result goes through the same review, new-or-replace choice and report as the other formats.

### 1.15 Import: MPP (optional, G3)
- **MPP-1** MPP import is optional and runs through a server-side converter. Only current MPP generations are accepted. A protected or older file is refused, with a pointer to save as XML. The report states clearly how faithfully calendars came through.

### 1.16 Import report
- **REP-1** Warnings appear before the import is confirmed:
  - links dropped because the other end is in another project or outside the file (count per source project)
  - links dropped because they touch a summary task (count)
  - links whose ends cannot be represented
  - resource-dependent activities converted to task dependent
  - P6 calculation flags that differ from our fixed rules
  - resources with several rates
  - unknown link types that were remapped
- **REP-2** Each warning opens a list of the affected items: each omitted link (from code, to code, type, lag and reason) and each calendar limitation (calendar name and what was lost).
- **REP-3** Every source element is sorted into one of three outcomes: used by the calculation, stored for display and export only, or dropped.
- **REP-4** Fatal errors stop the import with no partial result:
  - a parse failure (the advice is to re-export in the source tool's native format)
  - an unsupported or protected file
  - an unparseable calendar (named in the message)
  - an unsupported recurrence rule

  The error text and file type can be copied for support.
- **REP-5** A post-import summary shows counts for WBS nodes, activities by type, milestones, calendars and exceptions, activities with actuals, links by type and constraints, plus the status date. Imported start and finish are compared with the source before any recalculation.

### 1.17 Library
- **LIB-1** The Library is a sidebar page that lists every schedule file the user can reach, across workspaces and projects, and nothing else.
- **LIB-2** It shows a tree: workspace, then project, then folder, then file, then versions. Breadcrumbs show where the user is.
- **LIB-3** Columns: name, code, project, tag, status (current, baseline or work in progress), status date and created or modified. Access level is added in P7.
- **LIB-4** Search matches name and code. Filters cover workspace, project, tag, status and access level, and they combine. The page also has hide empty and show archived.
- **LIB-5** Row and bulk actions are open, move, copy, rename and delete, offered by permission and by file kind (versions get fewer). Bulk actions confirm the full selection and the destination. Move only changes where a file is filed, while copy makes a new file (D-8).
- **LIB-6** Tags are read-only in the Library and managed on Files.
- **LIB-7** In P7, files shared directly with the user appear even when the rest of their project is hidden, with a "remove from my library" action.
- **LIB-8** The empty and missing-file state suggests clearing filters, expanding parents, showing archived files, and checking which account is signed in.

### 1.18 Decisions the P3 spec must make (conflicts with our app-map)
- **D-1 Version tree.** `ScheduleVersion` needs `parentId` and a kind (working file or version). It also needs `protected` (the lock flag), `archivedAt`, `updateNumber` and the baseline flags, plus `sourceFileId`, `importSettings` and `importReport`.
- **D-2 Baselines.** The reference has one baseline slot. Our app-map allows many baselines with one primary. Recommendation: keep ours, since it is a superset.
- **D-3 Update order.** The reference orders updates by hand (drag). Our app-map numbers them by status date. Recommendation: manual order, with a conflict warning and a one-click renumber by status date.
- **D-4 Lock.** The reference's protection flag and our edit-session lock are different things, so keep both.
- **D-5 Time zone.** Add a scheduling time zone to Project (ATT-5).
- **D-6 Lock on import.** The reference locks only XER imports. Recommendation: lock every import.
- **D-7 P5 dependencies.** Custom-field mapping, carry-over columns and resources all need P5. Options: pull a minimal custom-field definition forward into P3, or store the raw values and map them later.
- **D-8 Move across projects.** Recommendation: only within a project in P3, because calendars and fields are scoped to a project.
- **D-9 Lag calendar.** Our app-map measures lag on the successor's calendar, and the reference measures it on the predecessor's. This is decided in P4, but the import should store the source's setting.

---

## 2. Items tagged to other phases (one line each)

### P1 (built; keep consistent)
- The top-bar workspace switcher sets the context. Projects then follows the selected workspace, while Home and the Library span all workspaces.
- The top-bar project switcher works within the selected workspace.
- Navigation has three levels: account (Home, Library, Assets), workspace (Projects) and project (Files, Dashboard, Schedule). The user menu adapts to the user's access.
- The project wizard's details, client and location steps (name and code required; description and photo optional).
- The first step in any troubleshooting is to check the account, workspace, project and file shown in the top bar.

### P2 (built; record the gaps)
- There are two workspace kinds, personal and team. Team management exists only in team workspaces.
- A project belongs to exactly one workspace, and nothing syncs it between workspaces.
- An invitation must be accepted while signed in with the invited address. A second account looks as if it has no access, and one shared file does not make someone a member.
- The hierarchy is workspace, then project, then file, then activities, WBS, links, calendars and progress.
- Gap: the reference has four workspace roles: Owner (billing), Admin (settings, projects, members), Member and Guest (only what is granted). We have owner, editor and viewer.
- Only owners or admins manage membership, and invite controls show only to them.
- What the UI shows depends on role, workspace kind and capability. The server enforces access whatever URL is used.
- Unavailable actions are checked in order: account and context, role, workspace kind and plan, workspace active, file state, cycle stage.

### P4 (schedule core)
- The version switcher shows name, code, status date and tag for each entry.
- Find locates activities by name or code. Hidden rows need filters cleared or groups expanded first.
- The toolbar folds into an overflow menu on narrow windows, and a command palette is available. Some commands appear only in edit mode, with a selection, or on an editable file.
- Checks before using a file: status date, calendars, key milestones, logic, and progress on started work.
- WBS rows roll up dates and carry no logic. A WBS-summary activity is a real activity. Level-of-effort dates come from the work it is linked to.
- Calculation terms: the status date splits history from remaining work. Durations are original, remaining, actual and total, and total is the calendar span.
- Lag can be negative and is measured on the predecessor's calendar in the reference. Our app-map says successor (D-9).
- Total float is finish float and free float is measured against successors. Negative float comes from must-finish-by or constraints. The critical threshold and the driving path are defined here.
- Physical % complete is manual and differs from duration %. A 100 % activity still needs an actual finish.
- Calendars drive durations, and all arithmetic runs in working minutes on the activity calendar.
- Duration entry takes explicit units, and a bare number uses the largest unit of the chosen format.
- Dates are read in the project's time zone and never shifted to the viewer's zone.
- Fixed engine rules: SS lag runs from the predecessor's remaining early start. Late dates anchor to must-finish-by, otherwise to the latest early finish.
- New mode, retained duration: actual and remaining duration stay separate. It is the default for MS Project imports and is written to XER as actual dates.
- Suspend and resume only set the earliest start of the next remaining block, which is always one continuous block.
- Start on and finish on are soft constraints with bounds. Mandatory start and finish are hard overrides.
- A project scheduled from its finish is scheduled forward from the status date, and the backward pass then gives late dates.
- MS Project slack is replaced at the first recalculation. A known list of features can make results differ from the source.
- Edits save as they are committed, with a visible pending or error state. Save As is for versions and copies only.
- The editor has a view and edit toggle, and disabled cells explain why.
- Troubleshooting covers why dates move: status date, actuals, remaining duration, calendars, links, lag, constraints and calculation mode.
- The engine aims to match a stated list of behaviors and states which it does not cover: expected finish, leveling, multiple float paths.

### P5 (views and assets)
- A view holds columns, filters, grouping and sorting, and saved views change only the display.
- The highlight-a-date-window tool corresponds to our focus window.
- Assets cover views, calendars, columns, resources, curves, palettes, layouts, reports and quality profiles. Scope decides availability, and duplicating is safer than editing a shared asset.
- Each project can set a duration display format: unit pattern, 0 to 2 decimals, conversion through the calendar, default of whole days.
- Display formats are presentation only. They apply to the Gantt and to exports, while day-based filters and thresholds keep their meaning.
- XER resources import with their fields. A resource is reused only on a full match, rate table included; otherwise a new one is created.
- XER assignments import with their fields, and a driving assignment can lengthen its activity.
- Assignment editing rules: actuals only after the activity starts, and units lock once it completes.
- Unit and cost calculation toggles per schedule.
- MS Project resources import only name, ID and calendar. Assignments keep work and units, and costs and contours are dropped.
- Troubleshooting missing activities: highlight filters, collapsed groups, blank values under field filters, and the difference between match all and match any.

### P6 (analysis and dashboard)
- Activity identity is the activity code. A changed code appears as an added and a deleted activity in a diff.
- Metrics include an SPI-style ratio, a hit rate per update window and a compression ratio.
- A quality profile holds the checks, thresholds and scoring, and findings drill down to the affected activities.
- Missing dashboard history comes from tags, order or status dates. A blank metric does not mean zero.
- An unexpected add or delete in a comparison usually means the files are in the wrong order or the codes changed.

### P7 (collaboration and output)
- Workspace roles and project roles are independent, and changing a workspace role keeps project assignments.
- Project roles: Viewer reads, Editor also imports, edits and comments, and Admin also runs update cycles and manages the team.
- Editors can invite people up to their own role but never grant Admin. A project invitation covers every file in the project.
- Grant the narrowest access that works: one file, then project viewer, editor or admin, then workspace admin.
- Sharing one file gives read-only access, no browsing of the project and no membership.
- Access paths stack, so offboarding must remove both a membership and any direct shares.
- Share links always need sign-in, have an expiry and can be limited to an email domain. All three are fixed when the link is created, and revoking a link keeps the memberships already made through it.
- A panel manages each file's direct shares.
- Sharing a working file shows its later edits, while sharing a version issues a fixed state. Downloads cannot be recalled.
- Activity comments need Editor or above, and team comments exist only in team workspaces.
- The project wizard gets a team step, and each project gets a Team page.
- The Share menu has three targets: this file, this project and this workspace.
- A print layout holds page, timeline, header and footer settings. A report bundles several layouts, and PDF output has a preview.
- XER export covers a stated list and omits another stated list. It is a handoff, not a backup.
- Export goes to PDF, Excel and XER, with no export to MS Project formats.
- Troubleshooting covers PDF output and failed share links.
- Workspace settings and billing review live on their own pages.
- Remove from library, and recovery when access to a file is lost.

### Improvement track (F1, A1, G3, D2)
- **F1** An update cycle has an "updates through" cutoff and a separate contributor due date. The due date never becomes the status date.
- **F1** Cycle stages are collecting, editing and completed. Only an admin starts, applies, returns, cancels or completes a cycle, and editors contribute only while it is collecting.
- **F1** The source must be a working file, never a child version. Saving a version before the update is optional.
- **F1** The start dialog asks for the source file, period start, cutoff, due date, an update label, a completion threshold and reminders.
- **F1** Monitoring shows an assignee column and filter, a my-tasks view and a remaining-only filter. Completion counts answered rows, not progress on site.
- **F1** Applying writes progress into the current file only. It takes a snapshot and shows how many rows have no update. By default it moves the status date to the cutoff and recalculates.
- **F1** Returning to collection restores the snapshot and keeps comments and inputs. Cancelling discards all inputs and cannot be undone.
- **F1** Completing a cycle saves a read-only child version, with optional "mark current" and "next update number".
- **F1** The contributor sheet has update start, update finish, a required flag, optional physical % and a "not started this period" answer, which should come with a comment.
- **F1** Validation: start cannot be after finish, dates snap to working time, a finish at or before the cutoff completes the activity, and helpers reforecast the finish.
- **F1** Submitting is blocked while rows are outstanding, and submitting does not calculate.
- **F1** Contributors can enter progress only when they are editors and the cycle is collecting.
- **F1** A workspace-level Updates page gathers update work across all projects.
- **F1** The monthly routine: import as a new file, carry over columns, check warnings, set the update number, compare, make current, keep the baseline.
- **A1** Each project can set a date display format (preset, then date only, 24-hour or 12-hour). The reference defaults to month/day/year.
- **G3** MPP accepts only current generations. Calendars keep their exceptions, but the weekly pattern is rebuilt as a standard two-block weekday.
- **D2** Earned value equals budgeted total cost times activity % complete.

---

## 3. Not-planned items worth the owner's attention

- **Licensing model.** The reference splits licences into seats assigned to people and premium slots assigned to projects, and the two cannot be swapped. A premium slot covers a whole project. Personal workspaces import and view for free but pay to create and edit. Update cycles are a premium team feature. We already have a plan badge and a Subscription entity, so the owner should decide whether F1 or editing becomes a paid feature before P3 fixes the permission checks.
- **Inactive workspace on unpaid billing.** It blocks every action. If billing ever ships, "workspace inactive" belongs in ACC-6's list of blocking reasons, so it is cheap to reserve the state now.
- **Missing roles.** The reference has a workspace Admin and a Guest, and we have neither. Both matter for subcontractor access in P7.
- **No resource leveling.** Resource and assignment calendars never drive dates, there are no rate overrides on assignments, and actuals are never computed automatically. Staying out is reasonable, but D2 (earned value) and A3 (progress-payment tracking) may need cost overrides.
- **Engine gaps.** Expected finish, multiple suspend and resume splits, resource-dependent scheduling, external float anchoring, and multiple float paths are all missing. These are chances for us to beat the reference after P4, especially for D3 delay analysis.
- **Structured support reports.** The reference asks for the workflow, IDs, error text, status date and calculation mode. A cheap version for us is a "copy diagnostics" button on error states, which also helps the lab pilot.

---

## 4. Improvements on top of the reference (P3 scope)

| # | Improvement | Rationale | Phase |
|---|---|---|---|
| I-1 | **Turkish encoding detection on import.** Auto-detect UTF-8, UTF-8 with BOM, Windows-1254 and ISO-8859-9 for XER and CSV, let the user override it, and preview names with ç ğ ı ö ş ü before committing | The reference says nothing about encodings. XER files from Turkish P6 installs and CSVs saved by Turkish Excel are often not UTF-8, so names arrive garbled | P3 |
| I-2 | **Locale-aware Excel and CSV mapping.** Detect `;` vs `,` delimiters, decimal commas and `dd.MM.yyyy` dates. Auto-map Turkish and English header synonyms (Aktivite Kodu, Süre, Başlangıç, Bitiş, Öncül). Save mapping templates per workspace | The reference has no Excel or CSV import at all. Spreadsheets are the most common source of schedules on Turkish sites | P3 |
| I-3 | **Itemized import report stored with each file.** Every dropped or changed item with its reason, counts per outcome (used, stored, dropped), reachable later from the Files row and downloadable as .xlsx | The reference warns before import, mostly with counts, and keeps nothing afterwards. Claims and audits need the record | P3 |
| I-4 | **Automatic post-import checks.** Run the reference's manual checklist as code: counts against the source, actuals after the status date, status-date fallback used, ambiguous milestones, frozen percent lags, summary links lost | The reference leaves this checklist to the user | P3 (checks); P4 adds a dry-run recalculation that previews how forecast dates would move before unlocking |
| I-5 | **Calendar fidelity.** Resolve MSPDI base-calendar inheritance instead of falling back to a default Monday–Friday. Through G3, keep real MPP weekly patterns instead of the reference's rebuilt standard week | The reference's docs admit both losses, and calendars drive every date | P3 (inheritance); G3 (MPP) |
| I-6 | **Accept P6 XML (PMXML)** in addition to XER | The reference refuses it, yet EPPM and cloud users often export only XML | P3 stretch, or soon after P3 |
| I-7 | **Name the blocking reason** next to every disabled file action (role, locked, archived, child version, cycle stage), with the fix where one exists ("Detach from parent to edit") | The reference lists these causes only in troubleshooting. Our P2 tooltip pattern already supports this | P3 |
| I-8 | **Update order vs status date.** Flag files whose update number contradicts their status date, and offer a one-click renumber by status date | The reference says misordered files distort trends but leaves the check to the user | P3 |
| I-9 | **Protect before tagging or replacing.** Baselining a working file offers to save a version and tag the version. Replace creates an automatic version of the target first, which makes it undoable | The reference only advises this. One click prevents lost history | P3 |
| I-10 | **Replace with a change preview.** Before overwriting, show activities added, removed and changed by code, plus mismatched codes | Avoids blind overwrites. A lightweight count-based diff fits P3 | P3 (counts); P6 (full diff) |
| I-11 | **Stronger matching on replace.** Match activities by stored source keys (XER task id, MSPDI GUID) as well as by activity code | The reference relies on the activity code alone, so renamed codes break matching and carry-over | P3 (store and match); P6 (diff uses it) |
| I-12 | **Map upgrades.** Clustering, a list of projects without a location, setting a location by clicking the map, filtering by the visible map area, and Turkish province and district pick lists for location | The reference's map silently skips projects without coordinates | P3 |
| I-13 | **Duplicate-project guard.** Warn when a new project's name or code resembles an existing one, including filtered-out and archived projects | The reference's troubleshooting repeatedly warns against duplicate projects | P3 |
| I-14 | **Better Library search.** Match name and code across workspaces. Fold Turkish letters (İ/ı/I/i) and diacritics, so "insaat" finds "inşaat". Add a status-date range filter, recently opened files and keyboard navigation | The reference's Library searches by name only | P3 |
| I-15 | **Per-project date format with a Turkish default** (`dd.MM.yyyy`, 24-hour), stored in P3 and applied in P4 | The reference defaults to month/day/year, which Turkish users misread | P3 (field); P4 (rendering) |

---

## 5. Gaps

- Pages not read: none.
- The reference does not document these, so the P3 spec decides them: folder rename, nesting and deletion (FLD-4); who may lock and unlock, and any timeout (LCK-3); archiving the current file or a parent (ARC-3); deleting a parent that has versions (FIL-11); and moving files across projects in the Library (D-8).