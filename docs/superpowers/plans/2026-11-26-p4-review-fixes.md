# Fixes after the review of PRs #1–#6 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. In this repository the controller runs each task with `.claude/workflows/plan-task.js` (see `docs/HANDOFF.md`).

**Goal:** Fix the 16 bugs that the 2026-11-24 review of the merged PRs #1–#6 confirmed, plus the Windows failure of `npm run check`, so that the schedule editor, the CPM engine and the P6 import can be used on real schedules.

**Architecture:** Each task fixes one area behind the existing interfaces:
- the CPM engine (`src/engine/**`, CLAUDE.md rule 9);
- the schedule editor and Gantt (`src/features/schedule/**`);
- the data layer (one new migration and both adapters);
- the Projects map, the import dialog and the XER reader.

No task adds a runtime dependency. The owner's answers to the review are spec rows P4 core D11–D16, P4 later D5 and P3 core D70. This plan implements them and changes no other spec rule.

**Tech Stack:** React 19 · Vite · TypeScript strict · Tailwind CSS v4 · TanStack Query/Table/Virtual · Vitest + fast-check (TZ `America/Los_Angeles`; the engine suite also runs in 4 time zones) · Playwright (port 4174) · Supabase local stack (Postgres 17, pgTAP).

**Spec:**
- `docs/superpowers/specs/2026-11-20-phase4-core-design.md` (D11–D16)
- `docs/superpowers/specs/2026-11-23-phase4-later-design.md` (D5)
- `docs/superpowers/specs/2026-11-05-phase3-core-design.md` (D37, D44, D56, D69, D70)

`<scratchpad>` in the tasks names the planning sessions' temporary folder. Its probe files are not kept; the tasks carry every value the probes produced, and Appendices A and B hold the two pieces of code a task needs.

The finding ids (PR5-1 and so on) come from the review summarized in `docs/HANDOFF.md` ("Open items from the review of PRs #1–#6"), which also lists the minor findings this plan leaves open.

## Global Constraints

1. **Test first.** Every task starts with the failing tests its Step 1 lists. Run them and confirm they fail for the stated reason before writing the fix.
2. **Done means checks pass.** A task is done only when `npm run check` exits 0.
   - Tasks that touch UI flows also pass `npm run test:e2e`.
   - Tasks that touch SQL or an adapter also pass `npm run test:db`, `npm run test:integration` and `npm run test:e2e:supabase`.
   - Run the two e2e suites one after the other: they share port 4174 (P2 D28).
3. **Migrations.** Never edit an applied migration. A task that changes SQL creates its own migration with `npx supabase migration new <name>`, and runs `npm run db:types` in the same commit. The generated types change only when a signature does.
4. **Pure modules stay pure.** `src/engine/**` stays pure TypeScript (CLAUDE.md rule 9), and so does `src/import/**` (rule 8). Engine changes keep the budget test green (10k < 300 ms, 50k < 2 s).
5. **Generated files.** A golden or ratchet file changes only through its generator (`npm run goldens` or the oracle ratchet update), never by hand, and only where the task says so.
6. **Copy.** UI copy is English, sentence case, no exclamation marks. New strings are exactly as the task pins them; the owner approved the new ones on 2026-11-26.
7. **Commits.** One Conventional Commit per task, with the message the task gives, ending with the `Co-Authored-By` trailer the controller passes.
8. **Real exports.** They stay in the main checkout's git-ignored `real-exports/`. Only `scripts/read-real-exports.ts` and `scripts/check-cpm-oracle.ts` read them, by path. Nothing from them is printed by name, copied or committed (P3 D2, §5.11, D70).

## Task order

| Order | Task | Fixes | Commit message |
|---|---|---|---|
| 1 | F1 | `npm run check` fails on Windows: Node 24 refuses `npx.cmd` without a shell | `fix(scripts): run the engine time-zone suite through node so npm run check works on Windows` |
| 2 | F2 | PR5-1 (critical, plus the LOE loops of the real files), PR5-3, PR5-6 | `fix(engine): keep LOE links out of logic and loops, re-place successors after ALAP, use actual span for completed late dates` |
| 3 | F3 | PR5-2, PR5-4 (D11), PR5-5 (D12) | `fix: measure floats and driving links from the forward pass bounds and keep completed work off the critical path` |
| 4 | F10 | PR3-2 (D14), PR3-1 | `feat: read P6 scheduling options from XER files` |
| 5 | F4 | PR5-8, PR6-3 (D13) | `fix: keep status and actual dates consistent on % complete edits (D13)` |
| 6 | F5 | PR6-4 | `fix: snap Gantt move and resize to working days on the activity calendar` |
| 7 | F7 | PR6-1 (D5), PR4-2, PR4-3, D16 copy; PR4 minor items: NULL expected revision, `display_name` e-mail fallback | `fix: harden folder delete, schedule locks and snapshot decoding (D5, R11)` |
| 8 | F6 | PR5-7, PR4-1, PR3-9 (D16) | `fix: keep stale on edits during calculate, re-take an expired own lock, open the stored snapshot after materialize` |
| 9 | F8 | PR6-2 | `fix(projects): place map pins on the drawn map at every width` |
| 10 | F9 | PR1-1, PR1-2 | `fix: hold Import during review re-checks and keep the D37 status date` |

Why this order:
- F1 comes first, so every later task can run `npm run check` on Windows.
- The engine tasks follow in the order F2 → F3 → F10. F3 measures floats on F2's passes, and F10's expected values assume both are in place.
- F4 comes before F5, because both change `gantt/drag.ts`.
- F7 comes before F6: F7's migration changes the lock-lost copy (D16), and F6's banner button and tests use the new copy.
- F8 and F9 are independent.

After F9 the controller reruns every suite and the oracle check below. It records the results in `docs/superpowers/plans/2026-11-20-phase4-core-verification.md` and `docs/HANDOFF.md` in a docs commit.

## Baseline before the fixes (owner machine, 2026-11-26)

`npx tsx scripts/check-cpm-oracle.ts` was run on the 73 sample XER files (P3 D70). Only aggregate numbers are recorded.

**Solve results.** 67 files solved; 6 were refused with `SCHEDULE_CYCLE`. Every one of those loops runs through a level-of-effort activity, and F2 removes LOE links from the topological order.

**Match with P6's own dates** (103,478 activities compared):

| es | ef | ls | lf | tf | ff |
|---|---|---|---|---|---|
| 75.3 % | 75.7 % | 73.7 % | 73.8 % | 81.5 % | 97.0 % |

**Files by es match:**

| es match | Files |
|---|---|
| 99 % or more | 36 |
| 90 to 99 % | 9 |
| 50 to 90 % | 10 |
| below 50 % | 12 |

F10's checks rerun the command and compare file by file on the 67 files solved at baseline. Any of es/ef/ls/lf/tf more than 1 point below the baseline on those files counts as a regression. Files that newly solve are reported separately: they add many activities, so the plain aggregate is not comparable.

**After F2 (0c36747, controller run 2026-11-26):**
- The 67 baseline files give exactly the baseline figures.
- Five of the six LOE-loop files now solve. They add 42,663 activities, and their es match is low (a 23,457-activity file matches 2 %), so the plain aggregate reads es 60.5 %.
- The sixth file has a real loop of three FS-linked tasks with no LOE, which P6 would refuse too; it stays `SCHEDULE_CYCLE`.

Diagnosing the low-match files is not in this plan; it is a follow-up in `docs/HANDOFF.md`.

## Review Focus

These are failure modes that no single task's tests cover in full. Reviewers check them in the task named:

1. **Schedules saved before these fixes** (F3, F6, F7). Their stored `computed` summary came from the old engine.
   - Opening such a schedule shows the stored values until the next Calculate.
   - WBS rows never show a critical flag from completed work, because the F3 rollup ignores it in both modes.
   - Snapshots without `sourceNotes` decode unchanged.
   - Nothing crashes.
2. **Real P6 files** (F2, F10). The six LOE-loop files must calculate, and no oracle figure may fall more than 1 point below the baseline above.
3. **A lock lost while another editor saved in between** (F6). The tab takes the lock back but must not overwrite the other save: the save still fails with "This schedule was changed elsewhere. Reload and try again." and the unsaved work can be downloaded.
4. **Large schedules** (F2, F3). The ALAP re-run and the new link-bound helper must keep the 50k-activity solve under 2 s. The budget test runs in `npm run check`.
5. **Mock and Supabase parity** (F7). Folder-delete renaming (D5) and the D16 copy must behave the same on both adapters. The contract tests run on both.

---

### Task F1: Make `npm run check` work on Windows

**Fixes:**
- Review note in `review-final.md` ("`npm run check` fails on Windows"), checked by the controller. `scripts/test-engine-timezones.mjs` spawns `npx.cmd` through `spawnSync` with no shell. Node 24 refuses to spawn `.cmd`/`.bat` files without a shell (CVE-2024-27980), so `spawnSync` returns `status: null` with `error.code === 'EINVAL'`. The script then exits 1 with no message right after `Running src/engine tests under TZ=UTC`. The effect is that `npm run check`, the done-gate in CLAUDE.md, always fails on Windows, even though every suite it runs would pass. CI runs on Linux and passes.
- No decision rows apply.

**Spec:** P4 core spec §2.2 S4 (the engine suite runs in `UTC`, `America/Los_Angeles`, `Europe/Istanbul` and `Pacific/Auckland`) and plan 2026-11-20-phase4-core Task 1 (`test:engine:tz` runs `vitest run src/engine --passWithNoTests` with `TZ` set and exits non-zero on the first failure). CLAUDE.md "Commands": `npm run check` = typecheck + lint + tests + contrast + engine multi-timezone suite. The four time zones, the arguments, the output lines and the exit-on-first-failure behaviour all stay as they are. Only the way the child process starts changes.

**Probe evidence** (`<scratchpad>/F1-probe.mjs` and `F1-impl-probe.mjs`, Node v24.14.0 win32, vitest 5.0.4):
- Current code: `spawnSync('npx.cmd', …)` gives `status null`, `error.code 'EINVAL'`, message `spawnSync npx.cmd EINVAL`.
- `require.resolve('vitest/vitest.mjs')` throws `ERR_PACKAGE_PATH_NOT_EXPORTED`, because vitest's `exports` map does not list `./vitest.mjs`. The entry is found by resolving `vitest/package.json`, which is exported, and joining its `bin.vitest` (`"./vitest.mjs"`). That gives `C:\Users\EkA\Desktop\scatchduler\node_modules\vitest\vitest.mjs`.
- `spawnSync(process.execPath, [entry, '--version'])` with no shell gives `status 0`, stdout `"vitest/5.0.4 win32-x64 node-v24.14.0\n"`, in about 90 ms.
- `shell: true` also works, but Node 24 prints `[DEP0190] DeprecationWarning: Passing args to a child process with shell option true…`. Do not use a shell.
- Every assertion in Step 1 was checked against the proposed implementation with `node:assert`, and all of them hold.

**Files:**
- Modify: `scripts/test-engine-timezones.mjs`
- Test (create): `scripts/test-engine-timezones.test.mjs`. It is picked up by `vitest.config.ts` through `include: 'scripts/**/*.test.mjs'`.
- No change to `package.json`, `.github/workflows/ci.yml`, CLAUDE.md or `eslint.config.js`. `scripts/**` already gets `globals.node`.

**Interfaces:**
- Produces, all exported from `scripts/test-engine-timezones.mjs` (plain JS; the signatures are written in TS notation):
  - `ENGINE_TIMEZONES: readonly string[]`. Unchanged: `['UTC', 'America/Los_Angeles', 'Europe/Istanbul', 'Pacific/Auckland']`.
  - `resolveVitestEntry(): string` (new). Returns the absolute path of the vitest CLI entry (`<repo>/node_modules/vitest/vitest.mjs`).
  - `buildVitestCommand(tz: string): { command: string; args: string[]; options: { stdio: 'inherit'; env: NodeJS.ProcessEnv } }` (new).
  - `runForTimezone(tz: string, spawn?: typeof spawnSync): number` (changed). It was a private function that called `process.exit`. It is now exported and returns the exit code: 0 on pass, the child's status on failure, 1 when the child could not start or was killed. The `spawn` parameter defaults to `spawnSync` and exists only so tests can pass a fake.
- Callers affected: the `isMainModule` block in the same file is the only caller of `runForTimezone`. `package.json` `test:engine:tz` (`node scripts/test-engine-timezones.mjs`) is unchanged, and so are `npm run check` and CI.

- [ ] **Step 1: Write the failing tests**

Create `scripts/test-engine-timezones.test.mjs`. `restoreMocks: true` in `vitest.config.ts` restores the `console.error` spies.

```js
// @vitest-environment node
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { basename, isAbsolute, relative, sep } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  ENGINE_TIMEZONES,
  buildVitestCommand,
  resolveVitestEntry,
  runForTimezone,
} from './test-engine-timezones.mjs';

const ENGINE_ARGS = ['run', 'src/engine', '--passWithNoTests'];

describe('test-engine-timezones', () => {
  it('keeps the four engine time zones', () => {
    expect(ENGINE_TIMEZONES).toEqual(['UTC', 'America/Los_Angeles', 'Europe/Istanbul', 'Pacific/Auckland']);
  });

  it('resolves the vitest CLI entry from the vitest package bin', () => {
    const entry = resolveVitestEntry();
    expect(isAbsolute(entry)).toBe(true);
    expect(existsSync(entry)).toBe(true);
    expect(basename(entry)).toBe('vitest.mjs');
    expect(relative(process.cwd(), entry).split(sep).join('/')).toBe('node_modules/vitest/vitest.mjs');
  });

  it('spawns the vitest CLI through process.execPath, never npx or a .cmd shim', () => {
    const { command, args, options } = buildVitestCommand('Europe/Istanbul');
    expect(command).toBe(process.execPath);
    expect(args).toEqual([resolveVitestEntry(), ...ENGINE_ARGS]);
    expect([command, ...args].some((part) => /\.(cmd|bat)$/i.test(part) || /(^|[\\/])npx/i.test(part))).toBe(false);
    expect(options).not.toHaveProperty('shell');
    expect(options.stdio).toBe('inherit');
    expect(options.env).toEqual({ ...process.env, TZ: 'Europe/Istanbul' });
  });

  it('starts the resolved vitest CLI without a shell', () => {
    const { command, args, options } = buildVitestCommand('UTC');
    const result = spawnSync(command, [args[0], '--version'], { env: options.env, encoding: 'utf8' });
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/^vitest\/\d+\.\d+\.\d+ /);
  });

  it('prints the spawn error and returns 1 when vitest cannot start', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const spawn = vi.fn(() => ({
      status: null,
      signal: null,
      error: Object.assign(new Error('spawnSync npx.cmd EINVAL'), { code: 'EINVAL' }),
    }));
    expect(runForTimezone('UTC', spawn)).toBe(1);
    expect(spawn).toHaveBeenCalledWith(
      process.execPath,
      [resolveVitestEntry(), ...ENGINE_ARGS],
      expect.objectContaining({ stdio: 'inherit', env: expect.objectContaining({ TZ: 'UTC' }) }),
    );
    expect(errorSpy).toHaveBeenCalledWith(
      'Engine TZ check: could not start vitest under TZ=UTC: spawnSync npx.cmd EINVAL',
    );
  });

  it('returns the vitest exit status, and 1 with a message when vitest is killed', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(runForTimezone('UTC', () => ({ status: 0, signal: null }))).toBe(0);
    expect(runForTimezone('UTC', () => ({ status: 3, signal: null }))).toBe(3);
    expect(errorSpy).not.toHaveBeenCalled();
    expect(runForTimezone('Pacific/Auckland', () => ({ status: null, signal: 'SIGTERM' }))).toBe(1);
    expect(errorSpy).toHaveBeenCalledWith('Engine TZ check: vitest under TZ=Pacific/Auckland was killed by SIGTERM');
  });
});
```

Where the values come from:
- The relative path `node_modules/vitest/vitest.mjs` holds because Vitest runs from the repository root (`check-contrast.test.mjs` already reads `src/index.css` relative to the root) and because vitest's `bin` is `{"vitest": "./vitest.mjs"}`.
- The real-spawn test is the actual Windows regression test. It starts the same command the script uses, swapping only the arguments for `--version`, with no shell. It takes about 90 ms.
- The `.cmd`/`npx` check protects the builder on Linux CI too. No existing test pins the old behaviour.
- Importing the module does not run the main block, because `isMainModule(import.meta.url)` is false under Vitest.

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run scripts/test-engine-timezones.test.mjs`
Expected: `Tests  5 failed | 1 passed (6)`. Only `keeps the four engine time zones` passes. The other five fail with `TypeError: resolveVitestEntry is not a function`, `TypeError: buildVitestCommand is not a function` or `TypeError: runForTimezone is not a function`, because these names are not exported yet. This is how Vitest 5 reports a missing named export from a `.mjs` file; it was checked with a throwaway module.

Optional reproduction on Windows: `npm run test:engine:tz; echo "exit=$?"` prints only `Running src/engine tests under TZ=UTC` and then `exit=1`. On Linux it passes.

- [ ] **Step 3: Implement** in `scripts/test-engine-timezones.mjs`
- Imports: `spawnSync` from `node:child_process`, `existsSync` and `readFileSync` from `node:fs`, `createRequire` from `node:module`, and `dirname` and `join` from `node:path`. Keep `isMainModule`.
- Keep `ENGINE_TIMEZONES` exactly as it is. Add `const ENGINE_TEST_ARGS = ['run', 'src/engine', '--passWithNoTests'];`.
- `resolveVitestEntry()`: `const requireFromHere = createRequire(import.meta.url);`, then `const packageJsonPath = requireFromHere.resolve('vitest/package.json');`. Read `bin` from that JSON and return `join(dirname(packageJsonPath), typeof bin === 'string' ? bin : bin.vitest)`.
  - Do not resolve `'vitest/vitest.mjs'`. That throws `ERR_PACKAGE_PATH_NOT_EXPORTED`.
  - Do not name the local `require`.
  - If vitest is not installed, the resolve throws `MODULE_NOT_FOUND` with a stack trace. That is loud, so leave it uncaught.
- `buildVitestCommand(tz)` returns `{ command: process.execPath, args: [resolveVitestEntry(), ...ENGINE_TEST_ARGS], options: { stdio: 'inherit', env: { ...process.env, TZ: tz } } }`. No `shell` key and no platform branch.
- `runForTimezone(tz, spawn = spawnSync)` calls `spawn(command, args, options)`, then applies these rules in order:
  1. If `result.error` is set, call `console.error(\`Engine TZ check: could not start vitest under TZ=${tz}: ${result.error.message}\`)` and return `1`.
  2. Otherwise, if `result.status === null`, call `console.error(\`Engine TZ check: vitest under TZ=${tz} was killed by ${result.signal}\`)` and return `1`.
  3. Otherwise return `result.status`.
- Main block: keep the `src/engine` existence check and its skip message. In the loop, print ``console.log(`Running src/engine tests under TZ=${tz}`)``, then `const code = runForTimezone(tz); if (code !== 0) process.exit(code);`. Keep the final `Engine TZ check OK: ${ENGINE_TIMEZONES.length} time zones passed`.
- Update the header comment to one line: `// Runs the CPM engine unit tests under four time zones (Phase 4 core spec S4). Starts the vitest CLI with this Node binary, so no shell or npx.cmd is needed (Node refuses to spawn .cmd without a shell).`

- [ ] **Step 4: Run the checks**

Run: `npx vitest run scripts/test-engine-timezones.test.mjs`
Expected: `Tests  6 passed (6)`.

Run: `npm run test:engine:tz; echo "exit=$?"`
Expected: four blocks, each starting with `Running src/engine tests under TZ=<tz>` (`UTC`, `America/Los_Angeles`, `Europe/Istanbul`, `Pacific/Auckland`) and ending in a Vitest summary with every test passing. At 8d0de4b that is `Test Files  13 passed (13)` and `Tests  55 passed (55)`; the numbers are higher if engine fix tasks landed first. The run ends with `Engine TZ check OK: 4 time zones passed` and `exit=0`. On Windows this is the step that failed before.

Run: `npm run check && npm run build`
Expected:
- typecheck passes; lint shows 0 errors (warnings stay at the existing count, 13 at 8d0de4b).
- vitest shows one more test file and six more tests than before this task (181 files / 1027 tests if F1 lands first on 8d0de4b), all passing.
- `Contrast OK: 51 checks passed`.
- `Engine TZ check OK: 4 time zones passed`.
- Exit code 0, and `vite build` completes. The build is not affected: `scripts/*.mjs` sits outside every tsconfig and outside the Vite graph.

No db, integration or e2e suites apply.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "fix(scripts): run the engine time-zone suite through node so npm run check works on Windows"
```

---

### Task F2: CPM passes: LOE links never drive or loop, ALAP keeps logic, completed late dates use the actual span

**Fixes:**
- **PR5-1 (critical)**: an LOE drives its successors in the forward pass. In `src/engine/cpm.ts`, the in-progress loop (316–382) and the not-started loop (413–456) use every incoming link, so a successor is placed from the LOE's *stored* duration before the LOE post-pass sets the LOE's real span. User-visible effect: a PM-LOE whose stored duration is longer than the work it spans pushes the finish milestone and the project finish later (golden shape below: M2 moves from 09.01 to 16.01), and the real critical work loses its criticality.
- **LOE loops (controller evidence, same root cause)**: 6 of the owner's 73 real P6 XER files are refused with `SCHEDULE_CYCLE`. Each reported loop has 3 activities, one of them a `level_of_effort`, and only exists through LOE links. `buildGraph` (`src/engine/graph.ts`) sorts and searches cycles over every link. P6 calculates these files because LOE links never drive. User-visible effect: "Circular logic found" and no dates at all.
- **PR5-3 (important)**: under `alapBehavior: 'to_late_dates'` (msp), `runPostPasses` (749–753) moves the ALAP task to its late dates and never re-places what follows it, so a successor starts before its FS predecessor finishes. The golden `alap-msp` pins the bug (B on 07.01 after A on 08.01). The P6 `within_free_float` branch has the same defect class with elapsed lags or mixed calendars (the probe below found it). The same fix covers it.
- **PR5-6 (important)**: with `completedLateDates: 'recalculate'` (msp), `runBackwardPass` (645–649) uses `originalDuration` for a completed activity's late start, but the forward pass uses the actual span. An activity that finished early gets TF 0 (or negative) and turns critical. `cpm-floats.test.ts` "applies totalFloatFormula…" (line 131) pins the bug through the `splitFloat` fixture (msp TF 0).
- **Minor**: an in-progress LOE's actual start is replaced by an earlier predecessor or successor anchor in the LOE post-pass (816, 854).
- **Not in this task**: everything in `computeFloatsAndCriticality` stays with F3 (driving-link snap, `relFreeFloat <= 0` at 935 from the PR5-3 note, D11 completed never critical, D12 free float to the project finish).

**Spec:** P4 core spec §5.3 (Kahn sort and iterative DFS; the cycle error shape `cycleIds`/`cycleCodes` with the start node repeated at the end is unchanged) and §5.4 steps 1–3. LOE: "from earliest predecessor anchor to latest successor anchor", so an LOE's dates come from its neighbours and never drive them, as the backward pass (662), ALAP (763) and longest path (947) already assume. ALAP: "delays unstarted ALAP tasks up to free-float limit (P6) or late dates", so the task is delayed and never moved earlier. The §5.1 table gives `alapBehavior` and `completedLateDates` per profile. The §5.5 copy is unchanged.

The `default` profile's ALAP stays `within_free_float`, as §5.1 and the code say (owner, D15, which also corrects §5.4's wording). This task does not touch `profiles.ts`. D11–D14 are not touched here.

**Probe evidence.** All probes are in `<scratchpad>/` and run with `npx tsx <file>` from the repo root. Probes that import fast-check also need `NODE_PATH=<repo>/node_modules`. `F2-work/cpm-fixed.ts` and `F2-work/graph-fixed.ts` are patched copies of the design below. They have probe-only `F2_FLAGS` toggles: do not copy them.
- `F2-golden.ts` and `F2-loe-literal.ts` give every expected value in Step 1, on the current engine and the patched one.
- `F2-fixtures-check.ts` replays every existing `forward.json`/`backward.json` case and the oracle ratchet. With the patch, only `alap-msp` changes (its B row). The ratchet stays exactly as pinned for all three fixtures (`two-projects.NTH-A`, `legacy-p6`, `project`), so `oracle-ratchet.json` is not edited.
- `F2-graph-existing.ts`: the existing `graph.test.ts` assertions, including the 50,000-node chain and cycle, pass on the patched graph.
- `F2-props-final.ts` is the verbatim property helper code from Step 1, and `F2-props-final-run.ts` runs it. Over 300 seeds at `numRuns: 200`:
  - Property 1 fails 300/300 on the current code (median 16 runs to the first failure, max 97) and 0/300 after the patch.
  - Property 2 fails 300/300 (median 7, max 43) and 0/300 after.
  - After the patch, 200 runs take about 34 ms and 61 ms.
- `F2-p6-rerun-effect.ts`: of 8,031 generated p6/default schedules with an ALAP task, 118 broke a link with the delay-only ALAP pass. With the re-run in Step 3, none do, and in 98 a successor moves later instead.

**Files:**
- Modify: `src/engine/graph.ts`, `src/engine/cpm.ts`
- Test (modify): `src/engine/graph.test.ts`, `src/engine/__fixtures__/forward.json`, `src/engine/__fixtures__/backward.json`, `src/engine/__fixtures__/floats.json`, `src/engine/cpm-floats.test.ts`, `src/engine/properties.test.ts`
- No change: `src/engine/index.ts`, `profiles.ts`, `cpm-forward.test.ts`, `cpm-backward.test.ts`, `oracle-ratchet.json`, the spec.

**Interfaces:**
- Consumes: `ScheduleGraph`, `ResolvedRules` and the `@/engine/calendar` functions, all unchanged.
- Produces: no exported signature changes. The changed contracts are:
  - `buildGraph(document)` keeps its signature and its error shape. `SCHEDULE_CYCLE` is now raised only for a loop whose activities and links are all non-LOE. `ScheduleGraph.activityOrder` still lists every node, in a new order:
    1. Every non-LOE node, in topological order over links whose two ends are both non-LOE.
    2. Every LOE node, in topological order over LOE→LOE links.
    3. LOE nodes caught in a loop of LOE→LOE links, in ascending node index.

    `incoming`, `outgoing`, `incomingEdgeIndices`, `outgoingEdgeIndices`, `edgePredIndex`, `edgeSuccIndex` and `activeRelationships` still hold every link, LOE links included.
  - `runForwardPass(document, graph, calendars, rules): ForwardState` keeps its signature. Its body moves into a module-private `forwardPass(document, graph, calendars, rules, pins: ForwardPins | null): ForwardState`, with a module-private `interface ForwardPins { readonly mask: Uint8Array; readonly es: Int32Array; readonly ef: Int32Array }` that is not exported.
  - `runBackwardPass(...)` keeps its signature. It now leaves LOE nodes to the post-pass.
  - `runPostPasses(...): void` keeps its signature. After ALAP it may now rewrite the contents of `forward.es`, `forward.ef`, `forward.drivers`, `forward.activeLinkMask` and `forward.warnings` for every node, not only the ALAP and LOE nodes.
- Callers: `src/engine/index.ts` `solve()` already reads `forward.warnings` after `runPostPasses`. `cpm-forward.test.ts`, `cpm-backward.test.ts` and `cpm-floats.test.ts` call the passes directly, and `oracle.test.ts`, `budget.test.ts` and `properties.test.ts` go through `solve`. None needs a code change. Nothing outside `src/engine` reads `activityOrder` or calls `buildGraph`.

- [ ] **Step 1: Write the failing tests**

Every date below is `projectStart 2026-01-05T08:00` (Monday) on the standard Mon–Fri 08–12/13–17 calendar. 480 min is 1 d. The values come from `F2-golden.ts`, `F2-loe-literal.ts` and `F2-floats-formula.ts` on the patched copy, and match hand CPM. Example: M1 SS→W 5 d gives W 05.01 08:00–09.01 17:00, and M2 FS-after-W lands on 09.01 17:00 (P6 finish milestone, no snap to the next day).

**1a. `src/engine/__fixtures__/forward.json`: append two cases** (the harness checks `es`, `ef`, `driver.kind` and the forward warnings).

```json
{
  "name": "loe-does-not-drive-successors",
  "profile": "p6",
  "settings": { "projectStart": "2026-01-05T08:00", "statusDate": "2026-01-05T08:00" },
  "activities": [
    { "id": "m1", "code": "M1", "type": "start_milestone", "originalDuration": 0 },
    { "id": "work", "code": "W10", "originalDuration": 2400 },
    { "id": "m2", "code": "M2", "type": "finish_milestone", "originalDuration": 0 },
    { "id": "loe", "code": "LOE1", "type": "level_of_effort", "originalDuration": 4800 }
  ],
  "relationships": [
    { "id": "r1", "predecessorId": "m1", "successorId": "work", "type": "FS", "lagMinutes": 0 },
    { "id": "r2", "predecessorId": "work", "successorId": "m2", "type": "FS", "lagMinutes": 0 },
    { "id": "r3", "predecessorId": "m1", "successorId": "loe", "type": "SS", "lagMinutes": 0 },
    { "id": "r4", "predecessorId": "loe", "successorId": "m2", "type": "FF", "lagMinutes": 0 }
  ],
  "expected": {
    "m1": { "es": "2026-01-05T08:00", "ef": "2026-01-05T08:00", "driver": "project_start" },
    "work": { "es": "2026-01-05T08:00", "ef": "2026-01-09T17:00", "driver": "predecessor" },
    "m2": { "es": "2026-01-09T17:00", "ef": "2026-01-09T17:00", "driver": "predecessor" }
  },
  "warnings": []
},
{
  "name": "loe-predecessor-ignored-with-progress",
  "profile": "p6",
  "settings": { "projectStart": "2026-01-05T08:00", "statusDate": "2026-01-07T08:00" },
  "activities": [
    { "id": "a", "code": "A10", "originalDuration": 960, "remainingDuration": 0, "status": "completed", "actualStart": "2026-01-05T08:00", "actualFinish": "2026-01-06T17:00" },
    { "id": "loe", "code": "LOE1", "type": "level_of_effort", "originalDuration": 9600 },
    { "id": "b", "code": "B10", "originalDuration": 960, "remainingDuration": 480, "status": "in_progress", "actualStart": "2026-01-07T08:00" },
    { "id": "c", "code": "C10", "originalDuration": 960, "remainingDuration": 0, "status": "completed", "actualStart": "2026-01-05T08:00", "actualFinish": "2026-01-06T17:00" }
  ],
  "relationships": [
    { "id": "r1", "predecessorId": "a", "successorId": "loe", "type": "SS", "lagMinutes": 0 },
    { "id": "r2", "predecessorId": "loe", "successorId": "b", "type": "FF", "lagMinutes": 0 },
    { "id": "r3", "predecessorId": "a", "successorId": "b", "type": "FS", "lagMinutes": 0 },
    { "id": "r4", "predecessorId": "loe", "successorId": "c", "type": "FF", "lagMinutes": 0 }
  ],
  "expected": {
    "a": { "es": "2026-01-05T08:00", "ef": "2026-01-06T17:00", "driver": "actual" },
    "b": { "es": "2026-01-07T08:00", "ef": "2026-01-07T17:00", "driver": "actual" },
    "c": { "es": "2026-01-05T08:00", "ef": "2026-01-06T17:00", "driver": "actual" }
  },
  "warnings": []
}
```

The current code gives:
- `loe-does-not-drive-successors`: M2 on 16.01 17:00, driven by r4 from the LOE.
- `loe-predecessor-ignored-with-progress`: B finishing on `2026-02-03T17:00` (the LOE's 20 d placeholder), and `["OUT_OF_SEQUENCE"]` for r4.

An LOE sets no logical bound, so a link from an LOE never raises `OUT_OF_SEQUENCE`. The LOE's own forward placeholder is not asserted.

**1b. `src/engine/__fixtures__/backward.json`.** The harness checks `es`/`ef`/`ls`/`lf` after the post-passes, plus the forward and backward warnings.

Correct the existing `alap-msp` case. Only its `b` row changes:
```json
"b": { "es": "2026-01-09T08:00", "ef": "2026-01-09T17:00", "ls": "2026-01-09T08:00", "lf": "2026-01-09T17:00" }
```
A (ALAP, 1 d) moves to its late dates, 08.01. B (FS from A) then starts 09.01; its SNET of 07.01 no longer binds. That is what PR5-3 expects. The old 07.01 pinned the bug.

Append six cases (`settings` as `S` = `{ "projectStart": "2026-01-05T08:00", "statusDate": "2026-01-05T08:00" }` unless shown):

1. `loe-stored-duration-longer-than-span`: profile `p6`, settings `S`, with the activities and relationships of `loe-does-not-drive-successors` (LOE stored 4800, span 5 d). Expected:
   - `m1`: es, ef, ls, lf all `2026-01-05T08:00`.
   - `work`: es `2026-01-05T08:00`, ef `2026-01-09T17:00`, ls `2026-01-05T08:00`, lf `2026-01-09T17:00`.
   - `m2`: all four `2026-01-09T17:00`.
   - `loe`: es and ls `2026-01-05T08:00`, ef and lf `2026-01-09T17:00`.
   - warnings `[]`.

   The current code gives m1 ls `2026-01-12T08:00`, work lf `2026-01-16T17:00`, and m2 and the LOE finishing on 16.01.
2. `loe-in-progress-keeps-actual-start`: profile `p6`, settings `{ "projectStart": "2026-01-05T08:00", "statusDate": "2026-01-07T08:00" }`.
   - Activities: `a` (A10, 960, completed, actual `2026-01-05T08:00`–`2026-01-06T17:00`, remaining 0); `loe` (LOE1, `level_of_effort`, original 960, remaining 480, `in_progress`, actualStart `2026-01-06T08:00`); `b` (B10, 960).
   - Links: r1 a SS→loe, r2 a FS→b, r3 loe FF→b.
   - Expected, `loe` row first: `loe` es and ls `2026-01-06T08:00`, ef and lf `2026-01-08T17:00`; `b` es and ls `2026-01-07T08:00`, ef and lf `2026-01-08T17:00`.
   - warnings `[]`.

   The current code gives loe es `2026-01-05T08:00`: A's start replaces the actual start.
3. `loe-link-loop-is-not-a-cycle`: profile `p6`, settings `S`.
   - Activities: `a` (A10, 480), `l` (L10, `level_of_effort`, 480), `b` (B10, 2400).
   - Links: r1 a FS→l, r2 l FF→b, r3 b SS→a. The loop A→L→B→A exists only through L.
   - Expected: `a` es `2026-01-05T08:00`, ef `2026-01-05T17:00`, ls `2026-01-09T08:00`, lf `2026-01-09T17:00`; `l` es and ls `2026-01-06T08:00`, ef and lf `2026-01-09T17:00`; `b` es and ls `2026-01-05T08:00`, ef and lf `2026-01-09T17:00`.
   - warnings `[]`.

   A and B are placed by B SS→A alone. L starts from A's finish (FS anchor, snapped to 06.01 08:00) and ends at B's finish (FF anchor). The current code fails at the harness's `expect(graphRes.ok).toBe(true)`.
4. `alap-msp-chain-keeps-logic`: profile `msp`, settings `S`.
   - Activities: `crit` (C10, 2400), `a` (A10, 480, constraint `{ "type": "as_late_as_possible", "date": null }`), `b` (B10, 480), `d` (D10, 480).
   - Links: r1 a FS→b, r2 b FS→d.
   - Expected, with es=ls and ef=lf for each: `crit` `2026-01-05T08:00`/`2026-01-09T17:00`; `a` `2026-01-07T08:00`/`2026-01-07T17:00`; `b` `2026-01-08T08:00`/`2026-01-08T17:00`; `d` `2026-01-09T08:00`/`2026-01-09T17:00`.
   - warnings `[]`.

   The current code gives b es `2026-01-06T08:00` and d es `2026-01-07T08:00`: B starts before A finishes.
5. `alap-msp-never-before-early-dates`: profile `msp`, settings `S` plus `"mustFinishBy": "2026-01-06T17:00"`.
   - Activities: `a` (A10, 960, ALAP), `b` (B10, 480). Link: r1 a FS→b.
   - Expected: `a` es `2026-01-05T08:00`, ef `2026-01-06T17:00`, ls `2026-01-02T08:00`, lf `2026-01-05T17:00`; `b` es `2026-01-07T08:00`, ef `2026-01-07T17:00`, ls `2026-01-06T08:00`, lf `2026-01-06T17:00`.
   - warnings `["MISSED_MUST_FINISH_BY"]`.

   The current code moves A back to 02.01, before the project start. ALAP delays and never advances.
6. `completed-early-finish-msp`: profile `msp`, settings `{ "projectStart": "2026-01-05T08:00", "statusDate": "2026-01-07T08:00" }`.
   - Activities: `a` (A10, original 1440, remaining 0, completed, actual `2026-01-06T08:00`–`2026-01-06T17:00`), `b` (B10, 480, constraint `{ "type": "start_on_or_after", "date": "2026-01-09T08:00" }`). Link: r1 a FS→b.
   - Expected: `a` es `2026-01-06T08:00`, ef `2026-01-06T17:00`, ls `2026-01-08T08:00`, lf `2026-01-08T17:00`; `b` all four on 09.01 (es/ls `08:00`, ef/lf `17:00`).
   - warnings `[]`.

   The current code gives a ls `2026-01-06T08:00`, because it subtracts the 3 d original duration instead of the 1 d actual span. The existing `completed-late-dates-msp` keeps passing: its original duration equals its actual span.

**1c. `src/engine/__fixtures__/floats.json` and `src/engine/cpm-floats.test.ts`.** Rename the fixture key `"splitFloat"` to `"completedEarly"`; its content is unchanged. After the fix, a completed activity's start float and finish float are always equal, so the fixture can no longer split them. Replace the test `applies totalFloatFormula (finish_float vs min_start_finish) on split start/finish float` (same name) with this. Add `ScheduleProfileId` to the type import and `toMinutes` to the `@/engine/time` import.

```ts
  it('applies totalFloatFormula (finish_float vs min_start_finish) on split start/finish float', () => {
    // No consistent schedule splits start and finish float, so the split is set on the pass output.
    function splitFloatFor(profile: ScheduleProfileId) {
      const doc = makeDocument({
        settings: { ...makeDocument().settings, profile },
        activities: [makeActivity({ id: 'a', code: 'A10', originalDuration: 480 })],
      });
      const compiled = new Map<string, CompiledCalendar>();
      for (const cal of doc.calendars) {
        const res = compileCalendar(cal);
        if ('code' in res) throw new Error(res.message);
        compiled.set(cal.id, res);
      }
      const graphRes = buildGraph(doc);
      if (!graphRes.ok) throw new Error(graphRes.error.message);
      const rules = resolveRules(doc.settings.profile, doc.settings.ruleOverrides);
      const forward = runForwardPass(doc, graphRes.graph, compiled, rules); // 05.01 08:00–17:00
      const backward = runBackwardPass(doc, graphRes.graph, compiled, rules, forward);
      const a = graphRes.graph.indexById.get('a')!;
      backward.ls[a] = toMinutes('2026-01-05T08:00'); // start float 0
      backward.lf[a] = toMinutes('2026-01-07T17:00'); // finish float 2 d
      return computeFloatsAndCriticality(doc, graphRes.graph, compiled, rules, forward, backward)
        .activities.a!;
    }
    expect(splitFloatFor('p6').totalFloat).toBe(960);
    expect(splitFloatFor('msp').totalFloat).toBe(0);
  });

  it('keeps the float of a completed activity that finished early when late dates are recalculated', () => {
    for (const profile of ['p6', 'msp'] as const) {
      const summary = runFullCpm(docFromFixture('completedEarly', { profile }));
      expect(summary.activities.a, profile).toMatchObject({
        lateStart: '2026-01-08T08:00',
        lateFinish: '2026-01-08T17:00',
        totalFloat: 960,
      });
    }
  });
```
The first test passes before and after the fix: it moves the formula check off the buggy fixture. The second fails today: the current code gives `lateStart: '2026-01-06T08:00'` for both profiles (the fixture's `ruleOverrides` makes p6 recalculate too), with TF 0 for msp. `isCritical` is not asserted, because F3 (D11) owns it.

**1d. `src/engine/graph.test.ts`: add three tests.** Add `import { solve } from '@/engine';`.

```ts
  it('leaves LOE activities and their links out of the sort and the cycle check', () => {
    // A FS→ L, L SS→ B, B FS→ A: a loop only through the LOE (as in 6 real XER files).
    const doc = makeDocument({
      activities: [
        makeActivity({ id: 'a', code: 'A10', originalDuration: 480 }),
        makeActivity({ id: 'l', code: 'L10', type: 'level_of_effort', originalDuration: 480 }),
        makeActivity({ id: 'b', code: 'B10', originalDuration: 2400 }),
      ],
      relationships: [
        makeRelationship({ id: 'r1', predecessorId: 'a', successorId: 'l', type: 'FS' }),
        makeRelationship({ id: 'r2', predecessorId: 'l', successorId: 'b', type: 'SS' }),
        makeRelationship({ id: 'r3', predecessorId: 'b', successorId: 'a', type: 'FS' }),
      ],
    });
    const res = buildGraph(doc);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.graph.activityOrder.map((i) => res.graph.nodes[i]!.code)).toEqual(['B10', 'A10', 'L10']);

    const solved = solve(doc, { calculatedAt: '2026-01-05T08:00:00.000Z' });
    expect(solved.ok).toBe(true);
    if (!solved.ok) return;
    expect(solved.summary.activities.b).toMatchObject({ earlyStart: '2026-01-05T08:00', earlyFinish: '2026-01-09T17:00' });
    expect(solved.summary.activities.a).toMatchObject({ earlyStart: '2026-01-12T08:00', earlyFinish: '2026-01-12T17:00' });
    expect(solved.summary.activities.l!.earlyStart).toBe('2026-01-05T08:00');
    expect(solved.summary.warnings.map((w) => w.code)).toEqual(['LOE_UNBOUNDED']);
  });

  it('reports a loop of non-LOE activities with its own path when an LOE hangs off it', () => {
    const doc = makeDocument({
      activities: [
        makeActivity({ id: 'a', code: 'A1010' }),
        makeActivity({ id: 'l', code: 'L1010', type: 'level_of_effort' }),
        makeActivity({ id: 'b', code: 'A1020' }),
        makeActivity({ id: 'c', code: 'A1030' }),
      ],
      relationships: [
        makeRelationship({ id: 'r0', predecessorId: 'a', successorId: 'l', type: 'SS' }),
        makeRelationship({ id: 'r1', predecessorId: 'l', successorId: 'c', type: 'FF' }),
        makeRelationship({ id: 'r2', predecessorId: 'a', successorId: 'b' }),
        makeRelationship({ id: 'r3', predecessorId: 'b', successorId: 'c' }),
        makeRelationship({ id: 'r4', predecessorId: 'c', successorId: 'a' }),
      ],
    });
    const res = buildGraph(doc);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.cycleIds).toEqual(['a', 'b', 'c', 'a']);
    expect(res.error.cycleCodes).toEqual(['A1010', 'A1020', 'A1030', 'A1010']);
    expect(res.error.message).toBe(
      'Circular logic found: A1010 → A1020 → A1030 → A1010. Break the loop to calculate.',
    );
  });

  it('orders LOE activities after every other activity, chained LOEs after their LOE predecessor', () => {
    const doc = makeDocument({
      activities: [
        makeActivity({ id: 'l2', code: 'L20', type: 'level_of_effort' }),
        makeActivity({ id: 'a', code: 'A10' }),
        makeActivity({ id: 'l1', code: 'L10', type: 'level_of_effort' }),
        makeActivity({ id: 'b', code: 'B10' }),
      ],
      relationships: [
        makeRelationship({ id: 'r1', predecessorId: 'a', successorId: 'l1', type: 'SS' }),
        makeRelationship({ id: 'r2', predecessorId: 'l1', successorId: 'l2', type: 'SS' }),
        makeRelationship({ id: 'r3', predecessorId: 'l2', successorId: 'b', type: 'FF' }),
        makeRelationship({ id: 'r4', predecessorId: 'a', successorId: 'b' }),
      ],
    });
    const res = buildGraph(doc);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.graph.activityOrder.map((i) => res.graph.nodes[i]!.code)).toEqual(['A10', 'B10', 'L10', 'L20']);

    const looped = {
      ...doc,
      relationships: [...doc.relationships, makeRelationship({ id: 'r5', predecessorId: 'l2', successorId: 'l1', type: 'FF' })],
    };
    const loopRes = buildGraph(looped);
    expect(loopRes.ok).toBe(true);
    if (!loopRes.ok) return;
    expect(loopRes.graph.activityOrder.map((i) => loopRes.graph.nodes[i]!.code)).toEqual(['A10', 'B10', 'L20', 'L10']);
  });
```

Keep the existing `reports a minimal cycle with spec §5.5 copy` unchanged: it is the pure task loop that must still fail with `A1010 → A1020 → A1030 → A1010`.

On the shapes:
- The controller's literal shape (L SS→B) gives L only start anchors, so `LOE_UNBOUNDED` is expected and L's finish falls back to its stored duration. That is why the test does not assert it.
- The "L spans from its predecessor to its successor" check is backward case 3, which uses L FF→B.
- In the pure-loop test the LOE links are listed first on purpose. Today the DFS follows them and reports `['a', 'l', 'c', 'a']`.

**1e. `src/engine/properties.test.ts`: add two properties.**
- Copy the helper block between `---- BEGIN verbatim ----` and `---- END verbatim ----` from Appendix A of this plan into the test file, above the `describe`. It contains `MIXED_CALENDARS` (standard, 7-day and 4×10), `MIXED_COMPILED`, `MixedSpec`, `mixedSpecArbitrary`, `buildMixedDoc`, `linkSlack` and `withLongerLoes`.
- Extend the imports with what that file imports: the types `ComputedScheduleSummary`, `LagCalendarMode`, `ProgressMode`, `ScheduleCalendar`, `ScheduleDocument`, `ScheduleProfileId`, and `addWorkingMinutes`, `ELAPSED_CALENDAR` and `type CompiledCalendar` from `@/engine/calendar`.

The generator mixes:
- Profiles: p6, msp and default.
- All four lag-calendar modes.
- Retained logic and progress override.
- An optional must-finish-by.
- Tasks, milestones and LOEs.
- Not started, in progress and completed.
- Constraints: SNET, FNET, SNLT, FNLT and ALAP. There are no mandatory constraints, which override logic on purpose.
- FS/SS/FF/SF links with lags -240/0/240/480, some elapsed.

`linkSlack` checks every link between two non-LOE activities whose successor logic places, on the successor's calendar:
- A not-started successor is checked on the bound's own side.
- An in-progress successor under retained logic is checked on its early finish.

```ts
describe('CPM passes keep logic', () => {
  it('satisfies every active non-LOE relationship with the early dates under mixed calendars, constraints and progress', () => {
    fc.assert(
      fc.property(mixedSpecArbitrary, (spec) => {
        const doc = buildMixedDoc(spec);
        const res = solve(doc, { calculatedAt: '2026-01-05T08:00:00.000Z' });
        expect(res.ok).toBe(true);
        if (!res.ok) return;
        for (const link of linkSlack(doc, res.summary)) {
          expect(link.slack, link.relId).toBeGreaterThanOrEqual(0);
        }
      }),
      { numRuns: 200 },
    );
  });

  it('never moves another activity when LOE stored durations change', () => {
    fc.assert(
      fc.property(mixedSpecArbitrary, (spec) => {
        const doc = buildMixedDoc(spec);
        const before = solve(doc, { calculatedAt: '2026-01-05T08:00:00.000Z' });
        const after = solve(withLongerLoes(doc), { calculatedAt: '2026-01-05T08:00:00.000Z' });
        expect(before.ok && after.ok).toBe(true);
        if (!before.ok || !after.ok) return;
        expect(after.summary.projectFinish).toBe(before.summary.projectFinish);
        for (const act of doc.activities) {
          if (act.type === 'level_of_effort') continue;
          const { earlyStart, earlyFinish, lateStart, lateFinish } = before.summary.activities[act.id]!;
          expect(after.summary.activities[act.id], act.id).toMatchObject({ earlyStart, earlyFinish, lateStart, lateFinish });
        }
      }),
      { numRuns: 200 },
    );
  });
});
```
No seed is pinned, as with the existing property. Over 300 seeds, the first failure on the current code came within 97 runs (property 1) and within 43 runs (property 2), so `numRuns: 200` fails reliably today.

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/engine/graph.test.ts src/engine/cpm-forward.test.ts src/engine/cpm-backward.test.ts src/engine/cpm-floats.test.ts src/engine/properties.test.ts`

Expected: `Tests  15 failed | 30 passed (45)` in 5 files. The failures:
- **`graph.test.ts`**: the 3 new tests.
  - LOE loop: `expected false to be true` at `res.ok`.
  - Pure loop: `cycleIds` is `['a','l','c','a']`.
  - Order: `['A10','L10','L20','B10']`.
- **`cpm-forward.test.ts`**: the 2 new cases, with messages `loe-does-not-drive-successors.m2.es` (`2026-01-16T17:00`) and `loe-predecessor-ignored-with-progress.b.ef` (`2026-02-03T17:00`).
- **`cpm-backward.test.ts`**: 7 cases.
  - `alap-msp.b.es` (`2026-01-07T08:00`)
  - `loe-stored-duration-longer-than-span.m1.ls` (`2026-01-12T08:00`)
  - `loe-in-progress-keeps-actual-start.loe.es` (`2026-01-05T08:00`)
  - `loe-link-loop-is-not-a-cycle` (`expected false to be true`)
  - `alap-msp-chain-keeps-logic.b.es` (`2026-01-06T08:00`)
  - `alap-msp-never-before-early-dates.a.es` (`2026-01-02T08:00`)
  - `completed-early-finish-msp.a.ls` (`2026-01-06T08:00`)
- **`cpm-floats.test.ts`**: `keeps the float of a completed activity…` fails, because `lateStart` is `'2026-01-06T08:00'`.
- **`properties.test.ts`**: both new properties fail with a shrunk counterexample.
  - Property 1: a negative slack on an msp ALAP link, for example `rel:0`, -2160.
  - Property 2: `projectFinish` or a date differs.

Every existing test passes, including the reworked formula test.

- [ ] **Step 3: Implement**

`src/engine/graph.ts`, in `buildGraph`:
- Keep building `activeRelationships`, `incoming`/`outgoing`, the edge-index arrays and `edgePredIndex`/`edgeSuccIndex` from every link, exactly as now.
- Replace `outgoingTargets` with two adjacency lists:
  - `drivingTargets`, with `inDegree`, for links whose predecessor and successor are both non-LOE.
  - `loeTargets`, with `loeInDegree`, for links whose two ends are both LOE.

  A link between an LOE and a non-LOE activity goes in neither list.
- Kahn: seed only non-LOE nodes with `inDegree === 0` and walk `drivingTargets`. Success means `orderedCount === nonLoeCount`. Then append the LOE nodes with a second Kahn over `loeTargets` (seed the LOE nodes with `loeInDegree === 0`, reusing `queue` from `tail`). Finally append, in ascending node index, the LOE nodes whose `loeInDegree` is still > 0. Return the graph as now.
- Cycle DFS: before the search, mark every LOE node `state = 2` (the Kahn-ordered nodes already are), and follow `drivingTargets` only. The error object, its message and `cycleIds` with the start node repeated at the end are unchanged.
- Update the docs:
  - `activityOrder` comment: `// topological order of non-LOE nodes over non-LOE links, then LOE nodes ordered by LOE→LOE links`.
  - `buildGraph` JSDoc: add "LOE activities and links touching them take no part in the sort or the cycle check; they never drive other activities".

`src/engine/cpm.ts`:
- **Forward pass.** Rename the body of `runForwardPass` to `function forwardPass(document, graph, calendars, rules, pins: ForwardPins | null): ForwardState`. `runForwardPass(...)` becomes `return forwardPass(document, graph, calendars, rules, null);`. Add the private `ForwardPins` interface (see Interfaces).
- **Skip LOE predecessors in all three incoming-link loops.** Add `if (pred.type === 'level_of_effort') continue;` right after `const pred = graph.nodes[p]!;` in:
  - the completed loop (before `isOutOfSequence`);
  - the in-progress loop (before `resolveLagCalendar` and `isOutOfSequence`);
  - the not-started loop.

  The completed loop goes beyond the review's two loops on purpose: an LOE sets no bound, so it can't be out of sequence (forward case 2).
- **Not-started tail.** Replace `es[u] = finalEs; ef[u] = finalEf;` with: if `pins !== null && pins.mask[u] === 1 && pins.es[u]! > finalEs`, use `pins.es[u]` / `pins.ef[u]`; else use `finalEs` / `finalEf`. `drivers[u] = c2.driver` either way, which keeps the early driver as today.
- **Backward pass.**
  - Extend the first `if` so that `act.type === 'level_of_effort'` also sets `ls[u] = forward.es[u]; lf[u] = forward.ef[u]; continue;`. LOE late dates come only from the post-pass, and LOE nodes now come last in the order, so their successors' late dates are not yet known here.
  - For a completed activity, `backDur` becomes `Math.max(0, workingMinutesBetween(cal, forward.es[u]!, forward.ef[u]!))` instead of `originalDuration`. This branch is reached only under `'recalculate'`.
- **ALAP, replacing the current block 1 of `runPostPasses`.**

```ts
  // 1. ALAP (spec §5.4 step 3): find each delayable ALAP task's target dates, then re-run the
  // forward logic with them as floors, so an ALAP task never starts before its predecessors allow
  // and everything after it is placed from its new dates.
  const n = graph.nodes.length;
  const pins: ForwardPins = { mask: new Uint8Array(n), es: new Int32Array(n), ef: new Int32Array(n) };
  let pinned = false;
  if (rules.alapBehavior === 'to_late_dates') {
    for (let u = 0; u < n; u++) {
      const act = graph.nodes[u]!;
      if (act.status !== 'not_started' || act.type === 'level_of_effort' || !hasAlapConstraint(act)) continue;
      if (backward.lf[u]! <= forward.ef[u]!) continue; // delays only, never advances
      pins.mask[u] = 1;
      pins.es[u] = backward.ls[u]!;
      pins.ef[u] = backward.lf[u]!;
      pinned = true;
    }
  } else {
    // within_free_float: keep the existing reverse-topological loop body unchanged; inside its
    // `if (limitLf > forward.ef[u]!)` block, after setting forward.ef[u] / forward.es[u], add:
    //   pins.mask[u] = 1; pins.es[u] = forward.es[u]!; pins.ef[u] = forward.ef[u]!; pinned = true;
  }
  if (pinned) {
    const rerun = forwardPass(document, graph, calendars, rules, pins);
    forward.es.set(rerun.es);
    forward.ef.set(rerun.ef);
    forward.activeLinkMask.set(rerun.activeLinkMask);
    for (let u = 0; u < n; u++) forward.drivers[u] = rerun.drivers[u]!;
    forward.warnings.length = 0;
    for (let i = 0; i < rerun.warnings.length; i++) forward.warnings.push(rerun.warnings[i]!);
  }
```
  Notes on this block:
  - Late dates are not recomputed: they come from logic and the project finish, and neither moves.
  - With one calendar and no elapsed lags, the P6 re-run reproduces today's dates. `alap-p6` and the oracle ratchet are unchanged.
  - With elapsed lags or mixed calendars, the reverse free-float limit can overshoot. The successor then moves later instead of the link breaking (see Decisions, item 2).
  - The `default` profile keeps `within_free_float`.
- **LOE post-pass.** Replace the `if (act.status === 'in_progress' && act.actualStart !== null)` block with `const actualStartMin = act.status === 'in_progress' && act.actualStart !== null ? toMinutes(act.actualStart) : null;` and `if (actualStartMin !== null) { earliestStart = actualStartMin; hasStart = true; }`. Prefix both start-candidate updates (the incoming SS/FS branch and the outgoing SS branch) with `actualStartMin === null &&`. Iteration stays over `graph.activityOrder`, where LOEs now come last and chained LOEs are in order.
- Update the `runPostPasses` JSDoc: "Mutates `forward` (es, ef, drivers, activeLinkMask, warnings) and `backward` (ls, lf, warnings) in place."

- [ ] **Step 4: Run the checks**

Run: `npx vitest run src/engine/graph.test.ts src/engine/cpm-forward.test.ts src/engine/cpm-backward.test.ts src/engine/cpm-floats.test.ts src/engine/properties.test.ts`
Expected: `Tests  45 passed (45)` in 5 files.

Run: `npm run check`
Expected:
- typecheck passes; lint shows 0 errors (warnings unchanged, 13 at 8d0de4b).
- vitest passes with 14 more tests than before this task and no new files: 180 files / 1035 tests on 8d0de4b, more if F1 or other fix tasks landed first.
- `Contrast OK: 51 checks passed`.
- `Engine TZ check OK: 4 time zones passed`; the engine suite goes from 55 to 69 tests in each zone.
- `oracle.test.ts` passes with the existing pins, and `budget.test.ts` stays within budget.

On Windows this needs F1. Without it, `npm run test:engine:tz` exits 1 silently. In that case run `npx vitest run src/engine` with `TZ` set to each of `UTC`, `America/Los_Angeles`, `Europe/Istanbul` and `Pacific/Auckland` (all must pass).

Run: `npm run test:engine:tz`
Expected: four `Running src/engine tests under TZ=…` blocks, all passing, then `Engine TZ check OK: 4 time zones passed`.

Run: `npm run build`
Expected: `vite build` completes, exit 0.

No UI, database or e2e suites apply. After this lands, the controller reruns `npx tsx scripts/check-cpm-oracle.ts` to confirm that the 6 XER files with LOE loops now calculate.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "fix(engine): keep LOE links out of logic and loops, re-place successors after ALAP, use actual span for completed late dates"
```

**Decisions (2026-11-26):**
1. **ALAP on the `default` profile: within free float** (owner, P4 core D15). §5.4's "late dates (MSP/default)" is corrected to "late dates (MSP)" in the D15 docs commit; the code doesn't change.
2. **P6 ALAP with elapsed lags or mixed calendars: logic is kept and the successor may move later** (98 of 8,031 generated schedules, by up to a lunch break or a weekend). An exact limit needs a definition of free float across two calendars; it is logged in `docs/HANDOFF.md` with the other backward-pass items.
3. **Loops made only of LOE→LOE links calculate** (no `SCHEDULE_CYCLE`); none occurs in the sample files.
4. **An LOE's own late-side constraint raises no `CONSTRAINT_VIOLATED`**: an LOE's dates come only from its links.

---

### Task F3: CPM floats, driving links and criticality

**Fixes:**
- **PR5-2 (important).** `computeFloatsAndCriticality` (cpm.ts 911-940) measures each link from `addWorkingMinutes(lagCal, predAnchor, lag)` on the lag calendar. It skips the snap to the successor's calendar that the forward pass applies (cpm.ts 336-381 for in-progress activities, 420-432 for not-started ones). It also treats `relFreeFloat <= 0` as driving.
  - An elapsed FS 0 link from A (Mon to Fri 17:00) to B (Mon 12.01 08:00) reports `r1 {freeFloat: 3780, isDriving: false}` and A `FF 3780 > TF 0`. B's forward driver is still `r1`. A drops off the longest path, so `traceDrivingPath(B)` returns only `[B]`.
  - The `lagCalendar: 'elapsed_24h'` and "+3 elapsed days from Thursday" variants give the same result (FF 3780 and 900).
  - FF/SF links and finish milestones snap backwards. There an elapsed lag gives a false negative link float (`-480`), which reaches the activity's FF on `msp` or with the floor off.
  - A link into an in-progress activity is measured to its actual start, not to the remaining start that the forward pass bounds. So a status-date-driven activity shows its completed predecessor's link as driving, and a link-driven one shows `-960`.
- **PR5-4 / D11 (owner decision 2026-11-24).** Completed activities are flagged critical (keep_actuals gives TF 0), near-critical (`longest_path` definition) and longest-path. `rollup.ts` then copies that flag into WBS `hasCritical`.
- **PR5-5 / D12 (owner decision 2026-11-24).** An activity with no active successor gets `freeFloat: 0` (cpm.ts 1003). D12 replaces this with the working time from its early finish to the calculated project finish, on its own calendar. Plan 2026-11-20-phase4-core.md Task 14 (line 1624, "or `0` when no successors") is superseded by D12. That old plan is not edited.
- **Same root cause, found by the probes (see Decisions, item 1).** FF > TF also happens on main without elapsed lags. An activity whose only successors are SS/SF gets its FF from the start side. The backward pass bounds its late finish by the project finish (cpm.ts 651-654, the same for every activity), but FF had no such bound. Example: A 3 d with SS 0 to B, where B waits for C 5 d: `A {TF 1440, FF 2400}`. In 1,500 random DAGs of the existing property shape, 274 activities had FF > TF on main. This task applies the same bound to free float, and D12's value is the no-successor case of that rule.

**Spec:**
- P4 core spec §5.4 step 4 (free float, per-relationship `freeFloat` and `isDriving` with "`relFreeFloat === 0` on active forward logic", `isLongestPath`, `isCritical`, `isNearCritical`) and step 5 (rollups `hasCritical`).
- Decisions log D11 and D12.
- §5.4 step 1: the forward pass evaluates links on the resolved lag calendar and snaps the bound per successor branch. The float step now recomputes that exact bound.
- Out of scope: the total float formula. F10 lands after F3 and adds the `'start_float'` `totalFloatFormula`. F3 leaves the `totalFloat` lines (cpm.ts 980-984) exactly as they are and adds no formula.
- Spec text is updated in this task (Step 3) so code and spec agree. The cap sentence in the `freeFloat` bullet is the controller's reading of D12 (2026-11-26): free float never runs past the calculated project finish, so it can't exceed total float; the owner sees it in the plan review.

**Probe evidence.** All values below come from probes run with `npx tsx` from the repo root. Prefix fast-check probes with `NODE_PATH=<repo>/node_modules`. The probes live in `<scratchpad>/`:
- `F3-v2-impl.ts`: the Step 3 code, run against main's passes. Its settings are `setMode('pred')`, `setCap('all')` and `LOE_SPECIAL = true`. It also runs on the passes of the earlier F2 snapshot (`<scratchpad>/F2/cpm-fixed.ts`).
- `F3-v2-cases.ts`: main vs fixed values for every fixture in Step 1, plus the 4 existing `floats.json` fixtures. Existing assertions are unchanged.
- `F3-v2-rollup.ts`: the rollup values.
- `F3-v2-props.ts`: the property shapes. Results are counts of failing activities on main vs fixed, over 3,000 runs:

  | Shape | Check | main | fixed |
  |---|---|---|---|
  | base (existing generator) | FF ≤ TF | 274 failures (1,500 runs) | 0 |
  | elapsed lags + 7-day calendar + p6/msp + finish milestones | driver link not driving | 1,555 failures | 0 |
  | same shape | p6 FF < 0 | 0 | 0 |

  The "fixed" column is also 0 under seeds 7, 2026 and 99991.
- `F3-v2-oracle.ts` and `F3-v2-oracle-detail.ts`: oracle ratchet. Only `two-projects.NTH-A.ff` changes, 0 → 1, both on main's passes and on F2's.
- `F3-v2-budget.ts`: the 10k/15k and 50k/150k solves take about the same time as main (67-89 ms vs 54-102 ms; 429-490 ms vs 307-424 ms).

**Files:**
- Modify:
  - `src/engine/cpm.ts`: new private `forwardLinkBound`, the edge loop, the longest-path walk and the summary loop of `computeFloatsAndCriticality`.
  - `src/engine/rollup.ts`: the `hasCritical` line.
  - `src/features/schedule/rows.ts`: the As imported branch of `buildVisibleRows` (D11 in the grid and the Gantt links).
  - `docs/superpowers/specs/2026-11-20-phase4-core-design.md`: §5.4 lines 446-450 and 453.
- Test:
  - `src/engine/__fixtures__/floats.json`: 11 new keys.
  - `src/engine/cpm-floats.test.ts`: 9 new tests. The helper gains `wbs`.
  - `src/engine/rollup.test.ts`: 2 new tests.
  - `src/features/schedule/rows.test.ts`: 1 new test.
  - `src/engine/properties.test.ts`: 2 new properties.
  - `src/engine/__fixtures__/oracle-ratchet.json`: the NTH-A `ff` pin.
- Unchanged:
  - `runForwardPass`, `runBackwardPass` and `runPostPasses` (F2 owns these).
  - The `totalFloat` formula (F10).
  - `driving.ts`, `index.ts` and all UI except the `rows.ts` line below.
  - Existing assertions in `cpm-floats.test.ts`, `rollup.test.ts`, `cpm-forward.test.ts` and `cpm-backward.test.ts`. The probes re-checked the values these tests assert.

**Interfaces:**
- Consumes (already imported in cpm.ts):
  - `addWorkingMinutes`, `snapForwardToWorkStart`, `snapBackwardToWorkFinish`, `subtractWorkingMinutes`, `workingMinutesBetween` from `@/engine/calendar`
  - `resolveLagCalendar`, `resolveNodeCalendars`
  - `ForwardState`, `BackwardState`, `ResolvedRules`
- Produces:
  - No exported signature changes. `computeFloatsAndCriticality(document, graph, calendars, rules, forward, backward)` and `rollup(document, summary)` keep their signatures and return types. Their callers are `src/engine/index.ts` `solve`, `cpm-floats.test.ts` `runFullCpm`, `client.ts`/`in-thread.ts`/`worker.ts` (rollup) and the probes. None of these change.
  - New module-private helper in `src/engine/cpm.ts`:
    ```ts
    interface ForwardLinkBound {
      /** The link's bound snapped to the successor's calendar exactly as runForwardPass snaps it. */
      readonly bound: number;
      /** The successor date that bound limits: ES, the remaining start of an in-progress activity, or EF. */
      readonly target: number;
      /** False when the successor's dates don't come from forward logic (completed, or level of effort). */
      readonly forwardLogic: boolean;
    }
    function forwardLinkBound(
      rel: ScheduleRelationship,
      rules: ResolvedRules,
      succ: ScheduleActivity,
      succCal: CompiledCalendar,
      lagCal: CompiledCalendar,
      predEs: number,
      predEf: number,
      succEs: number,
      succEf: number,
    ): ForwardLinkBound;
    ```
- Behaviour changes callers will see:
  - `ComputedRelationshipResult.freeFloat` is now measured on the **predecessor's** calendar from the snapped bound. It was measured on the lag calendar from the raw bound.
  - `isDriving` now means `=== 0` (it was `<= 0`). Consequence: `negativeFreeFloat`'s `r1` (into a mandatory-start successor, `-480`) is no longer driving. No test asserts it.
  - Links into completed successors never drive.
  - Activity `freeFloat` is now capped by the time to the project finish (D12).
  - Completed activities are never `isCritical`, `isNearCritical` or `isLongestPath`.
  - `traceDrivingPath` is unchanged. It still walks driving links into completed predecessors (`completedDrivesLongest` trace keeps `a`).

- [ ] **Step 1: Write the failing tests**

**`src/engine/__fixtures__/floats.json`** — add these keys next to the existing four. Every fixture also sets `"projectStart": "2026-01-05T08:00"` and, unless shown otherwise, `"statusDate": "2026-01-05T08:00"`. The fixtures deliberately avoid LOE, ALAP and MSP-completed activities, so the assertions hold whether F2 lands before or after F3.

```json
"elapsedLagOverWeekend": {
  "settings": { "profile": "p6", "projectStart": "2026-01-05T08:00", "statusDate": "2026-01-05T08:00" },
  "activities": [
    { "id": "a", "code": "A10", "originalDuration": 2400 },
    { "id": "b", "code": "B10", "originalDuration": 480 }
  ],
  "relationships": [
    { "id": "r1", "predecessorId": "a", "successorId": "b", "type": "FS", "lagMinutes": 0, "lagElapsed": true }
  ]
},
"elapsedLagCalendarOverWeekend": {
  "settings": { "profile": "p6", "lagCalendar": "elapsed_24h", "projectStart": "2026-01-05T08:00", "statusDate": "2026-01-05T08:00" },
  "activities": [
    { "id": "a", "code": "A10", "originalDuration": 2400 },
    { "id": "b", "code": "B10", "originalDuration": 480 }
  ],
  "relationships": [{ "id": "r1", "predecessorId": "a", "successorId": "b", "type": "FS", "lagMinutes": 0 }]
},
"elapsedLagThreeDays": {
  "settings": { "profile": "p6", "projectStart": "2026-01-05T08:00", "statusDate": "2026-01-05T08:00" },
  "activities": [
    { "id": "a", "code": "A10", "originalDuration": 1920 },
    { "id": "b", "code": "B10", "originalDuration": 480 }
  ],
  "relationships": [
    { "id": "r1", "predecessorId": "a", "successorId": "b", "type": "FS", "lagMinutes": 4320, "lagElapsed": true }
  ]
},
"elapsedFinishLink": {
  "settings": { "profile": "msp", "projectStart": "2026-01-05T08:00", "statusDate": "2026-01-05T08:00" },
  "activities": [
    { "id": "a", "code": "A10", "originalDuration": 960 },
    { "id": "b", "code": "B10", "originalDuration": 480 }
  ],
  "relationships": [
    { "id": "r1", "predecessorId": "a", "successorId": "b", "type": "FF", "lagMinutes": 480, "lagElapsed": true }
  ]
},
"elapsedFinishMilestone": {
  "settings": {
    "profile": "p6",
    "projectStart": "2026-01-05T08:00",
    "statusDate": "2026-01-05T08:00",
    "ruleOverrides": { "freeFloatFloorZero": false }
  },
  "activities": [
    { "id": "a", "code": "A10", "originalDuration": 2400 },
    { "id": "m", "code": "M10", "type": "finish_milestone", "originalDuration": 0 }
  ],
  "relationships": [
    { "id": "r1", "predecessorId": "a", "successorId": "m", "type": "FS", "lagMinutes": 480, "lagElapsed": true }
  ]
},
"inProgressDrivenByLink": {
  "settings": { "profile": "p6", "projectStart": "2026-01-05T08:00", "statusDate": "2026-01-05T08:00" },
  "activities": [
    { "id": "a", "code": "A10", "originalDuration": 960 },
    {
      "id": "b", "code": "B10", "originalDuration": 960, "remainingDuration": 480,
      "status": "in_progress", "actualStart": "2026-01-05T08:00"
    }
  ],
  "relationships": [{ "id": "r1", "predecessorId": "a", "successorId": "b", "type": "FS", "lagMinutes": 0 }]
},
"inProgressDrivenByStatusDate": {
  "settings": { "profile": "p6", "projectStart": "2026-01-05T08:00", "statusDate": "2026-01-08T08:00" },
  "activities": [
    {
      "id": "a", "code": "A10", "originalDuration": 960, "remainingDuration": 0, "status": "completed",
      "actualStart": "2026-01-05T08:00", "actualFinish": "2026-01-06T17:00"
    },
    {
      "id": "b", "code": "B10", "originalDuration": 960, "remainingDuration": 480,
      "status": "in_progress", "actualStart": "2026-01-07T08:00"
    }
  ],
  "relationships": [{ "id": "r1", "predecessorId": "a", "successorId": "b", "type": "FS", "lagMinutes": 0 }]
},
"completedWork": {
  "settings": { "profile": "default", "projectStart": "2026-01-05T08:00", "statusDate": "2026-01-07T08:00" },
  "wbs": [
    { "id": "w1", "parentId": null, "code": "1", "name": "Done", "order": 0 },
    { "id": "w2", "parentId": null, "code": "2", "name": "Open", "order": 1 }
  ],
  "activities": [
    {
      "id": "a", "code": "A10", "wbsId": "w1", "originalDuration": 960, "remainingDuration": 0, "status": "completed",
      "actualStart": "2026-01-05T08:00", "actualFinish": "2026-01-06T17:00"
    },
    { "id": "b", "code": "B10", "wbsId": "w2", "originalDuration": 960 },
    { "id": "c", "code": "C10", "wbsId": "w2", "originalDuration": 4800 }
  ],
  "relationships": [{ "id": "r1", "predecessorId": "a", "successorId": "b", "type": "FS", "lagMinutes": 0 }]
},
"completedDrivesLongest": {
  "settings": { "profile": "p6", "projectStart": "2026-01-05T08:00", "statusDate": "2026-01-07T08:00" },
  "activities": [
    {
      "id": "a", "code": "A10", "originalDuration": 960, "remainingDuration": 0, "status": "completed",
      "actualStart": "2026-01-05T08:00", "actualFinish": "2026-01-06T17:00"
    },
    { "id": "b", "code": "B10", "originalDuration": 2400 },
    { "id": "c", "code": "C10", "originalDuration": 480 }
  ],
  "relationships": [{ "id": "r1", "predecessorId": "a", "successorId": "b", "type": "FS", "lagMinutes": 0 }]
},
"openEnd": {
  "settings": { "profile": "p6", "projectStart": "2026-01-05T08:00", "statusDate": "2026-01-05T08:00" },
  "activities": [
    { "id": "a", "code": "A10", "originalDuration": 2400 },
    { "id": "b", "code": "B10", "originalDuration": 960 }
  ],
  "relationships": []
},
"startToStartOnly": {
  "settings": { "profile": "p6", "projectStart": "2026-01-05T08:00", "statusDate": "2026-01-05T08:00" },
  "activities": [
    { "id": "a", "code": "A10", "originalDuration": 1440 },
    { "id": "b", "code": "B10", "originalDuration": 480 },
    { "id": "c", "code": "C10", "originalDuration": 2400 }
  ],
  "relationships": [
    { "id": "r1", "predecessorId": "a", "successorId": "b", "type": "SS", "lagMinutes": 0 },
    { "id": "r2", "predecessorId": "c", "successorId": "b", "type": "FS", "lagMinutes": 0 }
  ]
}
```

**`src/engine/cpm-floats.test.ts`**
- Import `ScheduleWbsNode` (type) and `solve` from `@/engine`.
- Add `wbs?: ScheduleWbsNode[]` to `FloatFixtureSpec`, and pass `wbs: spec.wbs ?? []` in `docFromFixture`'s `makeDocument` call.
- Add these 9 tests (7 `it` plus a 3-row `it.each`) inside the existing `describe`. The comment above each test gives the main value that makes it fail today.

```ts
  // main: r1 {3780,false} / {3780,false} / {900,false}; a.isLongestPath false; trace ['b'].
  it.each(['elapsedLagOverWeekend', 'elapsedLagCalendarOverWeekend', 'elapsedLagThreeDays'] as const)(
    'marks a link driving when its successor sits at the calendar-snapped bound (%s)',
    (key) => {
      const doc = docFromFixture(key);
      const summary = runFullCpm(doc);
      expect(summary.relationships.r1).toEqual({ freeFloat: 0, isDriving: true });
      expect(summary.activities.a).toMatchObject({ totalFloat: 0, freeFloat: 0, isLongestPath: true });
      expect(summary.activities.b).toMatchObject({ earlyStart: '2026-01-12T08:00', isLongestPath: true });
      expect(traceDrivingPath(doc, summary, 'b')).toEqual({
        activityIds: ['b', 'a'],
        relationshipIds: ['r1'],
        hops: 1,
      });
    },
  );

  // main: r1 {-480,true}, a.freeFloat -480 in both documents.
  it('measures finish-side links and finish milestones from the snapped bound (no false negative free float)', () => {
    const link = runFullCpm(docFromFixture('elapsedFinishLink'));
    expect(link.relationships.r1).toEqual({ freeFloat: 0, isDriving: true });
    expect(link.activities.a!.freeFloat).toBe(0);
    expect(link.activities.b!.earlyFinish).toBe('2026-01-06T17:00');

    const milestone = runFullCpm(docFromFixture('elapsedFinishMilestone'));
    expect(milestone.relationships.r1).toEqual({ freeFloat: 0, isDriving: true });
    expect(milestone.activities.a!.freeFloat).toBe(0);
    expect(milestone.activities.m!.earlyStart).toBe('2026-01-09T17:00');
  });

  // main: byLink r1 {-960,true}; byStatus r1 {0,true}, trace ['b','a'].
  it('measures links into an in-progress activity to its remaining start', () => {
    const byLink = runFullCpm(docFromFixture('inProgressDrivenByLink'));
    expect(byLink.activities.b!.driver).toEqual({ kind: 'predecessor', relationshipId: 'r1', predecessorId: 'a' });
    expect(byLink.relationships.r1).toEqual({ freeFloat: 0, isDriving: true });

    const statusDoc = docFromFixture('inProgressDrivenByStatusDate');
    const byStatus = runFullCpm(statusDoc);
    expect(byStatus.activities.b!.driver).toEqual({ kind: 'actual' });
    expect(byStatus.relationships.r1).toEqual({ freeFloat: 480, isDriving: false });
    expect(traceDrivingPath(statusDoc, byStatus, 'b')).toEqual({ activityIds: ['b'], relationshipIds: [], hops: 0 });
  });

  // main: a {isCritical true}; longest_path a.isNearCritical true; chain a {isCritical true, isLongestPath true}.
  it('never marks completed work critical, near-critical or on the longest path (D11)', () => {
    const byFloat = runFullCpm(docFromFixture('completedWork'));
    expect(byFloat.activities.a).toMatchObject({
      totalFloat: 0,
      isCritical: false,
      isNearCritical: false,
      isLongestPath: false,
    });
    expect(byFloat.activities.c).toMatchObject({ totalFloat: 0, isCritical: true, isLongestPath: true });

    const byPath = runFullCpm(docFromFixture('completedWork', { criticalDefinition: 'longest_path' }));
    expect(byPath.activities.a).toMatchObject({ isCritical: false, isNearCritical: false, isLongestPath: false });

    const chainDoc = docFromFixture('completedDrivesLongest');
    const chain = runFullCpm(chainDoc);
    expect(chain.activities.a).toMatchObject({ isCritical: false, isLongestPath: false });
    expect(chain.activities.b).toMatchObject({ totalFloat: 0, isCritical: true, isLongestPath: true });
    expect(traceDrivingPath(chainDoc, chain, 'b')).toEqual({
      activityIds: ['b', 'a'],
      relationshipIds: ['r1'],
      hops: 1,
    });
  });

  // main: w1.hasCritical true.
  it('never takes a WBS hasCritical from completed work (D11)', () => {
    const res = solve(docFromFixture('completedWork'), { calculatedAt: '2026-01-05T08:00:00.000Z' });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.summary.wbsRollups.w1!.hasCritical).toBe(false);
    expect(res.summary.wbsRollups.w2!.hasCritical).toBe(true);
  });

  // main: b.freeFloat 0 in all three.
  it('gives an open-ended activity free float up to the calculated project finish (D12)', () => {
    for (const profile of ['p6', 'msp'] as const) {
      const summary = runFullCpm(docFromFixture('openEnd', { profile }));
      expect(summary.activities.b, profile).toMatchObject({ totalFloat: 1440, freeFloat: 1440 });
      expect(summary.activities.a, profile).toMatchObject({ totalFloat: 0, freeFloat: 0 });
    }
    const late = runFullCpm(docFromFixture('openEnd', { mustFinishBy: '2026-01-16T17:00' }));
    expect(late.activities.b).toMatchObject({ totalFloat: 3840, freeFloat: 1440 });
    expect(late.activities.a).toMatchObject({ totalFloat: 2400, freeFloat: 0 });
  });

  // main: a.freeFloat 2400 > totalFloat 1440.
  it('caps free float at the working time to the project finish when only start-side links follow', () => {
    const summary = runFullCpm(docFromFixture('startToStartOnly'));
    expect(summary.relationships.r1).toEqual({ freeFloat: 2400, isDriving: false });
    expect(summary.activities.a).toMatchObject({ totalFloat: 1440, freeFloat: 1440 });
    expect(summary.activities.b!.earlyStart).toBe('2026-01-12T08:00');
  });
```

How the values were derived (standard calendar Mon–Fri 08:00–12:00 and 13:00–17:00; checked with `F3-v2-cases.ts`):
- `elapsedLagOverWeekend`: A runs Mon 05 to Fri 09 17:00. Fri 17:00 + 0 elapsed, snapped forward on B's calendar, is Mon 12 08:00, which equals B's ES. So relationship FF = 0 on A's calendar.
- `elapsedLagThreeDays`: Thu 08 17:00 + 72 h is Sun 17:00, which snaps to Mon 08:00.
- `elapsedFinishLink`: Tue 17:00 + 8 h is Wed 01:00. Snapped backward that is Tue 17:00, which equals B's EF.
- `elapsedFinishMilestone` (p6, so it snaps): Fri 17:00 + 8 h snaps back to Fri 17:00, which is M's ES.
- `inProgressDrivenByLink`: the bound is Wed 07 08:00. B's remaining start is EF Wed 17:00 − 480, i.e. Wed 08:00.
- `inProgressDrivenByStatusDate`: the bound is Wed 07 08:00 and the remaining start is the status date, Thu 08 08:00. 480 working minutes lie between them, so B's driver is `actual`.
- `completedWork`:
  - C (10 d) starts at the status date Wed 07 and finishes Tue 20 17:00, which is the project finish.
  - B: TF 3840.
  - A: keep_actuals gives TF 0, but A is completed, so it is not critical.
- `openEnd`: B ends Tue 06 17:00 and the project finish is Fri 09 17:00, which gives 3 d = 1440. With `mustFinishBy` Fri 16, TF is measured to Jan 16 (3840), but FF is still measured to the calculated finish (D12).
- `startToStartOnly`:
  - The SS bound is Mon 05 08:00 and B's ES is Mon 12 08:00, so `r1` has 2400.
  - A's EF is Wed 07 17:00 and the project finish is Mon 12 17:00, which gives 1440.
  - TF = 1440 because the backward pass bounds A's late finish by the project finish.

**`src/engine/rollup.test.ts`** — add 2 tests:

```ts
  // main: hasCritical true.
  it('never sets hasCritical from completed work in as_imported mode (D11)', () => {
    const doc = makeDocument({
      settings: { ...makeDocument().settings, displayMode: 'as_imported' },
      wbs: fixture.wbs,
      activities: [makeActivity(fixture.activities[0]!)],
    });
    const result = rollup(doc, null);
    expect(result.sub1).toEqual({
      start: '2026-01-05T08:00',
      finish: '2026-01-06T17:00',
      durationMinutes: 960,
      percentComplete: 100,
      activityCount: 1,
      hasCritical: false,
    });
    expect(result.root!.hasCritical).toBe(false);
  });

  // main: hasCritical true.
  it('never sets hasCritical from completed work in calculated mode, even from a stale summary (D11)', () => {
    // Build `doc` and `summary` exactly as in 'uses summary.activities dates and criticality when in calculated mode',
    // but set `summary.activities.a.isCritical` to `true` (a is the completed activity).
    const result = rollup(doc, summary);
    expect(result.sub1).toMatchObject({ activityCount: 2, percentComplete: 40, hasCritical: false });
    expect(result.root!.hasCritical).toBe(false);
  });
```

The existing as_imported test keeps `sub1.hasCritical: true`, because B is not started and has source TF 0.

**`src/engine/properties.test.ts`** — add 2 tests to the existing `describe`. Import `LagCalendarMode` (type) from `@/data/schedule-types`.

```ts
  it('keeps free float between zero and total float on working-calendar lags (p6, D12)', () => {
    fc.assert(
      fc.property(dagArbitrary, (spec) => {
        const doc = buildDocFromDag(spec);
        const res = solve(doc, { calculatedAt: '2026-01-05T08:00:00.000Z' });
        expect(res.ok).toBe(true);
        if (!res.ok) return;
        for (const act of doc.activities) {
          const comp = res.summary.activities[act.id]!;
          expect(comp.freeFloat, act.id).toBeGreaterThanOrEqual(0);
          expect(comp.freeFloat, act.id).toBeLessThanOrEqual(comp.totalFloat);
        }
      }),
      { numRuns: 100 },
    );
  });
```

```ts
const sevenDayCalendar = makeStandardCalendar('cal:7d', {
  name: 'Seven day',
  week: Array.from({ length: 7 }, () => [
    { start: 480, finish: 720 },
    { start: 780, finish: 1020 },
  ]),
  hoursPerWeek: 56,
});

interface LagDagSpec {
  durations: number[];
  sevenDay: boolean[];
  edges: Array<{ u: number; v: number; type: RelationshipType; lagMinutes: number; lagElapsed: boolean }>;
  profile: 'p6' | 'msp';
  lagCalendar: LagCalendarMode;
}

const lagDagArbitrary: fc.Arbitrary<LagDagSpec> = fc.integer({ min: 2, max: 14 }).chain((n) =>
  fc.record({
    durations: fc.array(fc.constantFrom(0, 240, 480, 960, 1440), { minLength: n, maxLength: n }),
    sevenDay: fc.array(fc.boolean(), { minLength: n, maxLength: n }),
    edges: fc.array(
      fc
        .tuple(
          fc.integer({ min: 0, max: n - 2 }),
          fc.integer({ min: 1, max: n - 1 }),
          fc.constantFrom<RelationshipType>('FS', 'SS', 'FF', 'SF'),
          fc.constantFrom(-240, 0, 240, 480, 1440),
          fc.boolean(),
        )
        .filter(([u, v]) => u < v)
        .map(([u, v, type, lagMinutes, lagElapsed]) => ({ u, v, type, lagMinutes, lagElapsed })),
      { minLength: 0, maxLength: n * 2 },
    ),
    profile: fc.constantFrom<'p6' | 'msp'>('p6', 'msp'),
    lagCalendar: fc.constantFrom<LagCalendarMode>('predecessor', 'successor', 'elapsed_24h', 'project_default'),
  }),
);

function buildDocFromLagDag(spec: LagDagSpec) {
  const activities = spec.durations.map((dur, i) =>
    makeActivity({
      id: `act:${i}`,
      code: `A${String(i + 1).padStart(3, '0')}`,
      type: dur === 0 ? (i % 2 === 0 ? 'start_milestone' : 'finish_milestone') : 'task',
      originalDuration: dur,
      remainingDuration: dur,
      calendarId: spec.sevenDay[i] ? 'cal:7d' : 'cal:standard',
    }),
  );
  const seen = new Set<string>();
  const relationships: ScheduleRelationship[] = [];
  for (const e of spec.edges) {
    const key = `${e.u}:${e.v}:${e.type}`;
    if (seen.has(key)) continue;
    seen.add(key);
    relationships.push(
      makeRelationship({
        id: `rel:${relationships.length}`,
        predecessorId: `act:${e.u}`,
        successorId: `act:${e.v}`,
        type: e.type,
        lagMinutes: e.lagMinutes,
        lagElapsed: e.lagElapsed,
      }),
    );
  }
  return makeDocument({
    calendars: [makeStandardCalendar('cal:standard'), sevenDayCalendar],
    settings: {
      ...makeDocument().settings,
      profile: spec.profile,
      lagCalendar: spec.lagCalendar,
      projectStart: '2026-01-05T08:00',
      statusDate: '2026-01-05T08:00',
    },
    activities,
    relationships,
  });
}
```

```ts
  // FF <= TF is not asserted here. With elapsed lags or mixed calendars the backward pass is not an
  // exact mirror of the forward pass (it can even give negative TF with no constraint), so the
  // FF <= TF property is pinned only on working-calendar lags above.
  it('marks every forward driver link driving and floors p6 free float at zero across elapsed lags, lag calendars and two calendars (PR5-2)', () => {
    fc.assert(
      fc.property(lagDagArbitrary, (spec) => {
        const doc = buildDocFromLagDag(spec);
        const res = solve(doc, { calculatedAt: '2026-01-05T08:00:00.000Z' });
        expect(res.ok).toBe(true);
        if (!res.ok) return;
        for (const act of doc.activities) {
          const comp = res.summary.activities[act.id]!;
          if (spec.profile === 'p6') expect(comp.freeFloat, act.id).toBeGreaterThanOrEqual(0);
          if (comp.driver.kind === 'predecessor') {
            expect(
              res.summary.relationships[comp.driver.relationshipId]!.isDriving,
              `${act.id} is driven by ${comp.driver.relationshipId}`,
            ).toBe(true);
          }
        }
      }),
      { numRuns: 100 },
    );
  });
```

**`src/engine/__fixtures__/oracle-ratchet.json`** — change `"two-projects.NTH-A"` `"ff": 0` to `"ff": 1`. Every other pin stays. Reason:
- D12 now gives the open-ended finish milestone A1040 (EF 27.10 12:00, project finish 27.10 17:00) `freeFloat 240`.
- The synthetic `two-projects.xer` writes 0 in every float column, so that 0 is not P6 output.
- `legacy-p6.ff` stays 2. The mismatching set changes from {L1010, L1020} to {L1010, L1030}.
- `project.ff` stays 0.
- The F2 snapshot's passes give the same pins.

`src/features/schedule/rows.test.ts`: add `'never marks a completed activity critical in As imported mode (D11)'`:
```ts
const imported = (totalFloat: number) => ({
  planned: { start: '2026-01-05T08:00', finish: '2026-01-09T17:00' },
  early: { start: '2026-01-05T08:00', finish: '2026-01-09T17:00' },
  late: { start: '2026-01-05T08:00', finish: '2026-01-09T17:00' },
  remaining: { start: null, finish: null },
  totalFloat,
  freeFloat: 0,
});
const doc = makeDocument({
  settings: {
    ...makeDocument().settings,
    displayMode: 'as_imported',
    criticalThresholdMinutes: 0,
    nearCriticalThresholdMinutes: 4800,
  },
  activities: [
    makeActivity({
      id: 'done', code: 'A1000', order: 0, status: 'completed',
      actualStart: '2026-01-05T08:00', actualFinish: '2026-01-09T17:00', sourceDates: imported(0),
    }),
    makeActivity({ id: 'late', code: 'A1005', order: 1, status: 'completed',
      actualStart: '2026-01-05T08:00', actualFinish: '2026-01-09T17:00', sourceDates: imported(2400) }),
    makeActivity({ id: 'open', code: 'A1010', order: 2, sourceDates: imported(0) }),
  ],
});
const byKey = new Map(buildVisibleRows(doc, null, {}, new Set()).map((r) => [r.key, r]));
expect(byKey.get('act:done')).toMatchObject({ isCritical: false, isNearCritical: false });
expect(byKey.get('act:late')).toMatchObject({ isCritical: false, isNearCritical: false });
expect(byKey.get('act:open')).toMatchObject({ isCritical: true, isNearCritical: false });
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/engine/cpm-floats.test.ts src/engine/rollup.test.ts src/engine/properties.test.ts src/engine/oracle.test.ts src/features/schedule/rows.test.ts`

Expected: FAIL. Only the new tests and the NTH-A pin fail. Every pre-existing test passes:
- `cpm-floats.test.ts` (9 failures):
  - All three `it.each` rows: `r1` is `{ freeFloat: 3780, isDriving: false }` (twice) and `{ freeFloat: 900, isDriving: false }`.
  - Finish-side: `r1` is `{ freeFloat: -480, isDriving: true }`.
  - In-progress: `r1` is `{ freeFloat: -960, isDriving: true }`.
  - D11: `a.isCritical` is `true`.
  - WBS: `w1.hasCritical` is `true`.
  - D12: `b.freeFloat` is `0`.
  - Cap: `a.freeFloat` is `2400`.
- `rollup.test.ts`: the 2 new tests fail with `hasCritical: true`.
- `rows.test.ts`: `act:done` has `isCritical: true` and `act:late` `isNearCritical: true`.
- `properties.test.ts`:
  - The new driver property gives a counterexample with an elapsed lag ("act:N is driven by rel:M": expected false to be true).
  - The FF ≤ TF property gives a counterexample with an SS/SF-only successor. On main, 274 activities across 1,500 DAGs fail, so 100 runs find one.
- `oracle.test.ts`: `two-projects.NTH-A.ff improved — lower the ratchet pin in oracle-ratchet.json` (expected 0 to be 1).

- [ ] **Step 3: Implement**

**`src/engine/cpm.ts`**
1. Add `ForwardLinkBound` and `forwardLinkBound` (signature in Interfaces) just above `formatFloatDays`. Body, with each branch copying `runForwardPass`:
   ```ts
   const anchor = rel.type === 'FS' || rel.type === 'FF' ? predEf : predEs;
   const raw = addWorkingMinutes(lagCal, anchor, rel.lagMinutes);
   const startSide = rel.type === 'FS' || rel.type === 'SS';
   const isStartMs = succ.type === 'start_milestone';
   const isFinishMs = succ.type === 'finish_milestone';
   const remDur = isStartMs || isFinishMs ? 0 : Math.max(0, succ.remainingDuration);

   // Dates of completed and level-of-effort activities don't come from forward logic.
   if (succ.status === 'completed' || succ.type === 'level_of_effort') {
     return startSide
       ? { bound: snapForwardToWorkStart(succCal, raw), target: succEs, forwardLogic: false }
       : { bound: snapBackwardToWorkFinish(succCal, raw), target: succEf, forwardLogic: false };
   }
   if (succ.status === 'in_progress') {
     // runForwardPass in-progress branch: start-side links bound the remaining start.
     if (startSide) {
       const remainingStart = remDur > 0 ? subtractWorkingMinutes(succCal, succEf, remDur) : succEf;
       return { bound: snapForwardToWorkStart(succCal, raw), target: remainingStart, forwardLogic: true };
     }
     return { bound: snapBackwardToWorkFinish(succCal, raw), target: succEf, forwardLogic: true };
   }
   if (isFinishMs) {
     return {
       bound: rules.finishMilestoneOnPredFinish ? raw : snapBackwardToWorkFinish(succCal, raw),
       target: succEs,
       forwardLogic: true,
     };
   }
   if (isStartMs || remDur === 0 || startSide) {
     return { bound: snapForwardToWorkStart(succCal, raw), target: succEs, forwardLogic: true };
   }
   return { bound: snapBackwardToWorkFinish(succCal, raw), target: succEf, forwardLogic: true };
   ```
   Doc comment: "The forward pass's bound for one link, recomputed for floats and driving (spec §5.4 step 4). The `TRUNCATED_LEAD` clamp is left out on purpose. A clamped lead never becomes the driver, and its float is measured from the unclamped bound. If `runForwardPass` changes how it snaps a link, change this helper too."
2. Edge loop: replace cpm.ts 917-935 with:
   ```ts
   const predCal = nodeCalendars[u]!;
   const succCal = nodeCalendars[s]!;
   const lagCal = resolveLagCalendar(rel, document.settings, predCal, succCal, defaultCal);
   const link = forwardLinkBound(rel, rules, succ, succCal, lagCal, forward.es[u]!, forward.ef[u]!, forward.es[s]!, forward.ef[s]!);
   const relFreeFloat = workingMinutesBetween(predCal, link.bound, link.target);
   const active =
     forward.activeLinkMask[edgeIdx] === 1 && pred.type !== 'level_of_effort' && succ.type !== 'level_of_effort';
   const isDriving = active && link.forwardLogic && relFreeFloat === 0;
   ```
   The rule:
   - Relationship free float is measured on the **predecessor's** calendar, from the snapped bound to the target. That way the activity's FF (the minimum of these) is in its own calendar's minutes, as D12 asks, and is formatted with its own `hoursPerDay`.
   - `isDriving` is `=== 0`, as spec §5.4 says (it was `<= 0`).
3. Longest path: seed only nodes that are neither LOE nor `status === 'completed'`. In the walk, skip a predecessor `p` when it is LOE or completed. Never mark it and never push it, so the walk stops at completed work (D11).
4. Summary loop:
   - Replace the `minFf` block (cpm.ts 993-1006) inside the existing non-LOE / non-keep_actuals `else`:
     ```ts
     // D12: with no active successor, free float is the working time to the calculated project finish.
     // That is also its upper bound, as the backward pass bounds every late finish by the project finish.
     freeFloat = workingMinutesBetween(cal, actEf, backward.projectFinish);
     const outEdges = graph.outgoingEdgeIndices[u]!;
     for (let j = 0; j < outEdges.length; j++) {
       const edgeIdx = outEdges[j]!;
       if (forward.activeLinkMask[edgeIdx] !== 1) continue;
       const s = graph.edgeSuccIndex[edgeIdx]!;
       if (graph.nodes[s]!.type === 'level_of_effort') continue;
       const ff = edgeFreeFloat[edgeIdx]!;
       if (ff < freeFloat) freeFloat = ff;
     }
     if (rules.freeFloatFloorZero && freeFloat < 0) freeFloat = 0;
     ```
     LOE and keep_actuals-completed activities keep `freeFloat = 0`. `backward.projectFinish` is the forward `max EF`, not `mustFinishBy`.
   - Criticality:
     ```ts
     const completed = act.status === 'completed';
     const isCritical = !completed && (criticalDefinition === 'longest_path' ? longest : totalFloat <= criticalThresholdMinutes);
     const isNearCritical = !completed && !isCritical && totalFloat <= nearCriticalThresholdMinutes;
     ```
     `totalFloat`, `NEGATIVE_FLOAT` and the `totalFloat` formula lines stay as they are (F10 edits them next).

**`src/engine/rollup.ts`**: replace `if (isCritical) acc.hasCritical = true;` with `if (isCritical && act.status !== 'completed') acc.hasCritical = true;`. This is the D11 rule in both display modes. In calculated mode it also covers stored summaries computed before this fix.

**`src/features/schedule/rows.ts`**, the As imported branch of `buildVisibleRows`: with `const completed = act.status === 'completed';`, `isCritical = !completed && totalFloat !== null && totalFloat <= criticalThresholdMinutes` and `isNearCritical = !completed && !isCritical && totalFloat !== null && totalFloat <= nearCriticalThresholdMinutes`. The calculated branch keeps reading the summary.

**`docs/superpowers/specs/2026-11-20-phase4-core-design.md`** §5.4. Replace lines 446-450 and extend line 453:
- 446 `freeFloat`: "smallest working-minute gap, on the activity's calendar, to any active non-LOE successor's early bound (the per-relationship `freeFloat`). It is never more than the working time from its early finish to the calculated project finish (`max EF`, not `mustFinishBy`), and with no active successor it is that time (D12). Floored at 0 when `rules.freeFloatFloorZero`."
- 447: "Per-relationship `freeFloat` and `isDriving`:
  - The link's bound is computed exactly as the forward pass computes it: the lag on the resolved lag calendar, then snapped to the successor's calendar by the successor's branch (start/finish milestone, zero duration, FS/SS start bound, FF/SF finish bound, in-progress remaining start). The `TRUNCATED_LEAD` clamp is not applied.
  - `freeFloat` is the working minutes on the predecessor's calendar from that bound to the successor date it limits.
  - `isDriving` is `relFreeFloat === 0` on active forward logic. Links into completed or level-of-effort activities never drive."
- 448: append "Completed activities are never on the longest path and the walk stops at them (D11)."
- 449 and 450: prefix each with "a completed activity is never critical / near-critical (D11);".
- 453: append "`hasCritical` ignores completed activities in both modes (D11)."

- [ ] **Step 4: Run the checks**

Run: `npm run check && npm run test:engine:tz && npm run build`

Expected:
- `npm run check`: typecheck and lint are clean, and Vitest is all green, including:
  - the 9 new `cpm-floats` tests;
  - the 2 new rollup tests;
  - the 2 new properties;
  - the oracle ratchet with NTH-A `ff: 1`.

  Contrast passes. The engine suite passes in all 4 time zones: 13 files and 55 tests per zone at 8d0de4b, plus these 13 and any that other fix tasks add.
- `npm run test:engine:tz`: prints `Running src/engine tests under TZ=…` four times with no failure and exits 0.
- `npm run build`: succeeds.
- On Windows, `npm run check` needs F1 (the timezone runner spawn fix) first. Without it, `test:engine:tz` exits 1 silently right after the UTC line.
- If a test fails:
  - Re-run its fixture through `F3-v2-cases.ts` and compare the values.
  - The engine-only change needs no e2e, `test:db` or `test:integration` (e2e only toggles the Critical/Driving path buttons).

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "fix: measure floats and driving links from the forward pass bounds and keep completed work off the critical path"
```

**Decisions for this task (controller, 2026-11-26):**
1. **Free float cap: kept.** Free float is never more than the working time to the calculated project finish. This is the controller's reading of D12, stated in the plan for the owner's review. Without it, FF > TF (274 cases in 1,500 base DAGs).
2. **Elapsed lags on finish-side links in the backward pass: a follow-up, not this plan.** `reverseLinkFinishBound` doesn't mirror the forward snap for elapsed lags, giving `elapsedFinishLink` A `TF -420` and a false `NEGATIVE_FLOAT`; mixed calendars give similar late-date imprecision. Logged in `docs/HANDOFF.md` with the other backward-pass items. F3 asserts FF ≤ TF only on working-calendar lags because of it.
3. **Choices where the spec is silent: accepted as written.** Links into completed or LOE successors never drive. A link into an in-progress activity is measured to its remaining start. Negative relationship float is not driving. Relationship FF is on the predecessor's calendar.
4. **D11 in the grid's As imported mode: in this task** (`rows.ts`, Step 1's rows test).

---

### Task F10: Read P6 scheduling options from XER files

**Fixes:** PR3-2 (XER scheduling options other than progress mode and lag calendar are dropped, and `fromImportModel` hard-codes `ruleOverrides: {}`, `criticalDefinition: 'total_float'`, `criticalThresholdMinutes: 0`); PR3-1 (P6 "Actual Dates" is turned into Retained logic and nothing records it).

**Spec:** P4 core D14 (owner, 2026-11-24); P4 core §4.1 (`ScheduleSettings`, materialization), §5.1 (profile registry), §7.2 (Settings popover); P3 core §5.8 compatibility rule and D44 (additive reader change, each golden model change raises `PARSER_VERSION`), D69 (options come from the project's `SCHEDOPTIONS` row, else `PROJECT`).

**Decisions this task pins** (D14 leaves them to the plan):

| P6 option | Field read (`SCHEDOPTIONS` row, else `PROJECT`) | Values | Document effect |
|---|---|---|---|
| Total float type | `sched_float_type` | `FT_FF` (finish float) · `FT_SS` (start float); the smallest-of-both value is not in the sample collection | `FT_FF` → `ruleOverrides.totalFloatFormula: 'finish_float'`; `FT_SS` → `ruleOverrides.totalFloatFormula: 'start_float'`, a new engine formula (total float = late start − early start in working time on the activity's calendar); any other value → no override and no note (stored as written) |
| Open ends critical | `sched_open_critical_flag` | `Y` / `N` | No engine rule. `Y` → note `p6_open_ends_critical`; open-ended activities keep their float to the project finish |
| SS lag from early start | `sched_lag_early_start_flag` | `Y` = early start (all 65 sample files), `N` = actual start | **Recorded only.** The engine counts an SS lag from an in-progress predecessor's actual start, floored at the status date. A probe over the 56 SS links from an in-progress predecessor (single predecessor, unstarted unconstrained successor) in the sample files, all with `Y`, found P6's stored early start equal to that rule in 23 cases, equal to "status date + full lag" in 2, and to neither in 30 (stale dates or calendars; left to the fidelity follow-up). `Y` therefore needs no note; `N` gives the same dates for these links. No override, no note |
| Use expected finish | `sched_use_expect_end_flag` | `Y` / `N` | **Recorded only, never honoured.** The `ImportModel` carries no expected finish dates (P3 core §5.4: "Expected finish is not used"; `XER_EXPECTED_FINISH` already warns per file with the count of activities that have one). No override, no note: P6 ticks this option by default, so a note would sit on almost every P6 import |
| Critical path definition | `critical_path_type` | `CT_TotFloat` · `CT_DrivPath` | `CT_DrivPath` → `criticalDefinition: 'longest_path'`; anything else or absent → `'total_float'` |
| Critical threshold | `critical_drtn_hr_cnt` | hours as written, e.g. `0`, `40`, `1.5` | `criticalThresholdMinutes = Math.round(hours × 60)`; text that isn't a plain number → `0` |
| Progress mode (existing key `progress_mode`) | `sched_retained_logic`, `sched_progress_override` | `retained_logic` · `progress_override` · `actual_dates` | unchanged mapping; `actual_dates` → `progressMode: 'retained_logic'` **and** note `p6_actual_dates` |

- **Reader keys.** The six fields are added under their own P6 names, values as written (like `sched_calendar_on_relationship_lag`), each only when the row has the field, **appended after** the existing keys in the fixed order of the table above. Existing keys and their order stay as they are, so a golden changes only by the new entries.
- **How the document notes a substitution.** A new optional field `ScheduleSettings.sourceNotes?: ScheduleSourceNote[]` (codes, not copy), set by `fromImportModel` only when at least one note applies (absent otherwise, so every existing snapshot, literal and test document stays valid with no codec or migration change). The Settings popover renders the notes as a "From the file" list. Notes record what the file asked for at import; later settings edits don't change them. Copy is proposed here; the owner confirms it when reviewing this plan.
- **Values seen in real files (controller, 2026-11-26).** In the owner's 73 sample XER files (public data, P3 D70), `SCHEDOPTIONS.sched_float_type` is `FT_FF` in 62 rows and `FT_SS` in 3; `sched_open_critical_flag` is `N`, `sched_lag_early_start_flag` `Y`, `sched_use_expect_end_flag` `Y` (one `N`); `PROJECT.critical_path_type` is `CT_TotFloat` (74) or `CT_DrivPath` (4) and `critical_drtn_hr_cnt` a number. 10 files have no `SCHEDOPTIONS` table. The smallest-of-both token never appears, so it is not mapped until a real file shows it (owner checklist, V9).
- **Override rule.** A stated, mappable float type always becomes an override (also `FT_FF`, which equals the P6 default), so the file's choice survives a later profile switch. Every other `ruleOverrides` field stays unset.
- **What does not change.** Schedules already materialized keep their stored settings (no re-materialization). P3-era imports pick up the options when they first open (`fromImportModel` runs then). MSPDI, CSV and xlsx materialize exactly as before. `ImportModel` keeps its shape and `schemaVersion: 1`.
- **Goldens.** Only `legacy-p6` changes (its `SCHEDOPTIONS` row already has `sched_use_expect_end_flag Y`). `two-projects.xer` has none of the six fields, so `two-projects.NTH-A`/`NTH-B` goldens don't change. A golden model changes, so `PARSER_VERSION` goes `'1.0.0'` → `'1.1.0'` (additive, P3 §5.8). `oracle-ratchet.json` doesn't change: the legacy document gets no override or note.

**Files:**
- Modify: `src/import/xer/read.ts` (`settingsOf`), `src/import/version.ts`, `src/data/schedule-types.ts`, `src/engine/profiles.ts`, `src/engine/cpm.ts`, `src/engine/materialize.ts`, `src/features/schedule/ScheduleSettingsPopover.tsx`
- Regenerate (via `npm run goldens`, never by hand): `src/import/__fixtures__/legacy-p6.model.json`, `src/import/__fixtures__/legacy-p6.report.json`
- Test: `src/import/xer/read.test.ts` (2 updated, 1 new), `src/import/index.test.ts` (version literal), `src/engine/cpm-floats.test.ts` (1 new), `src/engine/materialize.test.ts` (3 new), `src/features/schedule/ScheduleSettingsPopover.test.tsx` (1 new)

**Interfaces:**
- Consumes: `settingsOf(project: Row, options: Row | undefined): Array<{ key: string; value: string }>` and its `optionRow(field)` (read.ts ~942); `ProfileRuleOverrides`, `CriticalDefinition` (`src/data/schedule-types.ts`); `resolveRules` (unchanged; reads `ruleOverrides` as today).
- Produces:
  - `src/import/xer/read.ts`: XER `model.settings` gains, in this order after the four `PROJECT` flags: `sched_float_type`, `sched_open_critical_flag`, `sched_lag_early_start_flag`, `sched_use_expect_end_flag`, `critical_path_type`, `critical_drtn_hr_cnt`. `settingsOf`'s signature is unchanged.
  - `src/import/version.ts`: `export const PARSER_VERSION = '1.1.0';`
  - `src/data/schedule-types.ts`:
    ```ts
    /** A P6 scheduling option the engine can't calculate as the file asks, noted at import (P4 core D14). */
    export type ScheduleSourceNote = 'p6_actual_dates' | 'p6_open_ends_critical';
    // ProfileRuleOverrides.totalFloatFormula gains 'start_float':
    totalFloatFormula?: 'finish_float' | 'min_start_finish' | 'start_float';
    // ScheduleSettings gains, after autoCalculate:
      /** Source options calculated differently from the file (D14); absent when there are none. */
      sourceNotes?: ScheduleSourceNote[];
    ```
  - `src/engine/profiles.ts`: `ResolvedRules.totalFloatFormula: 'finish_float' | 'min_start_finish' | 'start_float'` (profile defaults unchanged).
  - `src/engine/cpm.ts` (`computeFloatsAndCriticality`): `'start_float'` → `totalFloat = workingMinutesBetween(cal, actEs, actLs)`; the other two formulas unchanged.
  - `src/engine/materialize.ts`: `fromImportModel` keeps its signature. The private `resolveProfileSettings(model)` also returns `ruleOverrides: ProfileRuleOverrides`, `criticalDefinition: CriticalDefinition`, `criticalThresholdMinutes: number`, `sourceNotes: ScheduleSourceNote[]`.
  - Affected callers: none change. `src/engine/client.ts`, `src/test/fakes.ts` and `src/engine/oracle.test.ts` call `fromImportModel` as before. `commands.ts` `updateScheduleSettings` (a `Partial<ScheduleSettings>`) and `CALCULATION_SETTING_KEYS` stay as they are: `sourceNotes` is not a calculation key. `src/data/mock/seed.ts`, `src/test/fakes.ts` and `src/engine/testing.ts` build settings without the optional field. `ReportView` lists the new keys through its existing "Scheduling settings" line, with no copy change.

- [ ] **Step 1: Write the failing tests**

`src/import/xer/read.test.ts`, in `describe('readXer readings from real exports (D68, D69)')`:
- Update `'reads the calendars, options and link types of an older P6 export'`: `model.settings` toEqual
  `[{ key: 'progress_mode', value: 'progress_override' }, { key: 'sched_calendar_on_relationship_lag', value: 'rcal_Predecessor' }, { key: 'sched_use_expect_end_flag', value: 'Y' }]`.
- Update `"reads the options from the project's own SCHEDOPTIONS row over PROJECT"`: the same three entries. Project 201's row says `Y` and the other project's row, listed first, says `N`, so the test now also proves that row isn't read for the new key.
- Add `'reads the P6 calculation options from SCHEDOPTIONS, else PROJECT, after the existing keys (P4 D14)'`:
  ```ts
  const parsed = legacyFile();
  Object.assign(parsed.tables.get('SCHEDOPTIONS')!.rows[0]!, {
    sched_float_type: 'FT_FF',
    sched_open_critical_flag: 'Y',
    sched_lag_early_start_flag: 'N',
  });
  // PROJECT also carries two of them: SCHEDOPTIONS wins. The critical path fields are PROJECT's only.
  Object.assign(parsed.tables.get('PROJECT')!.rows[0]!, {
    sched_float_type: 'FT_SS',
    sched_lag_early_start_flag: 'Y',
    critical_path_type: 'CT_DrivPath',
    critical_drtn_hr_cnt: '40',
  });
  expect(readXer(parsed, '201').model.settings).toEqual([
    { key: 'progress_mode', value: 'progress_override' },
    { key: 'sched_calendar_on_relationship_lag', value: 'rcal_Predecessor' },
    { key: 'sched_float_type', value: 'FT_FF' },
    { key: 'sched_open_critical_flag', value: 'Y' },
    { key: 'sched_lag_early_start_flag', value: 'N' },
    { key: 'sched_use_expect_end_flag', value: 'Y' },
    { key: 'critical_path_type', value: 'CT_DrivPath' },
    { key: 'critical_drtn_hr_cnt', value: '40' },
  ]);
  // A file without the fields reads as before (the existing PROJECT-fallback test keeps NTH-A's six entries).
  ```
  The existing `'falls back to PROJECT for an option SCHEDOPTIONS lacks'` stays unchanged and must still pass: NTH-A keeps exactly its six entries.

`src/import/index.test.ts`, `'refuses with the detection message and never throws'`: `parserVersion: '1.1.0'`. Leave the other `'1.0.0'` literals in `copy-details.test.ts`, `ImportScheduleDialog.test.tsx` and `xlsx-export.test.ts` alone: they are inputs, not parser output.

`src/engine/cpm-floats.test.ts`: add `'applies totalFloatFormula start_float (P4 D14)'`: `runFullCpm(docFromFixture('splitFloat', { profile: 'p6', ruleOverrides: { totalFloatFormula: 'start_float' } })).activities.a!.totalFloat` toBe `0` (the fixture's finish float is 960 and the MSP minimum 0, so its start float is 0); with `ruleOverrides: {}` it stays `960`.

`src/engine/materialize.test.ts`: add `import { solve } from '@/engine';` and a `describe('XER scheduling options (P4 D14)')` block with these helpers:
```ts
const BASE = [
  { key: 'progress_mode', value: 'progress_override' },
  { key: 'sched_calendar_on_relationship_lag', value: 'rcal_Predecessor' },
];
/** legacy-p6 with its settings replaced (and an optional patch), materialized at status 2026-03-20. */
function legacyDoc(extra: Array<{ key: string; value: string }>, patch?: (m: ImportModel) => void) {
  const model = loadModel('legacy-p6.model.json');
  model.settings = [...BASE, ...extra];
  patch?.(model);
  return fromImportModel(model, { scheduleStatusDate: '2026-03-20' });
}
function solved(doc: ScheduleDocument) {
  const res = solve(doc, { calculatedAt: '2026-01-05T08:00:00.000Z' });
  if (!res.ok) throw new Error(res.error.message);
  return res.summary.activities;
}
```
(`legacy-p6` ids: `act:00001` = L1010 in progress, `act:00002` = L1020, `act:00003` = L1030 with no successors. No assertion uses the completed L1000, so the D11 and D12 fixes can't disturb these values.)

1. `'maps the file's total float type, critical path type and threshold (D14)'`:
   - `legacyDoc([{sched_float_type:'FT_FF'},{critical_path_type:'CT_DrivPath'},{critical_drtn_hr_cnt:'40'}])` (each as `{ key, value }`) → `settings.ruleOverrides` toEqual `{ totalFloatFormula: 'finish_float' }`, `criticalDefinition` `'longest_path'`, `criticalThresholdMinutes` `2400`, `sourceNotes` toBeUndefined.
   - `FT_SS` → `ruleOverrides` toEqual `{ totalFloatFormula: 'start_float' }`, `sourceNotes` toBeUndefined.
   - `'FT_XX'` (a value the reader doesn't know), `CT_TotFloat`, `'1.5'` → `{}`, `'total_float'`, `90`, `sourceNotes` toBeUndefined.
   - threshold `'0,5'` → `30`; `'-8'` → `-480`; `'abc'` → `0`; `''` → `0`.
   - `legacyDoc([])` → `ruleOverrides` toEqual `{}`, `'total_float'`, `0`, `sourceNotes` undefined.
2. `'notes the P6 options the engine cannot calculate and keeps the profile rules (D14)'`:
   - `model.settings` = `progress_mode: 'actual_dates'`, lag, `sched_float_type: 'FT_SS'`, `sched_open_critical_flag: 'Y'`, `sched_lag_early_start_flag: 'Y'`, `sched_use_expect_end_flag: 'Y'` (build it with `loadModel` and assign `settings` directly, since `BASE` holds progress_override) → `progressMode` `'retained_logic'`, `ruleOverrides` toEqual `{ totalFloatFormula: 'start_float' }`, `sourceNotes` toEqual `['p6_actual_dates', 'p6_open_ends_critical']` (the SS lag and expected-finish flags are recorded only).
   - `legacyDoc([{sched_open_critical_flag:'N'},{sched_lag_early_start_flag:'Y'},{sched_use_expect_end_flag:'Y'}])` (what the sample files say) → `sourceNotes` undefined; with `sched_lag_early_start_flag: 'N'` also undefined.
   - `fromImportModel(loadModel('legacy-p6.model.json'), { scheduleStatusDate: '2026-03-20' })` (the regenerated golden) → `ruleOverrides` toEqual `{}`, `sourceNotes` undefined.
3. `'calculates with the file's options (D14)'`. Values come from the probe at 8d0de4b:
   - Threshold: `solved(legacyDoc([{ key: 'critical_drtn_hr_cnt', value: '40' }]))['act:00003']` toMatchObject `{ totalFloat: 480, isCritical: true }` and `['act:00001']` `{ totalFloat: 960, isCritical: true }`. With `legacyDoc([])`, `act:00003` is `{ totalFloat: 480, isCritical: false }` and `act:00001` is `{ totalFloat: 960, isCritical: false }`.
   - Longest path, with `patch = (m) => { m.project.mustFinishBy = '2026-03-27T17:00'; }`: `CT_DrivPath` → `act:00002` `{ totalFloat: 1440, isLongestPath: true, isCritical: true }`; `CT_TotFloat` → `act:00002` `{ totalFloat: 1440, isLongestPath: true, isCritical: false }`.
   - (No smallest-float case: its P6 token is not in the sample collection, so it is not mapped; see Decisions.)
   - Open ends, a substitution: `legacyDoc([{ key: 'sched_open_critical_flag', value: 'Y' }])` → `act:00003` `{ totalFloat: 480, isCritical: false }` (P6 would make it critical; the note says so).
   - If an F-task that lands before this one changes these engine values, rerun the probe in Appendix B and use its numbers. Never loosen an assertion to an inequality.

`src/features/schedule/ScheduleSettingsPopover.test.tsx`: add `'lists the file options calculated differently under From the file (D14)'` (import `within`):
- `makeDocument({ settings: { ...makeDocument().settings, sourceNotes: ['p6_actual_dates', 'p6_open_ends_critical'] } })`, render in `mode="view"`, click "Settings". Then `within(screen.getByRole('list', { name: 'From the file' })).getAllByRole('listitem').map((li) => li.textContent)` toEqual:
  1. `"The file uses the Actual dates progress mode, which isn't available. Retained logic is used."`
  2. `"The file makes open-ended activities critical, which isn't available."`
- After unmounting, render `makeDocument()` and open it: `screen.queryByRole('list', { name: 'From the file' })` is null.

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/import/xer/read.test.ts src/import/index.test.ts src/engine/cpm-floats.test.ts src/engine/materialize.test.ts src/features/schedule/ScheduleSettingsPopover.test.tsx`
Expected: FAIL.
- read.test: the three settings tests fail because `model.settings` lacks `sched_use_expect_end_flag` and the other new keys.
- index.test: `parserVersion` is `'1.0.0'` where the test expects `'1.1.0'`.
- cpm-floats: `start_float` is not a formula yet, so `a` keeps 960.
- materialize tests 1–3: they get `ruleOverrides {}`, `'total_float'`, `0`, no `sourceNotes`, and `act:00003.isCritical false` under threshold 40.
- popover test: there is no list named "From the file".
- Every other test in these files passes.

- [ ] **Step 3: Implement**

- `src/import/xer/read.ts`, `settingsOf`: after the four-flag loop, for each field of `const P6_CALCULATION_OPTIONS = ['sched_float_type', 'sched_open_critical_flag', 'sched_lag_early_start_flag', 'sched_use_expect_end_flag', 'critical_path_type', 'critical_drtn_hr_cnt'] as const`, run `const row = optionRow(field); if (row !== null) settings.push({ key: field, value: row[field] ?? '' });`. In the doc comment, add that the six calculation options of P4 D14 come last, from the `SCHEDOPTIONS` row, else `PROJECT`. Nothing else in the reader changes: no new issue code, and the outcome count is still `model.settings.length`.
- `src/import/version.ts`: `'1.1.0'`.
- `src/data/schedule-types.ts`: `ScheduleSourceNote`, `ScheduleSettings.sourceNotes?` and the `'start_float'` member exactly as in Interfaces.
- `src/engine/profiles.ts` and `src/engine/cpm.ts`: the `'start_float'` formula as in Interfaces.
- `src/engine/materialize.ts` (type-only imports from `@/data/schedule-types`; still no runtime import from `@/import`):
  - `mapFloatType(raw: string | undefined): ProfileRuleOverrides['totalFloatFormula']`. It trims `raw`, then maps `FT_FF` → `'finish_float'`, `FT_SS` → `'start_float'`, and anything else → `undefined`.
  - `hoursToMinutes(raw: string | undefined): number`: `/^\s*-?\d+(?:[.,]\d+)?\s*$/` else `0`; `Math.round(Number(raw.trim().replace(',', '.')) * 60)`.
  - In `resolveProfileSettings`'s `xer` branch:
    - `progressMode` as today.
    - `ruleOverrides = formula !== undefined ? { totalFloatFormula: formula } : {}`.
    - `criticalDefinition = getSetting(…, 'critical_path_type')?.trim() === 'CT_DrivPath' ? 'longest_path' : 'total_float'`.
    - `criticalThresholdMinutes = hoursToMinutes(getSetting(…, 'critical_drtn_hr_cnt'))`.
    - `sourceNotes`, in this fixed order:
      - `p6_actual_dates` if `progress_mode` is `'actual_dates'`
      - `p6_open_ends_critical` if `sched_open_critical_flag` trims to `'Y'`
    - Read `sched_lag_early_start_flag` and `sched_use_expect_end_flag` nowhere (recorded only).
  - The `mspdi` and table branches return `ruleOverrides: {}`, `'total_float'`, `0`, `[]`.
  - `fromImportModel` writes `ruleOverrides`, `criticalDefinition` and `criticalThresholdMinutes` from that result, then `...(sourceNotes.length > 0 ? { sourceNotes } : {})` after `autoCalculate`.
  - `createBlankDocument` is unchanged.
- `src/features/schedule/ScheduleSettingsPopover.tsx`:
  - Add a module-local `const SOURCE_NOTE_COPY: Record<ScheduleSourceNote, string>` with the two strings of Step 1. Keep it unexported for react-refresh.
  - After the settings grid, when `(settings.sourceNotes ?? []).length > 0`, render a `mt-3 border-t pt-2` block: `<p id={`${baseId}-notes`} className="text-2xs font-medium text-muted-foreground">From the file</p>` and `<ul aria-labelledby={`${baseId}-notes`} className="mt-1 flex flex-col gap-1 text-2xs text-muted-foreground">` with one `<li>` per note in stored order.
  - Show it in View and Edit mode alike. Token classes only.

- [ ] **Step 4: Run the checks**

1. `npm run goldens`, then `git diff --stat src/import/__fixtures__` and read the diff. It must touch **only** `legacy-p6.model.json` and `legacy-p6.report.json`:
   - Each gains `{ "key": "sched_use_expect_end_flag", "value": "Y" }` as the third `settings` entry.
   - In the report, `{ "element": "Scheduling settings", "outcome": "kept", "items": 2 }` becomes `"items": 3`.
   - Any other change, or any new `error` issue, means the reader change is wrong: stop.
2. `npx vitest run src/import/xer/read.test.ts src/import/index.test.ts src/import/goldens.test.ts src/engine/cpm-floats.test.ts src/engine/materialize.test.ts src/engine/oracle.test.ts src/features/schedule/ScheduleSettingsPopover.test.tsx` → all pass; `oracle.test.ts` passes with `oracle-ratchet.json` unchanged.
3. `npm run check` → exit 0.
4. `npm run test:engine:tz` → `materialize.test.ts` passes in all 4 time zones.
5. `npm run build` → exit 0.
6. `npx tsx scripts/check-cpm-oracle.ts` (owner machine, real exports present) → the last line reads `Aggregate (72 solved, 1 solver errors)` (the remaining error is the real FS loop the header describes), and on the 67 files solved at baseline none of es/ef/ls/lf/tf is more than 1 point below the baseline (75.3 / 75.7 / 73.7 / 73.8 / 81.5 %); the controller compares the per-file lines. Copy only the aggregate line into the task's report; never a file's position or anything from its content. On a machine without `real-exports/` the script prints that it is skipping: note that and go on.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: read P6 scheduling options from XER files"
```

---

### Task F4: One progress helper for % complete edits

**Fixes:**
- PR5-8 (owner decision): a % complete typed in the grid (`ScheduleGrid.tsx` 195-216) sets `status` and `remainingDuration` but never sets `actualStart` or `actualFinish`. If you type 100 in B of A→B→C, the engine moves B to the project start (2026-01-05T08:00), pulls C forward, moves the project finish from 01-23 to 01-09, and raises two false `MISSING_ACTUAL_DATE` warnings plus `NEGATIVE_FLOAT`. After the fix, B stays at 12.01–16.01 and gets the actual dates it was calculated with.
- PR6-3: the Gantt progress drop (`drag.ts` 409-419) has the same gap (`status` with no actuals), and it also forces `percent.type` to `'duration'`. After the fix, a drop goes through the same helper as the grid and keeps the activity's % type. The test that pins the old patch is `drag.test.ts` 100-127.
- Details panel % complete (`ScheduleDetailsPanel.tsx` 404-421) changes the percent and nothing else, so it can leave a 100 % activity marked "Not started". After the fix, it goes through the same helper.
- P4 core D13: every % complete edit (grid, Details, Gantt progress drag) goes through one progress helper. That helper keeps status and actual dates consistent.

**Spec:** P4 core spec §11 D13 (governs; it supersedes P4 later §5.2.3's percent-only drop patch, which "follows this helper"). Also P4 core §6 (command layer: one undo step per edit, `stale` semantics), §7.2 (grid inline % edit, Details "status, actual start/finish, `% complete` + type"), §5.4 (progress rules: completed uses its actuals, and an empty actual raises `MISSING_ACTUAL_DATE`), and P4 later §5.2.3 (drop commits one undoable command).

**Decisions this task makes** (D13 leaves them open):
1. **Which dates count as "calculated".** The helper uses the dates the user sees, the same rule as `rows.ts`. In Calculated mode it uses `document.computed.activities[id].earlyStart/earlyFinish`. Otherwise (As imported mode, never calculated, or an activity missing from `computed`) it uses `sourceDates.early`, then `sourceDates.planned`. If none of these exist (a new activity that has never been calculated), the actual dates stay empty and the engine's `MISSING_ACTUAL_DATE` warning tells the user to enter them. Nothing is invented from the project start.
2. **Where the dates come from.** They are read in one place, `applyCommand`, from `document.computed`. In the editor, `summary` and `document.computed` are always the same object (`useScheduleEditor.ts` 107, 183-195, 361-366). All three call sites dispatch the new command `{ type: 'setPercentComplete', activityId, percentComplete }`. So the Gantt drag stays a pure state machine with no document access, and the three call sites can't resolve dates differently.
3. **Going below 100 % clears `actualFinish`.** An in-progress activity has no finish, which is what P6 and MS Project do, and D13 asks for status and actuals to stay "consistent". `actualStart` is kept. "Back to 0 %" clears both.
4. **`remainingDuration`.** The grid's existing rule now applies to all three call sites: `Math.round(originalDuration × (1 − pct/100))`. It is 0 at 100 % and `originalDuration` at 0 %. Milestones stay 0 through `updateActivity`.
5. **Rounding and type.** The percent is rounded to 1 decimal, which was the grid rule. `percent = { ...activity.percent, duration: pct, physical: pct }`, so `type` is kept.
6. **Comparing to the status date.** `WallClock` values are compared with `wallClockToCivilMinutes`, never as strings. A capped date takes the status date's exact value.

**Probe evidence** (`<scratchpad>/F4-probe.ts`, `F4-probe2.ts`, `F4-probe3.ts`). These run the helper below, inlined, through `applyCommand` and `solve()`, with `npx tsx` from the repository root. They use `makeDocument` defaults: Standard calendar Mon–Fri 08:00–12:00/13:00–17:00, project start 2026-01-05T08:00, profile `default`, `retained_logic`. Every activity is 2400 min (5 d), and links are FS.
- A→B→C calculated with status date `null`: A 01-05T08:00–01-09T17:00, B 01-12T08:00–01-16T17:00, C 01-19T08:00–01-23T17:00, finish 01-23T17:00, no warnings. The two-activity chain `a1→a2` gives the same A and B dates.
- B set to 100 % through the helper: B `actualStart '2026-01-12T08:00'`, `actualFinish '2026-01-16T17:00'`. A re-solve keeps all three activities and the finish exactly as before. The only warning is `OUT_OF_SEQUENCE` (`"B started out of sequence before A."`). That warning is correct: B is done while its FS predecessor A is not (`cpm.ts` `isOutOfSequence`, FS: `pred.status !== 'completed'`). There is no `MISSING_ACTUAL_DATE`.
- A to 100 %, then B to 100 %: same dates, `warnings: []`.
- Same document, but the status date moved to 2026-01-14T08:00 before B is set to 100 %: `actualFinish` is capped to `'2026-01-14T08:00'`.
- Status date 2026-01-05T08:00 (the `makeDocument` default): B at 100 % gets both actuals `'2026-01-05T08:00'`, which is the "never after the status date" rule. Tests that want B to keep its dates therefore set a later status date or `null`.

**Files:**
- Create: `src/features/schedule/progress.ts`, `src/features/schedule/progress.test.ts`
- Modify: `src/features/schedule/commands.ts`, `src/features/schedule/ScheduleGrid.tsx`, `src/features/schedule/ScheduleDetailsPanel.tsx`, `src/features/schedule/gantt/drag.ts`
- Test (modify): `src/features/schedule/commands.test.ts`, `src/features/schedule/gantt/drag.test.ts`, `src/features/schedule/InlineCellEditor.test.tsx`, `src/features/schedule/ScheduleDetailsPanel.test.tsx`
- Unchanged: `ScheduleGantt.tsx` (it dispatches whatever `commitGanttDrag` returns), `rows.ts`, `src/engine/**`, specs.

**Interfaces:**
- Consumes: `ScheduleActivity`, `ScheduleDocument`, `WallClock` (`@/data/schedule-types`, type-only). `wallClockToCivilMinutes(wc: WallClock | null): number | null` (`@/lib/civil-date`). `applyCommand` and its `updateActivity` validation path.
- Produces, in `src/features/schedule/progress.ts` (pure; no React, hooks or engine):
  ```ts
  export interface ProgressDates { start: WallClock | null; finish: WallClock | null }
  export type ProgressChanges = Pick<ScheduleActivity, 'status' | 'actualStart' | 'actualFinish' | 'remainingDuration' | 'percent'>;
  export function activityDisplayDates(document: ScheduleDocument, activity: ScheduleActivity): ProgressDates;
  export function progressChanges(activity: ScheduleActivity, percentComplete: number, dates: ProgressDates, statusDate: WallClock | null): ProgressChanges;
  ```
- Changed: `ScheduleCommand` (in `commands.ts`) gains `| { type: 'setPercentComplete'; activityId: string; percentComplete: number }`. This is an addition. The only `switch` over `command.type` is in `applyCommand`, and `useScheduleEditor.dispatch` already selects `act:{selectId}` for any command other than the WBS ones.
- Changed: `commitGanttDrag(state)` keeps its signature. In `'bar-progress'` mode it now returns `{ type: 'setPercentComplete', activityId, percentComplete }`. Its only callers are `ScheduleGantt.tsx` 496 (no change needed) and `drag.test.ts`.

- [ ] **Step 1: Write the failing tests**

Create `src/features/schedule/progress.test.ts`. ESLint allows `@/engine` in `src/**/*.test.*`, the D47 block in `eslint.config.js`.

```ts
// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { ScheduleDocument, SourceDateRecord, WallClock } from '@/data/schedule-types';
import { solve } from '@/engine';
import { makeActivity, makeDocument, makeRelationship } from '@/engine/testing';
import { applyCommand, emptyHistory, record, undo, type ScheduleCommand } from '@/features/schedule/commands';
import { activityDisplayDates, progressChanges } from '@/features/schedule/progress';

const CALCULATED_AT = '2026-01-01T00:00:00.000Z';
const B_DATES = { start: '2026-01-12T08:00', finish: '2026-01-16T17:00' };

/** A→B→C (5 d each, FS), calculated with the given status date; Calculated mode. */
function chainDocument(statusDate: WallClock | null): ScheduleDocument {
  const base = makeDocument({
    activities: [
      makeActivity({ id: 'a', code: 'A', originalDuration: 2400 }),
      makeActivity({ id: 'b', code: 'B', originalDuration: 2400 }),
      makeActivity({ id: 'c', code: 'C', originalDuration: 2400 }),
    ],
    relationships: [
      makeRelationship({ id: 'r1', predecessorId: 'a', successorId: 'b' }),
      makeRelationship({ id: 'r2', predecessorId: 'b', successorId: 'c' }),
    ],
  });
  const doc = { ...base, settings: { ...base.settings, statusDate } };
  const solved = solve(doc, { calculatedAt: CALCULATED_AT });
  if (!solved.ok) throw new Error(solved.error.message);
  return { ...doc, computed: solved.summary };
}

function sourceDates(
  early: { start: WallClock | null; finish: WallClock | null },
  planned: { start: WallClock | null; finish: WallClock | null },
): SourceDateRecord {
  return { planned, early, late: { start: null, finish: null }, remaining: { start: null, finish: null }, totalFloat: null, freeFloat: null };
}

describe('progressChanges (P4 core D13)', () => {
  const b = makeActivity({ id: 'b', code: 'B', originalDuration: 2400 });

  it('leaving 0 % sets in progress and the actual start to the calculated early start', () => {
    expect(progressChanges(b, 50, B_DATES, '2026-01-14T08:00')).toEqual({
      status: 'in_progress',
      actualStart: '2026-01-12T08:00',
      actualFinish: null,
      remainingDuration: 1200,
      percent: { duration: 50, physical: 50, type: 'duration' },
    });
  });

  it('100 % also sets the actual finish to the calculated early finish, capped at the status date', () => {
    expect(progressChanges(b, 100, B_DATES, '2026-01-14T08:00')).toEqual({
      status: 'completed',
      actualStart: '2026-01-12T08:00',
      actualFinish: '2026-01-14T08:00',
      remainingDuration: 0,
      percent: { duration: 100, physical: 100, type: 'duration' },
    });
    expect(progressChanges(b, 100, B_DATES, '2026-01-19T08:00')).toMatchObject({ actualStart: '2026-01-12T08:00', actualFinish: '2026-01-16T17:00' });
    expect(progressChanges(b, 100, B_DATES, null)).toMatchObject({ actualStart: '2026-01-12T08:00', actualFinish: '2026-01-16T17:00' });
  });

  it('never sets an actual date after the status date', () => {
    expect(progressChanges(b, 50, B_DATES, '2026-01-05T08:00')).toMatchObject({ status: 'in_progress', actualStart: '2026-01-05T08:00', actualFinish: null });
    expect(progressChanges(b, 100, B_DATES, '2026-01-05T08:00')).toMatchObject({ status: 'completed', actualStart: '2026-01-05T08:00', actualFinish: '2026-01-05T08:00' });
  });

  it('keeps existing actual dates and never finishes before the actual start', () => {
    const dates = { start: '2026-01-05T08:00', finish: '2026-01-09T17:00' };
    const started = makeActivity({ id: 'k', code: 'K', originalDuration: 2400, status: 'in_progress', actualStart: '2026-01-06T08:00' });
    expect(progressChanges(started, 100, dates, '2026-01-14T08:00')).toMatchObject({ actualStart: '2026-01-06T08:00', actualFinish: '2026-01-09T17:00' });
    const finished = makeActivity({ id: 'k', code: 'K', originalDuration: 2400, status: 'completed', actualStart: '2026-01-06T08:00', actualFinish: '2026-01-08T17:00' });
    expect(progressChanges(finished, 100, dates, '2026-01-14T08:00')).toMatchObject({ actualStart: '2026-01-06T08:00', actualFinish: '2026-01-08T17:00' });
    const lateStart = makeActivity({ id: 'k', code: 'K', originalDuration: 2400, status: 'in_progress', actualStart: '2026-01-13T08:00' });
    expect(progressChanges(lateStart, 100, dates, '2026-01-14T08:00')).toMatchObject({ actualStart: '2026-01-13T08:00', actualFinish: '2026-01-13T08:00' });
  });

  it('back to 0 % clears both actual dates and below 100 % clears the actual finish', () => {
    const done = makeActivity({
      id: 'b', code: 'B', originalDuration: 2400, status: 'completed',
      actualStart: '2026-01-12T08:00', actualFinish: '2026-01-16T17:00',
      percent: { duration: 100, physical: 100, type: 'duration' },
    });
    expect(progressChanges(done, 0, B_DATES, '2026-01-19T08:00')).toEqual({
      status: 'not_started', actualStart: null, actualFinish: null, remainingDuration: 2400,
      percent: { duration: 0, physical: 0, type: 'duration' },
    });
    expect(progressChanges(done, 60, B_DATES, '2026-01-19T08:00')).toEqual({
      status: 'in_progress', actualStart: '2026-01-12T08:00', actualFinish: null, remainingDuration: 960,
      percent: { duration: 60, physical: 60, type: 'duration' },
    });
  });

  it('keeps the % type and rounds to one decimal', () => {
    const physical = makeActivity({ id: 'p', code: 'P', originalDuration: 2400, percent: { duration: null, physical: null, type: 'physical' } });
    expect(progressChanges(physical, 33.36, B_DATES, null)).toEqual({
      status: 'in_progress', actualStart: '2026-01-12T08:00', actualFinish: null, remainingDuration: 1598,
      percent: { duration: 33.4, physical: 33.4, type: 'physical' },
    });
  });

  it('leaves the actual dates empty when there are no dates to default from', () => {
    expect(progressChanges(b, 100, { start: null, finish: null }, '2026-01-14T08:00')).toEqual({
      status: 'completed', actualStart: null, actualFinish: null, remainingDuration: 0,
      percent: { duration: 100, physical: 100, type: 'duration' },
    });
  });
});

describe('activityDisplayDates', () => {
  it('uses the calculated early dates in Calculated mode and the imported dates otherwise', () => {
    const imported = makeActivity({ id: 'i', code: 'I', originalDuration: 2400, sourceDates: sourceDates({ start: '2026-02-03T08:00', finish: '2026-02-09T17:00' }, { start: '2026-02-02T08:00', finish: '2026-02-06T17:00' }) });
    const plannedOnly = makeActivity({ id: 'j', code: 'J', originalDuration: 2400, sourceDates: sourceDates({ start: null, finish: null }, { start: '2026-02-02T08:00', finish: '2026-02-06T17:00' }) });
    const fresh = makeActivity({ id: 'n', code: 'N', originalDuration: 2400 });
    const base = makeDocument({ activities: [imported, plannedOnly, fresh] });
    const solved = solve(base, { calculatedAt: CALCULATED_AT });
    if (!solved.ok) throw new Error(solved.error.message);
    const calculated: ScheduleDocument = { ...base, computed: solved.summary };

    expect(activityDisplayDates(calculated, imported)).toEqual({ start: '2026-01-05T08:00', finish: '2026-01-09T17:00' });
    expect(activityDisplayDates({ ...calculated, settings: { ...calculated.settings, displayMode: 'as_imported' } }, imported))
      .toEqual({ start: '2026-02-03T08:00', finish: '2026-02-09T17:00' });
    // Calculated mode, never calculated: imported early dates, then planned, then nothing
    expect(activityDisplayDates(base, imported)).toEqual({ start: '2026-02-03T08:00', finish: '2026-02-09T17:00' });
    expect(activityDisplayDates(base, plannedOnly)).toEqual({ start: '2026-02-02T08:00', finish: '2026-02-06T17:00' });
    expect(activityDisplayDates(base, fresh)).toEqual({ start: null, finish: null });
  });
});

describe('setPercentComplete command', () => {
  it('applies the helper to the calculated dates, marks the schedule stale and undoes in one step', () => {
    const calculated = chainDocument(null);
    // Status date moved to 14.01.2026 after the calculation (no recalculation yet)
    const doc: ScheduleDocument = { ...calculated, settings: { ...calculated.settings, statusDate: '2026-01-14T08:00' } };
    const command: ScheduleCommand = { type: 'setPercentComplete', activityId: 'b', percentComplete: 100 };
    const res = applyCommand(doc, command);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.stale).toBe(true);
    expect(res.selectId).toBe('b');
    expect(res.forward).toHaveLength(1);
    expect(res.document.activities[1]).toMatchObject({
      status: 'completed', actualStart: '2026-01-12T08:00', actualFinish: '2026-01-14T08:00', remainingDuration: 0,
      percent: { duration: 100, physical: 100, type: 'duration' },
    });
    const undone = undo(res.document, record(emptyHistory(), { command, forward: res.forward, inverse: res.inverse }))!;
    expect(undone.document.activities[1]).toEqual(doc.activities[1]);
  });

  it('typing 100 in B of A→B→C keeps B in place without MISSING_ACTUAL_DATE', () => {
    const doc = chainDocument(null);
    const res = applyCommand(doc, { type: 'setPercentComplete', activityId: 'b', percentComplete: 100 });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.document.activities[1]).toMatchObject({ status: 'completed', actualStart: '2026-01-12T08:00', actualFinish: '2026-01-16T17:00' });

    const solved = solve(res.document, { calculatedAt: CALCULATED_AT });
    expect(solved.ok).toBe(true);
    if (!solved.ok) return;
    expect(solved.summary.activities['a']).toMatchObject({ earlyStart: '2026-01-05T08:00', earlyFinish: '2026-01-09T17:00' });
    expect(solved.summary.activities['b']).toMatchObject({ earlyStart: '2026-01-12T08:00', earlyFinish: '2026-01-16T17:00' });
    expect(solved.summary.activities['c']).toMatchObject({ earlyStart: '2026-01-19T08:00', earlyFinish: '2026-01-23T17:00' });
    expect(solved.summary.projectFinish).toBe('2026-01-23T17:00');
    // B is done while its FS predecessor A is not: a real out-of-sequence warning, no missing actuals
    expect(solved.summary.warnings.map((w) => w.code)).toEqual(['OUT_OF_SEQUENCE']);

    // In sequence (A then B to 100 %): same dates and no warnings
    const aDone = applyCommand(doc, { type: 'setPercentComplete', activityId: 'a', percentComplete: 100 });
    if (!aDone.ok) throw new Error(aDone.error);
    const bothDone = applyCommand(aDone.document, { type: 'setPercentComplete', activityId: 'b', percentComplete: 100 });
    if (!bothDone.ok) throw new Error(bothDone.error);
    const solvedInSequence = solve(bothDone.document, { calculatedAt: CALCULATED_AT });
    if (!solvedInSequence.ok) throw new Error(solvedInSequence.error.message);
    expect(solvedInSequence.summary.activities['b']).toMatchObject({ earlyStart: '2026-01-12T08:00', earlyFinish: '2026-01-16T17:00' });
    expect(solvedInSequence.summary.projectFinish).toBe('2026-01-23T17:00');
    expect(solvedInSequence.summary.warnings).toEqual([]);
  });
});
```
The values come from the probes. B's 12.01–16.01 is its calculated date. 1200, 960, 1440 and 1598 are `Math.round(2400 × (1 − pct/100))`. Every cap takes the exact status-date `WallClock`.

`src/features/schedule/commands.test.ts`: add to the existing `describe`.
```ts
  it('validates setPercentComplete (D13)', () => {
    const doc = makeDocument({ activities: [makeActivity({ id: 'b', code: 'B', originalDuration: 2400 })] });
    for (const percentComplete of [-1, 101, Number.NaN]) {
      expect(applyCommand(doc, { type: 'setPercentComplete', activityId: 'b', percentComplete }))
        .toEqual({ ok: false, error: 'Percent complete must be between 0 and 100.' });
    }
    expect(applyCommand(doc, { type: 'setPercentComplete', activityId: 'zz', percentComplete: 50 }))
      .toEqual({ ok: false, error: 'Activity not found.' });
  });
```

`src/features/schedule/gantt/drag.test.ts`: **replace** the existing test `'clamps bar-progress between 0 and 100% and commits percent and status'` (lines 100-127). It pins the old patch: `changes: { percent: { duration: 50, physical: 50, type: 'duration' }, status: 'in_progress' }` and `status: 'completed'`. Keep its hit-test, start and `half.overlay` assertions (`badgeLabel: '50%'`) unchanged. Rename the test and replace the two commit assertions:
```ts
  it('clamps bar-progress between 0 and 100% and commits a setPercentComplete command (D13)', () => {
    // … unchanged hit / started / half + overlay assertions …
    expect(commitGanttDrag(half)).toEqual({ type: 'setPercentComplete', activityId: 'a1', percentComplete: 50 });

    // Drag past right edge -> 100 %
    const full = updateGanttDrag(started, 300, 22, rows, ts, 0, 0);
    expect(commitGanttDrag(full)).toEqual({ type: 'setPercentComplete', activityId: 'a1', percentComplete: 100 });

    // Drag past left edge (x1 = 64) -> 0 %
    const none = updateGanttDrag(started, 10, 22, rows, ts, 0, 0);
    expect(commitGanttDrag(none)).toEqual({ type: 'setPercentComplete', activityId: 'a1', percentComplete: 0 });
  });
```

`src/features/schedule/InlineCellEditor.test.tsx`: add a second `it` to the existing `describe`. New imports: `type ScheduleDocument` from `@/data/schedule-types`, `solve` from `@/engine`, and `makeRelationship`. The existing test's % edit (`expect(doc.activities[0]?.percent.duration).toBe(50)`) still passes unchanged. Its document has no computed or source dates, so the helper leaves the actuals empty.
```tsx
  it('fills status and actual dates from the calculated dates when % complete is typed (D13)', async () => {
    const user = userEvent.setup();
    const base = makeDocument({
      activities: [
        makeActivity({ id: 'a1', code: 'A1010', name: 'Excavation', originalDuration: 2400 }),
        makeActivity({ id: 'a2', code: 'A1020', name: 'Concrete', originalDuration: 2400 }),
      ],
      relationships: [makeRelationship({ id: 'r1', predecessorId: 'a1', successorId: 'a2' })],
    });
    const solved = solve({ ...base, settings: { ...base.settings, statusDate: null } }, { calculatedAt: '2026-01-01T00:00:00.000Z' });
    if (!solved.ok) throw new Error(solved.error.message);
    // Calculated A1010 05.01–09.01 and A1020 12.01–16.01; status date then moved to 14.01.2026
    let doc: ScheduleDocument = { ...base, settings: { ...base.settings, statusDate: '2026-01-14T08:00' }, computed: solved.summary };
    const dispatched: ScheduleCommand[] = [];
    const onDispatch = vi.fn((cmd: ScheduleCommand) => {
      dispatched.push(cmd);
      const res = applyCommand(doc, cmd);
      if (res.ok) doc = res.document;
      return res;
    });
    const grid = () => (
      <ScheduleGrid rows={buildVisibleRows(doc, doc.computed, {}, new Set())} selectedKey="act:a1" mode="edit"
        document={doc} onDispatch={onDispatch} onSelectKey={vi.fn()} onToggleWbs={vi.fn()} />
    );
    const { rerender } = render(grid());
    const typePercent = async (name: string, code: string, value: string) => {
      const row = screen.getByText(name).closest('[role="row"]')!;
      await user.dblClick(row.querySelectorAll('[role="gridcell"]')[7]!);
      const input = screen.getByRole('textbox', { name: `Edit percent for ${code}` });
      await user.clear(input);
      await user.type(input, `${value}{Enter}`);
      rerender(grid());
    };

    await typePercent('Excavation', 'A1010', '50');
    expect(dispatched.at(-1)).toEqual({ type: 'setPercentComplete', activityId: 'a1', percentComplete: 50 });
    expect(doc.activities[0]).toMatchObject({ status: 'in_progress', actualStart: '2026-01-05T08:00', actualFinish: null, remainingDuration: 1200 });

    await typePercent('Concrete', 'A1020', '100');
    expect(doc.activities[1]).toMatchObject({
      status: 'completed', actualStart: '2026-01-12T08:00', actualFinish: '2026-01-14T08:00', remainingDuration: 0,
      percent: { duration: 100, physical: 100, type: 'duration' },
    });

    await typePercent('Concrete', 'A1020', '0');
    expect(doc.activities[1]).toMatchObject({ status: 'not_started', actualStart: null, actualFinish: null, remainingDuration: 2400 });
  });
```

`src/features/schedule/ScheduleDetailsPanel.test.tsx`: add a second `it`. It reuses `baseSummary` (a2 12.01 08:00–16.01 17:00) as the document's `computed` and adds `import type { ScheduleDocument }`. The existing test is unchanged; its Status select still dispatches `updateActivity`.
```tsx
  it('sets status and actual dates from % complete through the progress helper (D13)', () => {
    let doc: ScheduleDocument = {
      ...makeDocument({
        settings: { ...makeDocument().settings, displayMode: 'calculated', statusDate: '2026-01-14T08:00' },
        activities: [
          makeActivity({ id: 'a1', code: 'A1000', name: 'Site prep', originalDuration: 2400, remainingDuration: 2400 }),
          makeActivity({ id: 'a2', code: 'A1010', name: 'Excavation', originalDuration: 2400, remainingDuration: 2400 }),
        ],
        relationships: [makeRelationship({ id: 'r1', predecessorId: 'a1', successorId: 'a2', type: 'FS' })],
      }),
      computed: baseSummary,
    };
    const onDispatch = vi.fn((cmd: ScheduleCommand) => {
      const res = applyCommand(doc, cmd);
      if (res.ok) doc = res.document;
      return res;
    });
    const panel = () => (
      <ScheduleDetailsPanel document={doc} summary={doc.computed} rollups={{}} selectedKey="act:a2" mode="edit"
        activeTab="details" onTabChange={vi.fn()} onClose={vi.fn()} onJumpToActivity={vi.fn()} onDispatch={onDispatch} />
    );
    const { rerender } = render(panel());

    fireEvent.change(screen.getByLabelText('% complete'), { target: { value: '40' } });
    expect(onDispatch).toHaveBeenLastCalledWith({ type: 'setPercentComplete', activityId: 'a2', percentComplete: 40 });
    expect(doc.activities[1]).toMatchObject({
      status: 'in_progress', actualStart: '2026-01-12T08:00', actualFinish: null, remainingDuration: 1440,
      percent: { duration: 40, physical: 40, type: 'duration' },
    });
    rerender(panel());
    expect(screen.getByLabelText('Status')).toHaveValue('in_progress');
    expect(screen.getByLabelText('Actual start')).toHaveValue('2026-01-12');

    fireEvent.change(screen.getByLabelText('% complete'), { target: { value: '100' } });
    expect(doc.activities[1]).toMatchObject({ status: 'completed', actualStart: '2026-01-12T08:00', actualFinish: '2026-01-14T08:00', remainingDuration: 0 });
    rerender(panel());
    expect(screen.getByLabelText('Actual finish')).toHaveValue('2026-01-14');

    fireEvent.change(screen.getByLabelText('% complete'), { target: { value: '0' } });
    expect(doc.activities[1]).toMatchObject({ status: 'not_started', actualStart: null, actualFinish: null, remainingDuration: 2400 });
  });
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/features/schedule/progress.test.ts src/features/schedule/commands.test.ts src/features/schedule/gantt/drag.test.ts src/features/schedule/InlineCellEditor.test.tsx src/features/schedule/ScheduleDetailsPanel.test.tsx`

Expected: FAIL.
- `progress.test.ts`: `Failed to resolve import "@/features/schedule/progress"`.
- `commands.test.ts › validates setPercentComplete (D13)`: `expected undefined to deeply equal { ok: false, error: 'Percent complete must be between 0 and 100.' }`, because `applyCommand` falls through its `switch`.
- `drag.test.ts`: the diff shows `type: 'updateActivity'` where `'setPercentComplete'` is expected.
- `InlineCellEditor.test.tsx`: the new test gets `{ type: 'updateActivity', … }` and `actualStart: null`.
- `ScheduleDetailsPanel.test.tsx`: the new test gets an `updateActivity` call that has only `percent`, and `status: 'not_started'`.
- Every other test in these files passes.

- [ ] **Step 3: Implement**
- `src/features/schedule/progress.ts` (new):
  - `activityDisplayDates(document, activity)`. Let `computed = document.settings.displayMode === 'calculated' ? document.computed?.activities[activity.id] : undefined`. Then `start = computed?.earlyStart ?? activity.sourceDates?.early.start ?? activity.sourceDates?.planned.start ?? null`, and `finish` follows the same rule with the finish fields.
  - `progressChanges(activity, percentComplete, dates, statusDate)` takes a value the caller has already checked is 0–100. Write it in this order:
    ```ts
    const pct = Math.round(percentComplete * 10) / 10;
    const after = (a: WallClock, b: WallClock) =>
      (wallClockToCivilMinutes(a) ?? Number.NEGATIVE_INFINITY) > (wallClockToCivilMinutes(b) ?? Number.POSITIVE_INFINITY);
    const cap = (wc: WallClock) => (statusDate !== null && after(wc, statusDate) ? statusDate : wc);
    const status = pct <= 0 ? 'not_started' : pct >= 100 ? 'completed' : 'in_progress';
    const base = { status, remainingDuration: Math.round(activity.originalDuration * (1 - pct / 100)),
                   percent: { ...activity.percent, duration: pct, physical: pct } };
    if (status === 'not_started') return { ...base, actualStart: null, actualFinish: null };
    const actualStart = activity.actualStart ?? (dates.start === null ? null : cap(dates.start));
    if (status === 'in_progress') return { ...base, actualStart, actualFinish: null };
    let actualFinish = activity.actualFinish;
    if (actualFinish === null && dates.finish !== null) {
      actualFinish = cap(dates.finish);
      if (actualStart !== null && after(actualStart, actualFinish)) actualFinish = actualStart;
    }
    return { ...base, actualStart, actualFinish };
    ```
    Add a TSDoc line that cites P4 core D13. Use `import type` for the schedule types.
- `src/features/schedule/commands.ts`: add the union member. Import `activityDisplayDates` and `progressChanges` from `@/features/schedule/progress` (`progress.ts` imports nothing at runtime from `commands.ts`, so there is no cycle). Add `case 'setPercentComplete'` with these steps:
  1. Find the activity. If it is missing, return `{ ok: false, error: 'Activity not found.' }`.
  2. If `!Number.isFinite(percentComplete) || percentComplete < 0 || percentComplete > 100`, return `{ ok: false, error: 'Percent complete must be between 0 and 100.' }`.
  3. Otherwise `return applyCommand(document, { type: 'updateActivity', activityId: existing.id, changes: progressChanges(existing, command.percentComplete, activityDisplayDates(document, existing), document.settings.statusDate) }, newId);`. This gives one `set` patch with its inverse, `stale: true` and `selectId: existing.id`.
- `src/features/schedule/ScheduleGrid.tsx`, `commitEdit` `column === 'percent'`: keep the parse, the range check and the toast `'Percent complete must be between 0 and 100.'`. Replace the `pct`, `nextStatus` and `nextRemaining` lines and the `updateActivity` dispatch with `onDispatch({ type: 'setPercentComplete', activityId: row.id, percentComplete: num })`, and keep `if (!result.ok) toast.error(result.error)`.
- `src/features/schedule/ScheduleDetailsPanel.tsx`: add `const setPercentComplete = (percentComplete: number) => { if (readOnly || !selectedActivity) return; const res = onDispatch({ type: 'setPercentComplete', activityId: selectedActivity.id, percentComplete }); if (!res.ok) toast.error(res.error); };` next to `updateActivity`. In the `% complete` input's `onChange`, call `setPercentComplete(num)` inside the existing `Number.isFinite(num) && num >= 0 && num <= 100` guard. The Status select, the `% type` select and the actual-date inputs stay as they are.
- `src/features/schedule/gantt/drag.ts`, `commitGanttDrag` `'bar-progress'` branch: `return { type: 'setPercentComplete', activityId: state.activityId, percentComplete: state.percentComplete };`. In the function's TSDoc, note that progress follows the D13 helper.

- [ ] **Step 4: Run the checks**

Run: `npx vitest run src/features/schedule` and then `npm run check && npm run build && npm run test:e2e`. On Windows, `npm run check` needs Task F1 first.

Expected:
- vitest ends with all files passed and 0 failed.
- `npm run check` ends with `Engine TZ check OK: 4 time zones passed` after typecheck, lint (no `no-restricted-imports` errors), tests and contrast.
- `npm run build` exits 0.
- Playwright reports every test `passed`. `e2e/schedule.spec.ts` covers the grid and Gantt flows, not % values.
- No database, integration or type regeneration is needed, because there is no migration and no data-layer change.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "fix: keep status and actual dates consistent on % complete edits (D13)"
```

---

### Task F5: Gantt move and resize in working days

**Fixes:**
- PR6-4 (important). `drag.ts` counts calendar days. **Resize:** `updateGanttDrag` (drag.ts:232-258) takes `workingDays = endDay - startDay` over plain day indices, so dragging a 3 d bar (Wed 07.01 08:00 to Fri 09.01 17:00) to the 14.01 boundary shows "7 d" and commits 3360 min. Calculate then moves the finish to Thu 15.01 17:00, two working days past the ghost. **Grab:** `startGanttDrag` (drag.ts:97-101) builds its first badge the same way, so a 5 d bar that crosses a weekend shows "7 d" as soon as it is grabbed, and a 3 px nudge commits 7 d. **Move:** `updateGanttDrag` (drag.ts:204-230) adds whole calendar days and hard-codes 08:00 (line 210). A 3-day move lands on Sat 10.01 and commits SNET `2026-01-10T08:00`, but Calculate starts the task on Mon 12.01, so the result no longer matches the preview. `drag.test.ts:44-98` pins all of this under titles that say "working days".
- Decision rows: none new.
- User-visible effect after the fix:
  - Move lands on the next working day's start on the activity's own calendar, skipping weekends and holidays.
  - Resize badges and commits count working days only.
  - Grabbing or nudging a handle keeps the bar's real duration.
  - The ghost bar shows the dates Calculate will produce.

**Spec:**
- P4 later spec `2026-11-23-phase4-later-design.md` §5.2 item 1, Move: "Tracks pointer delta in minutes along `timescale`, snapping to whole working days (`08:00` start of day on the activity's calendar)". The drop stays an SNET `updateActivity`.
- §5.2 item 2, Resize: "Snaps new finish to working days, computing `newDurationMinutes = Math.max(hoursPerDay * 60, workingDays * hoursPerDay * 60)`". The preview label is `"{days} d"`.
- §1 item 1: "drag a task bar's right edge to resize its duration in working days".
- Plan `2026-11-23-phase4-later.md` Task 8: "snaps start to working-day `08:00` boundary" and "snaps finish to working-day boundary (min 1 working day)".
- CLAUDE.md architecture rule 9 and `eslint.config.js` (`ENGINE_HOOKS_ONLY_PATTERN`): `src/features/**` must not import engine runtime code. So `drag.ts` cannot use `@/engine/calendar` and needs its own small working-day view, built from the `ScheduleCalendar` data type.
- How this plan reads "`08:00` start of day on the activity's calendar": the start of the first working period on the snapped day. That is 08:00 on the standard calendar and on the fallback.

**Probe evidence:** `<scratchpad>/F5-probe.ts`, run with `npx tsx` from the repo root. The probe re-implements the rules in Step 3 outside the repo, drives them with the real `hitTestGanttTarget` and `createTimescale`, and checks every ghost against the real `solve()`. Every expected value below comes from that run:

| Case | Rule result | Real `solve()` |
|---|---|---|
| 3 d bar Wed 07 08:00 to Fri 09 17:00, resized to the 14.01 boundary | 5 d, ghost finish Tue 13.01 17:00, commit 2400 | 2400 min gives Wed 07 08:00 to Tue 13 17:00 (equal) |
| Same bar moved +96 px | SNET `2026-01-12T08:00`, ghost Mon 12 08:00 to Wed 14 17:00 | the same dates (equal) |
| Same bar moved +96 px, holiday Mon 12.01 | SNET `2026-01-13T08:00`, ghost to Thu 15 17:00 | equal |
| Mid-day start: SNET Wed 07 13:00, 3 d, so the bar runs to Mon 12 12:00 | grab "3 d"; nudge stays 1440; resize to 14.01 gives 4 d, ghost Tue 13 12:00 | equal. Without `durationMinutes` the nudge would commit 4 d, which is why that option exists |

**Files:**
- Modify: `src/features/schedule/gantt/drag.ts`, `src/features/schedule/ScheduleGantt.tsx`
- Test: `src/features/schedule/gantt/drag.test.ts`, `src/features/schedule/ScheduleGantt.test.tsx`, `e2e/schedule.spec.ts`
- Unchanged:
  - `src/data/types.ts`, the engine, `hit-test.ts`, `renderer.ts`, and the `nonWorkingDays` weekend shading in `ScheduleGantt.tsx`.
  - The progress and link-draw drag modes.

**Interfaces:**
- Produces (`src/features/schedule/gantt/drag.ts`):
  - `export interface GanttWorkDays { isWorkingDay(day: number): boolean; dayStartOffset(day: number): number; }`. Here `day` is a civil day index as in `civilDaysFromYmd`. `dayStartOffset` returns the minutes after midnight at which that day's first working period starts.
  - `export function createGanttWorkDays(calendar: ScheduleCalendar | null): GanttWorkDays`
  - `export interface GanttDragOptions { hoursPerDay?: number; calendar?: ScheduleCalendar | null; durationMinutes?: number | null; }`
  - `startGanttDrag(target: GanttHitTarget, pointerX: number, pointerY: number, options: GanttDragOptions = {}): GanttDragState | null`. The options type is widened. The change is additive, so existing calls still compile.
  - `GanttDragState` gains `initialDays: number` and `workDays: GanttWorkDays`. Only `startGanttDrag` constructs this type.
  - `updateGanttDrag` and `commitGanttDrag` keep their signatures.
- Consumes:
  - `ScheduleCalendar` (type only) from `@/data/schedule-types`.
  - `dayOfWeekFromDays`, `wallClockToCivilMinutes`, `ymdFromCivilDays`, `MINUTES_PER_DAY` from `@/lib/civil-date`.
- Callers affected:
  - `ScheduleGantt.tsx` `handlePointerDown` (the only production caller) now passes `calendar` and `durationMinutes`.
  - `drag.test.ts`.

- [ ] **Step 1: Write the failing tests**

**`src/features/schedule/gantt/drag.test.ts`**

Add these imports and fixtures under the existing `rows`:

```ts
import { makeStandardCalendar } from '@/engine/testing';

const standard = makeStandardCalendar(); // Mon–Fri 08:00–12:00, 13:00–17:00, 8 h/day
// Monday 12.01.2026 is a holiday on the site calendar.
const siteHoliday = makeStandardCalendar('cal:site', {
  exceptions: [{ date: '2026-01-12', periods: [] }],
});
const at = (month: number, day: number, hour = 0, minute = 0): number =>
  civilDaysFromYmd(2026, month, day) * MINUTES_PER_DAY + hour * 60 + minute;
```

1. **Correct** `'snaps bar-move to whole working days and commits an SNET constraint'`. It currently pins a Saturday: `badgeLabel: '10.01.2026'` and `date: '2026-01-10T08:00'`.
   - Start the drag with `startGanttDrag(hit, 160, 14, { hoursPerDay: 8, calendar: standard })`.
   - The move to x = 256 goes from Wed 07.01 to Sat 10.01, which snaps to Mon 12.01 08:00.
   - Assert:
     ```ts
     expect(moved.overlay).toMatchObject({
       kind: 'bar-ghost', mode: 'bar-move', startMinute: at(1, 12, 8), badgeLabel: '12.01.2026',
     });
     expect(commitGanttDrag(moved)).toEqual({
       type: 'updateActivity', activityId: 'a1',
       changes: { constraint: { type: 'start_on_or_after', date: '2026-01-12T08:00' } },
     });
     ```
2. **Correct** `'snaps bar-resize to working days (min 1 day) and commits originalDuration and remainingDuration'`. It currently pins `badgeLabel: '7 d'` and `originalDuration: 7 * 8 * 60`.
   - Start the drag with `startGanttDrag(hit, 222, 16, { hoursPerDay: 8, calendar: standard })`.
   - Fix the comment: a1 covers Wed 07, Thu 08 and Fri 09, which is 3 working days. Extending to x = 288 (the 14.01 boundary) adds Mon 12 and Tue 13, giving 5 working days, which is 2400 min.
   - Assert:
     ```ts
     expect(started.overlay).toMatchObject({ badgeLabel: '3 d' }); // new: badge on grab
     const resized = updateGanttDrag(started, 288, 16, rows, ts, 0, 0);
     expect(resized.overlay).toMatchObject({
       kind: 'bar-ghost', mode: 'bar-resize', finishMinute: at(1, 14), badgeLabel: '5 d',
     });
     expect(commitGanttDrag(resized)).toEqual({
       type: 'updateActivity', activityId: 'a1',
       changes: { originalDuration: 5 * 8 * 60, remainingDuration: 5 * 8 * 60 },
     });
     ```
   - The clamp block (x = 10 gives `'1 d'` and 480) stays as it is. The probe confirms 3 + (−5) clamps to 1.
3. **New** `"skips weekends and the activity calendar's holidays when moving and resizing"`:
   ```ts
   const moveHit = hitTestGanttTarget(160, 14, rows, ts, 0, 0, true)!;
   // Sat 10 -> Sun 11 -> holiday Mon 12 -> Tue 13.01
   const moved = updateGanttDrag(
     startGanttDrag(moveHit, 160, 14, { hoursPerDay: 8, calendar: siteHoliday })!, 256, 14, rows, ts, 0, 0);
   expect(moved.overlay).toMatchObject({ startMinute: at(1, 13, 8), badgeLabel: '13.01.2026' });
   expect(commitGanttDrag(moved)).toEqual({
     type: 'updateActivity', activityId: 'a1',
     changes: { constraint: { type: 'start_on_or_after', date: '2026-01-13T08:00' } },
   });
   // Moving left onto Sun 04.01 snaps forward to Mon 05.01, as Calculate does with a weekend SNET
   const movedBack = updateGanttDrag(
     startGanttDrag(moveHit, 160, 14, { hoursPerDay: 8, calendar: standard })!, 64, 14, rows, ts, 0, 0);
   expect(movedBack.overlay).toMatchObject({ startMinute: at(1, 5, 8), badgeLabel: '05.01.2026' });
   expect(commitGanttDrag(movedBack)).toMatchObject({
     changes: { constraint: { type: 'start_on_or_after', date: '2026-01-05T08:00' } },
   });
   // Resizing to the 14.01 boundary adds only Tue 13 (Mon 12 is a holiday): 3 + 1 = 4 d
   const resizeHit = hitTestGanttTarget(222, 16, rows, ts, 0, 0, true)!;
   const resized = updateGanttDrag(
     startGanttDrag(resizeHit, 222, 16, { hoursPerDay: 8, calendar: siteHoliday })!, 288, 16, rows, ts, 0, 0);
   expect(resized.overlay).toMatchObject({ badgeLabel: '4 d' });
   expect(commitGanttDrag(resized)).toEqual({
     type: 'updateActivity', activityId: 'a1',
     changes: { originalDuration: 1920, remainingDuration: 1920 },
   });
   ```
4. **New** `'previews the dates Calculate gives and keeps the real duration on a nudge'`. The rows here are real `solve()` results; see the probe evidence table.
   ```ts
   const opts = { hoursPerDay: 8, calendar: standard, durationMinutes: 3 * 480 };
   // 3 d with SNET Wed 07.01 08:00 solves to Wed 07.01 08:00 -> Fri 09.01 17:00
   const solved: GanttRow = { ...rows[0]!, start: at(1, 7, 8), finish: at(1, 9, 17), progressFinish: null };
   const x2 = ts.x(at(1, 9, 17)); // 150.67
   const resizeStart = startGanttDrag(
     hitTestGanttTarget(x2 - 2, 16, [solved], ts, 0, 0, true)!, x2 - 2, 16, opts)!;
   expect(resizeStart.mode).toBe('bar-resize');
   expect(resizeStart.overlay).toMatchObject({ badgeLabel: '3 d' });
   const resized = updateGanttDrag(resizeStart, 288, 16, [solved], ts, 0, 0);
   expect(resized.overlay).toMatchObject({
     startMinute: at(1, 7, 8), finishMinute: at(1, 13, 17), badgeLabel: '5 d',
   });
   expect(commitGanttDrag(resized)).toMatchObject({ changes: { originalDuration: 2400, remainingDuration: 2400 } });
   const nudged = updateGanttDrag(resizeStart, x2 + 1, 16, [solved], ts, 0, 0);
   expect(nudged.overlay).toMatchObject({ finishMinute: at(1, 9, 17), badgeLabel: '3 d' });
   expect(commitGanttDrag(nudged)).toMatchObject({ changes: { originalDuration: 1440, remainingDuration: 1440 } });

   const mid = (ts.x(at(1, 7, 8)) + x2) / 2; // 112.67
   const moveStart = startGanttDrag(hitTestGanttTarget(mid, 14, [solved], ts, 0, 0, true)!, mid, 14, opts)!;
   expect(moveStart.mode).toBe('bar-move');
   const moved = updateGanttDrag(moveStart, mid + 96, 14, [solved], ts, 0, 0);
   expect(moved.overlay).toMatchObject({
     startMinute: at(1, 12, 8), finishMinute: at(1, 14, 17), badgeLabel: '12.01.2026',
   });

   // Mid-day start: 3 d with SNET Wed 07.01 13:00 solves to Mon 12.01 12:00 (the bar touches 4 days)
   const midday: GanttRow = { ...solved, start: at(1, 7, 13), finish: at(1, 12, 12) };
   const mx2 = ts.x(at(1, 12, 12)); // 240
   const middayStart = startGanttDrag(
     hitTestGanttTarget(mx2 - 2, 16, [midday], ts, 0, 0, true)!, mx2 - 2, 16, opts)!;
   expect(middayStart.overlay).toMatchObject({ badgeLabel: '3 d' });
   expect(commitGanttDrag(updateGanttDrag(middayStart, mx2 + 1, 16, [midday], ts, 0, 0)))
     .toMatchObject({ changes: { originalDuration: 1440 } });
   const middayResized = updateGanttDrag(middayStart, 288, 16, [midday], ts, 0, 0);
   expect(middayResized.overlay).toMatchObject({ finishMinute: at(1, 13, 12), badgeLabel: '4 d' });
   expect(commitGanttDrag(middayResized)).toMatchObject({ changes: { originalDuration: 1920, remainingDuration: 1920 } });
   ```
   For reference, the raw minute values: `at(1,13,17)` = 29472060, `at(1,12,8)` = 29470080, `at(1,14,17)` = 29473500, `at(1,13,12)` = 29471760, `at(1,14)` = 29472480.

**`src/features/schedule/ScheduleGantt.test.tsx`**

- Add `makeStandardCalendar` to the `@/engine/testing` import.
- In `'dispatches updateActivity on bar resize and move, …'`, tighten two loose assertions. Neither pins wrong behaviour; this pins the integration:
  - Step 1: replace `originalDuration: expect.any(Number), remainingDuration: expect.any(Number)` with `originalDuration: 2880, remainingDuration: 2880`.
    - Why 2880: a1 is 2400 min, so 5 d. Its finish is Sat 10.01 17:00, so the finish boundary is 11.01.
    - The pointer at x = 310 is origin 03.01 + 9.6875 d, which rounds to the 13.01 boundary.
    - The working days in [11, 13) are Mon 12 alone, so the result is 6 d.
  - Step 2: replace `expect.stringMatching(/^2026-01-\d{2}T08:00$/)` with `'2026-01-07T08:00'` (+64 px from Mon 05 is Wed 07, a working day).
- New test `"moves a bar to the next working day on the activity's own calendar"`:
  - Setup: the same as the edit test, but with one activity a1 and `calendarId: 'cal:site'`.
    - `calendars: [makeStandardCalendar('cal:standard'), makeStandardCalendar('cal:site', { exceptions: [{ date: '2026-01-07', periods: [] }] })]`. This keeps the default calendar `cal:standard`.
    - Keep the same `sourceDates` and `displayMode: 'as_imported'`, with `mode="edit"` and `onDispatch = vi.fn()`.
  - Act: `pointerDown` at (140, 16), `pointerMove` to (204, 16), `pointerUp` at (204, 16).
  - Assert:
    ```ts
    expect(onDispatch).toHaveBeenLastCalledWith({
      type: 'updateActivity', activityId: 'a1',
      changes: { constraint: { type: 'start_on_or_after', date: '2026-01-08T08:00' } },
    });
    ```
    Wed 07.01 is a holiday on `cal:site` only. Thu 08 proves that the activity's calendar is used, not the default.

**`e2e/schedule.spec.ts`**, test `'supports Ctrl+K command palette activity jump and Gantt canvas bar resize & link drawing with Undo'`

It currently pins `await expect(a1010Row).toContainText('8 d');` (line 247). It also depends on the weekday of the run: the pixel offsets 212, 223 and 67 hit A1010's handle and ports only when A1010 starts on a Monday, which happens when today − 2 falls on Sat, Sun or Mon.

- Pin the clock. Insert `await page.clock.setFixedTime(new Date(2026, 10, 25, 10, 0));` as the first line of the test, before `openProject`.
  - Its comment: "Wed 25.11.2026: the seeded status date (2 days before) is Mon 23.11, so A1010 runs Mon 23.11 08:00 → Fri 27.11 17:00 (x1 74.67, x2 214.67 at Day zoom)".
  - The probe confirms that x = 212 is `bar-resize` and x = 223 is `link-port-finish` with that geometry.
- Update the comment on line 234 to: "drag A1010 right resize handle (+96 px = Sat 28, Sun 29, Mon 30 → one more working day → 6 d)".
- Replace line 247 with `await expect(a1010Row).toContainText('6 d');`.
  - Why 6 d: the pointer at x = 308 is Mon 30.11 15:00, which rounds to the 01.12 boundary. The working days in [28.11, 01.12) are Mon 30 alone, so 5 + 1 = 6.
- Everything after that stays the same: the Undo back to `'5 d'` and the link drawing.

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/features/schedule/gantt/drag.test.ts src/features/schedule/ScheduleGantt.test.tsx`

Expected: FAIL, 6 tests. Vitest does not type-check, so the new option names run against the old code:

| Test | Expected | Received |
|---|---|---|
| bar-move | `badgeLabel` `'12.01.2026'` | `'10.01.2026'` |
| bar-resize | grab `badgeLabel` `'3 d'` | `'5 d'` |
| holidays | `'13.01.2026'` | `'10.01.2026'` |
| previews | `'5 d'` | `'7 d'` |
| Gantt edit test | `originalDuration` 2880 | 3840 |
| new Gantt test | `date` `'2026-01-08T08:00'` | `'2026-01-07T08:00'` |

The progress and link tests stay green. `npm run typecheck` also fails: `'calendar' does not exist in type '{ hoursPerDay?: number }'`.

- [ ] **Step 3: Implement**

**`src/features/schedule/gantt/drag.ts`**

- Import `type { RelationshipType, ScheduleCalendar }` from `@/data/schedule-types`.
- Import `dayOfWeekFromDays`, `MINUTES_PER_DAY`, `wallClockToCivilMinutes` and `ymdFromCivilDays` from `@/lib/civil-date`.
- Add `const MAX_SCAN_DAYS = 3660;`. No scan ever walks more days than this, so a calendar with no working days cannot hang a drag.

`createGanttWorkDays(calendar)` builds the working-day view:
- With `calendar === null`: Mon–Fri are working days and `dayStartOffset` is 480. This is the same fallback as `nonWorkingDays` in `ScheduleGantt.tsx`.
- Otherwise:
  - Build `Map<day, periods>` from `calendar.exceptions`, with `day = Math.floor(wallClockToCivilMinutes(e.date)! / MINUTES_PER_DAY)`. Skip entries where that is `null`; when a date repeats, the last one wins (like `compileCalendar`).
  - The periods for a day are its exception entry if there is one, else `calendar.week[dayOfWeekFromDays(day)] ?? []`. Keep only periods with `Math.min(1440, p.finish) > Math.max(0, p.start)`, as the engine's `normalizePeriods` does.
  - `isWorkingDay(day)` is true when at least one period remains.
  - `dayStartOffset(day)` is the smallest remaining `Math.max(0, p.start)`, or 480 when no period remains.

Module-private helpers. These are not determined by the tests, so implement them exactly as written:

```ts
function nextWorkingDay(work: GanttWorkDays, day: number): number {
  for (let d = day; d < day + MAX_SCAN_DAYS; d++) if (work.isWorkingDay(d)) return d;
  return day;
}
function previousWorkingDay(work: GanttWorkDays, day: number): number {
  for (let d = day; d > day - MAX_SCAN_DAYS; d--) if (work.isWorkingDay(d)) return d;
  return day;
}
/** Working days d with from <= d < to (0 when to <= from). */
function countWorkingDays(work: GanttWorkDays, from: number, to: number): number {
  let n = 0;
  for (let d = from; d < to && d < from + MAX_SCAN_DAYS; d++) if (work.isWorkingDay(d)) n++;
  return n;
}
function signedWorkingDays(work: GanttWorkDays, from: number, to: number): number {
  return to >= from ? countWorkingDays(work, from, to) : -countWorkingDays(work, to, from);
}
/** Moves a finish instant by n working days, keeping its time of day (a 00:00 finish belongs to the day before). */
function shiftFinishByWorkingDays(work: GanttWorkDays, finish: number, n: number): number {
  if (n === 0) return finish;
  const lastDay = Math.ceil(finish / MINUTES_PER_DAY) - 1;
  const timeOfDay = finish - lastDay * MINUTES_PER_DAY; // 1..1440
  let day = previousWorkingDay(work, lastDay);
  const step = n > 0 ? 1 : -1;
  for (let left = Math.abs(n), guard = 0; left > 0 && guard < MAX_SCAN_DAYS; guard++) {
    day += step;
    if (work.isWorkingDay(day)) left--;
  }
  return day * MINUTES_PER_DAY + timeOfDay;
}
```

`startGanttDrag`:
- `workDays = createGanttWorkDays(options.calendar ?? null)`.
- `hoursPerDay` is `options.hoursPerDay` when it is > 0. Otherwise it is `options.calendar.hoursPerDay` when that is > 0, else 8.
- `startDay = Math.floor(startMin / MINUTES_PER_DAY)`.
- `initialDays`:
  - When `options.durationMinutes` is a number > 0, it is `Math.max(1, Math.round(durationMinutes / (hoursPerDay * 60)))`. This is the row's real duration.
  - Otherwise it is `Math.max(1, countWorkingDays(workDays, startDay, Math.ceil(finishMin / MINUTES_PER_DAY)))`.
- Set `newDurationMinutes: initialDays * hoursPerDay * 60` and the resize badge `` `${initialDays} d` ``.
- Store `initialDays` and `workDays` in both returned states (link-draw and bar).
- Delete the old `endDay`/`initialDays` lines 98-101.

`updateGanttDrag`, `'bar-move'`:
- Keep `deltaDays = Math.round(deltaMinutes / MINUTES_PER_DAY)`. With `initialStartDay = Math.floor(initialStart / MINUTES_PER_DAY)`:
  - `snappedDay = nextWorkingDay(workDays, initialStartDay + deltaDays)`. This always snaps forward, even when dragging left.
  - `snappedStart = snappedDay * MINUTES_PER_DAY + workDays.dayStartOffset(snappedDay)`.
  - `snappedFinish` is `snappedStart` when `span === 0` (milestones). Otherwise it is `shiftFinishByWorkingDays(workDays, initialFinish, signedWorkingDays(workDays, initialStartDay, snappedDay))`.
  - `progressMinute = percentComplete > 0 ? snappedStart + Math.round(((snappedFinish - snappedStart) * percentComplete) / 100) : null`.
  - `badgeLabel = formatDayDmy(snappedDay)`.

`updateGanttDrag`, `'bar-resize'`:
- With `finishBoundary = Math.ceil(initialFinish / MINUTES_PER_DAY)` and `pointerBoundary = Math.round(pointerMinute / MINUTES_PER_DAY)`:
  - `workingDays = Math.max(1, initialDays + signedWorkingDays(workDays, finishBoundary, pointerBoundary))`.
  - `newDurationMinutes = workingDays * hoursPerDay * 60`.
  - `snappedFinish = shiftFinishByWorkingDays(workDays, initialFinish, workingDays - initialDays)`.
  - Keep the `progressMinute` formula and `` `${workingDays} d` ``.

`commitGanttDrag`, `'bar-move'`:
- The date becomes `formatMinuteClock(state.snappedStart)`, formatted `YYYY-MM-DDTHH:mm` from `Math.floor(m / 1440)` and `m % 1440`. It is `T08:00` on the standard calendar.
- Remove `formatDayClock08`.

**`src/features/schedule/ScheduleGantt.tsx`**

- Add `ScheduleCalendar` to the `@/data/schedule-types` type import.
- Add a module-level `function calendarForActivity(doc: ScheduleDocument, activityId: string): ScheduleCalendar | null`. It returns the calendar whose `id` equals the activity's `calendarId`. When there is none, it falls back to `settings.defaultCalendarId`, then `calendars[0]`, then `null`.
- In `handlePointerDown`, call `startGanttDrag(target, x, y, { hoursPerDay: visRow?.hoursPerDay ?? 8, durationMinutes: visRow?.durationMinutes ?? null, calendar: calendarForActivity(scheduleDoc, target.row.key.slice(4)) })`.

Calling `find` once per pointer-down is enough; no new memo is needed.

- [ ] **Step 4: Run the checks**

Run: `npm run check && npm run build && npm run test:e2e`

Expected:
- `npm run check`: typecheck and lint are clean, and Vitest is all green, including the 6 tests above. Contrast OK, and the engine suite passes in all 4 time zones (no engine change).
- `npm run build`: succeeds.
- Playwright: 0 failed. The resize test now shows `6 d`, then `5 d` after Undo, then the A1010 link. That was 37 passed at 8d0de4b, plus any tests that other fix tasks add.
- No `test:db`, `test:integration` or `db:types` run is needed: there are no data-layer or SQL changes.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "fix: snap Gantt move and resize to working days on the activity calendar"
```

---

### Task F7: Database hardening and folder delete

**Fixes:**
- PR6-1 / P4 later D5 (owner decision): `public.delete_folder` re-parents the children while the deleted folder still exists (`20261123120000_p4_later_programs_folders_copy.sql:403`). The plain unique index `folders_sibling_name_uq` (`project_id, coalesce(parent_id, zero-uuid), lower(trim(name))`; not deferrable) then raises 23505 when a child is named like the deleted folder or like a folder already at the parent level. The UI shows "A folder with this name already exists here." on Delete (`errors.ts:34`, `FolderSidebar.tsx:137`). `MockRepository.deleteFolder` (`MockRepository.ts:837-857`) re-parents without a check, so it succeeds and leaves duplicate sibling names, which breaks R3. After the fix, deleting always succeeds on both adapters, and each clashing moved child gets `"{name} (n)"` with the lowest free n ≥ 2.
- PR4-2: R11 is checked only inside `update_schedule_details` and `set_schedules_archived`. An editor holds column UPDATE on `status_date` and `archived_at` (`p3_core_schedules.sql:430`), and RLS checks only the role. So a direct PostgREST PATCH by another editor archives or re-dates a schedule while someone else holds the lock. Verified in a rolled-back probe: both UPDATEs returned `UPDATE 1`. After the fix, the BEFORE UPDATE trigger function `app.guard_schedule_update` refuses this with the RPCs' own error. P3 core D13 says "invariants live in triggers so direct calls obey them".
- PR4-3: `decodeScheduleDocument` (`src/data/schedule-codec.ts:40-49`) gunzips on the main thread with no size cap. fflate 0.8.3 `gunzipSync` allocates `new Uint8Array(ISIZE)` straight from the gzip trailer (`node_modules/fflate/esm/browser.js:1384-1388`, `gzl` at :992). After the fix, input over the stored-snapshot limit and a trailer that declares more than 256 MiB are refused as `too_large` before gunzip.
- PR4 review, minor, same migration:
  - `save_schedule_data` checks `if v_current_rev <> p_expected_revision`, so a NULL expected revision skips the R5 check and the save goes through. This was probed: before the fix, the NULL save succeeded.
  - `app.display_name` falls back to the profile email (`p4_core_schedule_data.sql:65-69`). The P4 core plan (`docs/superpowers/plans/2026-11-20-phase4-core.md:572`) says: "returns trimmed `first_name || ' ' || last_name` from `public.profiles` (falling back to `'Another user'`)". The email fallback also shows a member's email to share recipients. The mock's `displayNameOf` (`MockRepository.ts:290-295`) has the same email fallback and is fixed too, so both adapters match.

- P4 core D16 (owner, 2026-11-26): the lock-lost copy of R2/R5 becomes "Your edit lock expired. Download your changes or reload the schedule." (F6 adds the download button). The copy lives in two SQL functions, the mock and the banner, so it changes here with the migration that already replaces `save_schedule_data`.

**Spec:**
- P4 later D5 (`docs/superpowers/specs/2026-11-23-phase4-later-design.md:353`): "Deleting a folder always succeeds. Its child folders move up to its parent; a moved folder whose name clashes (ignoring case and surrounding spaces) with a folder already there, or with the deleted folder itself, is renamed "{name} (2)", "{name} (3)" and so on, the lowest free number. Both adapters behave the same."
- P4 later R3 (sibling names unique ignoring case, 1..80 chars) and R4 (children and schedules move to the parent in one transaction; schedules' `updated_at` unchanged).
- P4 core §4.3 R5 (`docs/superpowers/specs/2026-11-20-phase4-core-design.md:353`): "Saving requires … `data_revision = p_expected_revision`". R11 (`:359`): archiving or changing `status_date` while another user holds an active lock is refused with `'conflict'` "This schedule is being edited by {name}. Try again once they finish." R8 (`:356`): bucket limit 20 MB (`20,971,520` bytes).
- P3 core D13 (`docs/superpowers/specs/2026-11-05-phase3-core-design.md:830`): "invariants live in triggers so direct calls obey them".
- Phase 2 plan, Global Constraints: `p_` parameters; definer and trigger functions use `security definer set search_path = ''` with schema-qualified names; user-facing errors carry `hint = 'app'`; every migration that creates a function ends with `revoke execute … from public, anon, authenticated` and then grants explicitly; migrations are created with `npx supabase migration new`; `database.types.ts` is regenerated in the same commit.
- Decisions this task makes (no spec text covers them; controller calls of 2026-11-26, the new copy approved by the owner):
  - A renamed name that would pass 80 characters keeps its suffix, and the base is cut: `rtrim(left(base, 80 - length(' (n)'))) || ' (n)'`. Without this, the folders length check would make the delete fail, which D5 forbids.
  - When several clashing children are renamed, they are numbered in `created_at, id` order. Order matters only when two cut-down names collide.
  - New copy: "This schedule is too large to open." It mirrors the existing "This schedule is too large to save.".

**Files:**
- Create: `supabase/migrations/<timestamp>_p4_fixes.sql`, made by `npx supabase migration new p4_fixes`. Never edit an existing migration.
- Create: `supabase/tests/13_p4_fixes.test.sql` (`plan(20)`)
- Modify: `src/data/schedule-codec.ts` (new export `MAX_SCHEDULE_JSON_BYTES`, the decode caps and the encode JSON cap)
- Modify: `src/data/mock/MockRepository.ts` (`deleteFolder` D5, a new module-level `freeFolderName`, and `displayNameOf` without the email)
- Modify: `src/data/repository.ts` (TSDoc on `deleteFolder` only; the signature is unchanged)
- Modify: `src/pages/SchedulePage.tsx` (the lock-lost banner text only, D16)
- Test: `src/test/contract/repository.contract.ts` (one new `it`, which runs on the mock via `src/test/contract/mock.contract.test.ts` and on Supabase via `integration/supabase.contract.itest.ts`), `src/data/schedule-codec.test.ts` (five new `it`s), `src/data/mock/MockRepository.test.ts` (one new `it`); the D16 copy in `supabase/tests/11_schedule_data.test.sql` (2 expected messages), `src/test/contract/repository.contract.ts` (2 expected messages) and `src/hooks/useScheduleLock.test.tsx` (the fake conflict message)
- Unchanged on purpose: `src/data/supabase/database.types.ts` (no signature changes), `src/data/supabase/SupabaseRepository.ts`, `src/data/supabase/errors.ts` (create and rename still raise `folders_sibling_name_uq`), and all UI except the SchedulePage banner text. The folder-delete dialog copy ("Child folders and schedules inside it will move to its parent folder. No schedules are deleted.") is still true. `useDeleteFolder` already invalidates `allFolders`, `library` and `allSchedules`, so renamed children show at once.
- Verified drafts: the migration and the pgTAP file below were run in rolled-back transactions on the local stack. Before the fix, 14 of the 20 pgTAP assertions fail; after it, all 20 pass. All 12 existing pgTAP files (376 assertions) still pass with the migration applied, and `02_privileges` is unchanged. The drafts are at `<scratchpad>/plan-fix/F7-probe/` (`migration.sql`, `13_p4_fixes.test.sql`). The mock algorithm and the contract sequence were run in `F7-probe/mock/probe.ts`, and the codec caps in `F7-probe/codec/probe.ts`.

**Interfaces:**
- Consumes, all unchanged in signature, so their grants are kept and `db:types` shows no change:
  - `public.delete_folder(p_folder_id uuid) returns void`, `security definer`, granted to `authenticated`. Its caller chain is `SupabaseRepository.deleteFolder` (`SupabaseRepository.ts:266`), then `useDeleteFolder` (`src/hooks/useFolders.ts:64`), then `FolderSidebar.handleConfirmDelete` (`FolderSidebar.tsx:133`). Behaviour change: it no longer fails with 23505, and it may rename moved children.
  - `public.save_schedule_data(p_schedule_id uuid, p_expected_revision int, p_data_file_path text, p_activity_count int, p_calculation_mode text, p_status_date date) returns table (data_revision int, previous_data_file_path text)`, `security definer`, granted to `authenticated`. Its only caller is `SupabaseRepository.saveScheduleDocument` (`:847`), which always passes a number. Behaviour change for NULL only.
  - `public.renew_schedule_lock(p_schedule_id uuid)`, `security definer`, granted to `authenticated`: only its expired-lock message changes (D16).
  - `app.display_name(p_user_id uuid) returns text`, `stable security definer`, granted to `authenticated`. It is used by `schedule_items.locked_by_name`, by `user_name` in `acquire_schedule_lock` and `renew_schedule_lock`, and by the R1 and R11 messages. The mapper already falls back to "Another user" (`mappers.ts:197,238`).
  - `app.guard_schedule_update() returns trigger`, used by trigger `schedules_guard_update` (BEFORE UPDATE on `public.schedules`, for each row; the trigger is not recreated). It now runs the R11 check on every UPDATE by a signed-in caller. Effect on each RPC that updates schedules:
    - `update_schedule_details` and `set_schedules_archived` refuse the same case earlier, with the same message.
    - `save_schedule_data` always runs for the lock holder.
    - `set_current_schedule`, `move_schedules_to_folder`, `delete_folder`, `materialize_schedule_data` and the lock RPCs never change `status_date` or `archived_at`.
    - Service-role and seed writes (`auth.uid()` null) are not checked.
- Produces (TypeScript): `export const MAX_SCHEDULE_JSON_BYTES = 268_435_456` in `src/data/schedule-codec.ts`.
  - `decodeScheduleDocument` throws a new `ScheduleCodecError('too_large', 'This schedule is too large to open.')`. Callers already map any `ScheduleCodecError` to `RepositoryError('validation', err.message)`: `SupabaseRepository.getScheduleDocument` (`:777-783`) and `MockRepository.importSchedule` (`:886-891`).
  - `encodeScheduleDocument` also throws `too_large` "This schedule is too large to save." when the JSON passes the cap. Its callers are `SupabaseRepository.encodeSnapshot` (`:1097`), `useImportParser.ts:26` and `src/test/fakes.ts:240`.

- [ ] **Step 1: Write the failing tests**

1. `supabase/tests/13_p4_fixes.test.sql`, exactly:

```sql
begin;
\ir _helpers.psql
select plan(20);

create function tests.root_folder(p_code text, p_name text) returns uuid
language sql stable security definer set search_path = '' as $$
  select f.id from public.folders f
  join public.projects p on p.id = f.project_id
  where p.code = p_code and f.parent_id is null and f.name = p_name
$$;

create function tests.data_path(p_schedule_name text) returns text
language sql stable security definer set search_path = '' as $$
  select p.workspace_id || '/' || s.project_id || '/' || s.id || '/' || gen_random_uuid() || '.json.gz'
  from public.schedules s
  join public.projects p on p.id = s.project_id
  where s.name = p_schedule_name
$$;

grant execute on function tests.root_folder(text, text), tests.data_path(text) to authenticated;

do $$
declare
  v_olive uuid := tests.create_user('olive@test.dev', true, '{"first_name":"Olive","last_name":"Owner"}');
  v_ed1 uuid := tests.create_user('ed1@test.dev', true, '{"first_name":"Ed","last_name":"One"}');
  v_ed2 uuid := tests.create_user('ed2@test.dev', true, '{"first_name":"Ed","last_name":"Two"}');
  v_nameless uuid := tests.create_user('nameless@test.dev', true, '{}');
  v_crew uuid := tests.team_workspace('Crew', v_olive);
  v_p1 uuid;
  v_p2 uuid;
  v_p3 uuid;
  v_id uuid;
  v_sub uuid;
begin
  perform tests.add_member(v_crew, v_ed1, 'editor');
  perform tests.add_member(v_crew, v_ed2, 'editor');
  perform tests.add_member(v_crew, v_nameless, 'editor');
  v_p1 := tests.add_project(v_crew, 'P1');
  v_p2 := tests.add_project(v_crew, 'P2');
  v_p3 := tests.add_project(v_crew, 'P3');

  -- D5 layouts. P1: Updates > (updates, Q4 > Week 1); Site > (Archive, Old > archive).
  insert into public.folders (project_id, parent_id, name) values (v_p1, null, 'Updates') returning id into v_id;
  insert into public.folders (project_id, parent_id, name) values (v_p1, v_id, 'updates');
  insert into public.folders (project_id, parent_id, name) values (v_p1, v_id, 'Q4') returning id into v_sub;
  insert into public.folders (project_id, parent_id, name) values (v_p1, v_sub, 'Week 1');
  insert into public.folders (project_id, parent_id, name) values (v_p1, null, 'Site') returning id into v_id;
  insert into public.folders (project_id, parent_id, name) values (v_p1, v_id, 'Archive');
  insert into public.folders (project_id, parent_id, name) values (v_p1, v_id, 'Old') returning id into v_sub;
  insert into public.folders (project_id, parent_id, name) values (v_p1, v_sub, 'archive');
  -- P2: Plans, Drawings, Drawings (2); Plans > (Plans, drawings, Field).
  insert into public.folders (project_id, parent_id, name) values (v_p2, null, 'Drawings'), (v_p2, null, 'Drawings (2)');
  insert into public.folders (project_id, parent_id, name) values (v_p2, null, 'Plans') returning id into v_id;
  insert into public.folders (project_id, parent_id, name) values (v_p2, v_id, 'Plans'), (v_p2, v_id, 'drawings'), (v_p2, v_id, 'Field');
  -- P3: an 80-character name at the root and in Long.
  insert into public.folders (project_id, parent_id, name) values (v_p3, null, repeat('L', 80));
  insert into public.folders (project_id, parent_id, name) values (v_p3, null, 'Long') returning id into v_id;
  insert into public.folders (project_id, parent_id, name) values (v_p3, v_id, repeat('L', 80));

  -- R11 and R5 schedules. 'Current' is the project's first, so it is the current one.
  insert into public.schedules (project_id, name, code, source, status_date) values
    (v_p1, 'Current', 'CUR-1', 'blank', '2026-10-01'),
    (v_p1, 'Locked', 'LCK-1', 'blank', '2026-10-01'),
    (v_p1, 'Free', 'FRE-1', 'blank', '2026-10-01'),
    (v_p1, 'Expired', 'EXP-1', 'blank', '2026-10-01'),
    (v_p1, 'Saving', 'SAV-1', 'blank', '2026-10-01'),
    (v_p1, 'Nameless lock', 'NAM-1', 'blank', '2026-10-01');
  update public.schedules
    set locked_by = v_ed1, locked_at = now(), lock_expires_at = now() + interval '15 minutes'
    where name in ('Locked', 'Saving');
  update public.schedules
    set locked_by = v_ed1, locked_at = now() - interval '20 minutes', lock_expires_at = now() - interval '5 minutes'
    where name = 'Expired';
  update public.schedules
    set locked_by = v_nameless, locked_at = now(), lock_expires_at = now() + interval '15 minutes'
    where name = 'Nameless lock';
end $$;

-- 1-9. D5: deleting a folder always succeeds; clashing moved children get the lowest free " (n)".
select tests.authenticate_as(tests.user_id('ed1@test.dev'));
select lives_ok(
  $$ select public.delete_folder(tests.root_folder('P1', 'Updates')) $$,
  'D5: deleting a folder whose child has the same name succeeds');
select set_eq(
  $$ select name from public.folders where project_id = tests.project_id('P1') and parent_id is null $$,
  $$ values ('updates (2)'), ('Q4'), ('Site') $$,
  'D5: the child named like the deleted folder becomes "updates (2)"; the other child keeps its name');
select is(
  (select c.name from public.folders c where c.parent_id = tests.root_folder('P1', 'Q4')),
  'Week 1',
  'D5: a moved child keeps its own children');
select lives_ok(
  $$ select public.delete_folder((select id from public.folders where project_id = tests.project_id('P1') and name = 'Old')) $$,
  'D5: deleting a nested folder whose child clashes with a sibling succeeds');
select set_eq(
  $$ select name from public.folders where parent_id = tests.root_folder('P1', 'Site') $$,
  $$ values ('Archive'), ('archive (2)') $$,
  'D5: a child clashing with a folder at the parent level, ignoring case, becomes "archive (2)"');
select lives_ok(
  $$ select public.delete_folder(tests.root_folder('P2', 'Plans')) $$,
  'D5: deleting a folder with several clashing children succeeds');
select set_eq(
  $$ select name from public.folders where project_id = tests.project_id('P2') and parent_id is null $$,
  $$ values ('Drawings'), ('Drawings (2)'), ('drawings (3)'), ('Plans (2)'), ('Field') $$,
  'D5: several clashes take the lowest free numbers, 2 and 3');
select lives_ok(
  $$ select public.delete_folder(tests.root_folder('P3', 'Long')) $$,
  'D5: deleting a folder whose child has an 80-character clashing name succeeds');
select set_eq(
  $$ select name from public.folders where project_id = tests.project_id('P3') and parent_id is null $$,
  $$ values (repeat('L', 80)), (repeat('L', 76) || ' (2)') $$,
  'D5: a renamed name is cut so it stays within 80 characters');

-- 10-17. R11 in schedules_guard_update: direct writes obey the lock.
select tests.authenticate_as(tests.user_id('ed2@test.dev'));
select throws_ok(
  $$ update public.schedules set archived_at = now() where name = 'Locked' $$,
  '40001', 'This schedule is being edited by Ed One. Try again once they finish.',
  'R11: a direct archive by another editor is refused while the lock is active');
select throws_ok(
  $$ update public.schedules set status_date = '2026-10-20' where name = 'Locked' $$,
  '40001', 'This schedule is being edited by Ed One. Try again once they finish.',
  'R11: a direct status date change by another editor is refused while the lock is active');
select lives_ok(
  $$ update public.schedules set notes = 'Checked' where name = 'Locked' $$,
  'R11: other direct changes still work while the schedule is locked');
select lives_ok(
  $$ update public.schedules set archived_at = now(), status_date = '2026-10-20' where name = 'Free' $$,
  'R11: an unlocked schedule is archived and re-dated directly');
select lives_ok(
  $$ update public.schedules set archived_at = now() where name = 'Expired' $$,
  'R11: an expired lock does not block a direct archive');
select tests.authenticate_as(tests.user_id('ed1@test.dev'));
select lives_ok(
  $$ update public.schedules set status_date = '2026-10-20', archived_at = now() where name = 'Locked' $$,
  'R11: the lock holder changes the status date and archives directly');
select tests.clear_authentication();
select lives_ok(
  $$ update public.schedules set status_date = '2026-10-21' where name = 'Saving' $$,
  'R11: writes without a signed-in user are not checked');
select tests.authenticate_as(tests.user_id('ed1@test.dev'));
select results_eq(
  $$ select name, status_date, archived_at is not null, notes from public.schedules
     where name in ('Expired', 'Free', 'Locked', 'Saving') order by name $$,
  $$ values ('Expired'::text, '2026-10-01'::date, true, null::text),
            ('Free', '2026-10-20', true, null),
            ('Locked', '2026-10-20', true, 'Checked'),
            ('Saving', '2026-10-21', false, null) $$,
  'R11: the allowed direct writes changed their rows');

-- 18. R5: a NULL expected revision is a stale revision.
select tests.authenticate_as(tests.user_id('ed1@test.dev'));
select throws_ok(
  $$ select * from public.save_schedule_data(tests.schedule_id('Saving'), null, tests.data_path('Saving'), 3, 'calculated', '2026-10-01') $$,
  '40001', 'This schedule was changed elsewhere. Reload and try again.',
  'R5: save refuses a NULL expected revision');

-- 19-20. Display name: first and last name, else 'Another user', never the email.
select tests.clear_authentication();
select is(app.display_name(tests.user_id('nameless@test.dev')), 'Another user',
  'display_name: a user without a first or last name is "Another user", not the email');
select tests.authenticate_as(tests.user_id('ed1@test.dev'));
select is(
  (select locked_by_name from public.schedule_items where name = 'Nameless lock'),
  'Another user',
  'schedule_items names a lock holder without a name "Another user"');

select tests.clear_authentication();
select * from finish();
rollback;
```

The setup inserts folders and locks directly as `postgres`, so `auth.uid()` is null and no guard runs. Every assertion is a top-level statement, as in `12_*` since commit `78dcf82`.

2. `src/test/contract/repository.contract.ts`, inside `describe('programs, folders, schedule duplication and library (P4 later)', …)`, directly after the `it('manages 3-level folder hierarchy, …')` block. No import changes are needed, because `ID` is already imported.

```ts
      it('deletes a folder whose moved children clash by name, renaming them "{name} (n)" with the lowest free number (D5)', async () => {
        const f = await makeFixture();
        const riverside = f.projectIds['001']!;
        const create = (name: string, parentId: ID | null = null) =>
          f.repository.createFolder({ projectId: riverside, parentId, name });
        const find = async (id: ID) => {
          const found = (await f.repository.listFolders(riverside)).find((x) => x.id === id);
          return found && { parentId: found.parentId, name: found.name };
        };

        // A child named like the deleted folder (ignoring case) is renamed; the others keep their names.
        const updates = await create('Updates');
        const sameName = await create('updates', updates.id);
        const q4 = await create('Q4', updates.id);
        const week1 = await create('Week 1', q4.id);
        await f.repository.deleteFolder(updates.id);
        expect(await find(sameName.id)).toEqual({ parentId: null, name: 'updates (2)' });
        expect(await find(q4.id)).toEqual({ parentId: null, name: 'Q4' });
        expect(await find(week1.id)).toEqual({ parentId: q4.id, name: 'Week 1' });
        expect(await find(updates.id)).toBeUndefined();

        // A nested child clashing with a folder at the parent level.
        const site = await create('Site');
        const archive = await create('Archive', site.id);
        const old = await create('Old', site.id);
        const archiveChild = await create('archive', old.id);
        await f.repository.deleteFolder(old.id);
        expect(await find(archive.id)).toEqual({ parentId: site.id, name: 'Archive' });
        expect(await find(archiveChild.id)).toEqual({ parentId: site.id, name: 'archive (2)' });

        // Several clashes take the lowest free numbers: 2, and 3 because "Drawings (2)" exists.
        await create('Drawings');
        await create('Drawings (2)');
        const plans = await create('Plans');
        const plansChild = await create('Plans', plans.id);
        const drawingsChild = await create('  DRAWINGS ', plans.id);
        const field = await create('Field', plans.id);
        await f.repository.deleteFolder(plans.id);
        expect(await find(plansChild.id)).toEqual({ parentId: null, name: 'Plans (2)' });
        expect(await find(drawingsChild.id)).toEqual({ parentId: null, name: 'DRAWINGS (3)' });
        expect(await find(field.id)).toEqual({ parentId: null, name: 'Field' });

        // A renamed 80-character name is cut so the result stays within 80 characters.
        await create('L'.repeat(80));
        const long = await create('Long');
        const longChild = await create('L'.repeat(80), long.id);
        await f.repository.deleteFolder(long.id);
        expect(await find(longChild.id)).toEqual({ parentId: null, name: `${'L'.repeat(76)} (2)` });

        // R3 still holds: sibling names are unique ignoring case and surrounding spaces.
        const keys = (await f.repository.listFolders(riverside)).map(
          (x) => `${x.parentId ?? 'root'}/${x.name.trim().toLowerCase()}`,
        );
        expect(new Set(keys).size).toBe(keys.length);
      });
```

3. `src/data/schedule-codec.test.ts`:
   - Add `MAX_SCHEDULE_JSON_BYTES` to the existing import from `@/data/schedule-codec`.
   - Add these helpers below `sampleDoc`:

```ts
/** A copy of `bytes` whose gzip trailer (ISIZE: last 4 bytes, little-endian) declares `isize`. */
function withIsize(bytes: Uint8Array, isize: number): Uint8Array {
  const copy = bytes.slice();
  new DataView(copy.buffer).setUint32(copy.byteLength - 4, isize, true);
  return copy;
}

async function gzippedSample(): Promise<Uint8Array> {
  return new Uint8Array(await (await encodeScheduleDocument(sampleDoc)).arrayBuffer());
}
```

   - Add these five tests inside `describe('schedule-codec', …)`:

```ts
  it('caps the decompressed snapshot at 256 MiB', () => {
    expect(MAX_SCHEDULE_JSON_BYTES).toBe(268_435_456);
  });

  it('refuses a snapshot whose gzip trailer declares more than the cap, before decompressing', async () => {
    const gz = await gzippedSample();
    for (const isize of [MAX_SCHEDULE_JSON_BYTES + 1, 0xffff_ffff]) {
      await expect(decodeScheduleDocument(withIsize(gz, isize))).rejects.toMatchObject({
        name: 'ScheduleCodecError',
        code: 'too_large',
        message: 'This schedule is too large to open.',
      });
    }
  });

  it('still reads a snapshot whose trailer declares exactly the cap', async () => {
    const gz = await gzippedSample();
    await expect(decodeScheduleDocument(withIsize(gz, MAX_SCHEDULE_JSON_BYTES))).resolves.toEqual(
      sampleDoc,
    );
  });

  it('reads a trailer that understates the size as corrupt, never as a document', async () => {
    const gz = await gzippedSample();
    await expect(decodeScheduleDocument(withIsize(gz, 10))).rejects.toMatchObject({
      name: 'ScheduleCodecError',
      code: 'corrupt',
    });
  });

  it('refuses input larger than the stored snapshot limit before reading it', async () => {
    const oversized = new Uint8Array(MAX_SCHEDULE_DATA_BYTES + 1);
    for (const input of [oversized, new Blob([oversized])]) {
      await expect(decodeScheduleDocument(input)).rejects.toMatchObject({
        name: 'ScheduleCodecError',
        code: 'too_large',
        message: 'This schedule is too large to open.',
      });
    }
  });
```

   The exactly-at-the-cap test makes fflate reserve a 256 MiB buffer. The probe measured under 4 ms and about 0 MB of RSS growth, because the memory is never touched (Node 24, Windows), so it is safe in CI.

4. `src/data/mock/MockRepository.test.ts`, a new `it` inside `describe('MockRepository', …)`:

```ts
  it('names a lock holder without a first or last name "Another user", never by email', async () => {
    store.write((db) => {
      const me = db.users.find((u) => u.id === db.currentUserId)!;
      me.firstName = '';
      me.lastName = '';
    });
    const up1 = (await repo.listSchedules(project('003').id)).find((s) => s.code === 'UP-01')!;
    const lock = await repo.acquireScheduleLock(up1.id);
    expect(lock.userName).toBe('Another user');
  });
```

5. D16 copy: in `supabase/tests/11_schedule_data.test.sql` (the R2 renew assertion and the R5 save assertion) and in `src/test/contract/repository.contract.ts` (the `renewScheduleLock` and `saveScheduleDocument` conflict expectations), replace `'Your edit lock expired. Copy your changes or reload the schedule.'` with `'Your edit lock expired. Download your changes or reload the schedule.'`. In `src/hooks/useScheduleLock.test.tsx` change the fake conflict message the same way (an input, so that test still passes).

- [ ] **Step 2: Run them to see them fail**

The local stack must be running (`npm run db:start`). The database is still at `20261123120000`.

```bash
npm run test:db
npx vitest run src/test/contract/mock.contract.test.ts -t "D5"
npx vitest run src/data/schedule-codec.test.ts src/data/mock/MockRepository.test.ts
npm run test:integration -- integration/supabase.contract.itest.ts -t "D5"
```

Expected:
- `test:db`: `13_p4_fixes.test.sql` fails 14 of 20: assertions 1–11 and 18–20. Assertions 12–17 pass already. The details:
  - 1, 4, 6 and 8 die with `23505: duplicate key value violates unique constraint "folders_sibling_name_uq"` (context: `update public.folders f set parent_id = v_parent_id …`).
  - 10 and 11 report `wanted: 40001`, because the UPDATE succeeds.
  - 18 reports `wanted: 40001`, because the NULL save succeeds.
  - 19 and 20 report `have: nameless@test.dev` and `want: Another user`.
  - `11_schedule_data.test.sql` fails its two D16 message assertions (`have: Your edit lock expired. Copy your changes or reload the schedule.`).
  - The other 11 files pass. The summary reads `Files=13, Tests=396` and `Result: FAIL`.
- Mock contract: 3 failed. The D5 test's first `toEqual` gets `{ parentId: null, name: 'updates' }`, and the two lock tests get the old copy.
- Codec and mock unit tests: 4 failed:
  - "caps the decompressed snapshot at 256 MiB" gets `undefined`.
  - "refuses a snapshot whose gzip trailer…": the promise resolves.
  - "refuses input larger…" gets `code: 'corrupt'`, "Could not read schedule data.".
  - "names a lock holder…" gets `'deniz.kaya@example.com'`.
  - "still reads … exactly the cap" and "understates … corrupt" already pass.
- Supabase contract: the two lock tests get the old copy, and the D5 test fails: `deleteFolder` rejects with `RepositoryError` `code: 'conflict'`, "A folder with this name already exists here.".

- [ ] **Step 3: Implement**

1. Run `npx supabase migration new p4_fixes` and fill the new file in this order. Start it with a header comment in the style of the earlier migrations, naming D5, R11 (P3 core D13), R5 and the display-name rule. Each `create or replace` keeps the function's signature and OID, so the trigger `schedules_guard_update` is not recreated.

   a. `public.delete_folder(p_folder_id uuid)`: `create or replace`, `returns void language plpgsql security definer set search_path = ''`.
      - Keep lines 389-401 of `20261123120000_p4_later_programs_folders_copy.sql` unchanged: the `for update` select, `no_data_found`/`hint = 'app'`/"Folder not found", then `insufficient_privilege` "Only editors and owners can manage folders.".
      - Add the declarations `v_taken text[]; v_child record; v_n int; v_suffix text; v_name text;`.
      - Between the role check and the existing three statements (re-parent, move schedules, delete), insert this block:

```sql
  -- D5: names already taken at the parent level (the deleted folder's own included) and by the
  -- moved children; a clashing child takes the lowest free "{name} (n)", cut to fit 80 characters.
  select coalesce(array_agg(lower(trim(f.name))), '{}') into v_taken
  from public.folders f
  where f.project_id = v_project_id
    and (f.parent_id is not distinct from v_parent_id or f.parent_id = p_folder_id);

  for v_child in
    select c.id, trim(c.name) as base
    from public.folders c
    where c.parent_id = p_folder_id
      and exists (
        select 1 from public.folders s
        where s.project_id = v_project_id
          and s.parent_id is not distinct from v_parent_id
          and lower(trim(s.name)) = lower(trim(c.name))
      )
    order by c.created_at, c.id
  loop
    v_n := 2;
    loop
      v_suffix := ' (' || v_n || ')';
      v_name := rtrim(left(v_child.base, 80 - char_length(v_suffix))) || v_suffix;
      exit when not (lower(v_name) = any (v_taken));
      v_n := v_n + 1;
    end loop;
    v_taken := v_taken || lower(v_name);
    update public.folders f set name = v_name where f.id = v_child.id;
  end loop;
```

      - The renames happen while each child is still under the deleted folder. `v_taken` holds every current child key and every name given so far, so no intermediate state breaks `folders_sibling_name_uq`. The re-parent `update` that follows moves children whose keys are all distinct from the parent level. `check_folder_hierarchy` still runs on the re-parent, and depth only drops.

   b. `app.guard_schedule_update()`: `create or replace`, `returns trigger language plpgsql security definer set search_path = ''`.
      - Declare `v_caller uuid := (select auth.uid());` and keep `if v_caller is null then return new; end if;`.
      - Then put the R11 check **first**, before the existing R4, R2 and R8 checks. Those checks stay verbatim from `p3_core_schedules.sql:79-89`. The order makes a direct archive of a locked current schedule get the same answer as `set_schedules_archived`, which checks R11 before it updates.

```sql
  if old.locked_by is not null
     and old.locked_by <> v_caller
     and old.lock_expires_at > now()
     and ((old.archived_at is null and new.archived_at is not null)
          or new.status_date is distinct from old.status_date) then
    raise exception using errcode = 'serialization_failure', hint = 'app',
      message = 'This schedule is being edited by ' || app.display_name(old.locked_by) || '. Try again once they finish.';
  end if;
```

      - Restoring (`archived_at` from non-null to null) and every other column stay unchecked, as R11 says.

   c. `app.display_name(p_user_id uuid)`: `create or replace`, `returns text language plpgsql stable security definer set search_path = ''`.
      - Copy `p4_core_schedule_data.sql:40-75` verbatim, including the privacy branch that returns 'Another user'.
      - Change only the final lookup to `select nullif(trim(concat_ws(' ', p.first_name, p.last_name)), '') into v_name from public.profiles p where p.id = p_user_id; return coalesce(v_name, 'Another user');`. The email is never read.

   d. `public.save_schedule_data(...)`: `create or replace` with the same six parameters and return table.
      - Copy `p4_core_schedule_data.sql:371-446` verbatim.
      - Change only line 421 to `if v_current_rev is distinct from p_expected_revision then`, and the lock message on line 419 to the D16 copy. The error stays `serialization_failure`, `hint = 'app'`, "This schedule was changed elsewhere. Reload and try again.".

   d2. `public.renew_schedule_lock(p_schedule_id uuid)`: `create or replace` with the same parameter and return table. Copy `p4_core_schedule_data.sql:207-249` verbatim, changing only the message on line 240 to "Your edit lock expired. Download your changes or reload the schedule.".

   e. Privileges, at the end (add `public.renew_schedule_lock(uuid)` to both lists):

```sql
revoke execute on function
  public.delete_folder(uuid),
  app.guard_schedule_update(),
  app.display_name(uuid),
  public.save_schedule_data(uuid, int, text, int, text, date),
  public.renew_schedule_lock(uuid)
from public, anon, authenticated;

grant execute on function
  public.delete_folder(uuid),
  app.display_name(uuid),
  public.save_schedule_data(uuid, int, text, int, text, date),
  public.renew_schedule_lock(uuid)
to authenticated;
```

      This keeps the ACLs exactly as before: `authenticated=X` on the three, and owner only on the trigger function. That was checked with `pg_proc.proacl` before and after. `02_privileges`' set of 26 executable functions is unchanged.

2. `src/data/schedule-codec.ts`:
   - Below `MAX_SCHEDULE_DATA_BYTES`, add the constant with TSDoc:

```ts
/**
 * Largest uncompressed snapshot JSON read or written: 256 MiB. A 50,000-activity, 150,000-link
 * document (2.5× the 20,000-activity limit) measures 41 MB of JSON, so real snapshots stay far
 * below it, and it is half of V8's longest string (2^29 − 24 characters), so decoding stays
 * within engine limits.
 */
export const MAX_SCHEDULE_JSON_BYTES = 268_435_456;
const TOO_LARGE_TO_OPEN = 'This schedule is too large to open.';
```

   - `encodeScheduleDocument`: right after `utf8` is built, `if (utf8.byteLength > MAX_SCHEDULE_JSON_BYTES) throw new ScheduleCodecError('too_large', 'This schedule is too large to save.');`. This stops a snapshot from being stored that the decoder would refuse. It has no unit test, because building a 256 MiB document is too heavy for the suite.
   - `decodeScheduleDocument`, before the `try`:
     - First, `const size = data instanceof Uint8Array ? data.byteLength : data.size;` and, if `size > MAX_SCHEDULE_DATA_BYTES`, throw `too_large` `TOO_LARGE_TO_OPEN`. A Blob is measured before it is read.
     - Then build `bytes` as today.
     - Then, when `bytes.byteLength >= 18` (a gzip member's 10-byte header plus its 8-byte trailer; shorter input is left to `gunzipSync`, which answers `corrupt`), read `new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(bytes.byteLength - 4, true)`. Use `byteOffset`, because callers may pass a subarray. If that value is `> MAX_SCHEDULE_JSON_BYTES`, throw `too_large` `TOO_LARGE_TO_OPEN`.
     - Add a one-line comment: "ISIZE (RFC 1952 §2.3.1) is the uncompressed size mod 2^32; fflate allocates its output from it".
     - A trailer that understates the size makes fflate truncate the output, which then fails as `corrupt` (pinned by the test).

3. `src/data/mock/MockRepository.ts`:
   - `LOCK_EXPIRED_COPY` becomes "Your edit lock expired. Download your changes or reload the schedule." (D16). In `src/pages/SchedulePage.tsx` the banner's text changes the same way.
   - Next to `displayNameOf`, add:

```ts
/** D5: `{name} (n)` with the lowest n ≥ 2 whose key isn't taken, the name cut so it fits 80 characters. */
function freeFolderName(name: string, taken: ReadonlySet<string>): string {
  const base = Array.from(name.trim()); // code points, as Postgres left() counts them
  for (let n = 2; ; n++) {
    const suffix = ` (${n})`;
    const candidate = base.slice(0, 80 - suffix.length).join('').trimEnd() + suffix;
    if (!taken.has(codeKey(candidate))) return candidate;
  }
}
```

   - In `deleteFolder`, replace the child re-parent loop (lines 848-851) with the code below. The schedule loop and the final filter stay as they are. `compareIds` is already imported.

```ts
        // R4 and D5: children move to the parent; one whose name clashes with a folder at the
        // parent level (the deleted one included) takes the lowest free "{name} (n)".
        const children = db.folders.filter((f) => f.parentId === folder.id);
        const atParent = new Set(
          db.folders
            .filter((f) => f.projectId === folder.projectId && f.parentId === folder.parentId)
            .map((f) => codeKey(f.name)),
        );
        const taken = new Set([...atParent, ...children.map((c) => codeKey(c.name))]);
        const clashing = children
          .filter((c) => atParent.has(codeKey(c.name)))
          .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt) || compareIds(a.id, b.id));
        for (const child of clashing) {
          child.name = freeFolderName(child.name, taken);
          taken.add(codeKey(child.name));
        }
        for (const child of children) child.parentId = folder.parentId;
```

   - `displayNameOf`: `return full !== '' ? full : 'Another user';`. Drop `user.email`.

4. `src/data/repository.ts`: add TSDoc above `deleteFolder`: `/** Editors and owners (R3). Always succeeds (D5): child folders and schedules move to the parent (R4); a moved folder whose name clashes there, or with the deleted folder, becomes "{name} (2)", "{name} (3)", … the lowest free number. */`.

Residual limits, not fixed here (logged in `docs/HANDOFF.md`):
- The ISIZE cap bounds the allocation, not the CPU time. A bomb whose trailer lies small still inflates fully before it fails as `corrupt`.
- Two concurrent deletes under one parent can still meet the unique index, because `create_folder` takes no parent-level lock.

- [ ] **Step 4: Run the checks**

```bash
npm run db:reset
npm run test:db
npm run db:types && git diff --exit-code -- src/data/supabase/database.types.ts
npm run check
npm run test:integration
npm run test:e2e:supabase
```

Expected:
- `db:reset` lists `Applying migration <timestamp>_p4_fixes.sql...`, seeds and exits 0.
- `test:db`: every file `ok`, `Files=13, Tests=396`, `Result: PASS`. That is 376 before plus 20. Add any pgTAP assertions an earlier F-task added.
- `db:types` + `git diff --exit-code` prints nothing and exits 0. No function signature, table or view changed. If it shows a diff, stop and report it; do not commit a types change for this task.
- `npm run check` ends with `Engine TZ check OK: 4 time zones passed`, after typecheck, lint (0 errors), Vitest (all files passed, 0 failed, including the 7 new tests: 5 codec, 1 mock unit and the mock run of the D5 contract test) and the contrast check. On Windows it needs Task F1 first.
- `test:integration`: every test file passed and 0 failed. `supabase.contract.itest.ts` includes the passing D5 test, and `schedule-data.itest.ts` still passes its lock tests ("Mert Demir" names, R11 messages).
- `test:e2e:supabase`: every test `passed` (9 at the review).
- `npm run test:e2e` (mock) is not required: no UI flow changed.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "fix: harden folder delete, schedule locks and snapshot decoding (D5, R11)"
```

---

### Task F6: Editor and data: stale results, lock expiry, materialize race

**Fixes:**
- PR5-7 (important). `runCalculate` (`useScheduleEditor.ts` 177-212) awaits `engineSolve(targetDoc)` and then puts the result on `docRef.current`, clearing `stale`, even when the user edited while the solve ran. Manual mode (Auto-calculate off): F5, then a1 duration 2400 → 4800 min before the answer. Result on main: `stale` false, a1 early finish 2026-01-09T17:00 (the pre-edit value; the edited document solves to 2026-01-16T17:00), and Save stores that summary. Discard during a solve is worse: the result lands on the restored document and sets `dirty` back to true in View mode (both reproduced by the probe, see Step 2).
- PR3-9 (important, owner item). `renew_schedule_lock` and `save_schedule_data` refuse an expired lock even for its holder, while `acquire_schedule_lock` lets the holder take it back (R1, verified in SQL). The client never does that. On the first renew conflict `useScheduleLock.ts` 51-56 sets `lost`, Save only toasts, and the banner's "Copy your changes" has no way to do it.
- PR4-1 (important). When another editor materialized first, `materialize_schedule_data` returns the current revision N (SQL 355-357; `MockRepository.ts` 1116-1117 does the same). `useScheduleDocument.ts` 118-130 then caches **this tab's own parse** under `scheduleDocument(id, N)` and opens it at revision N, so a Save at `expectedRevision: N` passes and overwrites the other editor's saves.
- Depends on Task F1: `npm run check` fails on Windows without it.

**Spec:**
- P4 core §4.3 R1: "At most one active lock (`lock_expires_at > now()`) per schedule; an expired lock is transparently replaced".
- R2: "Lock TTL is 15 minutes from acquire or renew; active editor tabs renew every 2 minutes". Enforcement: "`renew_schedule_lock` fails with `'conflict'` `"Your edit lock expired. Download your changes or reload the schedule."` if lost".
- R5: "Saving requires an active lock held by the caller and `data_revision = p_expected_revision`". Enforcement: "`'conflict'` → `"Your edit lock expired. Download your changes or reload the schedule."` or `"This schedule was changed elsewhere. Reload and try again."`".
- Materialize, §4.2: "`materializeScheduleDocument(input: MaterializeScheduleInput): Promise<{ dataRevision: number }>` — uploads gzipped initial snapshot for a P3-era import (`data_revision = 0`) and commits via `materialize_schedule_data`; idempotent if another editor already materialized it."
- R7: "Materializing is editor/owner only, requires `data_file_path is null`, sets `data_revision = 1`, and leaves `updated_at` unchanged".
- §7.2, editor/owner: "shows `"Preparing schedule…"` skeleton, runs `getScheduleSourceFile` + `getImportMapping` → `importParser.analyze()` → `fromImportModel()` → `materializeScheduleDocument()`, then opens."
- §6: "running **Calculate (`F5`)** updates `computed` and clears `stale` **without** pushing an undo entry". §7.2 Calculation: "amber indicator `"Recalculate needed"` when edits have made calculated dates stale".
- P4 core plan, Review Focus 1: "the editor keeps the unsaved document in memory … and never overwrites the other user's snapshot".
- No decision row covers PR3-9 yet. Before this task starts, the controller records the owner's answers to Q1–Q4 as P4 core D15. The button label and the file name below are **proposals** until then. If the owner changes them, change both the test and the component.

**Decisions this task pins:**

| Topic | Decision | Why |
|---|---|---|
| PR5-7: what an outdated result does | **Drop it.** If the edit counter changed while the solve ran, `runCalculate` changes nothing: document, summary, rollups, `stale`, `cycleError`, `drivingPath`, `dirty` and `lastAnnouncement` all stay as they are. `calculate()` still resolves with the `SolveResult`. | Applying the result but keeping `stale` true would still land it on the restored document after Discard (wrong dates, `dirty` true in View mode), and could show a cycle banner for a cycle the user already removed. In manual mode the user sees "Recalculate needed" and presses F5 again. With Auto-calculate, the solve started by the edit applies. |
| PR5-7: what bumps the counter (`editSeqRef`) | `dispatch` only when `result.stale` is true; `undo`, `redo` and `discard` always. Calculate never bumps it. | A command that leaves the dates valid (name, notes, order, display mode, auto-calculate) can't make a result wrong. Counting it would leave Auto-calculate stuck on "Recalculate needed" with no solve pending. Document identity is not compared, as the brief requires. |
| PR3-9: heartbeat | A renew `'conflict'` calls `reacquire()`. Success keeps `lost` false and the heartbeat goes on. Failure (another user's active lock, archived, forbidden, network) sets `lost`. | R1 lets the holder take back an expired lock. The banner shows only when re-acquiring fails. |
| PR3-9: Save | Only a `'conflict'` carrying the exact R2/R5 lock copy (`isLockExpiredError`) triggers one `reacquire()` and **one** retry with the same `expectedRevision`. The revision conflict never re-acquires. If re-acquiring fails, Save toasts the acquire error (for example "This schedule is being edited by Mert Demir.") and returns false. | R5's revision check still refuses the retry if anyone saved in between ("This schedule was changed elsewhere. Reload and try again."). A later successful Save clears `lost`. |
| PR3-9: `enterEdit` | Unchanged. | Edit mode has no Edit button. Save is the manual retry and the heartbeat is the automatic one. |
| PR3-9: "Copy your changes" | The banner gets a button, **"Download your changes"** (D16). It saves `JSON.stringify(document)` (no indentation, `application/json`) through `saveFile` as **`{schedule name} - unsaved changes.json`** (D16). | It gives the banner's "Copy your changes" a real path. The name follows the existing "{name} - import report.json". |
| PR4-1 | After `materializeScheduleDocument` resolves, the hook always loads `getScheduleDocument(id)`. It uses and caches **that** document and revision; the local parse is never opened. `document === null` throws `'Schedule snapshot could not be loaded.'`, the same copy as the materialized path. | This costs one extra download on the first open of a P3-era import. No adapter or contract change: both adapters already keep the stored path and answer the current revision (pinned by the new contract test). |

Out of scope (unchanged): `isMine` still comes from the list's `schedule.lock`. If a list refetch shows the expired lock as `null` before the next heartbeat, the heartbeat stops, and only Save re-takes the lock. Undo and Redo still don't start Auto-calculate.

**Files:**
- Modify: `src/hooks/useScheduleLock.ts`, `src/features/schedule/useScheduleEditor.ts`, `src/hooks/useScheduleDocument.ts`, `src/pages/SchedulePage.tsx`, `src/features/schedule/ScheduleToolbar.test.tsx` (its `makeEditor` fake gains `downloadChanges: vi.fn()`)
- Test: `src/features/schedule/useScheduleEditor.test.tsx` (4 new), `src/hooks/useScheduleLock.test.tsx` (1 rewritten), `src/hooks/useScheduleDocument.test.tsx` (1 new), `src/pages/SchedulePage.test.tsx` (1 new, plus a `vi.mock`), `src/test/contract/repository.contract.ts` (1 new; runs on mock through `src/test/contract/mock.contract.test.ts` and on Supabase through `integration/supabase.contract.itest.ts`), `integration/schedule-data.itest.ts` (1 new)
- Unchanged: both adapters, the migrations, `src/data/types.ts`, `src/data/repository.ts`

**Interfaces:**
- Consumes (unchanged):
  - `DataRepository.acquireScheduleLock(scheduleId: ID): Promise<ScheduleLock>`, `renewScheduleLock(scheduleId: ID): Promise<ScheduleLock>`
  - `saveScheduleDocument(input: SaveScheduleDocumentInput): Promise<{ schedule: Schedule; dataRevision: number }>`
  - `materializeScheduleDocument(input: MaterializeScheduleInput): Promise<{ dataRevision: number }>`
  - `getScheduleDocument(scheduleId: ID): Promise<{ document: ScheduleDocument | null; dataRevision: number }>`
  - `saveFile(blob: Blob, fileName: string): void` (`src/lib/download.ts`)
  - `RepositoryError` (`src/data/errors.ts`)
- Produces:
  - `src/hooks/useScheduleLock.ts`:
    ```ts
    export const LOCK_EXPIRED_MESSAGE =
      'Your edit lock expired. Download your changes or reload the schedule.';
    /** True for the R2/R5 lock conflict, as opposed to R5's revision conflict. */
    export function isLockExpiredError(error: unknown): boolean;
    // useScheduleLock(schedule) return type gains:
    /** Takes the lock again (R1). On failure sets `lost`, invalidates the list and rethrows the acquire error. */
    reacquire(): Promise<void>;
    ```
    Callers: `useScheduleEditor` is the only caller of `useScheduleLock`. `ScheduleEditorController['lock']` keeps its current type (`reacquire` is internal), so `ScheduleToolbar.tsx`, `SchedulePage.tsx` and the toolbar test's lock fake don't change.
  - `src/features/schedule/useScheduleEditor.ts`: `ScheduleEditorState` gains `downloadChanges(): void;`. Callers: `SchedulePage.tsx` (banner button), and `ScheduleToolbar.test.tsx` `makeEditor` (add `downloadChanges: vi.fn(),` after `discard`). The signatures of `calculate`, `dispatch`, `undo`, `redo`, `save` and `discard` don't change.
  - `src/hooks/useScheduleDocument.ts`: signature unchanged. The editor/owner P3 path returns `{ document: stored.document, dataRevision: stored.dataRevision, persisted: true }`.

- [ ] **Step 1: Write the failing tests**

`src/features/schedule/useScheduleEditor.test.tsx`. Add `import type { SolveResult } from '@/data/schedule-types';` and these helpers below `makeWrapper`:

```tsx
async function upTwo(dataLayer: TestDataLayer) {
  const harbor = dataLayer.store.read().projects.find((p) => p.code === '003')!;
  return (await dataLayer.repository.listSchedules(harbor.id)).find((s) => s.code === 'UP-02')!;
}

/** a1 → a2 (FS), 5 d each, from Monday 2026-01-05 08:00 on the 8 h Standard calendar. */
function chainDocument(autoCalculate: boolean) {
  return makeDocument({
    settings: { ...makeDocument().settings, autoCalculate },
    wbs: [{ id: 'w1', parentId: null, code: '1', name: 'Phase 1', order: 0 }],
    activities: [
      makeActivity({ id: 'a1', code: 'A1010', wbsId: 'w1', originalDuration: 2400, remainingDuration: 2400 }),
      makeActivity({ id: 'a2', code: 'A1020', wbsId: 'w1', originalDuration: 2400, remainingDuration: 2400 }),
    ],
    relationships: [makeRelationship({ id: 'r1', predecessorId: 'a1', successorId: 'a2', type: 'FS' })],
  });
}
```

Add three tests:

```tsx
it('drops a solve whose document changed while it ran, keeps stale, and drops it after Discard (PR5-7)', async () => {
  const dataLayer = createTestDataLayer();
  const schedule = await upTwo(dataLayer);
  const initialDocument = chainDocument(false);
  const { result } = renderHook(
    () => useScheduleEditor({ schedule, initialDocument, initialRevision: schedule.dataRevision }),
    { wrapper: makeWrapper(dataLayer) },
  );
  await act(async () => {
    await result.current.enterEdit();
  });

  // F5, then a duration edit before the solve answers.
  let pending!: Promise<SolveResult>;
  act(() => {
    pending = result.current.calculate();
    result.current.dispatch({
      type: 'updateActivity',
      activityId: 'a1',
      changes: { originalDuration: 4800, remainingDuration: 4800 },
    });
  });
  let landed!: SolveResult;
  await act(async () => {
    landed = await pending;
  });
  expect(landed.ok).toBe(true);
  expect(result.current.stale).toBe(true);
  expect(result.current.summary).toBeNull();
  expect(result.current.document.computed).toBeNull();
  expect(result.current.document.activities[0]?.originalDuration).toBe(4800);
  expect(result.current.lastAnnouncement).toBe('Entered edit mode');

  // The next F5 solves the edited document.
  await act(async () => {
    await result.current.calculate();
  });
  expect(result.current.stale).toBe(false);
  expect(result.current.summary?.activities.a1?.earlyFinish).toBe('2026-01-16T17:00');
  expect(result.current.summary?.activities.a2?.earlyFinish).toBe('2026-01-23T17:00');

  // Discard while a solve runs: its result never reaches the restored document.
  await act(async () => {
    const solving = result.current.calculate();
    await result.current.discard();
    await solving;
  });
  expect(result.current.mode).toBe('view');
  expect(result.current.dirty).toBe(false);
  expect(result.current.stale).toBe(false);
  expect(result.current.summary).toBeNull();
  expect(result.current.document.activities[0]?.originalDuration).toBe(2400);
});

it('applies only the newest of overlapping Auto-calculate solves (PR5-7)', async () => {
  const dataLayer = createTestDataLayer();
  const schedule = await upTwo(dataLayer);
  const { result } = renderHook(
    () =>
      useScheduleEditor({
        schedule,
        initialDocument: chainDocument(true),
        initialRevision: schedule.dataRevision,
      }),
    { wrapper: makeWrapper(dataLayer) },
  );
  act(() => {
    result.current.dispatch({ type: 'updateActivity', activityId: 'a1', changes: { originalDuration: 4800, remainingDuration: 4800 } });
    result.current.dispatch({ type: 'updateActivity', activityId: 'a1', changes: { originalDuration: 7200, remainingDuration: 7200 } });
  });
  await waitFor(() => expect(result.current.stale).toBe(false));
  expect(result.current.summary?.activities.a1?.earlyFinish).toBe('2026-01-23T17:00');
  expect(result.current.summary?.activities.a2?.earlyFinish).toBe('2026-01-30T17:00');
  expect(result.current.document.computed).toBe(result.current.summary);
});

it('re-acquires its own expired lock and saves when Save meets the lock-expired conflict (PR3-9)', async () => {
  const dataLayer = createTestDataLayer();
  const schedule = await upTwo(dataLayer);
  const initialDocument = makeDocument({
    activities: [makeActivity({ id: 'a1', code: 'A1010', name: 'Initial' })],
  });
  const acquireSpy = vi.spyOn(dataLayer.repository, 'acquireScheduleLock');
  const saveSpy = vi.spyOn(dataLayer.repository, 'saveScheduleDocument');
  const { result } = renderHook(
    () => useScheduleEditor({ schedule, initialDocument, initialRevision: schedule.dataRevision }),
    { wrapper: makeWrapper(dataLayer) },
  );
  await act(async () => {
    await result.current.enterEdit();
  });
  act(() => {
    result.current.dispatch({ type: 'updateActivity', activityId: 'a1', changes: { name: 'Edited after sleep' } });
  });
  // The tab slept past the 15-minute TTL: the lock is still ours, but expired.
  dataLayer.store.write((db) => {
    const row = db.schedules.find((s) => s.id === schedule.id)!;
    row.lock = { ...row.lock!, expiresAt: new Date(Date.now() - 60_000).toISOString() };
  });

  let saved = false;
  await act(async () => {
    saved = await result.current.save();
  });
  expect(saved).toBe(true);
  expect(acquireSpy).toHaveBeenCalledTimes(2); // Edit, then the re-acquire
  expect(saveSpy).toHaveBeenCalledTimes(2); // refused, then saved
  expect(result.current.dataRevision).toBe(2);
  expect(result.current.dirty).toBe(false);
  expect(result.current.lock.lost).toBe(false);
  const stored = await dataLayer.repository.getScheduleDocument(schedule.id);
  expect(stored.dataRevision).toBe(2);
  expect(stored.document?.activities[0]?.name).toBe('Edited after sleep');
  const lock = dataLayer.store.read().schedules.find((s) => s.id === schedule.id)!.lock!;
  expect(lock.userId).toBe(dataLayer.store.read().currentUserId);
  expect(Date.parse(lock.expiresAt)).toBeGreaterThan(Date.now());
});

it('keeps the edits and reports the revision conflict when another editor saved while the lock was expired (PR3-9)', async () => {
  const dataLayer = createTestDataLayer();
  const schedule = await upTwo(dataLayer);
  const initialDocument = makeDocument({
    activities: [makeActivity({ id: 'a1', code: 'A1010', name: 'Initial' })],
  });
  const saveSpy = vi.spyOn(dataLayer.repository, 'saveScheduleDocument');
  const { result } = renderHook(
    () => useScheduleEditor({ schedule, initialDocument, initialRevision: schedule.dataRevision }),
    { wrapper: makeWrapper(dataLayer) },
  );
  await act(async () => {
    await result.current.enterEdit();
  });
  act(() => {
    result.current.dispatch({ type: 'updateActivity', activityId: 'a1', changes: { name: 'Edited after sleep' } });
  });
  // The lock expired, another editor took it, saved revision 2 and released it.
  dataLayer.store.write((db) => {
    const row = db.schedules.find((s) => s.id === schedule.id)!;
    row.lock = { ...row.lock!, expiresAt: new Date(Date.now() - 60_000).toISOString() };
    row.dataRevision = 2;
  });

  let saved = true;
  await act(async () => {
    saved = await result.current.save();
  });
  expect(saved).toBe(false);
  expect(saveSpy).toHaveBeenCalledTimes(2); // lock refused, then the retry meets the new revision
  await expect(saveSpy.mock.results[1]!.value).rejects.toMatchObject({
    code: 'conflict',
    message: 'This schedule was changed elsewhere. Reload and try again.',
  });
  expect(result.current.dirty).toBe(true);
  expect(result.current.document.activities[0]?.name).toBe('Edited after sleep');
  const stored = await dataLayer.repository.getScheduleDocument(schedule.id);
  expect(stored.dataRevision).toBe(2);
  expect(stored.document?.activities[0]?.name).not.toBe('Edited after sleep');
});
```

`src/hooks/useScheduleLock.test.tsx`. Replace the first test, `'renews every 120 s while held, flags lost on conflict, and releases on unmount'`, with the test below. Remove the now-unused `RepositoryError` import and add `import type { ScheduleLock } from '@/data/types';`.

```tsx
it('renews every 120 s, re-takes its own expired lock, flags lost when another user holds it, and does not release then (R1, R2)', async () => {
  const dl = createTestDataLayer();
  const harbor = dl.store.read().projects.find((p) => p.code === '003')!;
  const up02 = (await dl.repository.listSchedules(harbor.id)).find((s) => s.code === 'UP-02')!;
  const lock = await dl.repository.acquireScheduleLock(up02.id);
  const lockedSchedule = { ...up02, lock };
  const setLock = (next: ScheduleLock) =>
    dl.store.write((db) => {
      db.schedules.find((s) => s.id === up02.id)!.lock = next;
    });

  const renewSpy = vi.spyOn(dl.repository, 'renewScheduleLock');
  const acquireSpy = vi.spyOn(dl.repository, 'acquireScheduleLock');
  const releaseSpy = vi.spyOn(dl.repository, 'releaseScheduleLock');

  vi.useFakeTimers({ shouldAdvanceTime: true });
  const wrapper = createQueryWrapper(dl);
  const { result, unmount } = renderHook(() => useScheduleLock(lockedSchedule), { wrapper });
  await waitFor(() => expect(result.current.isMine).toBe(true));

  await act(async () => {
    await vi.advanceTimersByTimeAsync(LOCK_HEARTBEAT_MS);
  });
  expect(renewSpy).toHaveBeenCalledTimes(1);
  expect(acquireSpy).not.toHaveBeenCalled();
  expect(result.current.lost).toBe(false);

  // The tab slept past the TTL: renew refuses the expired lock (R2) and the hook takes it back (R1).
  setLock({ ...lock, expiresAt: new Date(Date.now() - 1_000).toISOString() });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(LOCK_HEARTBEAT_MS);
  });
  await waitFor(() => expect(acquireSpy).toHaveBeenCalledTimes(1));
  expect(renewSpy).toHaveBeenCalledTimes(2);
  expect(result.current.lost).toBe(false);
  expect(result.current.isMine).toBe(true);
  const retaken = dl.store.read().schedules.find((s) => s.id === up02.id)!.lock!;
  expect(retaken.userId).toBe(lock.userId);
  expect(Date.parse(retaken.expiresAt)).toBeGreaterThan(Date.now());

  // Another user took the lock after it expired: renew and re-acquire both fail, so it is lost.
  const mert = dl.store.read().users.find((u) => u.email === 'mert.demir@example.com')!;
  setLock({
    userId: mert.id,
    userName: 'Mert Demir',
    lockedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(LOCK_HEARTBEAT_MS);
  });
  await waitFor(() => expect(result.current.lost).toBe(true));
  expect(acquireSpy).toHaveBeenCalledTimes(2);
  expect(result.current.isMine).toBe(false);

  unmount();
  expect(releaseSpy).not.toHaveBeenCalled();
});
```

`src/hooks/useScheduleDocument.test.tsx`. Add `makeSampleScheduleDocument` to the `@/test/fakes` import and this test:

```tsx
it('opens the stored snapshot and revision when another editor materialized and saved first (PR4-1)', async () => {
  const { dl, schedule } = await makeUnmaterializedImport({ withMapping: true });
  // Another editor materializes and saves while this tab still holds the old list row.
  const theirs = makeSampleScheduleDocument({
    settings: { ...makeSampleScheduleDocument().settings, statusDate: '2026-10-20T08:00' },
  });
  await dl.repository.materializeScheduleDocument({
    scheduleId: schedule.id,
    document: makeSampleScheduleDocument(),
  });
  await dl.repository.acquireScheduleLock(schedule.id);
  await dl.repository.saveScheduleDocument({ scheduleId: schedule.id, expectedRevision: 1, document: theirs });
  await dl.repository.releaseScheduleLock(schedule.id);
  expect(schedule.hasScheduleData).toBe(false);

  const materializeSpy = vi.spyOn(dl.repository, 'materializeScheduleDocument');
  const wrapper = createQueryWrapper(dl);
  const { result } = renderHook(() => useScheduleDocument(schedule, 'editor'), { wrapper });
  await waitFor(() => expect(result.current.status).toBe('ready'));
  if (result.current.status !== 'ready') return;
  expect(result.current.document.activities).toHaveLength(2);
  expect(result.current.document).toEqual(theirs);
  expect(result.current.dataRevision).toBe(2);
  expect(result.current.persisted).toBe(true);
  await expect(materializeSpy.mock.results[0]!.value).resolves.toEqual({ dataRevision: 2 });

  // The (id, 2) cache entry holds the stored snapshot, so the refreshed row opens it too.
  const [fresh] = await dl.repository.listSchedules(schedule.projectId);
  expect(fresh).toMatchObject({ hasScheduleData: true, dataRevision: 2 });
  const reopened = renderHook(() => useScheduleDocument(fresh, 'editor'), { wrapper });
  expect(reopened.result.current).toEqual({
    status: 'ready',
    document: theirs,
    dataRevision: 2,
    persisted: true,
  });
});
```

`src/pages/SchedulePage.test.tsx`. Add `vi`, `import type { ScheduleDocument } from '@/data/schedule-types';`, `import { saveFile } from '@/lib/download';` and, at module level, `vi.mock('@/lib/download', () => ({ saveFile: vi.fn() }));`. Then:

```tsx
it('shows the lost-lock banner with a download of the unsaved document when another user holds the lock', async () => {
  const dataLayer = createTestDataLayer();
  const harbor = dataLayer.store.read().projects.find((p) => p.code === '003')!;
  const { user } = renderApp(`/w/${harbor.workspaceId}/p/${harbor.id}/schedule`, { dataLayer });
  await user.click(await screen.findByRole('button', { name: 'Edit' }));
  await user.click(await screen.findByRole('button', { name: '+ Activity' }));

  // Mert takes the lock (as after this tab's lock expired).
  const mert = dataLayer.store.read().users.find((u) => u.email === 'mert.demir@example.com')!;
  dataLayer.store.write((db) => {
    db.schedules.find((s) => s.projectId === harbor.id && s.code === 'UP-02')!.lock = {
      userId: mert.id,
      userName: 'Mert Demir',
      lockedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
    };
  });
  await user.click(screen.getByRole('button', { name: 'Save' }));

  expect(await screen.findByText('This schedule is being edited by Mert Demir.')).toBeInTheDocument();
  expect(
    await screen.findByText('Your edit lock expired. Download your changes or reload the schedule.'),
  ).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Download your changes' }));

  expect(saveFile).toHaveBeenCalledOnce();
  const [blob, fileName] = vi.mocked(saveFile).mock.calls[0]!;
  expect(fileName).toBe('Update 2 - unsaved changes.json');
  expect(blob.type).toBe('application/json');
  const downloaded = JSON.parse(await blob.text()) as ScheduleDocument;
  expect(downloaded.activities).toHaveLength(7); // the seeded 6 plus the new one
  const up2 = dataLayer.store
    .read()
    .schedules.find((s) => s.projectId === harbor.id && s.code === 'UP-02')!;
  expect(up2.dataRevision).toBe(1); // nothing overwritten
});
```

`src/test/contract/repository.contract.ts`. In `describe('schedule documents and locks (P4)')`, after the `'materializes idempotently …'` test, add:

```ts
it('answers the current revision and keeps the stored snapshot when a saved schedule is materialized again (R7)', async () => {
  const f = await makeFixture();
  const metro = f.projectIds['002']!;
  const blank = await f.repository.createSchedule({
    projectId: metro,
    name: 'Materialize Race',
    code: 'MAT-2',
  });
  const saved = makeSampleScheduleDocument({
    settings: { ...makeSampleScheduleDocument().settings, statusDate: '2026-10-20T08:00' },
  });
  expect(
    await f.repository.materializeScheduleDocument({
      scheduleId: blank.id,
      document: makeSampleScheduleDocument(),
    }),
  ).toEqual({ dataRevision: 1 });
  await f.repository.acquireScheduleLock(blank.id);
  expect(
    (await f.repository.saveScheduleDocument({ scheduleId: blank.id, expectedRevision: 1, document: saved }))
      .dataRevision,
  ).toBe(2);
  await f.repository.releaseScheduleLock(blank.id);

  // A late materialize (a tab that parsed before the save) keeps the stored snapshot.
  expect(
    await f.repository.materializeScheduleDocument({
      scheduleId: blank.id,
      document: makeSampleScheduleDocument({ activities: [] }),
    }),
  ).toEqual({ dataRevision: 2 });
  expect(await f.repository.getScheduleDocument(blank.id)).toEqual({
    document: saved,
    dataRevision: 2,
  });
});
```

`integration/schedule-data.itest.ts`. After `'saves snapshots with revision checks …'`, add:

```ts
it('lets the holder take back its own expired lock and save at the same revision (R1, R2, R5)', async () => {
  const f = await makeSupabaseRepositoryFixture();
  const metro = f.projectIds['002']!;
  const created = await f.repository.createSchedule({ projectId: metro, name: 'Expired Lock', code: 'EXP-1' });
  const doc2 = makeSampleScheduleDocument({
    settings: { ...makeSampleScheduleDocument().settings, statusDate: '2026-10-22T08:00' },
  });
  await f.repository.acquireScheduleLock(created.id);
  expect(
    (await f.repository.saveScheduleDocument({ scheduleId: created.id, expectedRevision: 0, document: makeSampleScheduleDocument() }))
      .dataRevision,
  ).toBe(1);

  // The tab slept past the 15-minute TTL.
  const { error } = await admin
    .from('schedules')
    .update({ lock_expires_at: new Date(Date.now() - 60 * 60_000).toISOString() })
    .eq('id', created.id);
  if (error) throw error;
  const expired = {
    code: 'conflict',
    message: 'Your edit lock expired. Download your changes or reload the schedule.',
  };
  await expect(f.repository.renewScheduleLock(created.id)).rejects.toMatchObject(expired);
  await expect(
    f.repository.saveScheduleDocument({ scheduleId: created.id, expectedRevision: 1, document: doc2 }),
  ).rejects.toMatchObject(expired);

  const retaken = await f.repository.acquireScheduleLock(created.id);
  expect(retaken.userId).toBe(f.users.current.id);
  expect(
    (await f.repository.saveScheduleDocument({ scheduleId: created.id, expectedRevision: 1, document: doc2 }))
      .dataRevision,
  ).toBe(2);
  expect(await f.repository.getScheduleDocument(created.id)).toEqual({ document: doc2, dataRevision: 2 });
  await f.repository.releaseScheduleLock(created.id);
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/features/schedule/useScheduleEditor.test.tsx src/hooks/useScheduleLock.test.tsx src/hooks/useScheduleDocument.test.tsx src/pages/SchedulePage.test.tsx src/test/contract/mock.contract.test.ts`

Expected. A scratchpad probe ran the same scenarios against main and against the fix: `F6b/probe.tsx`, with `HARNESS=orig` and `HARNESS=fixed`.
- `drops a solve whose document changed …` FAILS at `expect(result.current.stale).toBe(true)` with `expected false to be true`. On main the late result clears `stale` and sets a1 early finish to 2026-01-09T17:00.
- `applies only the newest of overlapping Auto-calculate solves` PASSES on main too. It guards the counter against the document-identity trap.
- `re-acquires its own expired lock …` FAILS at `expect(saved).toBe(true)` with `expected false to be true`; `acquireScheduleLock` is called only once.
- `keeps the edits and reports the revision conflict …` FAILS at `expect(saveSpy).toHaveBeenCalledTimes(2)`: main never retries, so it is called once.
- The rewritten `useScheduleLock` test FAILS at `waitFor(() => expect(acquireSpy).toHaveBeenCalledTimes(1))` with `… to be called 1 times, but got 0 times`; on main the renew conflict only sets `lost`.
- `opens the stored snapshot and revision …` FAILS at `toHaveLength(2)` with `… to have a length of 2 but got 6`: the local parse is opened. `dataRevision` is already 2 on main.
- The SchedulePage test FAILS at `findByText('This schedule is being edited by Mert Demir.')` with `Unable to find an element with the text`. Main toasts the lock-expired copy instead and shows no banner.
- The new contract test PASSES on mock. It pins the adapter behavior that the hook fix relies on; the integration tests run in Step 4.

- [ ] **Step 3: Implement**

`src/hooks/useScheduleLock.ts`:
- Export `LOCK_EXPIRED_MESSAGE` and `isLockExpiredError` as in Interfaces (`error instanceof RepositoryError && error.code === 'conflict' && error.message === LOCK_EXPIRED_MESSAGE`).
- Move `invalidate` above the heartbeat effect and add `reacquire`:
  ```ts
  const reacquire = useCallback(async () => {
    if (scheduleId === undefined || projectId === undefined) return;
    try {
      await repository.acquireScheduleLock(scheduleId);
    } catch (error) {
      heldScheduleIdRef.current = null;
      setLostForId(scheduleId);
      void invalidate(projectId);
      throw error;
    }
    heldScheduleIdRef.current = scheduleId;
    setLostForId(null);
    void invalidate(projectId);
  }, [invalidate, projectId, repository, scheduleId]);
  ```
- In the heartbeat's renew `catch`, on `RepositoryError` `'conflict'`, replace the three lines that set `lost` with:
  ```ts
  // R2 refuses to renew an expired lock even for its holder; R1 lets the holder take it again.
  return reacquire().catch(() => undefined);
  ```
  Return `undefined` otherwise. Add `reacquire` to the effect's dependencies; `queryClient` is no longer used there.
- Return `reacquire` and add it to the return type. Update the doc comment: "on a renew conflict takes the lock back; flags `lost` only when that fails".

`src/features/schedule/useScheduleEditor.ts`:
- Imports: `isLockExpiredError` from `@/hooks/useScheduleLock`, and `saveFile` from `@/lib/download`.
- `ScheduleEditorState`, after `discard`: `downloadChanges(): void; // saves the in-memory document as "{schedule name} - unsaved changes.json"`.
- Destructure the lock as `const { acquire: lockAcquire, reacquire: lockReacquire, release: lockRelease } = lock;`.
- Add `const editSeqRef = useRef(0);` with a comment saying which changes bump it.
- `runCalculate`: first line `const editSeq = editSeqRef.current;`. After the `mountedRef` check, add `if (editSeq !== editSeqRef.current) return result;` with the comment "The document changed while solving: keep stale and the shown dates; a newer solve or F5 applies."
- `dispatch`: right after `if (!result.ok) return result;`, add `if (result.stale) editSeqRef.current += 1;`. It must come before the Auto-calculate `runCalculate`, so that solve records the new value.
- `undo` and `redo`: `editSeqRef.current += 1;` right after `if (step === null) return;`. `discard`: `editSeqRef.current += 1;` as its first line.
- `save`: replace the single `saveScheduleAsync` call with:
  ```ts
  const attempt = () =>
    saveScheduleAsync({
      scheduleId: schedule.id,
      expectedRevision: revisionRef.current,
      document: docRef.current,
    });
  try {
    let saved: { schedule: Schedule; dataRevision: number };
    try {
      saved = await attempt();
    } catch (error) {
      if (!isLockExpiredError(error)) throw error;
      // R1/R2: take back our own expired lock (throws and flags lost if another user holds it);
      // R5's revision check still refuses the retry if anyone saved in between.
      await lockReacquire();
      saved = await attempt();
    }
    if (!mountedRef.current) return true;
    // … the existing success path, unchanged
  ```
  The existing `catch` (`toast.error(errorMessage(error))`, `return false`) and `finally` stay. Add `lockReacquire` to the dependencies.
- Add the following and return `downloadChanges` after `discard`:
  ```ts
  const downloadChanges = useCallback(() => {
    const blob = new Blob([JSON.stringify(docRef.current)], { type: 'application/json' });
    saveFile(blob, `${schedule.name} - unsaved changes.json`);
  }, [schedule.name]);
  ```

`src/hooks/useScheduleDocument.ts`, editor/owner branch of `prepareQuery`. Replace the `materializeScheduleDocument` → `setQueryData(local document)` block with:
```ts
await repository.materializeScheduleDocument({ scheduleId: current.id, document });
// R7: if another editor materialized (and maybe saved) first, the call kept their snapshot and
// answered its revision, so open the stored snapshot, never this tab's parse.
const stored = await repository.getScheduleDocument(current.id);
if (stored.document === null) {
  throw new Error('Schedule snapshot could not be loaded.');
}
const loaded = { document: stored.document, dataRevision: stored.dataRevision };
queryClient.setQueryData(queryKeys.scheduleDocument(current.id, loaded.dataRevision), loaded);
void queryClient.invalidateQueries({ queryKey: queryKeys.schedules(current.projectId) });
void queryClient.invalidateQueries({ queryKey: queryKeys.allProjects() });
return { ...loaded, persisted: true };
```
Update the hook's doc comment: "auto-materialize, then open the stored snapshot, for editors/owners".

`src/pages/SchedulePage.tsx`, lost-lock banner (about lines 400-408). Keep the condition and the text. After the `<span>`, add:
```tsx
<Button type="button" variant="outline" size="sm" className="ml-auto" onClick={editor.downloadChanges}>
  <Download aria-hidden="true" />
  Download your changes
</Button>
```
`Button` and `Download` are already imported.

`src/features/schedule/ScheduleToolbar.test.tsx`: add `downloadChanges: vi.fn(),` to `makeEditor` after `discard`.

The scratchpad copies `F6b/useScheduleLock.ts`, `F6b/useScheduleEditor.ts` and `F6b/useScheduleDocument.ts` hold this implementation. They type-check under the repo's `tsconfig.app.json` (`tsc` exit 0) and give the "fixed" values in Step 2. Write the code into the repository by hand; don't copy those files over it (their import paths differ).

- [ ] **Step 4: Run the checks**

1. `npx vitest run src/features/schedule/useScheduleEditor.test.tsx src/hooks/useScheduleLock.test.tsx src/hooks/useScheduleDocument.test.tsx src/pages/SchedulePage.test.tsx src/features/schedule/ScheduleToolbar.test.tsx src/test/contract/mock.contract.test.ts`: every test passes.
2. `npm run check`: exit 0 (on Windows this needs Task F1). It includes typecheck, lint with 0 errors, all unit tests and the engine time-zone suite.
3. With the local stack up (`npm run db:start`, then `npm run db:reset`), run these one after the other:
   - `npm run test:integration`: every file passes, 0 failed, and there are 2 more tests than before this task. Both new tests must appear as passed: `answers the current revision …` under "DataRepository contract — supabase", and `lets the holder take back its own expired lock …`. (At main 8d0de4b the baseline was 11 files and 108 tests.)
   - `npm run test:e2e`: all pass, 0 failed.
   - `npm run test:e2e:supabase`: all pass, 0 failed.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "fix: keep stale on edits during calculate, re-take an expired own lock, open the stored snapshot after materialize"
```

**Owner decisions (2026-11-26, P4 core D16):**
1. The banner button reads "Download your changes", and the R2/R5 copy becomes "Your edit lock expired. Download your changes or reload the schedule.". Task F7, which lands before this task, changes the copy in SQL, the mock and the banner text; this task adds the button.
2. The file is `{schedule name} - unsaved changes.json`, the raw `ScheduleDocument` as plain JSON. The app can't load it back yet; a restore path is a later item (`docs/HANDOFF.md`).
3. A force-released lock that nobody else took is taken back by the heartbeat like an expired one. No spec change.
4. The P4 core plan Task 19 behaviour ("on `'conflict'` sets `lost = true`") and its `useScheduleLock` test change as this task says.

---

### Task F8: Map pins on the drawn map

**Fixes:**
- PR6-2 (confirmed, important). `ProjectsMap.tsx` draws the map in an SVG with `viewBox="0 0 800 500"` and `preserveAspectRatio="xMidYMid slice"`, in a box 460 px high and as wide as the layout allows (W). Slice scales the viewBox by s = max(W / 800, 460 / 500) and centres it. Below W = 736 it crops the left and right sides; above 736 it crops the top and bottom. The HTML pin overlay is `absolute inset-0` of the W × 460 box and puts each pin at left = x / 800 and top = y / 500 of that box, so pins sit on the drawn map only when W = 736. Real Chromium, measured against the drawn graticule:
  - At the e2e's 1440 px viewport (W = 928, or 913 with a 15 px scrollbar gutter), the Riverside (001) and Harbor (003) pins are 35.4 px (32.7 px) off vertically.
  - At a 390 px viewport (W = 366, or 351), Riverside is 41 px (43 px) off horizontally. Harbor's point is drawn left of the box, but its pin still shows.
  - At W = 1000, a point 5 px below the visible top edge gets its pin 59.4 px too low.
- Same geometry bug, in the same component:
  - The ±5 % visibility filter uses the wrong mapping, so it keeps pins whose point is drawn outside the box.
  - Drag-to-pan divides by the box's width and height instead of the slice scale. The map moves 2.04× the pointer horizontally at W = 360, and 1.37× vertically at W = 1000.
- Decision rows: none change. Two calls are ours and are written in Step 3. (a) A project whose point is drawn outside the visible box gets no pin, so Tab never lands on a hidden pin. (b) A drag moves the map exactly with the pointer.

**Spec:** P4 later spec §7.3.2 (`docs/superpowers/specs/2026-11-23-phase4-later-design.md:293-296`): the interactive map has "drag-to-pan, and interactive project markers (`role="button"`, `aria-label="{project.name} ({project.code})"`)". D2 (`:350`) makes it a self-contained SVG/Canvas coordinate map, and V5 (`:309`) requires zero external requests. All of these stay as they are. The pins remain native `<button>`s with the same names and classes, and there is no new dependency and no network use. The spec does not specify pin geometry, so it needs no change.

**Approach (decided):** Keep the HTML pins and the 460 px box, and put the pins in a **pin layer whose rectangle is exactly the slice-scaled viewBox**. The layer is `absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2` with `width: max(100%, 736px)` and `aspect-ratio: 800 / 500`. Its width is max(W, 736) = 800 · s and its height is 500 · s, centred, which is the slice transform. Pins keep `left: x/800 %` and `top: y/500 %`, now percentages of the layer. Positions are pure CSS, so they are right from the first paint and through every resize with no measuring.
- The layer's wrapper is `inset-x-0 top-0`, 460 px high, with **`overflow-clip`**, not `overflow-hidden`. In Chromium, focusing a clipped pin scrolled an `overflow:hidden` wrapper by 193 px and moved every pin off the drawing. With `overflow:clip`, neither the wrapper nor the `overflow-hidden` map box scrolled.
- The only measurement is the box width, taken with a `ResizeObserver` (the `ScheduleGantt` pattern). It feeds the visibility filter only.
- Rejected:
  - Pins inside the SVG: they would scale with s, and `<g role="button">` needs hand-made key handling and focus rings.
  - An `aspect-[8/5]` box: it gives a 225 px-high map at 360 px, too small for the 288 px project card.

**Probe evidence** (all in `<scratchpad>/`):
- `F8b-geometry-probe.ts` is an oracle written from the SVG `slice` rule. It gives the expected pixels used in Step 1, the seed fit viewport `{ centerLat: 39.71715, centerLng: 29.9942, zoom: 7 }`, and the pan numbers.
  - At that viewport, the graticule lines in the DOM are latitudes 39 and 41 (odd degrees) and longitudes 26 to 34 (even degrees).
  - Harbor's point is drawn at x = −47.7 px when W = 366, outside the box. Riverside's is at x = 101.3 px, inside.
- `F8b-chromium-probe.ts` builds a standalone Chromium page with no app server. It copies the map DOM (SVG, graticule `<g><line/><text/></g>` groups, the wrapper and layer above, the four seed pins) and measures with the exact code of the Step 1 e2e test.
  - New layer: pin centre minus drawn point is at most 0.015 px at W = 351, 366, 561, 576, 736, 913, 928, 1000 and 1200.
  - Old overlay: the offsets listed under Fixes. The focus results listed under Approach also come from this probe.
- `F8b-tc/` typechecks the Step 1 e2e test under the repo's `tsconfig.node.json` settings (lib ES2023, no DOM lib), with exit 0. The same check fails on `new DOMPoint(...)` with `TS2304 Cannot find name 'DOMPoint'`, which is why the test multiplies the screen matrix by hand.
- `F8b-impl/` holds the Step 3 `map-geometry.ts` and the Step 1 unit test.
  - All 13 test cases pass under a `node:assert` shim.
  - Both files pass `tsc` with the app's strict settings (including `noUncheckedIndexedAccess` and `noUnusedLocals`).
  - A trial `ProjectsMap.tsx` with the Step 3 edits typechecks. The only error is that `react-router` does not resolve from the scratch path, which is unrelated to the edit.
  - Prettier (`singleQuote`, `printWidth 100`) reports no diffs in any new or changed lines.

**Decisions (controller, 2026-11-26):**
- A project whose point is drawn outside the visible map gets no pin, so Tab never lands on a hidden button. The "Not on the map" panel is unchanged (it lists projects without coordinates).
- Panning divides the pointer movement by the map's scale, so the map follows the pointer (part of this task).
- "Fit to projects" still ignores the cropping below 736 px; making it width-aware is a follow-up in `docs/HANDOFF.md` (it would also move the desktop starting zoom from 7.0 to about 6.0). If that lands, the e2e check that Harbor has no pin at 390 px needs another off-screen case.

**Files:**
- Create: `src/features/projects/map-geometry.ts`
- Test (create): `src/features/projects/map-geometry.test.ts`
- Modify: `src/features/projects/ProjectsMap.tsx`
- Modify (test): `e2e/projects.spec.ts` (add one test after the existing map test)
- Unchanged, and must still pass: `src/features/projects/ProjectsMap.test.tsx` and `src/pages/ProjectsPage.test.tsx`. In jsdom the `ResizeObserver` stub (`src/test/setup.ts`) never fires, so the filter uses the 736 px fallback, where all four seed pins show. Also unchanged: `ProjectsPage.tsx`, including the `h-[460px]` skeleton.

**Interfaces:**
- Produces, all exported from `src/features/projects/map-geometry.ts` (pure, no imports):
  - `MAP_WIDTH = 800`, `MAP_HEIGHT = 500` (the viewBox), `MAP_BOX_HEIGHT_PX = 460`, and `PIN_LAYER_MIN_WIDTH_PX = 736`, computed as 460 × 800 / 500.
  - `PIN_LAYER_STYLE: { readonly width: \`max(100%, ${number}px)\`; readonly aspectRatio: '800 / 500' }`. Its value is `{ width: 'max(100%, 736px)', aspectRatio: '800 / 500' }`.
  - `interface MapViewport { centerLat: number; centerLng: number; zoom: number }`. It moves here from `ProjectsMap.tsx`.
  - `interface MapPoint { x: number; y: number }`
  - `projectPoint(lat: number, lng: number, viewport: MapViewport): MapPoint`. Moved here; the maths is unchanged.
  - `drawnPointPx(point: MapPoint, boxWidth: number): MapPoint`. The SVG slice transform, in px from the box's top-left corner.
  - `pinPercent(point: MapPoint): { left: number; top: number }`
  - `pinCentrePx(point: MapPoint, boxWidth: number): MapPoint`. Where the CSS layer puts a pin's centre. It mirrors the CSS for tests and is not used at runtime.
  - `isDrawnInBox(point: MapPoint, boxWidth: number): boolean`. Edges count as inside.
  - `panViewport(start: MapViewport, dxPx: number, dyPx: number, boxWidth: number): MapViewport`. Clamps as today: lng to [−180, 180], lat to [−80, 80].
- Consumes: nothing new. `ProjectsMap`'s props stay as they are. It uses the global `ResizeObserver`, which `src/test/setup.ts` stubs.

- [ ] **Step 1: Write the failing tests**

Create `src/features/projects/map-geometry.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  MAP_BOX_HEIGHT_PX,
  PIN_LAYER_MIN_WIDTH_PX,
  PIN_LAYER_STYLE,
  drawnPointPx,
  isDrawnInBox,
  panViewport,
  pinCentrePx,
  pinPercent,
  projectPoint,
} from '@/features/projects/map-geometry';

// Expected px: SVG `xMidYMid slice` in a W × 460 box scales the 800 × 500 viewBox by
// s = max(W / 800, 460 / 500) and centres it. 360: s 0.92, offset (-188, 0). 736: s 0.92,
// offset (0, 0). 1000: s 1.25, offset (0, -82.5). The old overlay (left x / 800, top y / 500 of
// the box) put the 1000 px "near top" pin at y 64.4 (59.4 px low) and the 360 px "near left" pin
// at x 99 (84.6 px right).
const CASES = [
  { boxWidth: 360, point: { x: 400, y: 250 }, px: { x: 180, y: 230 } },
  { boxWidth: 360, point: { x: 400, y: 70 }, px: { x: 180, y: 64.4 } },
  { boxWidth: 360, point: { x: 220, y: 250 }, px: { x: 14.4, y: 230 } },
  { boxWidth: 736, point: { x: 400, y: 250 }, px: { x: 368, y: 230 } },
  { boxWidth: 736, point: { x: 400, y: 70 }, px: { x: 368, y: 64.4 } },
  { boxWidth: 736, point: { x: 220, y: 250 }, px: { x: 202.4, y: 230 } },
  { boxWidth: 1000, point: { x: 400, y: 250 }, px: { x: 500, y: 230 } },
  { boxWidth: 1000, point: { x: 400, y: 70 }, px: { x: 500, y: 5 } },
  { boxWidth: 1000, point: { x: 220, y: 250 }, px: { x: 275, y: 230 } },
];

describe('map geometry', () => {
  it('sizes the pin layer like the viewBox scaled by slice', () => {
    expect(MAP_BOX_HEIGHT_PX).toBe(460);
    expect(PIN_LAYER_MIN_WIDTH_PX).toBe(736);
    expect(PIN_LAYER_STYLE).toEqual({ width: 'max(100%, 736px)', aspectRatio: '800 / 500' });
    expect(pinPercent({ x: 600, y: 125 })).toEqual({ left: 75, top: 25 });
  });

  it.each(CASES)(
    'puts the pin for viewBox ($point.x, $point.y) on its drawn point in a $boxWidth px box',
    ({ boxWidth, point, px }) => {
      const drawn = drawnPointPx(point, boxWidth);
      expect(drawn.x).toBeCloseTo(px.x, 6);
      expect(drawn.y).toBeCloseTo(px.y, 6);
      const pin = pinCentrePx(point, boxWidth);
      expect(Math.abs(pin.x - drawn.x)).toBeLessThanOrEqual(1);
      expect(Math.abs(pin.y - drawn.y)).toBeLessThanOrEqual(1);
    },
  );

  it('keeps the projection unchanged', () => {
    expect(projectPoint(39.2, 34.5, { centerLat: 39.2, centerLng: 34.5, zoom: 4 })).toEqual({
      x: 400,
      y: 250,
    });
    // Harbor Logistics Hub (003) at the seed fit viewport, which the map e2e also sees.
    const harbor = projectPoint(38.4192, 27.1287, {
      centerLat: 39.71715,
      centerLng: 29.9942,
      zoom: 7,
    });
    expect(harbor.x).toBeCloseTo(149.26875, 6);
    expect(harbor.y).toBeCloseTo(397.646121, 6);
  });

  it('shows a pin only where the map draws its point inside the box', () => {
    expect(isDrawnInBox({ x: 220, y: 250 }, 360)).toBe(true); // 14.4 px from the left edge
    expect(isDrawnInBox({ x: 200, y: 250 }, 360)).toBe(false); // x -4 px: slice crops the sides
    expect(isDrawnInBox({ x: 400, y: 70 }, 1000)).toBe(true); // 5 px below the top edge
    expect(isDrawnInBox({ x: 400, y: 60 }, 1000)).toBe(false); // y -7.5 px: slice crops the top
    expect(isDrawnInBox({ x: 0, y: 0 }, 736)).toBe(true); // at 736 px the whole viewBox shows
    expect(isDrawnInBox({ x: 800, y: 500 }, 736)).toBe(true);
    expect(isDrawnInBox({ x: 801, y: 250 }, 736)).toBe(false);
  });

  it('pans so the point under the pointer follows it', () => {
    const start = { centerLat: 39.2, centerLng: 34.5, zoom: 4 };
    for (const boxWidth of [360, 736, 1000]) {
      const before = drawnPointPx(projectPoint(39.2, 34.5, start), boxWidth);
      const after = drawnPointPx(
        projectPoint(39.2, 34.5, panViewport(start, 100, 40, boxWidth)),
        boxWidth,
      );
      expect(after.x - before.x).toBeCloseTo(100, 6);
      // 40.39 px at 360 and 736, 40.29 px at 1000: the latitude scale follows the new centre.
      expect(Math.abs(after.y - before.y - 40)).toBeLessThan(0.5);
    }
    const panned = panViewport(start, 100, 40, 1000);
    expect(panned.centerLng).toBeCloseTo(32.9, 9);
    expect(panned.centerLat).toBeCloseTo(39.695964, 6);
    expect(panned.zoom).toBe(4);
    expect(panViewport(start, 100, 40, 360).centerLng).toBeCloseTo(32.326087, 6);
    expect(panViewport({ centerLat: 79.5, centerLng: 179, zoom: 1 }, -2000, 2000, 1000)).toEqual({
      centerLat: 80,
      centerLng: 180,
      zoom: 1,
    });
  });
});
```

Where the values come from:
- The expected pixels follow the slice rule; `F8b-geometry-probe.ts` printed them.
- The three points are the viewBox centre, a point near the top edge (5 px below it at W = 1000) and a point near a side edge (14.4 px from the left at W = 360).
- The pan values are exact outputs of the formula in Step 3: lat 39.695964472770676, lng 32.9 and 32.32608695652174. The old pan maths would move the point 204.4 px horizontally at 360 and 54.9 px vertically at 1000.
- The vertical move is 0.29 to 0.39 px over 40 because `projectPoint` scales latitude by cos(centre latitude), and the centre moves.

In `e2e/projects.spec.ts`, add this test directly after `'switches to Map layout with interactive pins, Not on the map panel, and zero external requests'`. It uses the file's `beforeEach`, which opens Projects at the 1440 × 900 project viewport. The test resizes only after that, because the `Primary` navigation link that `beforeEach` clicks sits in a closed drawer below 1024 px.

```ts
test('map pins sit on their drawn coordinates at a wide and a narrow width', async ({ page }) => {
  await page.getByRole('radio', { name: 'Map' }).click();
  const map = page.getByRole('img', { name: 'Projects coordinate map' });
  await expect(map).toBeVisible();

  // Where the SVG draws a coordinate, read from the drawn map: interpolate between the first and
  // last labelled graticule lines (the projection is linear in latitude and in longitude), then
  // map viewBox units to page pixels with the SVG's screen matrix, which includes the
  // `xMidYMid slice` scale and centring.
  const drawnAt = (lat: number, lng: number) =>
    map.evaluate(
      (svg, [lat, lng]) => {
        const lines: Record<'lat' | 'lng', { deg: number; at: number }[]> = { lat: [], lng: [] };
        for (const label of svg.querySelectorAll('text')) {
          const match = /^(\d+)°([NSEW])$/.exec(label.textContent ?? '');
          const line = label.previousElementSibling;
          if (match === null || line?.tagName !== 'line') continue;
          const deg = Number(match[1]) * (match[2] === 'S' || match[2] === 'W' ? -1 : 1);
          if (match[2] === 'N' || match[2] === 'S') {
            lines.lat.push({ deg, at: Number(line.getAttribute('y1')) });
          } else {
            lines.lng.push({ deg, at: Number(line.getAttribute('x1')) });
          }
        }
        const along = (list: { deg: number; at: number }[], value: number) => {
          const first = list[0];
          const last = list[list.length - 1];
          if (first === undefined || last === undefined || first === last) {
            throw new Error('The map needs two graticule lines in each direction');
          }
          return first.at + ((value - first.deg) / (last.deg - first.deg)) * (last.at - first.at);
        };
        const x = along(lines.lng, lng);
        const y = along(lines.lat, lat);
        const m = svg.getScreenCTM();
        return { x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f };
      },
      [lat, lng] as const,
    );
  // The largest horizontal or vertical distance in px between a pin's centre and its drawn point.
  const pinOffset = async (name: string, lat: number, lng: number) => {
    const box = await page.getByRole('button', { name }).boundingBox();
    if (box === null) return Number.POSITIVE_INFINITY;
    const drawn = await drawnAt(lat, lng);
    return Math.max(
      Math.abs(box.x + box.width / 2 - drawn.x),
      Math.abs(box.y + box.height / 2 - drawn.y),
    );
  };

  // 1440 px wide: the map box is wider than 736 px, so the drawing is cropped top and bottom.
  await expect
    .poll(() => pinOffset('Riverside Office Tower (001)', 41.0151, 28.9795))
    .toBeLessThanOrEqual(2);
  await expect
    .poll(() => pinOffset('Harbor Logistics Hub (003)', 38.4192, 27.1287))
    .toBeLessThanOrEqual(2);

  // 390 px wide: the sidebar becomes a drawer and the map box is narrower than 736 px, so the
  // drawing is cropped left and right.
  await page.setViewportSize({ width: 390, height: 900 });
  await expect
    .poll(() => pinOffset('Riverside Office Tower (001)', 41.0151, 28.9795))
    .toBeLessThanOrEqual(2);
  // Harbor is drawn left of the visible map at this width, so it has no pin to tab to.
  await expect(page.getByRole('button', { name: 'Harbor Logistics Hub (003)' })).toHaveCount(0);
});
```

How the test finds the drawn point in the DOM:
- Each graticule `<g>` holds a `<line>` followed by its label `<text>`, for example `39°N` or `28°E`. The line's `y1` (for a latitude) or `x1` (for a longitude) is the coordinate's position in viewBox units.
- Within one viewport, `projectPoint` gives x from the longitude only and y from the latitude only, and both are linear. So interpolating between two labelled lines gives any coordinate's viewBox point.
- `svg.getScreenCTM()` then applies the transform the browser itself uses to draw the SVG.
- Use the matrix fields, not `DOMPoint`. `tsconfig.node.json` (which covers `e2e/`) has no DOM lib, so `DOMPoint` does not compile. The `svg` parameter is loosely typed there, as in `home.spec.ts`'s `evaluate`.
- The coordinates are the seed values (`src/data/mock/seed.ts:416,446`). The existing map test already relies on `38.4192, 27.1287`.

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/features/projects/map-geometry.test.ts`
Expected: the file fails to load with `Failed to resolve import "@/features/projects/map-geometry"`. The run shows `Test Files  1 failed (1)` and no tests run.

Run: `npx playwright test e2e/projects.spec.ts -g "drawn coordinates"`
Expected: `1 failed`. The first `expect.poll` (Riverside at 1440 px) times out with `Expected: <= 2` and `Received: 35.4…`, or `32.6…` if Chromium keeps a 15 px scrollbar gutter.

- [ ] **Step 3: Implement**

1. Create `src/features/projects/map-geometry.ts` with exactly this content. It is the file checked in `F8b-impl/`.

```ts
/**
 * Geometry of the Projects map (P4 later spec §7.3.2, D2). The SVG draws in a fixed 800 × 500
 * viewBox with `preserveAspectRatio="xMidYMid slice"` inside a box `MAP_BOX_HEIGHT_PX` tall and as
 * wide as the layout allows. Slice scales the viewBox by max(W / 800, 460 / 500) and centres it, so
 * a box narrower than 736 px crops the sides and a wider one crops the top and bottom. The HTML
 * pins sit in a layer with that same rectangle, so each pin lands on its drawn point at every width.
 */

/** The viewBox the map is drawn in (`viewBox="0 0 800 500"`). */
export const MAP_WIDTH = 800;
export const MAP_HEIGHT = 500;
/** CSS height of the map box: the SVG and the pin wrapper. */
export const MAP_BOX_HEIGHT_PX = 460;
/** The box width at which slice scales both ways alike: 460 × 800 / 500 = 736 px. */
export const PIN_LAYER_MIN_WIDTH_PX = (MAP_BOX_HEIGHT_PX * MAP_WIDTH) / MAP_HEIGHT;

/**
 * Inline style of the pin layer, which is also positioned with
 * `absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2`: the viewBox rectangle scaled like
 * slice (width max(W, 736 px), height width × 500 / 800) and centred in the box.
 */
export const PIN_LAYER_STYLE = {
  width: `max(100%, ${PIN_LAYER_MIN_WIDTH_PX}px)`,
  aspectRatio: `${MAP_WIDTH} / ${MAP_HEIGHT}`,
} as const;

export interface MapViewport {
  centerLat: number;
  centerLng: number;
  zoom: number;
}

/** A point in viewBox units, or in px from the map box's top-left corner. */
export interface MapPoint {
  x: number;
  y: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function sliceScale(boxWidth: number): number {
  return Math.max(boxWidth / MAP_WIDTH, MAP_BOX_HEIGHT_PX / MAP_HEIGHT);
}

function degreesPerScreen(viewport: MapViewport): { lng: number; lat: number } {
  const lng = 64 / viewport.zoom;
  const cosLat = Math.max(0.35, Math.cos((viewport.centerLat * Math.PI) / 180));
  return { lng, lat: lng * (MAP_HEIGHT / MAP_WIDTH) * cosLat };
}

/** Where a coordinate falls in the viewBox for `viewport`. */
export function projectPoint(lat: number, lng: number, viewport: MapViewport): MapPoint {
  const degrees = degreesPerScreen(viewport);
  return {
    x: MAP_WIDTH / 2 + ((lng - viewport.centerLng) / degrees.lng) * MAP_WIDTH,
    y: MAP_HEIGHT / 2 - ((lat - viewport.centerLat) / degrees.lat) * MAP_HEIGHT,
  };
}

/** Where the SVG (`xMidYMid slice`) draws viewBox `point` in a box `boxWidth` px wide, in px. */
export function drawnPointPx(point: MapPoint, boxWidth: number): MapPoint {
  const scale = sliceScale(boxWidth);
  return {
    x: (boxWidth - MAP_WIDTH * scale) / 2 + point.x * scale,
    y: (MAP_BOX_HEIGHT_PX - MAP_HEIGHT * scale) / 2 + point.y * scale,
  };
}

/** A pin's `left` and `top` inside the pin layer, in percent. */
export function pinPercent(point: MapPoint): { left: number; top: number } {
  return { left: (point.x / MAP_WIDTH) * 100, top: (point.y / MAP_HEIGHT) * 100 };
}

/**
 * Where the pin layer (`PIN_LAYER_STYLE`, centred) puts the centre of the pin for viewBox `point`
 * in a box `boxWidth` px wide, in px. The browser does this in CSS; this mirrors it for tests.
 */
export function pinCentrePx(point: MapPoint, boxWidth: number): MapPoint {
  const layerWidth = Math.max(boxWidth, PIN_LAYER_MIN_WIDTH_PX);
  const layerHeight = (layerWidth * MAP_HEIGHT) / MAP_WIDTH;
  const { left, top } = pinPercent(point);
  return {
    x: (boxWidth - layerWidth) / 2 + (left / 100) * layerWidth,
    y: (MAP_BOX_HEIGHT_PX - layerHeight) / 2 + (top / 100) * layerHeight,
  };
}

/** True when the SVG draws viewBox `point` inside the visible box (edges included). */
export function isDrawnInBox(point: MapPoint, boxWidth: number): boolean {
  const { x, y } = drawnPointPx(point, boxWidth);
  return x >= 0 && x <= boxWidth && y >= 0 && y <= MAP_BOX_HEIGHT_PX;
}

/**
 * The viewport after dragging the map by (`dxPx`, `dyPx`) in a box `boxWidth` px wide. The move is
 * divided by the slice scale, so the point under the pointer follows it.
 */
export function panViewport(
  start: MapViewport,
  dxPx: number,
  dyPx: number,
  boxWidth: number,
): MapViewport {
  const scale = sliceScale(boxWidth);
  const degrees = degreesPerScreen(start);
  return {
    ...start,
    centerLng: clamp(start.centerLng - (dxPx / (MAP_WIDTH * scale)) * degrees.lng, -180, 180),
    centerLat: clamp(start.centerLat + (dyPx / (MAP_HEIGHT * scale)) * degrees.lat, -80, 80),
  };
}
```

2. `src/features/projects/ProjectsMap.tsx`:
   - Imports:
     - Change the React import to `import { useEffect, useMemo, useRef, useState } from 'react';`.
     - After the `DialogsProvider` import, add:
       ```ts
       import {
         MAP_BOX_HEIGHT_PX,
         MAP_HEIGHT,
         MAP_WIDTH,
         PIN_LAYER_MIN_WIDTH_PX,
         PIN_LAYER_STYLE,
         isDrawnInBox,
         panViewport,
         pinPercent,
         projectPoint,
       } from '@/features/projects/map-geometry';
       import type { MapViewport } from '@/features/projects/map-geometry';
       ```
   - Delete these, which now live in `map-geometry.ts`:
     - the local `MAP_WIDTH` and `MAP_HEIGHT` constants
     - the local `interface MapViewport`
     - the local `function projectPoint`
   - Keep `MIN_ZOOM`, `MAX_ZOOM`, `DEFAULT_VIEWPORT`, `LANDMASS_POLYGONS`, `clamp` (still used by `computeFitViewport` and `zoomBy`) and `computeFitViewport`, which is unchanged.
   - Directly after `const containerRef = useRef<HTMLDivElement>(null);`, add:
     ```tsx
     // The map box's measured width. Null until the first measurement (and in jsdom); pins are then
     // filtered as if the box were 736 px wide, where the whole viewBox shows.
     const [boxWidth, setBoxWidth] = useState<number | null>(null);
     useEffect(() => {
       const el = containerRef.current;
       if (el === null || typeof ResizeObserver === 'undefined') return;
       const observer = new ResizeObserver(() => {
         const width = el.getBoundingClientRect().width;
         setBoxWidth(width > 0 ? width : null);
       });
       observer.observe(el);
       return () => observer.disconnect();
     }, []);
     ```
     `setBoxWidth` runs in the observer callback, not in the effect body, the same as `ScheduleGantt.tsx:267-286`. The react-hooks `set-state-in-effect` rule allows that.
   - In `handlePointerMove`, replace everything after `if (!pan?.active) return;` with:
     ```tsx
     const width = containerRef.current?.getBoundingClientRect().width || PIN_LAYER_MIN_WIDTH_PX;
     setViewportOverride(
       panViewport(pan.startViewport, event.clientX - pan.startX, event.clientY - pan.startY, width),
     );
     ```
   - On the `<svg>`, remove `h-[460px]` from `className`, which becomes `"w-full cursor-grab bg-background/70 active:cursor-grabbing"`. Add `style={{ height: MAP_BOX_HEIGHT_PX }}`. The container keeps `min-h-[460px]`.
   - Replace the whole overlay block, from `{/* HTML overlay pins for crisp keyboard focus & accessible click targets */}` through its closing `</div>`, with the block below. The `<button>` keeps its attributes and classes; only `style` changes.
     ```tsx
     {/* HTML pins for keyboard focus and accessible click targets. The layer is the viewBox
         rectangle scaled and centred the way `xMidYMid slice` draws it, so a pin at x / 800 and
         y / 500 of the layer sits on its drawn point at every width. overflow-clip, not
         overflow-hidden: focusing a pin must not scroll the layer away from the drawing. */}
     <div
       className="pointer-events-none absolute inset-x-0 top-0 overflow-clip"
       style={{ height: MAP_BOX_HEIGHT_PX }}
     >
       <div
         className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
         style={PIN_LAYER_STYLE}
       >
         {mapped.map((project) => {
           const pt = projectPoint(
             project.location.latitude!,
             project.location.longitude!,
             viewport,
           );
           // A point drawn outside the box gets no pin, so Tab never lands on a hidden pin.
           if (!isDrawnInBox(pt, boxWidth ?? PIN_LAYER_MIN_WIDTH_PX)) return null;
           const { left, top } = pinPercent(pt);
           const isSelected = selectedProject?.id === project.id;
           return (
             <button
               key={project.id}
               type="button"
               aria-label={`${project.name} (${project.code})`}
               aria-pressed={isSelected}
               onClick={() => setSelectedId(isSelected ? null : project.id)}
               style={{ left: `${left}%`, top: `${top}%` }}
               className={cn(
                 'pointer-events-auto absolute flex -translate-x-1/2 -translate-y-1/2 items-center gap-1 rounded-full px-2 py-1 text-2xs font-semibold shadow-sm transition-transform hover:scale-105',
                 pinColorClasses(project.attributes.status, isSelected),
                 FOCUS_OUTLINE_CLASSES,
               )}
             >
               <MapPin className="size-3 shrink-0" aria-hidden="true" />
               <span className="font-mono">{project.code}</span>
             </button>
           );
         })}
       </div>
     </div>
     ```
   - The rest of the component stays as it is: graticule, landmass, controls, legend, card and side panel. The pin wrapper still comes before the controls, legend and card in the DOM, so they stay on top. `pointer-events-none` on the wrapper and layer keeps drag-to-pan on the SVG. No colours change.

3. No change to the spec, `ProjectsPage.tsx` or any other test.

- [ ] **Step 4: Run the checks**

Run: `npx vitest run src/features/projects src/pages/ProjectsPage.test.tsx`
Expected: every file passes, including `map-geometry.test.ts (13 tests)`, `ProjectsMap.test.tsx` and `ProjectsPage.test.tsx`.

Run: `npm run check`. On Windows this needs Task F1 first.
Expected:
- typecheck passes, and lint reports 0 errors. Warnings stay at the existing count.
- vitest shows one more file and 13 more tests than before this task, all passed.
- `Contrast OK: 51 checks passed`.
- `Engine TZ check OK: 4 time zones passed`.
- exit code 0.

Run: `npm run test:e2e`
Expected: every test passes, and there is one more than before this task. That includes the new test and the existing `switches to Map layout …` test, which still clicks Harbor at 1440 px, where Harbor is drawn inside the box at y ≈ 401 of 460. No database, integration or Supabase suites apply.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "fix(projects): place map pins on the drawn map at every width"
```

---

### Task F9: Import Review: pending re-checks and the status date

**Fixes:**
- PR1-1: Review re-checks (status date, MSPDI activity-code field, XER encoding) left Import enabled while `analyze` ran. A click in that window stored the new mapping with the old report and the old model, so the user's choice was silently dropped (for example the mapping says ID, the activity codes are Unique IDs). A refused or failed re-check also kept the new mapping. After the fix, Import is disabled and reads "Checking…" until the answer arrives. The mapping, report and model change together or not at all.
- PR1-2: The D37 project-date check was lost on a row switch, an encoding change and a code-field change. A row without a file status date showed and stored checks made with no date (NTH-B: "0 errors · 2 warnings · 2 notes", no "Actual dates after the status date" findings, instead of "0 errors · 4 warnings · 2 notes" and "2 findings"). Going back to a row after editing its date reset the field but kept the edited-date report. After the fix, one helper picks the date for every re-check, and choosing a row re-checks that row.
- Decision rows: P3 core D37 and §5.1 step 5 (quoted below). No new decision row.

**Spec:**
- P3 core §5.1 step 5 (`docs/superpowers/specs/2026-11-05-phase3-core-design.md:415`): "Changing the encoding (XER), the activity-code field (MSPDI) or the status date runs `analyze` again; the checks use the status date the schedule will get, which is the field's value, or the project's when the field is empty, so the stored checks match the schedule (D37)."
- P3 core D37 (`:854`): "The status date reaches `analyze` as an option outside `ImportMapping`; the Review step re-runs the checks when it changes, so the stored checks use the schedule's own date (our call)".
- P3 core §5.1 step 6: `pack` returns the stored report; `importSchedule` inserts the mapping and the report. P4 core §4.2: `ImportScheduleInput.dataStored` is the `ScheduleDocument` built from the analyzed model at commit. Mapping, report and model must therefore come from the same `analyze` answer.
- P3 core §6.4 "Import schedule" row (`:726`): the Review footer is "Back" · "Import" / "Importing…", and the Columns footer is "Back" · "Next" / "Checking…". The spec gives no label for a Review re-check. This task reuses "Checking…" (see the open question).

**Files:**
- Create: `src/features/import/import-schema.test.ts`
- Modify: `src/features/import/import-schema.ts`, `src/features/import/ReviewStep.tsx`, `src/features/import/ImportScheduleDialog.tsx`
- Test: `src/features/import/import-schema.test.ts` (new), `src/features/import/ImportScheduleDialog.test.tsx` (adds helpers and six tests; no existing test pins the wrong behaviour, so none changes)

**Interfaces:**
- Produces, in `src/features/import/import-schema.ts`:
  ```ts
  export function statusDateForChecks(input: {
    edited: boolean;            // the Status date field was changed since the row's defaults
    fieldValue: string;         // the field's value
    initialStatusSource: ImportReport['statusDate']['source']; // from the row's first, date-less analysis
    projectStatusDate: ISODate | null; // the destination project's status date
  }): ISODate | null
  ```
  It needs `import type { ImportReport, ISODate } from '@/data/types'` and `import { isIsoDate } from '@/features/files/details-schema'`, which creates no import cycle.
- Changes, in `src/features/import/ReviewStep.tsx`: `AnalyzedProjectRow` gains `initialStatusDate: ISODate | null`. This is the file's own status date (or earliest start), equal to `report.statusDate.date` of the row's first analysis with `{ statusDate: null }`. The only producer is `enterReview` in `ImportScheduleDialog.tsx`, and the only reader is `applyRowDefaults`. No test or other module builds this type (`grep AnalyzedProjectRow src` lists only these two files).
- Internal to `ImportScheduleDialog.tsx` (not exported):
  - Removed: `currentAnalyzeStatusDate(edited, fieldValue)`.
  - New: `recheckRows(request: { mapping: ImportMapping; rows: ReadonlyArray<{ id: string; statusDate: ISODate | null }>; selectedId: string; renameProjects?: boolean }): void`.
- Consumes: `ImportClient.analyze(mapping: ImportMapping, options?: { statusDate?: ISODate | null }): Promise<AnalyzeOutcome>`, where `AnalyzeOutcome` is `{ kind: 'analyzed'; model; report } | { kind: 'refused'; message }`. Also consumes `isIsoDate(value: string): boolean`. Neither signature changes.

- [ ] **Step 1: Write the failing tests**

**(a) `src/features/import/import-schema.test.ts`** (new file). This pins the rule from §5.1 step 5 and D37. An unedited field holds the file's own date, so it passes `null` and the report keeps `source: 'file'`. The only exception is a file with no date, where the project's date applies.

```ts
import { describe, expect, it } from 'vitest';
import { statusDateForChecks } from '@/features/import/import-schema';

describe('statusDateForChecks', () => {
  it('uses the edited field, or the project date when the edited field is empty', () => {
    const edited = { edited: true, initialStatusSource: 'file', projectStatusDate: '2026-10-15' } as const;
    expect(statusDateForChecks({ ...edited, fieldValue: '2026-09-01' })).toBe('2026-09-01');
    expect(statusDateForChecks({ ...edited, fieldValue: '' })).toBe('2026-10-15');
    expect(statusDateForChecks({ ...edited, fieldValue: '', projectStatusDate: null })).toBeNull();
    expect(statusDateForChecks({ ...edited, fieldValue: '2026-02-30' })).toBeNull();
  });

  it('uses the project date for an unedited field only when the file has no status date', () => {
    const unedited = { edited: false, projectStatusDate: '2026-10-15' } as const;
    expect(statusDateForChecks({ ...unedited, fieldValue: '', initialStatusSource: 'none' })).toBe('2026-10-15');
    expect(
      statusDateForChecks({ ...unedited, fieldValue: '', initialStatusSource: 'none', projectStatusDate: null }),
    ).toBeNull();
    expect(statusDateForChecks({ ...unedited, fieldValue: '2026-10-15', initialStatusSource: 'file' })).toBeNull();
    expect(
      statusDateForChecks({ ...unedited, fieldValue: '2026-03-02', initialStatusSource: 'earliest-start' }),
    ).toBeNull();
  });
});
```
(`isIsoDate('2026-02-30')` is `false`. This was checked with a probe.)

**(b) `src/features/import/ImportScheduleDialog.test.tsx`.**

Make these helper changes at the top of the file:
- Add `import depot from '@/import/__fixtures__/project.xml?bytes';` and `import type { ISODate } from '@/data/types';`.
- Give `renderImport` an option `projectStatusDate?: ISODate | null`. When it is defined, call `dataLayer.store.write((db) => { db.projects.find((p) => p.code === options.projectCode)!.statusDate = options.projectStatusDate!; })` before the project lookup and the render. Project 003's seeded date is `now − 7 days`, so the tests that need a fixed date set it.
- Add these helpers:
```ts
/** A real in-thread client whose `analyze` answers can be held back (PR1-1). */
function gatedClient() {
  const client = realClient();
  const answer = client.analyze.bind(client);
  let gate: Promise<void> | null = null;
  let open = () => {};
  const analyze = vi.spyOn(client, 'analyze').mockImplementation(async (mapping, options) => {
    const held = gate;
    const outcome = await answer(mapping, options);
    if (held !== null) await held;
    return outcome;
  });
  return {
    client,
    analyze,
    hold: () => {
      gate = new Promise<void>((resolve) => {
        open = resolve;
      });
    },
    release: () => {
      gate = null;
      open();
    },
  };
}

/** two-projects.xer with NTH-B's last_recalc_date removed and B2000 finished on 2026-10-20 (PR1-2). */
function annexWithoutStatusDate() {
  const text = new TextDecoder().decode(xer)
    .replace('%R\t102\tNTH-B\tN\t2026-10-15 17:00\t', '%R\t102\tNTH-B\tN\t\t')
    .replace(
      '%R\t11\t102\t2002\t1\tB2000\tAnnex start\tTT_Mile\tTK_NotStart\t0\tCP_Drtn\t0\t0\t\t\t',
      '%R\t11\t102\t2002\t1\tB2000\tAnnex start\tTT_Mile\tTK_Complete\t100\tCP_Drtn\t0\t0\t2026-10-20 08:00\t2026-10-20 08:00\t',
    );
  expect(text).toContain('%R\t102\tNTH-B\tN\t\t');
  expect(text).toContain('TK_Complete\t100');
  return new TextEncoder().encode(text);
}

/** project.xml with every task ID moved up by 100, so "Unique ID" and "ID" give different codes. */
function depotWithShiftedIds() {
  const text = new TextDecoder().decode(depot)
    .replace(/<ID>(\d+)<\/ID>/g, (_match, id: string) => `<ID>${Number(id) + 100}</ID>`);
  return new TextEncoder().encode(text);
}
```

The values were derived from the probe `<scratchpad>/F9-probe.ts`. It drives the real in-thread client with the same fixture edits, followed by `pack` and `fromImportModel`. These are the results:

| Source · encoding · `statusDate` option | `report.statusDate` | Issues summary | ACTUAL_AFTER |
|---|---|---|---|
| two-projects NTH-A · utf-8 · null | `{2026-10-15, 08:00, file}` | 0 errors · 4 warnings · 3 notes | 0 |
| two-projects NTH-A · utf-8 · 2026-09-01 | `{2026-09-01, null, user}` | 0 errors · 6 warnings · 2 notes | 2 |
| annex NTH-A · utf-8 · null | `{2026-10-15, 08:00, file}` | 0 errors · 4 warnings · 3 notes | 0 |
| annex NTH-B · utf-8 · null (today's row switch) | `{null, null, none}` | 0 errors · 2 warnings · 2 notes | 0 |
| annex NTH-B · utf-8 · 2026-10-15 (D37) | `{2026-10-15, null, user}` | 0 errors · 4 warnings · 2 notes | 2 |
| annex NTH-B · windows-1254 · 2026-10-15 | `{2026-10-15, null, user}`, encoding `{windows-1254, user}` | 0 errors · 4 warnings · 2 notes | 2 |
| depot (IDs +100) · UID · null | `{2026-03-20, 17:00, file}` | 0 errors · 0 warnings · 2 notes | 0. Document codes `2,3,4…`, 6 activities |
| depot (IDs +100) · ID · null | same | same | 0. Document codes `102,103,104…` |

`pack` keeps `statusDate`, `issueTotals`, `encoding` and `activityCodeField` unchanged. MSPDI `codeFields` are `['UID', 'ID']`, labelled "Unique ID" and "ID".

Add these tests in `describe('ImportScheduleDialog — Review and import')`. The local helper `toReview` already exists. Every test also spies `const importSchedule = vi.spyOn(dataLayer.repository, 'importSchedule');` right after `renderImport`.

1. `it('keeps Import disabled while the checks run again and imports what was checked')` (PR1-1)
```ts
const gated = gatedClient();
const { user, dataLayer } = renderImport({ projectCode: '003', client: () => gated.client });
const importSchedule = vi.spyOn(dataLayer.repository, 'importSchedule');
await toReview(user, new File([xer], 'north.xer'));
gated.hold();
const date = screen.getByLabelText('Status date');
await user.clear(date);
await user.type(date, '2026-09-01');
await waitFor(() =>
  expect(gated.analyze).toHaveBeenLastCalledWith(
    expect.objectContaining({ sourceProjectId: '101' }), { statusDate: '2026-09-01' }),
);
expect(screen.getByRole('button', { name: 'Checking…' })).toBeDisabled();
expect(screen.queryByRole('button', { name: 'Import' })).not.toBeInTheDocument();
expect(screen.getByText('0 errors · 4 warnings · 3 notes')).toBeInTheDocument();
await act(async () => gated.release());
const button = await screen.findByRole('button', { name: 'Import' });
expect(button).toBeEnabled();
expect(screen.getByText('0 errors · 6 warnings · 2 notes')).toBeInTheDocument();
await user.click(button);
expect(await screen.findByText('Schedule imported')).toBeInTheDocument();
expect(importSchedule).toHaveBeenCalledTimes(1);
const submitted = importSchedule.mock.calls[0]![0];
expect(submitted).toMatchObject({ statusDate: '2026-09-01', mapping: { sourceProjectId: '101' } });
expect(submitted.report.statusDate).toEqual({ date: '2026-09-01', time: null, source: 'user' });
expect(submitted.report.issueTotals).toEqual({ error: 0, warning: 6, info: 2 });
```

2. `it('stores the activity-code field only with its analysis')` (PR1-1, mapping equals the analyzed one)
```ts
const gated = gatedClient();
// render with client: () => gated.client, spy importSchedule
await toReview(user, new File([depotWithShiftedIds()], 'depot.xml'));
gated.hold();
await user.click(screen.getByLabelText('Activity codes'));
await user.click(await screen.findByRole('option', { name: 'ID' }));
await waitFor(() =>
  expect(gated.analyze).toHaveBeenLastCalledWith(
    expect.objectContaining({ activityCodeField: 'ID' }), { statusDate: null }),
);
expect(screen.getByRole('button', { name: 'Checking…' })).toBeDisabled();
expect(screen.getByLabelText('Activity codes')).toHaveTextContent('Unique ID');
await act(async () => gated.release());
expect(await screen.findByRole('button', { name: 'Import' })).toBeEnabled();
expect(screen.getByLabelText('Activity codes')).not.toHaveTextContent('Unique ID');
expect(screen.getByText('IDs change when rows are inserted, so later updates may not match.')).toBeInTheDocument();
await user.click(screen.getByRole('button', { name: 'Import' }));
expect(await screen.findByText('Schedule imported')).toBeInTheDocument();
const submitted = importSchedule.mock.calls[0]![0];
expect(submitted).toMatchObject({ statusDate: '2026-03-20', activityCount: 6, mapping: { activityCodeField: 'ID' } });
expect(submitted.report.activityCodeField).toBe('ID');
const created = await importSchedule.mock.results[0]!.value;
const loaded = await dataLayer.repository.getScheduleDocument(created.id);
expect(loaded.document?.activities.slice(0, 3).map((a) => a.code)).toEqual(['102', '103', '104']);
```
Here `statusDate: null` is the helper's value for an unedited field whose source is `'file'` (the file's StatusDate is 2026-03-20).

3. `it('keeps the analyzed mapping when a re-check fails')` (PR1-1, failed re-analyze)
```ts
const client = realClient();
const analyze = vi.spyOn(client, 'analyze');
// render with client: () => client, spy importSchedule
await toReview(user, new File([depotWithShiftedIds()], 'depot.xml'));
analyze.mockRejectedValueOnce(new Error('The parser stopped.'));
await user.click(screen.getByLabelText('Activity codes'));
await user.click(await screen.findByRole('option', { name: 'ID' }));
expect(await screen.findByText('The parser stopped.')).toBeInTheDocument();
expect(await screen.findByRole('button', { name: 'Import' })).toBeEnabled();
expect(screen.getByLabelText('Activity codes')).toHaveTextContent('Unique ID');
await user.click(screen.getByRole('button', { name: 'Import' }));
expect(await screen.findByText('Schedule imported')).toBeInTheDocument();
const submitted = importSchedule.mock.calls[0]![0];
expect(submitted.mapping.activityCodeField).toBe('UID');
expect(submitted.report.activityCodeField).toBe('UID');
const created = await importSchedule.mock.results[0]!.value;
const loaded = await dataLayer.repository.getScheduleDocument(created.id);
expect(loaded.document?.activities.slice(0, 3).map((a) => a.code)).toEqual(['2', '3', '4']);
```

4. `it('shows a refused re-check and keeps the analyzed mapping')` (PR1-1, refused re-analyze)

This test is the same as test 3, with `analyze.mockResolvedValueOnce({ kind: 'refused', message: 'Refused for the test.' })` in place of the rejection. It expects `await screen.findByText('Refused for the test.')`. The rest is identical: Import is enabled, the select shows "Unique ID", and the submitted `mapping.activityCodeField` and `report.activityCodeField` are `'UID'`.

5. `it('checks a row without a file status date against the project date when it is chosen')` (PR1-2, row switch)
```ts
const client = realClient();
const analyze = vi.spyOn(client, 'analyze');
const { user, dataLayer } = renderImport({ projectCode: '003', projectStatusDate: '2026-10-15', client: () => client });
// spy importSchedule
await toReview(user, new File([annexWithoutStatusDate()], 'north.xer'));
const table = screen.getByRole('table', { name: 'Projects in this file' });
expect(within(table).getByText('0 errors · 2 warnings')).toBeInTheDocument();
await user.click(within(table).getByRole('radio', { name: 'Use NTH-B · North Annex' }));
await waitFor(() =>
  expect(analyze).toHaveBeenLastCalledWith(
    expect.objectContaining({ sourceProjectId: '102' }), { statusDate: '2026-10-15' }),
);
expect(await screen.findByText('0 errors · 4 warnings · 2 notes')).toBeInTheDocument();
expect(within(table).queryByText('0 errors · 2 warnings')).not.toBeInTheDocument();
expect(screen.getByLabelText('Status date')).toHaveValue('');
expect(screen.getByText("Not in the file. Leave it empty to use the project's status date.")).toBeInTheDocument();
expect(
  within(screen.getByRole('region', { name: 'Checks' }))
    .getByText('Actual dates after the status date').nextElementSibling,
).toHaveTextContent('2 findings');
await user.click(await screen.findByRole('button', { name: 'Import' }));
expect(await screen.findByText('Schedule imported')).toBeInTheDocument();
const submitted = importSchedule.mock.calls[0]![0];
expect(submitted).toMatchObject({
  code: 'NTH-B', statusDate: null, activityCount: 3, sourceProjectCode: 'NTH-B',
  mapping: { sourceProjectId: '102' },
});
expect(submitted.report.statusDate).toEqual({ date: '2026-10-15', time: null, source: 'user' });
expect(submitted.report.issueTotals).toEqual({ error: 0, warning: 4, info: 2 });
```
The checks are scoped to the "Checks" region because "Actual dates after the status date" is also an issue-group title once it has findings.

6. `it('resets a row to its file status date when it is chosen again')` (PR1-2, A → B → A)
```ts
// same render as test 5 (projectStatusDate '2026-10-15', analyze spy), annexWithoutStatusDate()
const date = screen.getByLabelText('Status date');
await user.clear(date);
await user.type(date, '2026-09-01');
expect(await screen.findByText('0 errors · 6 warnings · 2 notes')).toBeInTheDocument();
const table = screen.getByRole('table', { name: 'Projects in this file' });
await user.click(within(table).getByRole('radio', { name: 'Use NTH-B · North Annex' }));
expect(await screen.findByText('0 errors · 4 warnings · 2 notes')).toBeInTheDocument();
await user.click(within(table).getByRole('radio', { name: 'Use NTH-A · North Plant' }));
await waitFor(() =>
  expect(analyze).toHaveBeenLastCalledWith(
    expect.objectContaining({ sourceProjectId: '101' }), { statusDate: null }),
);
expect(await screen.findByText('0 errors · 4 warnings · 3 notes')).toBeInTheDocument();
expect(screen.getByLabelText('Status date')).toHaveValue('2026-10-15');
expect(screen.getByText('From the file')).toBeInTheDocument();
await user.click(await screen.findByRole('button', { name: 'Import' }));
expect(await screen.findByText('Schedule imported')).toBeInTheDocument();
const submitted = importSchedule.mock.calls[0]![0];
expect(submitted).toMatchObject({ code: 'NTH-A', statusDate: '2026-10-15', mapping: { sourceProjectId: '101' } });
expect(submitted.report.statusDate).toEqual({ date: '2026-10-15', time: '08:00', source: 'file' });
```

7. `it('keeps the project date when the encoding changes')` (PR1-2, encoding)
```ts
// same render as test 5
await user.click(screen.getByRole('radio', { name: 'Use NTH-B · North Annex' }));
expect(await screen.findByText('0 errors · 4 warnings · 2 notes')).toBeInTheDocument();
await user.click(screen.getByLabelText('Text encoding'));
await user.click(await screen.findByRole('option', { name: 'Turkish (Windows-1254)' }));
await waitFor(() =>
  expect(analyze).toHaveBeenLastCalledWith(
    expect.objectContaining({ sourceProjectId: '102', encoding: 'windows-1254' }), { statusDate: '2026-10-15' }),
);
expect(analyze).toHaveBeenCalledWith(
  expect.objectContaining({ sourceProjectId: '101', encoding: 'windows-1254' }), { statusDate: null });
await waitFor(() => expect(screen.getByLabelText('Text encoding')).toHaveTextContent('Turkish (Windows-1254)'));
expect(screen.getByText('0 errors · 4 warnings · 2 notes')).toBeInTheDocument();
await user.click(await screen.findByRole('button', { name: 'Import' }));
expect(await screen.findByText('Schedule imported')).toBeInTheDocument();
const submitted = importSchedule.mock.calls[0]![0];
expect(submitted.mapping).toMatchObject({ encoding: 'windows-1254', sourceProjectId: '102' });
expect(submitted.report.statusDate).toEqual({ date: '2026-10-15', time: null, source: 'user' });
expect(submitted.report.encoding).toEqual({ name: 'windows-1254', detectedBy: 'user' });
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/features/import/import-schema.test.ts src/features/import/ImportScheduleDialog.test.tsx`

Expected: these fail, and the existing tests in both files still pass.
- `statusDateForChecks` (both tests): `TypeError: … statusDateForChecks is not a function`.
- Tests 1 and 2: `Unable to find an accessible element with the role "button" and name "Checking…"`. Today Import stays enabled while the answer is held.
- Test 3: `expected 'ID' to be 'UID'` on `submitted.mapping.activityCodeField`. Today the code-field handler calls `setMapping` before `analyze`.
- Test 4: `Unable to find an element with the text: Refused for the test.` Today a refusal is silently ignored, and the mapping is already `'ID'`.
- Tests 5, 6 and 7: the `waitFor` or `findByText('0 errors · 4 warnings · 2 notes')` after choosing NTH-B times out. Today `handleSelectProject` never calls `analyze`, and the last call was `({ sourceProjectId: '102' }, { statusDate: null })` from `enterReview`.

- [ ] **Step 3: Implement**

`src/features/import/import-schema.ts`: add `statusDateForChecks` (signature above) with this rule:
- If `edited`: return `projectStatusDate` when `fieldValue === ''`, return `fieldValue` when `isIsoDate(fieldValue)`, and `null` otherwise. In the last case the submit refuses with "Enter a valid date" anyway.
- If not `edited`: return `projectStatusDate` when `initialStatusSource === 'none'`, and `null` otherwise. `null` lets the reader use the file's own date or earliest start, which is the field's default, so the report keeps its `'file'` or `'earliest-start'` source.

Add a JSDoc line that cites §5.1 step 5 and D37.

`src/features/import/ReviewStep.tsx`: add `initialStatusDate: ISODate | null` to `AnalyzedProjectRow` and add `ISODate` to the type import. Nothing else changes in this file.

`src/features/import/ImportScheduleDialog.tsx`:
1. `enterReview`: both `rows.push` calls add `initialStatusDate: outcome.report.statusDate.date`. Replace the D37 re-check condition (`chosenRow.initialStatusSource === 'none' && selectedProject?.statusDate != null`) with `const recheckDate = chosenRow === null ? null : statusDateForChecks({ edited: false, fieldValue: '', initialStatusSource: chosenRow.initialStatusSource, projectStatusDate: selectedProject?.statusDate ?? null })`. Re-analyze `nextMapping` with `{ statusDate: recheckDate }` only when `recheckDate !== null`. The rest of `enterReview` stays as it is.
2. `applyRowDefaults`: set the field to `row.initialStatusSource === 'none' ? '' : (row.initialStatusDate ?? '')`. It no longer reads `row.report.statusDate.date`, which an edited date overwrote.
3. Delete `currentAnalyzeStatusDate`.
4. Add `recheckRows`, the only path for Review re-checks. The pending flag is the existing `analyzing` state. The mapping, reports and models are applied only after every requested row has answered under the current sequence number. A refusal or failure applies nothing.
```ts
function recheckRows(request: {
  mapping: ImportMapping;
  rows: ReadonlyArray<{ id: string; statusDate: ISODate | null }>;
  selectedId: string;
  renameProjects?: boolean;
}): void {
  const isXer = inspected?.kind === 'schedule' && inspected.format === 'xer';
  analyzeSeqRef.current += 1;
  const seq = analyzeSeqRef.current;
  setAnalyzing(true);
  void (async () => {
    try {
      const answers = new Map<string, Extract<AnalyzeOutcome, { kind: 'analyzed' }>>();
      for (const target of request.rows) {
        const outcome = await parser.analyze(
          isXer ? { ...request.mapping, sourceProjectId: target.id } : request.mapping,
          { statusDate: target.statusDate },
        );
        if (analyzeSeqRef.current !== seq) return;          // a newer change owns the pending state
        if (outcome.kind !== 'analyzed') {
          setAnalyzing(false);
          toast.error(outcome.message);
          return;                                           // mapping, reports and models unchanged
        }
        answers.set(target.id, outcome);
      }
      for (const [id, answer] of answers) modelsRef.current.set(id, answer.model);
      setProjectRows((rows) =>
        rows.map((row) => {
          const answer = answers.get(row.project.id);
          if (answer === undefined) return row;
          return {
            ...row,
            project: request.renameProjects
              ? { ...row.project, name: answer.report.sourceProject.name ?? row.project.name }
              : row.project,
            report: answer.report,
            firstActivities: answer.model.activities.slice(0, 5).map((a) => a.name),
          };
        }),
      );
      setMapping(request.mapping);
      setAnalyzing(false);
      if (answers.get(request.selectedId)?.report.issueTotals.error === 0) setImportAlert(null);
    } catch (error) {
      if (analyzeSeqRef.current !== seq) return;
      setAnalyzing(false);
      if (!isCancelledError(error)) toast.error(clientErrorMessage(error));
    }
  })();
}
```
   `AnalyzeOutcome` is already exported from `@/hooks/useImportParser`; add it to that type import.
5. Each Review handler returns early when `submittingRef.current` is true. Radix selects stay live while "Importing…" runs. Each handler builds its request as follows, with `const projectStatusDate = selectedProject?.statusDate ?? null`:
   - `handleSelectProject(nextId)`: keep its guards (file and mapping set, the row exists, the row has no errors). Then call `setSelectedProjectId(nextId)` and `applyRowDefaults(row, file)`. Then call `recheckRows({ mapping: isXer ? { ...mapping, sourceProjectId: nextId } : mapping, rows: [{ id: nextId, statusDate: statusDateForChecks({ edited: false, fieldValue: '', initialStatusSource: row.initialStatusSource, projectStatusDate }) }], selectedId: nextId })`. It always re-checks the chosen row, so a row whose report was made with an earlier edited date goes back to its default date (test 6). It no longer calls `setMapping` directly.
   - `handleStatusDateChange(value)`: keep `setStatusDate`, `setStatusDateError(undefined)`, `setStatusDateEdited(true)` and the early returns (no active row or mapping, and a non-empty invalid value). Then call `recheckRows({ mapping: rowMapping, rows: [{ id: activeRow.project.id, statusDate: statusDateForChecks({ edited: true, fieldValue: value, initialStatusSource: activeRow.initialStatusSource, projectStatusDate }) }], selectedId: activeRow.project.id })`. `rowMapping` is built as today.
   - `handleActivityCodeFieldChange(field)`: call `recheckRows({ mapping: { ...mapping, activityCodeField: field }, rows: [{ id: activeRow.project.id, statusDate: statusDateForChecks({ edited: statusDateEdited, fieldValue: statusDate, initialStatusSource: activeRow.initialStatusSource, projectStatusDate }) }], selectedId: activeRow.project.id })`. Remove the early `setMapping(nextMapping)`.
   - `handleReviewEncodingChange(encoding)`: require `activeRow !== null`. Call `recheckRows({ mapping: { ...mapping, encoding, sourceProjectId: activeRow.project.id }, rows: projectRows.map((row) => ({ id: row.project.id, statusDate: row.project.id === activeRow.project.id ? statusDateForChecks({ edited: statusDateEdited, fieldValue: statusDate, initialStatusSource: row.initialStatusSource, projectStatusDate }) : null })), selectedId: activeRow.project.id, renameProjects: true })`. Remove the early `setMapping(nextMapping)`. Rows other than the selected one keep `null`, as in `enterReview`. They get their D37 date when chosen.
6. Concurrency rule (decision): a newer Review change supersedes a pending one through the sequence number. The superseded mapping change is dropped, and the selects show the mapping still in force because they read the report. `handleBack` is unchanged: it already bumps the sequence and clears `analyzing`. `handleReviewSubmit` keeps its guard `submittingRef.current || analyzing`. With the pending flag, its `activeRow.report`, `modelsRef` model and `mapping` now always come from one answer.
7. Review footer button: `disabled={analyzing || importing}` stays. Show `<Loader2 className="animate-spin" aria-hidden="true" />` when `analyzing || importing`. The label is `importing ? 'Importing…' : analyzing ? 'Checking…' : 'Import'`. `ReviewStep` keeps `disabled={importing}`. The Status date field must stay editable during a re-check, because a date input commits each segment as the user types it.

- [ ] **Step 4: Run the checks**

Run: `npx vitest run src/features/import`. Expected: every test passes, including the 2 new `statusDateForChecks` tests and the 7 new dialog tests.

Run: `npm run check && npm run build && npm run test:e2e`

Expected:
- `npm run check` exits 0. Typecheck and lint are clean, Vitest reports `0 failed`, contrast checks pass and the engine multi-timezone suite passes (unchanged).
- `npm run build` exits 0.
- Playwright reports `0 failed`. In `e2e/import.spec.ts`, "the second project of a two-project XER is imported and its report opens from the row" stays green. Choosing NTH-B now starts a re-check, and `getByRole('button', { name: 'Import', exact: true }).click()` waits until the button is named "Import" and enabled again.

No migration or data-layer change, so `test:db`, `test:integration` and `test:e2e:supabase` are not required.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "fix: hold Import during review re-checks and keep the D37 status date"
```

---

## Appendix A: property-test helpers for Task F2 (verbatim)

Task F2 Step 1e copies this block into `src/engine/properties.test.ts`, above the `describe`. It was type-checked and run against main's engine and the fixed one during planning.

```ts
const MIXED_CALENDARS: ScheduleCalendar[] = [
  makeStandardCalendar('cal:standard'),
  makeStandardCalendar('cal:7day', {
    name: 'Seven day',
    week: Array.from({ length: 7 }, () => [
      { start: 480, finish: 720 },
      { start: 780, finish: 1020 },
    ]),
    hoursPerWeek: 56,
  }),
  makeStandardCalendar('cal:4x10', {
    name: 'Four tens',
    week: [0, 1, 2, 3, 4, 5, 6].map((day) =>
      day >= 1 && day <= 4
        ? [
            { start: 420, finish: 720 },
            { start: 750, finish: 1050 },
          ]
        : [],
    ),
    hoursPerDay: 10,
    hoursPerWeek: 40,
  }),
];

const MIXED_COMPILED = new Map<string, CompiledCalendar>(
  MIXED_CALENDARS.map((cal) => {
    const res = compileCalendar(cal);
    if ('code' in res) throw new Error(res.message);
    return [cal.id, res];
  }),
);

type MixedKind = 'task' | 'start_milestone' | 'finish_milestone' | 'level_of_effort';

interface MixedSpec {
  profile: ScheduleProfileId;
  lagCalendar: LagCalendarMode;
  progressMode: ProgressMode;
  mustFinishBy: string | null;
  activities: Array<{
    kind: MixedKind;
    duration: number;
    calendar: number;
    progress: ScheduleActivity['status'];
    constraint: ScheduleActivity['constraint'];
  }>;
  edges: Array<{ u: number; v: number; type: RelationshipType; lagMinutes: number; lagElapsed: boolean }>;
}

const mixedSpecArbitrary: fc.Arbitrary<MixedSpec> = fc.integer({ min: 2, max: 14 }).chain((n) =>
  fc.record({
    profile: fc.constantFrom<ScheduleProfileId>('p6', 'msp', 'default'),
    lagCalendar: fc.constantFrom<LagCalendarMode>('predecessor', 'successor', 'elapsed_24h', 'project_default'),
    progressMode: fc.constantFrom<ProgressMode>('retained_logic', 'progress_override'),
    mustFinishBy: fc.constantFrom<string | null>(null, null, '2026-01-12T17:00'),
    activities: fc.array(
      fc.record({
        kind: fc.constantFrom<MixedKind>(
          'task',
          'task',
          'task',
          'task',
          'start_milestone',
          'finish_milestone',
          'level_of_effort',
        ),
        duration: fc.constantFrom(240, 480, 960, 1440, 2400),
        calendar: fc.integer({ min: 0, max: MIXED_CALENDARS.length - 1 }),
        progress: fc.constantFrom<ScheduleActivity['status']>(
          'not_started',
          'not_started',
          'not_started',
          'in_progress',
          'completed',
        ),
        constraint: fc.constantFrom<ScheduleActivity['constraint']>(
          null,
          null,
          null,
          { type: 'start_on_or_after', date: '2026-01-08T08:00' },
          { type: 'finish_on_or_after', date: '2026-01-09T17:00' },
          { type: 'start_on_or_before', date: '2026-01-12T08:00' },
          { type: 'finish_on_or_before', date: '2026-01-13T17:00' },
          { type: 'as_late_as_possible', date: null },
          { type: 'as_late_as_possible', date: null },
        ),
      }),
      { minLength: n, maxLength: n },
    ),
    edges: fc.array(
      fc
        .tuple(
          fc.integer({ min: 0, max: n - 2 }),
          fc.integer({ min: 1, max: n - 1 }),
          fc.constantFrom<RelationshipType>('FS', 'FS', 'SS', 'FF', 'SF'),
          fc.constantFrom(-240, 0, 0, 240, 480),
          fc.boolean(),
        )
        .filter(([u, v]) => u < v)
        .map(([u, v, type, lagMinutes, lagElapsed]) => ({ u, v, type, lagMinutes, lagElapsed })),
      { minLength: 1, maxLength: n * 2 },
    ),
  }),
);

function buildMixedDoc(spec: MixedSpec): ScheduleDocument {
  const activities = spec.activities.map((a, i) => {
    // Activity 0 is always a task, so the project finish never comes from an LOE.
    const type: MixedKind = i === 0 ? 'task' : a.kind;
    const isMilestone = type === 'start_milestone' || type === 'finish_milestone';
    const duration = isMilestone ? 0 : a.duration;
    const status = a.progress === 'in_progress' && isMilestone ? 'not_started' : a.progress;
    return makeActivity({
      id: `act:${i}`,
      code: `A${String(i + 1).padStart(3, '0')}`,
      type,
      calendarId: MIXED_CALENDARS[a.calendar]!.id,
      originalDuration: duration,
      remainingDuration:
        status === 'completed' ? 0 : status === 'in_progress' ? Math.max(240, duration - 480) : duration,
      status,
      actualStart:
        status === 'completed' ? '2026-01-05T08:00' : status === 'in_progress' ? '2026-01-06T08:00' : null,
      actualFinish:
        status === 'completed' ? (isMilestone ? '2026-01-05T08:00' : '2026-01-06T12:00') : null,
      constraint: type === 'level_of_effort' ? null : a.constraint,
    });
  });
  const seen = new Set<string>();
  const relationships: ScheduleRelationship[] = [];
  for (const e of spec.edges) {
    const key = `${e.u}:${e.v}:${e.type}`;
    if (seen.has(key)) continue;
    seen.add(key);
    relationships.push(
      makeRelationship({
        id: `rel:${relationships.length}`,
        predecessorId: `act:${e.u}`,
        successorId: `act:${e.v}`,
        type: e.type,
        lagMinutes: e.lagMinutes,
        lagElapsed: e.lagElapsed,
      }),
    );
  }
  return makeDocument({
    calendars: MIXED_CALENDARS,
    settings: {
      ...makeDocument().settings,
      profile: spec.profile,
      lagCalendar: spec.lagCalendar,
      progressMode: spec.progressMode,
      mustFinishBy: spec.mustFinishBy,
      projectStart: '2026-01-05T08:00',
      statusDate: '2026-01-07T08:00',
      defaultCalendarId: 'cal:standard',
    },
    activities,
    relationships,
  });
}

/**
 * For each relationship between two non-LOE activities whose successor is calculated by logic
 * (not started, or in progress under retained logic), the working minutes on the successor's
 * calendar from the link's bound to the successor's early date; negative means the link is broken.
 * An in-progress successor is checked on its early finish (its remaining work is what logic places).
 */
function linkSlack(doc: ScheduleDocument, summary: ComputedScheduleSummary) {
  const byId = new Map(doc.activities.map((a) => [a.id, a]));
  const out: Array<{ relId: string; slack: number }> = [];
  for (const rel of doc.relationships) {
    const pred = byId.get(rel.predecessorId)!;
    const succ = byId.get(rel.successorId)!;
    if (pred.type === 'level_of_effort' || succ.type === 'level_of_effort') continue;
    if (succ.status === 'completed') continue;
    if (succ.status === 'in_progress' && doc.settings.progressMode === 'progress_override') continue;
    const predCal = MIXED_COMPILED.get(pred.calendarId)!;
    const succCal = MIXED_COMPILED.get(succ.calendarId)!;
    const mode = doc.settings.lagCalendar;
    const lagCal =
      rel.lagElapsed || mode === 'elapsed_24h'
        ? ELAPSED_CALENDAR
        : mode === 'predecessor'
          ? predCal
          : mode === 'successor'
            ? succCal
            : MIXED_COMPILED.get(doc.settings.defaultCalendarId)!;
    const p = summary.activities[pred.id]!;
    const s = summary.activities[succ.id]!;
    const anchor = toMinutes(rel.type === 'FS' || rel.type === 'FF' ? p.earlyFinish : p.earlyStart);
    const bound = addWorkingMinutes(lagCal, anchor, rel.lagMinutes);
    const startSide = succ.status === 'not_started' && (rel.type === 'FS' || rel.type === 'SS');
    const target = toMinutes(startSide ? s.earlyStart : s.earlyFinish);
    out.push({ relId: rel.id, slack: workingMinutesBetween(succCal, bound, target) });
  }
  return out;
}

function withLongerLoes(doc: ScheduleDocument): ScheduleDocument {
  return {
    ...doc,
    activities: doc.activities.map((a) =>
      a.type === 'level_of_effort'
        ? { ...a, originalDuration: a.originalDuration + 4800, remainingDuration: a.remainingDuration + 4800 }
        : a,
    ),
  };
}
```

## Appendix B: engine probe for Task F10

Task F10 Step 1 uses this probe only if an earlier task changed the engine values it pins.

```ts
// F10 probe: one engine case per option on the legacy-p6 model. Save it at the repository root as
// zz-f10-probe.ts, run `npx tsx zz-f10-probe.ts`, read the values, then delete the file.
import { readFileSync } from 'node:fs';
import { fromImportModel, solve, type ImportModel } from '@/engine';
import type { ScheduleDocument, ScheduleSettings } from '@/data/schedule-types';

const load = () =>
  JSON.parse(readFileSync('src/import/__fixtures__/legacy-p6.model.json', 'utf8')) as ImportModel;

function run(label: string, model: ImportModel, patch: Partial<ScheduleSettings>) {
  const base = fromImportModel(model, { scheduleStatusDate: '2026-03-20' });
  const doc: ScheduleDocument = { ...base, settings: { ...base.settings, ...patch } };
  const res = solve(doc, { calculatedAt: '2026-01-05T08:00:00.000Z' });
  if (!res.ok) {
    console.log(label, 'ERR', res.error);
    return;
  }
  console.log(`== ${label}`, JSON.stringify(patch), 'finish', res.summary.projectFinish);
  for (const a of doc.activities) {
    const r = res.summary.activities[a.id]!;
    console.log(
      `  ${a.id} ${a.code} ${a.status.padEnd(11)} TF ${r.totalFloat} FF ${r.freeFloat} crit ${r.isCritical} LP ${r.isLongestPath}`,
    );
  }
}

// Threshold: 40 h makes act:00003 (TF 480) and act:00001 (TF 960) critical.
run('threshold 0', load(), {});
run('threshold 40 h', load(), { criticalThresholdMinutes: 2400 });
// Longest path vs total float with a later must-finish-by.
{
  const m = load();
  m.project.mustFinishBy = '2026-03-27T17:00';
  run('total_float, must finish by', m, {});
  run('longest_path, must finish by', m, { criticalDefinition: 'longest_path' });
}
// Start float (F10's new formula).
run('start_float', load(), { ruleOverrides: { totalFloatFormula: 'start_float' } });
```
