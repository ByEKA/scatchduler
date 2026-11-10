# Open Planner Studio study

Open Planner Studio (OPS), https://github.com/OpenAEC-Foundation/open-planner-studio, from the OpenAEC Foundation, is a free construction scheduler licensed LGPL-3.0-or-later. It was studied on 2026-11-10 at v2026.45.0 by reading its source; none of it was run.

Owner decision, 2026-11-10 (option A, P3 core spec D58): OPS is a rules reference. We study it and write its rules into our specs in our own words. None of its code is copied, because our app is closed (P2 D19). Its claims about fidelity and speed come from its own release notes and tests; we have not verified them.

Part 1 feeds the Phase 4 core spec (engine, profiles, grid, Gantt). Part 2 records what the Phase 3 core import design took from it.

## Part 1: engine, profiles and UI (for the Phase 4 core spec)

Bottom line: most useful are (a) the P6-vs-MSP rule list, (b) date testing against files saved by MSP/P6, (c) canvas Gantt with one drawing path for screen and PDF. Building on their code fits poorly (no server, store-coupled UI, weekly upstream churn, LGPL).

### Engine
- solveProject (src/engine/scheduler/solveProject.ts): leaf tasks only, summary relations expanded to leaves, CPMSolver (4,232 lines), results written back, summaries rolled up. Full recalculation each time; manual F5 with scheduleStale flag; auto opt-in.
- Kahn topological sort with head-index queue (O(n^2) step removed: 0.8 s at 20k); iterative DFS cycle detection (recursive overflowed at 6,000-chain); cycle returns loop ids; error codes, not thrown strings.
- Minute model: per-calendar day-unrolled work blocks cached, prefix sums (CalendarEngine.ts). Calendar with no work hours refused. Most bugs at block boundaries (17:00 finish vs 08:00 next-day start).
- Constraints: ASAP, ALAP, SNET, SNLT, FNET, FNLT, MSO, MFO + hard flag + constraint2 + soft deadline. Late-side constraints and deadlines cap LF → negative float + warning.
- Lags: FS/SS/FF/SF; minutes or days; working or elapsed; percent lag of predecessor duration re-evaluated each run; leads clamped at project start ("truncated lead"); lag calendar: predecessor (default), successor, 24h, project default.
- Critical: TF <= threshold or longest path (walk driving links back from latest EF); near-critical threshold; P6 multiple float paths by FF or TF; driving = relationship free float 0, ties allowed (scheduleAnalysis.ts).
- Progress: RETAINED_LOGIC and PROGRESS_OVERRIDE; no P6 actual-dates mode; out-of-sequence warnings.
- Summaries not CPM nodes; SS/SF from summary errs late; summary constraints ignored (known bug 3).
- Hammock/LOE in topo order; ALAP post-pass. Task types (work rules) apply only on edit (src/engine/work/workRuleApply.ts), never in the calculation — worth copying.
- Speed: 10k tasks / 11.7k relations solve 178 ms in Node; F5 to redraw 532 ms; main thread.

