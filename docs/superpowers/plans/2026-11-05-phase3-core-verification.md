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
| V6 | A Vite module worker builds, loads under the CSP and has `crypto.subtle` | pending — Task 23 e2e (Chromium); production CSP: owner checklist item 1 | — |
| V7 | `storage.download(path)` returns an object's bytes; `storage.objects.owner_id` holds the uploader's id as text and policies can read it; SQL deletes of `storage.objects` are refused | pass, no fallback. `download` returns the exact 7 bytes a signed-in workspace owner uploaded to `schedule-imports`. `information_schema` lists `owner_id` as `text` (the older `owner` is `uuid`), and the object the test uploaded has `owner_id` equal to the uploader's `auth.users.id::text`. A `for delete` policy using `owner_id = (select auth.uid())::text` is created without error (inside a transaction that was rolled back). A plain `delete from storage.objects` fails with "Direct deletion from storage tables is not allowed. Use the Storage API instead." (`storage.protect_delete()`, exit 1); after `set local storage.allow_delete_query = 'true'` it succeeds (exit 0), which Task 4's pgTAP `06_storage` relies on. So the adapter removes objects through the Storage API | 2026-11-06 |
| V8 | The 20 MB generated XER compresses to 4 MB or less, and its upload and insert finish inside 60 s on the local stack | pending — Task 23; production: owner checklist item 3 | — |
| V9 | The owner's real exports read without errors and their counts match the source tools' totals | pending — Task 24 | — |

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
