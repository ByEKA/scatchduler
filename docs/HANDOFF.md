# Handoff: continuing on another computer

Written 2026-10-18 and updated on 2026-11-05 on the second computer. Phase 1 is done and tagged `v0.1.0`. Phase 2 (Supabase) is done (all 19 plan tasks; the `v0.2.0` tag waits for the owner's checklist review). **Phase 3 core is in progress: spec `docs/superpowers/specs/2026-11-05-phase3-core-design.md` (owner decision 2026-11-05: usability first, no one-to-one copy of the reference product); one plan of about 24 tasks, then a Phase 4 core.**

## Where things stand

- Branch: `main` everywhere. On 2026-11-05 the owner made `main` GitHub's default branch and deleted `master` (P2 spec D20). On another computer whose clone still has `master`: `git branch -m master main`, `git fetch origin --prune`, `git branch -u origin/main main`, `git remote set-head origin -a`.
- The branch holds Phase 1: 20 plan tasks, one commit each, plus fix and docs commits. `v0.1.0` is the commit `docs: record the phase 1 browser checks`.
- Checks at that commit: `npm run check` passes (257 unit tests, `Contrast OK: 37 checks passed`, lint 0 errors and 13 react-refresh warnings), `npm run test:e2e` gives `12 passed`, and `npm run build` succeeds.
- The owner's decisions made during Phase 1 are rows D9–D15 of the spec's decisions log (`docs/superpowers/specs/2026-10-14-home-shell-design.md`, §10). One more, on 2026-10-17: e2e builds into `dist-e2e` and serves it on port 4174, and never reuses a running server (`playwright.config.ts`).
- The browser checklist and 25 open items are in `docs/superpowers/plans/2026-10-14-phase1-verification.md`.
- Phase 2 continues on the second computer (Windows 11, Docker Desktop 29 with the WSL 2 engine, the repo at `C:\Users\EkA\Desktop\scatchduler`). Each finished plan task is one commit, so `git log` shows how far it got. Task 1's assumption checks all passed (`docs/superpowers/plans/2026-10-15-phase2-verification.md`).
- Phase 2 is done: one commit per task (`git log`), plus the D23 test commit and the docs commits for the decision rows. Results after Task 19 (`docs/superpowers/plans/2026-10-15-phase2-verification.md` has the full list): `npm run check` = 70 test files / 410 tests, lint 0 errors / 13 warnings, `Contrast OK: 37 checks passed`; `npm run test:e2e` = `15 passed`; `npm run test:e2e:supabase` = `4 passed`; `npm run test:db` = 7 files / 106; `npm run test:integration` = 6 files / 45; `npm run check:secrets` is clean for both build modes. The two e2e suites share port 4174 (D28), so run them one after the other.
- The owner's Phase 2 decisions are rows D17–D28 of the P2 spec's decisions log (§13). D25–D28 were taken after Tasks 14–18 (the secrets-check wording, the mock/Supabase differences on unknown workspaces, the offline sign-out and storage open items, and the shared e2e port).
- Phase 3 core (`docs/superpowers/plans/2026-11-05-phase3-core.md`, 24 tasks) is in progress: Tasks 1–13 are done as of 2026-11-15, one commit per task (`git log`), plus docs commits for the owner's decisions D49–D65 (P3 core spec §11). Task 24 reads the owner's real exports from the git-ignored `real-exports/` folder of the main checkout; the owner has prepared them. Review findings left open are under "Open items from Phase 3 core reviews" below.
- Tasks 4–8 need no Docker; Tasks 9–17 do. On a computer without Docker, stop before Task 9.
- On the first computer, omit `root` from the workflow args (its default is `C:\scatchdule\scheduler-app`).

## Setting up the new computer

1. Get the repo: `git clone <remote URL>`, or `git clone scheduler-app.bundle scheduler-app` from a bundle file. Git stashes and ignored folders (`node_modules`, `dist`, `test-results`) don't travel; nothing in them is needed.
2. Install Node.js 22 LTS or newer, Git and Claude Code.
3. In `scheduler-app/`: `npm ci`, then `npx playwright install chromium`.
4. Check the copy: `npm run check` and `npm run test:e2e` should give the numbers above.
5. Set the repo's git identity if the machine has another default: `git config user.name "efe.asik"` and `git config user.email "asike20@itu.edu.tr"`.
6. For Phase 2, install Docker (on Windows: `wsl --install` in an admin PowerShell, reboot, then Docker Desktop with the WSL 2 engine; a company machine may need a paid Docker Desktop licence). Confirm with `docker --version` and `docker run hello-world`.

## How the work was run

These are the owner's working rules from Phase 1; keep them for Phase 2.

- Chat in Turkish; code, commits, docs and UI copy in English.
- Plan tasks in order, test first: failing test, the plan's commands compared with its Expected lines, then one commit per task. A step that can't run as written uses the closest equivalent and says so in the commit body.
- Never change the spec silently. When the spec looks wrong, or a test can't pass without changing it, stop and ask. Each answer goes into the spec's decisions log as a new D-row and into the plan's pins.
- Per task: implementer, then spec review, then quality review, one after the other; fixers commit their fixes as `fixup! <task subject>` commits (auto mode refused their `git commit --amend`), and the controller squashes them into the task's one commit after the reviews, folding each fixup's "Task commit body:" lines into its message. To rerun only the reviews on a committed task, pass `startAt: 'spec'` (or `'quality'`) and `resumeCommit`.
- Never leave a half-finished task: HEAD is always a completed task. If a usage limit cuts a task off, set the partial work aside (`git stash`) and run the task again.
- When the owner asks to stop after a task, finish that task and wait for an explicit go-ahead.

The per-task runner is `.claude/workflows/plan-task.js` (Claude Code Workflow tool). For a Phase 2 task, ask Claude to run it with these args (Task 1 shown):

```json
{
  "task": 1,
  "title": "Local stack, auth settings and assumption checks",
  "lines": "85-337",
  "commit": "chore: add the local Supabase stack, auth settings and assumption checks",
  "plan": "docs/superpowers/plans/2026-10-15-phase2-supabase.md",
  "spec": "docs/superpowers/specs/2026-10-14-phase2-supabase-design.md",
  "headLines": "13-84",
  "rulesLines": "13-58",
  "tableLines": "59-81",
  "root": "C:\\Users\\EkA\\Desktop\\scatchduler",
  "notes": "Context for this task: what earlier commits changed, the expected test counts, owner decisions that affect it."
}
```

`root` is the repo folder on the computer running the workflow; without it the script uses the first computer's `C:\scatchdule\scheduler-app`. `tableLines` points at the plan's task table (Phase 1's default is 51–74).

`startAt: "spec"` or `"quality"` with `resumeCommit` reruns only the reviews of a task that is already committed.

| Task | Plan lines | Task | Plan lines |
|---|---|---|---|
| 1 | 85–337 | 11 | 2136–2346 |
| 2 | 338–524 | 12 | 2347–2448 |
| 3 | 525–811 | 13 | 2449–2707 |
| 4 | 812–1128 | 14 | 2708–2937 |
| 5 | 1129–1380 | 15 | 2938–3023 |
| 6 | 1381–1593 | 16 | 3024–3179 |
| 7 | 1594–1681 | 17 | 3180–3275 |
| 8 | 1682–1816 | 18 | 3276–3426 |
| 9 | 1817–2015 | 19 | 3427–3478 |
| 10 | 2016–2135 | | |

The commit subject of each task is in its last step (`git commit -m "…"`).

## Kickoff prompt for Phase 2

```text
Read CLAUDE.md, docs/HANDOFF.md, the Phase 2 spec (docs/superpowers/specs/2026-10-14-phase2-supabase-design.md) and the Phase 2 plan (docs/superpowers/plans/2026-10-15-phase2-supabase.md).
Docker is running. Execute the plan task by task, in order, with the .claude/workflows/plan-task.js workflow as docs/HANDOFF.md describes.
For every task: write the failing test first, run the commands shown and compare with the expected output, then commit.
Stop and ask me if a Supabase assumption check fails, the spec seems wrong, or a test can't pass without changing the spec.
```

## Open items by Phase 2 task

From the verification notes, checked against the code on 2026-10-17. Numbers are the open-item numbers there.

| When | Item | What to do |
|---|---|---|
| Before Task 1 | 25 | Done: Docker Desktop runs on the second computer. |
| Task 2 | — | Names sort in Turkish alphabetical order (P2 spec D21); Phase 1's English-collation test in `MockRepository.test.ts` changes with it. |
| Task 3 | — | Stronger ordering tests from Task 2's review (P2 spec D22), pinned in Task 3. |
| Task 3 | 7 | Done in Task 3 (project `createdAt` clamped to its workspace's); D23 adds the test. |
| Before Task 4 | — | The D23 test commit (P2 spec §13). |
| Task 15 | — | From Task 3's review: the mock's `createProject` on an unknown workspace rejects `not_found`, while Supabase under RLS will likely answer `forbidden`; and the mock's project and share lists don't filter by membership. Neither is in the contract; check them when the Supabase contract runs. |
| Task 4 | 3, 4 | Task 4 rewrites `SignInPage`; P2 spec §5.4 already returns to `state.from` or `/home`. Check that the new button reads "Signing in…" while pending. |
| Task 6 | 9, 22 | Give the Role selects the ring-outline highlight (as in `AttributesStep.tsx`). The owner confirmed the WorkspacesPanel error reading (P2 spec D17). |
| Task 8 | 2 | Task 8's cover shrinking (long edge 1600 px, JPEG 0.85) should bring mock covers under the `localStorage` quota; check it. |
| Task 14 | 6 | Requests time out after 60 s (P2 spec D18, pinned in Task 14). |
| Task 17 | 26 | Give `playwright.supabase.config.ts` its own port and build folder and `reuseExistingServer: false`, as Phase 1's e2e config has. |
| Task 18 | 1, 27 | `"license": "UNLICENSED"` and `"private": true` (P2 spec D19). `master` becomes `main` (D20); the owner renames it on GitHub before CI is pushed. |
| Task 18 | 8, 15 | Make `check-contrast.mjs`'s main-module guard compare real paths and reuse it in `check-secrets.mjs`; add a favicon the owner approves. |
| Later | 11–14, 18–21, 23, 24 | Cosmetic or later-phase items; the verification notes list each one. |

The Phase 2 plan was written before the Phase 1 decisions D9–D15. Each task's notes should tell the implementer which of them it touches (for example D11–D13 for the dialogs, D14 for the shared table, D15 for To do), so plan assertions that predate them follow the spec.

## Open items from Phase 3 core reviews

Minor findings the task reviews left open, for the batched cleanup after the plan. None breaks data consistency.

| From | Item | What to do |
|---|---|---|
| Task 3 | Deadlock between `delete_schedules` and `delete_project` | Two owners deleting a schedule and its whole project in the same instant can hit 40P01 (generic error toast; data stays consistent). Fix: `delete_schedules` locks the project row before its delete, the order `delete_project` uses; map 40P01 in `errors.ts`. |
| Task 4 | Empty file on the interim Supabase import path | A 0-byte `.xer` passes the P2 dialog's schema, then fails the `source_file_size` check with the generic validation toast. Task 23's `FILE_EMPTY` replaces this path; check it there. |
| Task 4 | No test for the adapter's "Use a .xer, .xml or .csv file." refusal | Interim path only; Task 23 removes it. Check it is gone. |
| Task 4 | `schedule_imports_delete` and service-role inserts | The policy's NOT EXISTS check runs under the editor's RLS; a service-role insert (seed) naming another workspace's object would be invisible to it. Keep seeded objects inside their own workspace folder. |
| Task 4 | The storage path rule accepts lower-case UUIDs only | Both producers emit lower case; keep it so for any new writer. |
| Task 5 | Mock and Supabase differ on coordinates past six decimals or out of numeric range | The mock checks the range before rounding (binary `toFixed`); Postgres casts to `numeric(8,6)`/`numeric(9,6)` first, and an overflow (22003) maps to `unknown`. The wizard (Task 16) range-checks input. Fix: round before the range check in the mock; mapping 22003 to `validation` is the owner's call (outside spec §4.11). |
| Task 5 | Untested paths | `updateProject`'s value checks on the mock; Supabase removing a new cover after a failed update; cover `'remove'` deleting the old object; `useUpdateProject` shrinking a File cover. |
| Tasks 5, 7 | Stale mock data in development browsers | `MOCK_DB_VERSION` stays 3 (plan pin), so a browser that saved mock data during Tasks 3–6 lacks the new project attributes and schedule fields (`archivedAt`, `isCurrent`, baseline, notes); its projects show 0 schedules. Run `window.__resetMockDb()` before visual checks. |
| Task 6 | Mock project deletion not checked in the store | No test reads the mock store after `deleteProject` (schedules, shares, `task.projectId = null`); `listSharedWithMe` hides orphans anyway. Add a `MockRepository.test.ts` case. |
| Task 6 | `useDeleteProject` cache effects only partly tested | The hook test checks only the projects list; add assertions for removing `project(ws, id)` and the `allSchedules`/`sharedWithMe`/`workspaces` invalidations. |
| Task 6 | Storage bulk delete caps at 1000 objects | `deleteProject` (and Task 8's `deleteSchedules`) send one `remove(paths)` per bucket (plan pin); over 1000 objects the request is refused and every object is orphaned. Far off; owner's call: accept, or chunk by 1000. |
| Task 6 | Two owners deleting the same project at once | The second call waits at the row lock, deletes 0 rows and raises 42501, so the user sees "You don't have permission to do that." instead of "Project not found". Fix in a new migration: raise P0002 when the delete affects 0 rows after the lock. |
| Task 7 | Interim import: the adapters refuse unsupported files differently | The mock accepts `.xlsx` and refuses others after the role check with the generic copy; Supabase refuses anything but `.xer`/`.xml`/`.csv` first with "Use a .xer, .xml or .csv file.". The UI can't reach it; Task 23 removes the path. |
| Task 7 | Schedule hooks' cache refresh untested | No test for `useUpdateScheduleDetails`, nor for `useCreateSchedule`/`useImportSchedule` refreshing `allSchedules()` and `sharedWithMe()`. |
| Task 7 | Seed R6 not pinned | No test checks that each seeded project's status date equals its current schedule's, nor the spec §4.5 notes and update numbers; Supabase's sync trigger would hide a drift the mock shows. |
| Task 7 | Update number 1.5 | The mock gives validation; Supabase's int parameter fails with 22P02 → unknown. The Task 21 form checks whole numbers. |
| Task 8 | Mock archive rules not pinned | No mock test for re-archiving keeping the first `archivedAt`, nor for a restore moving `updatedAt` (R11); pgTAP 09 pins both on the database. |
| Task 8 | Distinct ids and the archive hook untested | `deleteSchedules([id, id])` works on both adapters but no test pins it; `useSetSchedulesArchived` has no hook test. |
| Task 9 | `MM/DD/YYYY` accepts only `/` | `03-15-2026` fails under every format, even when chosen by hand. One line in the `dates.ts` format table adds `-`; check the guess order so day-first files aren't guessed month-first. |
| Task 9 | `detect.ts` root-attribute regex is quadratic | Bounded by the 64 KB head (3.5 s worst case, under the 30 s watchdog). Make it linear if it ever shows. |
| Task 9 | UTF-8 with a byte-order mark can get `ENCODING_INVALID_BYTES` | Its copy says "choose another encoding", but a byte-order mark can't be overridden (§5.4). Tasks 22–23 decide where the override is offered. |
| Task 10 | Plan test name now misleading | "stops on a calendar it needs but cannot read, or whose base is missing" keeps its plan name, but after D51 a missing base no longer stops the import. Rename it; the plan's `__proto__: 'x'` literal should read `['__proto__']: 'x'` for later readers. |
| Task 10 | XER paths without a dedicated test | A file without `%E` being unreadable, `FILE_UNREADABLE` with no usable calendar, `CONSTRAINT_UNSUPPORTED` for an unknown `cstr_type`, `LINK_SELF` and `LINK_UNKNOWN_ACTIVITY` in XER, `TEXT_TRUNCATED`. A fuzz run showed none of them throw. |
| Task 10 | Stray `)` before a second Exceptions container | Refused (`CALENDAR_UNREADABLE`), not repaired, when a file has both D53 damages at once. Fails safe; a refinement could try each `)` before an Exceptions container. |
| Task 11 | Calendar expansion work has no total bound | Every Exception record expands fully even when its dates repeat; a crafted 20 MB file takes about 26 s. The browser worker's 30 s watchdog covers it; Phase 4's Node path needs a per-calendar step budget. |
| Task 11 | MSPDI paths without a dedicated test | Links of null or inactive tasks dropped uncounted; a missing link Type read as FS; a working day or exception with no WorkingTimes makes the calendar unreadable; duplicate or UID-less Calendar elements give `CALENDAR_UNUSED_SKIPPED`; with no date at all recurrences expand over 1984-01-01..2149-12-31. |
| Task 11 | `calendars.ts` duplicates `dates.ts` day arithmetic | Export the day-number helpers from `dates.ts` and reuse them. |
| Task 11 | Nesting limit boundary | `maxNestedTags` 100 refuses from 102 levels (root not counted); no test pins it. Decide whether the root is level 1 and pin it. |
| Task 11 | Reader stricter than detection | Whitespace before `<?xml` passes `detectFormat` as MSPDI but `readMspdi` gives `FILE_UNREADABLE` (XMLValidator). Malformed XML, so within §5.2; check in V9. |
| Task 11 | Tasks but no Calendar element | `FILE_UNREADABLE` at the first non-elapsed task (consistent with §5.5); pin it in a damaged-file case. |
| Task 11 | Task without a UID | Read with an empty code and location "Task UID " (UID is required by the schema; damaged files only). Skipping it or coding it from its ID needs new §5.12 copy; decide with V9. |
| Task 12 (fix before V9) | Merged title banner fools the header-row guess | `headerRowGuess` runs after `fillMerges`, so a title merged across A1:G1 counts as seven text cells: row 1 is guessed and no column is mapped. Common in hand-made Turkish Excel schedules. Count cells a horizontal merge filled once (or require two distinct texts); refines the plan pin, record it. |
| Task 12 (fix before V9) | Decimal guess ignores predecessor lags | Guessed only from Duration and % complete; whole-number durations with `T1SS+1,5 g` guess `.`, so the cell splits on `,` (a 1-day lag, and `5 g` gives `TABLE_BAD_LINK`). Add the lag amounts to the vote. |
| Task 12 | Untested pinned table behaviours | `fillMerges`, `{sheet}!{cell}` locations, `columnLetter` past Z, WBS paths on `/` or `>`, `DUPLICATE_CODE` after the 40-character cut; `TABLE_BAD_DATE`, `TABLE_UNKNOWN_TYPE`, `TABLE_MISSING_NAME`, `LINK_UNKNOWN_ACTIVITY`, `TABLE_BAD_LINK`, `ELAPSED_LAG` in tables. |
| Task 12 | `LINK_UNKNOWN_ACTIVITY` names a fragment | An unknown `CON-9999` is reported as `CON`; use the whole token as the original. |
| Task 12 | Deflate slack is quadratic | A tiny deflate stream followed by MBs of slack takes about 17 s per `checkZip` on 20 MB, and `xlsxSource` runs it on every preview change. Refuse an entry whose output stops while many compressed bytes remain, or cache the guard result per file. |
| Task 12 | Date-only times with long days | `TABLE_ASSUMPTIONS` keeps date-only starts at 08:00 and finishes at 17:00 even when D61 moves a day over 15 hours to start earlier. Revisit if long days are used. |
| Task 13 | xlsx without a correct dimension | D65 detects rows past the 100,000-row window from `!fullref`, which SheetJS takes from the sheet's `<dimension>`. A sheet without one, or understating it, loses rows past 100,000 silently. Excel always writes it; closing the gap needs a scan of the sheet XML for its last row. |
| Task 13 (fix before V9) | A crafted xlsx can exhaust worker memory | `xlsxSource` builds each dense row out to its last cell (up to 16,384 columns); about 117 KB of heap per row with a value in column XFD, so a 3 MB workbook with `x` in XFD1..XFD100000 needs about 12 GB and can crash the tab before the 30 s watchdog. Keep only the first 201 columns when building the grid and flag a row that reaches past them, so `FILE_TOO_MANY_COLUMNS` still fires. |
| Task 13 → Task 23 | Review step's status date | Any status date passed to `analyze` gives `statusDate.source: 'user'` and drops `STATUS_TIME_KEPT`. While the Review field still holds the file's own date, pass null. |
| Task 13a | Lag votes lost after a `,` followed by a digit | In a `.`-decimal table whose Predecessors list numeric Task IDs with `,` (`3FS+1.5 days,5`), `lagAmounts` ends a token only at a `,` no digit follows, so that lag gives no vote. The guess defaults to `.`, so it flips only in mixed hand-written cells. End a token also at a `,` after a complete lag with a unit or `%`, and add `3FS+1.5 days,5` → `['1.5']` to the test. |
| Task 13b | Two crafted-file timings measured at 20 MB | The Task 11 calendar-expansion case (about 26 s) and the Task 12 deflate-slack case (about 17 s, quadratic) were measured at the old 20 MB limit; at 50 MB (D67) both grow, the deflate case about 6x. The 30 s worker watchdog still protects the browser; Phase 4's Node path needs the bounds those rows name. |
| Task 13b | The interim dialog's hint has no test | `FILE_HINT` in `ImportScheduleDialog.tsx` reads "· up to 50 MB" but nothing pins it; Task 23 replaces the dialog, so check its replacement's hint test instead. |
| Task 14 → Task 22 (fix there) | A worker that can't start looks like a slow file | `client.ts` handles neither the worker's `error` nor `messageerror`, and a throwing `new Worker(...)` escapes as a plain `Error`. After a deploy, a tab left open loads a missing `worker-<hash>.js`: the user waits 30 s and reads "This file took too long to read". Give `WorkerLike` an optional `onerror` that rejects open requests with code `failed`, and wrap `createWorker()` so its throw becomes `ImportClientError('failed')`. |
| Task 14 → Task 22 | A new file waits behind the old one | Requests share one worker; Task 22 should call `parser.cancel()` before inspecting another file (Review Focus 4), so a slow file A doesn't delay, or time out, file B. |
| Task 14 → Task 23 | V6 still open | The app build emits no worker chunk until the dialog imports `useImportParser` (checked with a two-entry build). Rerun `npm run build && ls dist/assets \| grep -i worker` in Task 22/23. The worker builds as IIFE (Vite's default, V6's fallback): record it with V6; an `import()` inside the worker would not build. |
| Task 14 | Client paths without a test | Answers arriving out of order (the pinned test answers in order), `worker.ts` routing and transfers, `ok:false` → `no_file`/`failed`, the xlsx Blob type, `dispose()`, the watchdog timing a queued request from when it became the oldest. |
| Task 15 → Task 23 | A report without a stored copy differs by adapter | Supabase takes the stored-import path only with both `stored` and `report`; the mock keys on `report` alone. No caller sends a report without `stored`, and Task 23 makes every field required; check the two agree then. |
| Task 15 | `saveFile` has no test of its own | Every hook test mocks it; Task 23's e2e CSV download covers it. A `download.test.ts` would pin the `download` attribute and the URL revoke. |
| Task 15 | Fallback download name keeps `.gz` | When `source_file_name` is null, `getScheduleSourceFile` names the gunzipped file after its stored path (`{uuid}.xer.gz`). Both adapters always set the name, so only hand-made rows; strip a trailing `.gz`. |
| Task 16 | Coordinate behaviours without a test | (a) After a failed submit, clearing Latitude clears "Enter both latitude and longitude" under Longitude (the `deps` option); (b) a pasted pair re-checks both fields after a submit; (c) a paste is ignored while saving; (d) the "both" error sits on the *empty* field (the schema test compares messages, not paths); (e) Latitude and Longitude are described by the coordinate hint (`aria-describedby`). The code is right today; one wizard test and two assertions would pin it. |
| Task 16 | Status has no required marker | Spec §6.5 calls Status required (default Active), but the pinned `SelectField` has no `required` prop, so there is no `*` or `aria-required`. Status can't be empty; add the marker when `SelectField` gains the prop. |
| Task 17 | "A workspace that isn't mine" test doesn't reach its branch | The mock `getProject` ignores the workspace, so the case ends on the "elsewhere" branch; the `workspaces.isSuccess && workspace === undefined` clause in `EditProjectDialog.tsx` is never the deciding condition. Make the case load a project of a workspace missing from my list (e.g. after removal). |
| Task 17 | Skeleton then wizard replays the open animation | When reads take over 300 ms the skeleton `DialogShell` is replaced by the wizard's `FormDialog` (a separate Radix dialog), so the overlay animates twice; visible with the mock's 400 ms latency. Owner's visual check; a fix needs `FormDialog`/`DialogShell` to share one dialog. |
| Task 18 | Toolbar behaviours without a test | The search draft under a router that applies URL changes in a transition (`createMemoryRouter` + `RouterProvider`; unit tests use `MemoryRouter`, which doesn't); choosing "Any" removes the filter; every URL change replaces the history entry; a click on the pressed layout item does nothing. All work today (checked with throwaway tests). |
| Task 18 | Owner's visual check | The status badge on Home cards over cover photos and generated covers, both themes; the layout toggle (icons only below 640 px) and its pressed outline; the generated `toggle.tsx` keeps a 50 % focus ring, overridden where it is used, so a later Toggle user must repeat the override (or fix it in a wrapper, as 1f3d241 did for inputs). |
| Task 19 (owner's visual check) | Long project names in the List don't truncate | The List table uses the auto layout and every cell is `whitespace-nowrap`, so a long name widens the table: the panel scrolls sideways (at 375 px 508 in 336; at 1100 px 943 in 877) and on phones the Actions column sits off-screen inside it. The page itself no longer scrolls. Owner's choice: accept scrolling in the panel, or cap the Project column / use a fixed layout so names truncate (as `SharedSchedulesTable` does). |
| Task 19 → Task 20/21 | Focus lost when an edit moves a project out of the filter | On the Projects page with `?status=active`, editing a project to On hold removes its card; the dialog's opener is gone and focus falls to `<body>`. `DialogShell`'s close autofocus could fall back to `h1[tabindex="-1"]` as `DeleteProjectDialog` now does. |
| Task 19 | `VIEWER_HINT` copied in three places | `ProjectsPage` and `WelcomeBanner` hold the same viewer hint, and Task 20 needs it again; one shared constant (e.g. in `roles.ts`). |
| Task 8 | Over 500 ids with several non-UUIDs | The mock says "Select 500 schedules or fewer."; Supabase collapses non-UUIDs to one id and says "Some schedules are no longer available.". The UI passes one id (D13). |

## Owner tasks

- Before Phase 2: install Docker (done on the second computer).
- During Phase 2: the decisions are taken (P2 spec D17–D28). Still to do: rename `master` to `main` on GitHub (Settings → General → Default branch) before CI (`.github/workflows/ci.yml`, Task 18) is pushed.
- Now: optionally bump `package.json` `version` to `0.2.0`, approve or supply a favicon (Phase 1 item 15), then tag `v0.2.0` and push once the checklist is reviewed. The checklist (in the Phase 2 verification notes): the Google "G" mark file, the production runbook end to end, Google sign-in for invited and uninvited accounts, Cloudflare Pages deep links and headers, an invite accepted from a university inbox, the KVKK cross-border transfer check and privacy notice, and the Supabase plan limits.
- Billing stays a placeholder (`/settings/billing`); the owner chose to leave it for now.

## Left on the first computer

Nothing here is needed on the new computer.

- Two git stashes from cut-off sessions (`task 14 quality fix`, `task 10 partial work`); both tasks were redone and committed.
- `C:\scatchdule\.playwright-mcp`: browser logs from the Playwright MCP server, outside the repo.
- Claude Code's session history and memory for this project stay in that machine's `~/.claude` folder; this file replaces them.

## Left on the second computer

- A stale stash (`task 2 partial work`); Task 2 was redone and committed.
- The local Supabase stack in Docker (`npm run db:stop` stops it). Its `supabase_vector` container restart-loops on Windows; that is harmless (only Studio's log views stay empty).
