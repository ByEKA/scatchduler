# Phase 3 core verification notes

| | |
|---|---|
| **Spec** | `docs/superpowers/specs/2026-11-05-phase3-core-design.md` (§8 assumptions V1–V9, §2.2 success criteria) |
| **Plan** | `docs/superpowers/plans/2026-11-05-phase3-core.md` (Task 1 checks V1–V7; Task 23 checks V6 and V8; Task 24 checks V9 and adds the final results) |
| **Status** | Task 1, 2026-11-06: V1–V5 and V7 hold, so the design's primary path applies and no §8 fallback is in use. One difference from the spec's wording: the SheetJS CE 0.20.3 package ships no NOTICE file (V1). V6, V8 and V9 are pending; the parts of V2–V5 that need a worker or another browser wait for Task 23 and the [owner checklist](#owner-checklist). |

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
| V2 | SheetJS CE installs from `vendor/` offline, honors `dense`, `sheets`, `sheetRows` and the 1904 flag, and writes workbooks in both date systems that it reads back with the same serials | pass for every part checked here, no fallback. `rm -rf node_modules && npm ci --offline` succeeds (`added 498 packages`) and `npm ls xlsx` shows `xlsx@0.20.3`. A workbook written with `utils.aoa_to_sheet` and `write({ bookType: 'xlsx', type: 'array' })` reads back with `Workbook.WBProps.date1904` as written and the serial `46096.5` unchanged, in both date systems; `read` with `sheets: ['Plan']` and `sheetRows: 1` lists both sheet names, parses only `Plan` and returns only its first row. Not checked here: SheetJS in a module worker (Task 14's worker, Task 23's e2e in Chromium) and whether current Excel and LibreOffice open the generated workbooks without a repair prompt (owner checklist item 4, once Task 12 writes the fixtures) | 2026-11-06 |
| V3 | `fast-xml-parser` with `processEntities: false` leaves `&amp;` and character references as written; `parseTagValue: false`, `isArray` and `removeNSPrefix` behave as §5.6 | pass in Node, no fallback: `<Name>Kazı &amp; Dolgu &#x130;</Name>` reads as `Kazı &amp; Dolgu &#x130;`, `1.10` stays the text `1.10`, the default namespace is dropped and a single `Task` is an array. In a worker: Task 23's e2e (Chromium) | 2026-11-06 |
| V4 | Papa Parse parses a decoded string with an explicit delimiter | pass in Node, no fallback: `'Kod;Süre\nA1;2,5\n'` with `delimiter: ';'` gives `[['Kod', 'Süre'], ['A1', '2,5']]`. In a worker: Task 23's e2e (Chromium) | 2026-11-06 |
| V5 | `TextDecoder` supports `windows-1254`, `windows-1252`, `utf-16le/be` with `fatal` | pass in Node 24, no fallback: `windows-1254` decodes `DD FE F0` as `İşğ`, `windows-1252` decodes `8E` as `Ž`, both UTF-16 orders decode `İ`, and a fatal UTF-8 decoder throws on `FD`. Node 22: the CI `supabase` job runs the same test. Chromium worker: Task 23's e2e. Firefox and Safari workers: owner checklist item 2 | 2026-11-06 |
| V6 | A Vite module worker builds, loads under the CSP and has `crypto.subtle` | pass (Chromium): the worker builds as Vite's default IIFE bundle (`dist/assets/worker-*.js`, V6's fallback), loads from the preview build and hashes with `crypto.subtle` (`import.spec.ts`, `home.spec.ts`). Production CSP: owner checklist item 1 | 2026-11-19 |
| V7 | `storage.download(path)` returns an object's bytes; `storage.objects.owner_id` holds the uploader's id as text and policies can read it; SQL deletes of `storage.objects` are refused | pass, no fallback. `download` returns the exact 7 bytes a signed-in workspace owner uploaded to `schedule-imports`. `information_schema` lists `owner_id` as `text` (the older `owner` is `uuid`), and the object the test uploaded has `owner_id` equal to the uploader's `auth.users.id::text`. A `for delete` policy using `owner_id = (select auth.uid())::text` is created without error (inside a transaction that was rolled back). A plain `delete from storage.objects` fails with "Direct deletion from storage tables is not allowed. Use the Storage API instead." (`storage.protect_delete()`, exit 1); after `set local storage.allow_delete_query = 'true'` it succeeds (exit 0), which Task 4's pgTAP `06_storage` relies on. So the adapter removes objects through the Storage API | 2026-11-06 |
| V8 | The 20 MB generated XER compresses to 4 MB or less, and its upload and insert finish inside 60 s on the local stack | pending — Task 23; production: owner checklist item 3 | — |
| V9 | The owner's real exports read without errors and their counts match the source tools' totals | pending — Task 24 | — |

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

## Owner checklist

Each item needs the owner (a browser other than Chromium, a desktop application or the production project). Tick the box and fill in the result line.

- [ ] **1. Worker under the production CSP (V6).** On the production deployment, an import reaches the Columns or Review step, so the module worker loads under `default-src 'self'`.
  - Result:
- [ ] **2. Firefox and Safari (V5).** Importing the Windows-1254 CSV fixture in Firefox and in Safari shows the Turkish letters correctly, so both decode `windows-1254` in a worker.
  - Result:
- [ ] **3. V8 on production.** With the next rollout, the 20 MB generated XER imports on the production project inside the 60 s client timeout.
  - Result:
- [ ] **4. Generated workbooks (V2).** Once Task 12 has written `src/import/__fixtures__/dates-1900.xlsx` and `dates-1904.xlsx`, both open in current Excel and LibreOffice without a repair prompt.
  - Result:

## Final results

Filled in by Task 24.