### Profiles (most valuable)
Base p6 | msproject | ops + overrides → 29 boolean rules, one options object; verify:conventions forbids engine branching on source format (src/engine/scheduler/conventions/registry.ts); rule meanings and evidence in src/types/project.ts; import suggests profile (XER/P6 XML → P6, .mpp → MSP, MSPDI/CSV → OPS).
1. Duration units: P6/MSP days × hoursPerDay × 60; OPS counts workday as 1.
2. Status-date floor for unstarted work: P6 retained logic only; MSP doesn't push unstarted tasks (A23).
3. Resume in-progress: MSP = latest of status date, logic, actual start + elapsed (A22); P6 early start = start of remaining work, late side uses remaining duration (A19).
4. SS lag from in-progress predecessor: P6 counts only lag left after actual start, from ES or actual start (C6; option startToStartLagFrom).
5. Completed activities (P6): keep actual dates on late side (A12); actual date-times exact (A18); completed physical-% as a point on status date (C5); lag after completed predecessor counts only the unelapsed part (C3).
6. Float: P6 TF = LF − EF; MSP automatic mode uses finish float for started task with status date, else min(start, finish float); P6 never negative free float (A13); P6 FF and LF on the activity's own calendar (C2, C9).
7. Boundary instants (P6): FS0 on a shared block edge (B1), backward lag from block end (B2), FF not before bound (C12), FF to start milestone (C7). MSP: finish milestone after FS sits at predecessor's exact finish (17:00), not next work instant (cases-msp-pariteit.json).
8. Milestones: P6 keeps planned block edge (A15), exact constraint time (A20); OPS milestone without predecessor at end of day (B6).
9. P6 target_start_date as floor (A16), not for started (C8).
10. P6 ALAP inside free float (C14).
11. P6 progress override ignores link to a started successor on late side too (C11).
12. Per-file options: lag calendar, TF mode, critical definition, open ends critical, P6 expected finish, project end as late-pass anchor, levelling.
13. Import: MSP MSO/MFO → hard constraints (mspdiReader.ts).
Caveats: some P6 rules only for explicit-hours calendars / XER data (CONVENTION_REQUIRES); some measured on one file. CONFLICT: our app-map §3.1 defaults lag calendar to successor's; P6 and OPS default to predecessor's; MSP [VERIFY].

### Date verification
- 573 hand-worked JSON cases in 24 batteries, expected from CPM theory, run under five time zones (tests/planning/README.md).
- MPP: read, solve through the app chain (mppFidelity.ts), compare start/finish with saved dates: exact/same day/diff/missing (fidelityCore.ts); pinned per file (mpp-fidelity-baseline.json): 216 files, 3,413 tasks all exact — but 164 are MPXJ JUnit data, largest ~215 tasks, only start/finish measured; files not in repo.
- XER: 93 files, 9 P6-calculated references; six values (es/ef/ls/lf/tf/ff) + driving path; ratchet keyed by file SHA-256/task/value, no exact cell may regress, deviations may not grow (fidelityCells.ts); float tolerance 0.001 min; 76 six-value and 145 driving-path deviations remain (P6 parity unfinished).
- Approach for us: ImportModel keeps the file's early/late/actual/float as oracle for P4's first calculation; six values + driving path; per-file hash ratchet; hand-worked JSON batteries; multi-time-zone runs (we only test America/Los_Angeles); corpus gate on git-ignored real-exports/.

### UI
- Task grid: own DOM grid, fixed-row virtualization (overscan 8, spacers, aria-rowindex; src/engine/taskGrid/virtualization.ts); spreadsheet select/edit modes with keys → commands via pure functions (navigation.ts); cell edits → pure validated plans (taskEditPlan.ts, relationPlan.ts) applied as one transaction; same core for Gantt side table and full table.
- Gantt Canvas 2D: imperative renderer without store imports (GanttRenderer.ts), 3–4 ms/frame at 10k; right-angle link routing; driving solid, non-driving dashed, critical red; one Draw2D interface (src/services/pdf/draw2d.ts) to canvas and vector PDF (pdf-lib), drawn once as a form object and tiled A4–A1 (paginateVector.ts); 40–50 ms wheel-to-frame at 10k rows.
- State: Zustand + Immer slices; undo = full snapshot per event, merged per drag, squash/revert for dialogs (historySlice.ts); documentContract.ts lists every document field for undo/save/recovery; recalculation is not an undo step.
- For us: keep TanStack Table + Virtual but add a pure command/edit-plan layer; start Gantt on canvas with a pure renderer + Draw2D-like interface (also replaces headless-Chromium print); Immer patches (inverse = undo, forward = Supabase change set and HistoryEntry).

### Health
- DCMA 14-point (src/engine/reports/dcmaAssessment.ts, DCMA-EA PAM 200.1 Oct 2012): population excludes completed, LOE, summary, milestone; relations by incomplete successor; explicit n/a reasons (no status date/baseline/resources); critical path test re-runs with injected delay after releasing hard-constrained finish; CPLI and BEI.
- scheduleHealth.ts: 16 checks with editable thresholds listing items. scheduleWarnings.ts: solver warnings separate from quality, coded, jump target (cycle, missed deadline, violated constraint, out-of-sequence, truncated lead, dropped relation, hammock without finish driver, calendar-capped date, overallocation).
- Ours (app-map §3.5) has weights, scores, editable profiles, extra checks; lacks explicit population/n-a rules, re-run CP test, solver-warning vs quality split.

