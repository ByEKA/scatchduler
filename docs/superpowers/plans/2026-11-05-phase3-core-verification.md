# Phase 3 core verification notes

| | |
|---|---|
| **Spec** | `docs/superpowers/specs/2026-11-05-phase3-core-design.md` (§8 assumptions V1–V9, §2.2 success criteria) |
| **Plan** | `docs/superpowers/plans/2026-11-05-phase3-core.md` (Task 1 checks V1–V7; Task 23 checks V6 and V8; Task 24 checks V9 and adds the final results) |
| **Status** | Task 1, 2026-11-06: V1–V5 and V7 hold, so the design's primary path applies and no §8 fallback is in use (except SheetJS CE 0.20.3 shipping no NOTICE file, V1). Task 23, 2026-11-19: V6 (Chromium IIFE worker) and V8 (50 MB XER in CI) pass. Task 24, 2026-11-20: V9 passes on 64 of the collection's 73 P6 XER files in the cloud read (68 projects, 0 errors) and on all 73 (78 projects, 0 errors) in the local rerun of 2026-11-24 (D70), the English P6 workbook and all 11 refused `.mpp`/`.xls` files, with three gaps deferred by owner consent (Microsoft Project XML, Turkish Excel export and per-file source-tool totals); every automated suite passes (see [Final results](#final-results)). Production/cross-browser checks and the deferred V9 items wait in the [owner checklist](#owner-checklist). |

## Environment

Recorded in Task 1 on 2026-11-06.

| | |
|---|---|
| Machine | Windows 11 Pro; Docker Desktop 29.8.2 with the WSL 2 engine |
| Node | `node -v` → `v24.14.0` (npm 11.9.0); CI runs Node 22 |
| Supabase CLI | `npx supabase --version` → `2.121.0` (dev dependency `supabase`) |
| Local stack images | Postgres 17.11.0.004, Storage v1.82.1, PostgREST v16.4, Kong 2.8.1 |
| New packages | `fast-xml-parser` 5.12.0, `papaparse` 5.7.0 (+ `@types/papaparse` 5.5.2, dev), `xlsx` 0.20.3 from `vendor/xlsx-0.20.3.tgz`, `fflate` 0.8.3, `@tanstack/react-table` 8.21.3 |
| Their production dependencies | `fast-xml-parser` brings `@nodable/entities` 3.1.0, `anynum` 1.0.1, `fast-xml-builder` 1.3.1, `is-unsafe` 2.0.3, `path-expression-matcher` 1.6.2, `strnum` 2.5.1 and `xml-naming` 0.3.0; `@tanstack/react-table` brings `@tanstack/table-core` 8.21.3. All MIT. |
| SheetJS tarball | downloaded from `https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`, 2,409,319 bytes, SHA-256 `8dc73fc3b00203e72d176e85b50938627c7b086e607c682e8d3c22c02bb99fe8`; `package-lock.json` records it as `file:vendor/xlsx-0.20.3.tgz` with its sha512 integrity |

Notes:

- `package.json` keeps the plan's caret ranges (`^5.12.0`, `^5.7.0`, `^0.8.3`, `^8.21.3`, `^5.5.2`); `package-lock.json` pins the exact versions above.
- `npm audit` without `--omit=dev` still reports 8 advisories (7 moderate, 1 high), all in development tools that were already in the lockfile before this task: `undici` 8.12.1 (through `jsdom`) and `minimatch` (through `typescript-eslint`). None reaches a build.
- The licence file lists 119 production packages: 113 MIT, 2 Apache-2.0 (`xlsx`, `class-variance-authority`), 2 OFL-1.1 (the two font packages), 1 ISC, 1 0BSD, none `UNKNOWN`. Two MIT packages ship no licence file of their own, so their entries carry only the `License:` line: `@nodable/entities` 3.1.0 (new, through `fast-xml-parser`) and `react-remove-scroll-bar` 2.3.8 (already a P1 dependency, through `radix-ui`).
- `npm ls --omit=dev --all --json --long` prints the 24 unmet optional peer dependencies (for example `@hookform/resolvers`' validators and `@supabase/supabase-js`' `@opentelemetry/api`) as `{}` entries without a version; the licence script skips them, as they aren't installed.
- The ESLint `group` patterns follow `.gitignore` rules, so a bare `@/data` or `@/import` next to a negation (`!@/data/types`, `!@/import/client`) also matches the parent of the negated file, and the negation can't re-include it. `eslint.config.js` restricts those two bare specifiers through `paths` (an exact match) with the same message. Two additions to the plan's five blocks close gaps the plan's rows don't cover: the `src/import/**` blocks repeat the relative half of the adapter rule (a `regex` for `../data/mock/…` and `../data/supabase/…`; the `@/data/*` half is already in the pure-import group), and blocks 1–3 also restrict parser-library subpaths such as `fflate/browser` (`paths` matches the bare name only). `scripts/import-boundaries.test.mjs` pins all three with five rows beyond the plan's 16.

## V1–V9

V2–V5 and V7's download are checked by `integration/p3-assumptions.itest.ts` (`npx vitest run -c vitest.integration.config.ts integration/p3-assumptions.itest.ts`: 1 file, 6 tests passed on 2026-11-06); the rest by hand with the commands of plan Task 1 step 7.

| # | Assumption | Result | Date |
|---|---|---|---|
| V1 | The five dependencies have no open advisory, carry the expected licences, and the licence script finds each licence and NOTICE file | pass, no fallback. `npm audit --omit=dev` → `found 0 vulnerabilities`. `fast-xml-parser` 5.12.0 (at least 5.3.5), `papaparse` 5.7.0, `fflate` 0.8.3 and `@tanstack/react-table` 8.21.3 are MIT; `xlsx` 0.20.3 is Apache-2.0. `npm run build` ends with `Wrote 119 packages to …\dist\third-party-licenses.txt`; the file has 119 `License:` lines and lists all five packages, each with its `LICENSE` text, and the `xlsx` entry reads `License: Apache-2.0` followed by `--- LICENSE ---`. Difference from the spec's wording: the SheetJS 0.20.3 tarball has no NOTICE file (it ships `LICENSE` and `dist/LICENSE`, the same Apache-2.0 text ending in "Copyright (C) 2012-present SheetJS LLC"), so the licence file has no `--- NOTICE` section (`grep -c` → `0`). Apache-2.0 §4(d) asks for a NOTICE only when the work includes one, so the `LICENSE` text is the whole notice; the script would pick a NOTICE up if a later package shipped one | 2026-11-06 |
| V2 | SheetJS CE installs from `vendor/` offline, honors `dense`, `sheets`, `sheetRows` and the 1904 flag, and writes workbooks in both date systems that it reads back with the same serials | pass for every part checked here, no fallback. `rm -rf node_modules && npm ci --offline` succeeds (`added 498 packages`) and `npm ls xlsx` shows `xlsx@0.20.3`. A workbook written with `utils.aoa_to_sheet` and `write({ bookType: 'xlsx', type: 'array' })` reads back with `Workbook.WBProps.date1904` as written and the serial `46096.5` unchanged, in both date systems; `read` with `sheets: ['Plan']` and `sheetRows: 1` lists both sheet names, parses only `Plan` and returns only its first row. Not checked here: whether current Excel and LibreOffice open the generated workbooks without a repair prompt (owner checklist item 4) | 2026-11-06 |
| V3 | `fast-xml-parser` with `processEntities: false` leaves `&amp;` and character references as written; `parseTagValue: false`, `isArray` and `removeNSPrefix` behave as §5.6 | pass in Node and Chromium worker (`import.spec.ts` / `worker-*.js`), no fallback: `<Name>Kazı &amp; Dolgu &#x130;</Name>` reads as `Kazı &amp; Dolgu &#x130;`, `1.10` stays the text `1.10`, the default namespace is dropped and a single `Task` is an array | 2026-11-06, 2026-11-19 |
| V4 | Papa Parse parses a decoded string with an explicit delimiter | pass in Node and Chromium worker (`import.spec.ts` Windows-1254 CSV test), no fallback: `'Kod;Süre\nA1;2,5\n'` with `delimiter: ';'` gives `[['Kod', 'Süre'], ['A1', '2,5']]` | 2026-11-06, 2026-11-19 |
| V5 | `TextDecoder` supports `windows-1254`, `windows-1252`, `utf-16le/be` with `fatal` | pass in Node 24, Node 22 (CI) and Chromium worker (`import.spec.ts`), no fallback: `windows-1254` decodes `DD FE F0` as `İşğ`, `windows-1252` decodes `8E` as `Ž`, both UTF-16 orders decode `İ`, and a fatal UTF-8 decoder throws on `FD`. Firefox and Safari workers: owner checklist item 2 | 2026-11-06, 2026-11-19 |
| V6 | A Vite module worker builds, loads under the CSP and has `crypto.subtle` | pass (Chromium): the worker builds as Vite's default IIFE bundle (`dist/assets/worker-*.js`, V6's fallback), loads from the preview build and hashes with `crypto.subtle` (`import.spec.ts`, `home.spec.ts`). Production CSP: owner checklist item 1 | 2026-11-19 |
| V7 | `storage.download(path)` returns an object's bytes; `storage.objects.owner_id` holds the uploader's id as text and policies can read it; SQL deletes of `storage.objects` are refused | pass, no fallback. `download` returns the exact 7 bytes a signed-in workspace owner uploaded to `schedule-imports`. `information_schema` lists `owner_id` as `text` (the older `owner` is `uuid`), and the object the test uploaded has `owner_id` equal to the uploader's `auth.users.id::text`. A `for delete` policy using `owner_id = (select auth.uid())::text` is created without error (inside a transaction that was rolled back). A plain `delete from storage.objects` fails with "Direct deletion from storage tables is not allowed. Use the Storage API instead." (`storage.protect_delete()`, exit 1); after `set local storage.allow_delete_query = 'true'` it succeeds (exit 0), which Task 4's pgTAP `06_storage` relies on. So the adapter removes objects through the Storage API | 2026-11-06 |
| V8 | The 50 MB generated XER (raised from 20 MB in D67) compresses to 10 MB or less, and its upload and insert finish inside 60 s on the local stack | pass on the CI Supabase stack: the generated 52,424,584-byte XER (`2,000` activities, `2,000` links) packs gzipped to **1,219,252 bytes** (1.16 MB, 2.33%, well under 10 MB), and `integration/imports.itest.ts` completes upload + insert in **4,800 ms** (4.8 s vs 60 s timeout). Production: owner checklist item 3 | 2026-11-19 |
| V9 | The owner's real exports read without errors and their counts match the source tools' totals | pass with owner-accepted gaps (2026-11-20): 64 P6 XER files (68 projects across P6 5.0–7.0, including five 10k+ activity files up to 23,457 activities / 67,260 links in 2,613 ms) and the English P6 `.xlsx` export all read with **0 errors**, and all 11 `.mpp`/`.xls` files are refused with their §5.2 copy; P6 8.0 XERs also read with 0 errors in the 2026-11-17 local run. Gaps deferred by the owner on 2026-11-20 (owner checklist item 5): Microsoft Project XML (MSPDI), Turkish `.xlsx` export, and per-file source-tool totals | 2026-11-20 |

## V9 early read (2026-11-16, D66)

`npm run real-exports` over the owner's `real-exports/` folder, read with its subfolders by `scripts/read-real-exports.ts` at commit 2e38c82. Only formats, versions, counts, issue codes and masked shapes are recorded here.

**What was read.** 87 files in 23 s, none threw: 73 XER, 2 xlsx, 11 `.mpp` and 1 `.xls` (the last two refused with their §5.2 copy, as designed). 293 other files (Primavera P3 folders, archives, PDFs, pictures) are not schedules the importer takes. No Microsoft Project XML and no CSV yet, and no totals from the source tools yet, so "counts match the source tools' totals" is still open for Task 24.

| P6 version (ERMHDR) | Files |
|---|---|
| 5.0 (one of them 5.0.2000) | 37 |
| 6.0 / 6.0.0 | 26 |
| 6.2 | 2 |
| 7.0 | 5 |
| 8.0 | 3 |

80 projects were analyzed (four files hold two or three projects): 151,579 activities in all, the largest project 23,457 activities and 67,260 relationships, read in 1,959 ms. Every text file but one was detected as Windows-1254 by byte score.

**What holds.**
- Every XER date is written with its time (`YYYY-MM-DD HH:MM`), in every version; no date-only value occurs.
- Every number uses `.` as its decimal mark, and none has a digit group (D55, D59 hold; `CURRTYPE` declares `.` and `,` for the files' own currency).
- `task_type`, `status_code`, `complete_pct_type`, `clndr_type` and every `cstr_type` in the files are ones the reader knows (`CS_MANDSTART` among them, D58).
- The 10,000-activity budget (S5) holds with room: 23,457 activities and 67,260 links read in under 2 s.
- The refusals of `.mpp` and `.xls`, and the Windows-1254 detection, work on real files.

**Differences found** (each is fixed before Task 14 with a fixture written from scratch, or is the owner's decision):

| # | Difference | Seen in | Effect today |
|---|---|---|---|
| 1 | `clndr_data` whose root entry has no name, holding `DaysOfWeek` and `Exceptions` directly (sometimes beside an empty `CalendarData`), instead of a root named `CalendarData` | 9 calendars in 6 files (P6 5.0.2000, 6.0.0, 6.2) | `CALENDAR_UNREADABLE`; the import stops when an activity uses the calendar |
| 2 | The same exception date listed twice with the same hours | 17,442 dates in 622 of 897 calendars (5.0, 6.0.0, 7.0); none conflicts | Read correctly, but each calendar gets `CALENDAR_DATA_REPAIRED` ("had damaged data"): 622 notes for data that isn't damaged |
| 3 | The schedule options (`sched_retained_logic`, `sched_progress_override`, …) are in the table `SCHEDOPTIONS`, never in `PROJECT`; no file has `PROJECT.data_date` | all 73 files | The report's settings are empty for real files |
| 4 | Link types `PR_FS1`, `PR_FF1`, `PR_FS2`, `PR_SF1` | 100 links in one 5.0.2000 file | `LINK_TYPE_UNKNOWN` and read as FS, so 74 FF and SF links become FS |
| 5 | Projects larger than the limits: 16,146 to 23,457 activities, 47,286 to 67,260 relationships, files of 28.9 to 38.5 MB | 3 files | `FILE_TOO_MANY_ACTIVITIES` / `FILE_TOO_MANY_RELATIONSHIPS`; the form would refuse the files by size first |
| 6 | An xlsx whose first row is a title merged across the columns, with the header in row 5 | 1 of 2 workbooks | Header row guessed as 1, no column mapped, `FILE_NO_ACTIVITIES` (the open item from Task 12) |
| 7 | The header "% of Complete" | 1 workbook | Not mapped to % complete |
| 8 | `CALENDAR` without `day_hr_cnt`, `week_hr_cnt`, `month_hr_cnt`, `year_hr_cnt` | 25 files (5.0.2000, 6.0.0) | To check: the hours per day then come from the week |

**After Task 13a (2026-11-17).** `npm run real-exports` and `npm run real-exports -- --shapes` again, with differences 1–4, 6 and 7 fixed, each compared file by file with a run of the same script on the code before the task. 87 files read, none threw; 80 projects analyzed.

- **Errors:** projects with an error 10 → 4, all four among the ten of the first read, so no file that read without an error has one now. What is left: `FILE_TOO_MANY_RELATIONSHIPS` 3 and `FILE_TOO_MANY_ACTIVITIES` 1 (difference 5, Task 13b), and `FILE_NO_ACTIVITIES` 1 (the workbook of difference 6: its header row is now guessed as 5, and its table has no activity code column, which is the user's mapping to make).
- **Calendars:** `CALENDAR_UNREADABLE` 6 → 0 and `CALENDAR_DATA_REPAIRED` 622 → 0. All 897 calendars of the 73 files read, none repaired, none unreadable; the analyzed projects read 845 calendars and accept all of them (before: 839 accepted, 6 skipped), 4 adjusted by `CALENDAR_HOURS_MISMATCH` as before.
- **Link types:** `LINK_TYPE_UNKNOWN` 96 → 23 and `LINK_DUPLICATE` 19 → 92, both changes in the one 5.0.2000 project, whose 100 numbered links (`PR_FF1` 73, `PR_FS1` 24, `PR_FS2` 2, `PR_SF1` 1) are now read by their letters. Of its 11,966 relationships, 11,887 are accepted (before 11,960), 23 adjusted (before 96) and 79 skipped (before 6): read with its own type, 73 more links repeat a link of the same type between the same two activities, and one copy of each is kept (D58). Before, they stayed in as finish to start links beside the link they repeat.
- **Tables:** the other workbook now maps "% of Complete" to % complete; its counts are unchanged.
- **Not shown by the script:** the settings now read from `SCHEDOPTIONS`. The script prints no settings; its shapes show that in each of the seven P6 versions the table's fields include `proj_id`, `sched_retained_logic` and `sched_progress_override`. The fixture `legacy-p6.xer` pins the reading.
- Every other count and issue code is as in the first read. Difference 8 needs no fix: `legacy-p6.xer` has no hour counts, and its hours per day come from the work week.

**Task 24 final read (2026-11-20, after Task 13b / D67 and Tasks 21–23 at `01e4ffb`).** `npm run real-exports` and `npm run real-exports -- --shapes` over the owner's real-exports collection (77 files read from a temporary folder outside the repo, deleted immediately afterwards: 64 XER [61 loose + 3 extracted from `.zip`], 2 `.xlsx`, 10 `.mpp`, 1 `.xls`; 8 `.rar` archives were not extracted in the Linux VM where `unrar` is absent — their P6 8.0 XERs were already verified in the 2026-11-17 local run).

| Format / version | Files | Projects | Errors | Notes |
|---|---|---|---|---|
| P6 XER 5.0 | 28 | 29 | 0 | includes the largest file: 23,457 activities, 67,260 links, 38.5 MB, read in 2,613 ms |
| P6 XER 5.0.2000 | 1 | 1 | 0 | 4,648 activities, 11,887 accepted links (23 `LINK_TYPE_UNKNOWN`, 79 `LINK_DUPLICATE`), UTF-8 |
| P6 XER 6.0 | 2 | 2 | 0 | 19,202 activities / 52,826 links (28.9 MB, 2,409 ms) and 16,146 activities / 47,286 links (30.1 MB, 1,942 ms) |
| P6 XER 6.0.0 | 26 | 29 | 0 | includes three 2-project XERs with `XER_CROSS_PROJECT_LINK` |
| P6 XER 6.2 | 2 | 2 | 0 | 3,353 activities / 8,938 links each (517–566 ms) |
| P6 XER 7.0 | 5 | 5 | 0 | includes two 11,426-activity / 32,407-link files (670–713 ms) |
| Excel `.xlsx` (English P6 export) | 1 | 1 | 0 | header row 3; 8 fields auto-mapped (`Activity ID`, `Activity Name`, `Original Duration`, `Start`, `Finish`, `Actual Start`, `Actual Finish`, `% of Complete`); 79 activities, 1 `TABLE_MISSING_NAME` warning |
| Excel `.xlsx` (English summary sheet) | 1 | 1 | 1 | header row 5 (`Ser.`, `Item`, `Progress %`, `Notes`); expected `FILE_NO_ACTIVITIES` until user maps columns manually |
| `.mpp` / `.xls` | 11 | — | — | all 10 `.mpp` and 1 `.xls` cleanly refused with §5.2 guidance |

- **Totals across the 70 analyzed schedules:** 146,338 activities, 362,508 relationships, 23,043 WBS elements, 795 calendars (`0` unreadable, `0` repaired). Zero exceptions thrown.
- **Difference 5 resolved (D67):** All three files that previously exceeded the old 20 MB / 20,000-activity / 40,000-relationship limits now read cleanly with **0 errors**, bringing XER errors to **0 / 68 projects**.
- **S5 10k+ budget:** All five projects over 10,000 activities (11,426 to 23,457 activities, up to 67,260 links) read and check in **0.67–2.61 s** (budget: `< 5 s`).
- **Owner-accepted gaps (2026-11-20):** The owner confirmed proceeding with Phase 3 core completion while deferring the following to later testing (tracked in [Owner checklist](#owner-checklist) item 5):
  1. Real Microsoft Project XML (`.xml` / MSPDI) export (the collection has `.mpp` files only; MSPDI milestone placement and recurrence exception type numbers remain covered by committed fixtures only).
  2. Real Turkish Excel (`.xlsx`) export (both workbooks in the collection are English; Turkish link types, lags, duration units, dates and constraint names remain covered by committed fixtures only).
  3. Per-file source-tool totals comparison (activities, links, WBS elements, calendars read from P6 / MS Project / Excel).


**Local rerun (2026-11-24, D70).** `npm run real-exports` over the main checkout's `real-exports/` at `e31948e`: 87 files read, none threw (73 XER, 2 `.xlsx`, 11 `.mpp`, 1 `.xls`). All 78 XER projects (P6 5.0, 5.0.2000, 6.0, 6.0.0, 6.2, 7.0 and 8.0) read with 0 errors: 151,576 activities in all, the largest 23,457 activities in 1,930 ms. The only error is `FILE_NO_ACTIVITIES` on the summary workbook, whose table has no activity code column until the user maps one. The collection is publicly available sample data (owner, 2026-11-24; spec D70).

## Owner checklist

Each item needs the owner (a browser other than Chromium, a desktop application, the production project, or deferred real exports). Tick the box and fill in the result line.

- [ ] **1. Worker under the production CSP (V6).** On the production deployment, an import reaches the Columns or Review step, so the worker loads under `default-src 'self'`.
  - Result:
- [ ] **2. Firefox and Safari (V5).** Importing the Windows-1254 CSV fixture in Firefox and in Safari shows the Turkish letters correctly, so both decode `windows-1254` in a worker.
  - Result:
- [ ] **3. V8 on production.** With the next rollout, the 50 MB generated XER imports on the production project inside the 60 s client timeout.
  - Result:
- [ ] **4. Generated workbooks (V2).** Both `src/import/__fixtures__/dates-1900.xlsx` and `dates-1904.xlsx` open in current Excel and LibreOffice without a repair prompt.
  - Result:
- [ ] **5. Deferred V9 real-export checks (S12).** Test a real Microsoft Project XML (MSPDI) export (confirming milestone times and exception recurrence types), a real Turkish Excel (`.xlsx`) export (confirming Turkish link/lag/duration/date/constraint tokens), and compare parser counts against source-tool totals for each format.
  - Result:

## Final results

Recorded in Task 24 on 2026-11-20 at `01e4ffb` plus this commit's doc updates (`npm run check`, `npm run build`, `npm run test:e2e`, `npm run check:secrets` locally and full `app` + `supabase` CI jobs on GitHub Actions).

| Check | Command | Result |
|---|---|---|
| Static checks, unit, component, parser, script and contract tests (mock) | `npm run check` | typecheck clean; lint `0 errors, 13 warnings` (the 13 standing `react-refresh/only-export-components` warnings); Vitest `123 passed (123)` files, `831 passed (831)` tests; `Contrast OK: 43 checks passed` |
| Mock e2e | `npm run test:e2e` | `25 passed` (Chromium) |
| pgTAP | `npm run test:db` | `Files=10, Tests=272`, `Result: PASS` (GitHub Actions CI `supabase` job) |
| Generated database types | `npx supabase gen types typescript --local` diff | current, empty diff (GitHub Actions CI `supabase` job) |
| Integration (assumptions, bootstrap, storage, projects, imports incl. 50 MB V8, invitations, repository and auth contracts on Supabase) | `npm run test:integration` | `9 passed (9)` files, `92 passed (92)` tests (GitHub Actions CI `supabase` job; 50 MB XER V8 test in `4,800 ms`) |
| Supabase e2e | `npm run test:e2e:supabase` | `6 passed` (GitHub Actions CI `supabase` job) |
| Build, licence file and secrets check | `npm run build && test -s dist/third-party-licenses.txt && npm run check:secrets` | built (`dist/assets/worker-*.js` IIFE worker emitted; 119 production packages in `dist/third-party-licenses.txt`); `No secrets found in dist/` (both default and `--mode supabase` in CI) |

### Success criteria

| # | Result |
|---|---|
| S1 | pass: repository contract passes on mock (`npm run check`) and on Supabase (`npm run test:integration`, 92 tests) |
| S2 | pass: `npm run test:db` (`Files=10, Tests=272`) covers RLS, views, all 9 RPCs, triggers and `schedule-imports` storage policies |
| S3 | pass: R1–R12 verified by `npm run test:db` and the contract suite on both adapters |
| S4 | pass: `src/import/goldens.test.ts` and format/damaged/refusal tests pass in `npm run check` (`831` tests) |
| S5 | pass: `src/import/budget.test.ts` parses and checks 50,000 activities / 150,000 links in ~1.6 s; V8 50 MB XER packs to 1.16 MB (`<= 10 MB`) and imports in `4.8 s` (`< 60 s`) in CI `integration/imports.itest.ts` |
| S6 | pass: `npm run test:e2e` (`25 passed`, including `projects.spec.ts`, `files.spec.ts`, `import.spec.ts`, `home.spec.ts`) and `npm run test:e2e:supabase` (`6 passed`) |
| S7 | pass: ESLint passes with `0 errors` and `scripts/import-boundaries.test.mjs` (`23 tests`) pins every layer rule including D47 |
| S8 | pass: GitHub Actions CI (`app` and `supabase` jobs) passes every check and confirms generated database types are current |
| S9 | pass: viewer disabled-action tests pass in component tests, contract tests, `test:db`, and `e2e-supabase/supabase.spec.ts` |
| S10 | pass: `scripts/third-party-licenses.test.mjs` passes and every build emits non-empty `dist/third-party-licenses.txt` (119 packages) |
| S11 | pass: hand-over round trip (`getScheduleSourceFile` + `getImportMapping` → `analyze` gives identical `ImportModel`) passes on mock (`repository.contract.ts`) and Supabase (`integration/imports.itest.ts`) |
| S12 | pass with owner-accepted gaps (2026-11-20): all 73 P6 XERs (78 projects; 64 in the cloud read, all 73 in the 2026-11-24 local rerun, D70) and English P6 `.xlsx` read with 0 errors; MS Project XML, Turkish `.xlsx` and source-tool totals deferred to [Owner checklist](#owner-checklist) item 5 with owner consent |