### Where we are ahead
Multi-user workspaces, roles, locks, shares, comments, audit; version diff by activity code incl. logic; "as imported" progress mode; calculation in a Web Worker; XER export (OPS can't write XER); Turkish holidays (OPS: NL, DE, BE, FR, UK, AT, CH, US).
ImportModel gaps: deadlines, percent lags, P6 expected finish, suspend/resume, P6 duration and percent-complete types; MSPDI MSO/MFO → mandatory_* [VERIFY].

### Ranked ideas for the Phase 4 spec
1. Profile registry (P6, MSP, own) with named switches, no format branching (app-map §2.1, §3.1)
2. Minute time model with explicit boundary rules and a day-unit choice (§3.1, §3.3)
3. Oracle gate: first calculation vs file values, six values + driving path, per-file ratchet (§3.3, tests)
4. Progress rules per profile (§3.3 items 2, 7)
5. Float and lag settings incl. 4-way lag calendar defaulting to predecessor (§3.1, §3.3 item 4)
6. Solver output contract: driving ids, relationship free float, coded warnings with targets, "why did this move" trace (§3.3, §3.5)
7. "As imported" as a display mode (§3.3 item 7)
8. Hand-worked JSON batteries in several time zones (tests)
9. Explicit summary semantics (§3.2, §3.3 item 8)
10. Canvas Gantt with pure renderer and vector print; patch-based undo (roadmap §3; app-map §2 HistoryEntry)

### Reuse assessment
- Engine (scheduler + calendar + work ≈ 17,400 lines): imports only OPS types/helpers; one localStorage read (defaultCalendar.ts). Public API only @openaec/open-planner-core (src/core/api.ts): IFC text in, Zustand vanilla store, not on npm, ~2 MB. Internals use OPS Task (~70 fields), Sequence, WorkCalendar (ISO weekdays, minute blocks); types churn (minute-model migration Oct 2026). Mapping from ImportModel moderate; missing P6 data disables some rules. Tests: 537 check-*.ts + batteries, ~185k lines, own esbuild/Node harness.
- LGPL: ship only as a separately replaceable module with source and our changes under LGPL; inlining into our minified bundle is a problem; legal review. Using it only as an internal test oracle never distributed avoids distribution obligations.
- Grid/Gantt: renderer (~5,600 lines) store-free but typed to OPS Task/ViewState, portable behind an adapter; interaction layer (~6,500 lines) welded to store (GanttCanvas.tsx 77 selectors, FullTaskGrid.tsx 74). Reuse ideas, not components.
- No server, accounts, multi-user, sharing, permissions or cloud. Single-user file-based (IFC 4.3, Tauri, File System Access + IndexedDB recovery); undeployed stateless HTTP API; local MCP server.
- Upstream: weekly automated releases (~30 tags since Feb), PRs ~#869 built by AI agents, major model changes Sep/Oct, Dutch comments, knownbugs.md 2,627 lines. A modified fork is expensive to keep in step.

## Part 2: import readers (Phase 3 core, spec §5)

Neither design is ahead everywhere. OPS's readers know far more about real P6 and Microsoft Project files: they were tuned on about 93 public XER files, 160 MSPDI files and 216 .mpp files. Ours is stronger on report shape, limits, security, determinism and Turkish support. The owner's answers are D51–D57 of the P3 core spec. The readings that fit the spec as written are D58.

### Taken into the P3 core spec

| Topic | OPS behaviour (file) | Our decision |
|---|---|---|
| XER base calendars | `base_clndr_id` is not applied: P6 already writes the inherited week and exceptions into the derived calendar. The corpus has 157 derived calendars, none missing anything (`src/services/xer/xerCalendarData.ts`) | D51: a missing base is a warning |
| MSPDI base calendars | `BaseCalendarUID` -1, 0 or -65533 is a root calendar (`src/services/msproject/mspdiReader.ts`) | D51 |
| MSPDI dates and root | Drops `Z`, offsets and milliseconds; reads `NA` as empty; accepts a `Project` root without a namespace (`src/services/formatRegistry.ts`) | D52 |
| clndr_data damage | Compact records, one stray `)`, several Exceptions containers, the same date twice (`xerCalendarData.ts`) | D53 |
| Unknown XER values | Unknown task_type reads as task; a blank status_code is derived (knownbugs 117/118) | D54 |
| XER numbers | Decimal symbol taken from CURRTYPE (`src/services/xer/xerTables.ts`) | D55: warn rather than refuse |
| Baseline projects | `sum_base_proj_id` (`src/services/xer/xerMultiProject.ts`) | D56 |
| Limits | 100,000 exception dates, recurrence iteration cap, xlsx entry cap (`src/services/calendarRecurrence.ts`, `src/services/xlsx/readXlsxSheet.ts`) | D57; iteration cap in D58 |
| Smaller readings | Six-decimal hour noise, raw line breaks, 0x7F notes, WBS order, data_date, aliases, CrossProject, LagFormat, legacy exceptions, project calendar, xlsx time formats, link duplicates by type | D58 |

### Left for later

- **XER dates without a time.** OPS keeps them date-only; we read them as T00:00, which puts an actual finish at the start of its day. Check in V9.
- **MSPDI exception periods past midnight.** These are periods whose end is at or before their start. Our `Period` stops at 1440, so this needs a model rule. Check in V9 and Phase 4.
- **Empty clndr_data.** OPS falls back to Mon–Fri 08–16. That conflicts with our "no calendar is ever replaced with a standard week". Watch in V9.
- **Phase 4 only:**
  - P6 6.x/7.x non-working-day quirk;
  - weekend reconstruction;
  - TT_FinMile "+1 minute";
  - ImportModel additions: deadlines, percent lags, P6 expected finish, suspend/resume, P6 duration and percent-complete types.

  P4 re-reads the stored originals with a newer parser (D44), so these need no P3 change.
- **.mpp.** OPS has its own TypeScript reader for MPP14 only, 5,659 lines, derived from MPXJ (LGPL-2.1). We can't copy it, and a clean-room reader would take months. The realistic later route is MPXJ on a server, converting to MSPDI. Phase 3 keeps the refusal.

### Where our design is ahead

- **Report:** one English catalog with severities, groups, counts and pinned copy. OPS throws on duplicate IDs, dangling links and unreadable dates.
- **Limits:** OPS has no activity, relationship or file-size caps for XER and MSPDI.
- **Security:**
  - OPS reads MSPDI through `DOMParser`, which doesn't refuse DOCTYPE.
  - It keys XER records into plain `{}` objects.
  - It has no worker or watchdog for parsing.
- **Determinism:** OPS uses random IDs, stamps the current date and fills missing dates with today.
- **Turkish:**
  - **Encoding:** OPS defaults to Windows-1252 and can't tell 1250 from 1254.
  - **Tables:** OPS reads CSV only through fixed headers.

### Their test approach, and what we take

- **Synthetic fixtures inline** in `tests/planning/check-*.ts`, with a custom runner.
- **External corpora read by path**, with a manifest of SHA-256, source and role. A file counts as an oracle only when P6 itself calculated it: SCHEDOPTIONS present, `rem_late_start_date` on open tasks, `driving_path_flag` set.
- **Ratchets keyed by file hash** for parser snapshots and date fidelity.

For us, V9's `read-real-exports` output can become a pinned, anonymized manifest with hash prefix, role, counts, issue codes and check findings. It fails on any regression. Their fixture files can't be used: their licences are unrecorded or LGPL, and our D2 rules them out anyway.

### Reuse verdict

- **Size:** reader dependency trees run to about 21,000–35,000 lines each.
- **Coupling:** the readers build OPS's own types and call its engine during import. The MSPDI reader needs `DOMParser`, which Web Workers lack, and reads `localStorage`.
- **What an adapter would lose:** dates as written, our report, determinism and Turkish encoding.

Borrow the rules, not the code.
