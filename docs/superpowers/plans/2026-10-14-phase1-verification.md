# Phase 1 verification notes

| | |
|---|---|
| **Date** | 2026-10-17 |
| **Checked at** | `c9ead39` (Task 19) plus the Task 20 commit, whose only code change is the wizard focus fix below |
| **Status** | Automated checks pass. Items 1–6 and 8 wait for the owner; `v0.1.0` is tagged after that review. |
| **Spec** | `docs/superpowers/specs/2026-10-14-home-shell-design.md` (§2.2 success criteria, §6 layout, §6.12 accessibility) |

## Automated checks

Run on Windows 11 with Node 24 and npm 11.

| Command | Result |
|---|---|
| `npm run typecheck` | no errors |
| `npm run lint` | 0 errors, 13 warnings (open item 11) |
| `npm run test` | 45 test files, 257 tests passed |
| `npm run check:contrast` | `Contrast OK: 37 checks passed` |
| `npm run test:e2e` | `12 passed`; `home-1440.png`, `home-1024.png`, `home-768.png` and `home-375.png` written to `test-results/screens/` |
| `npm run build` | built; Vite warns that `index-*.js` is larger than 500 kB (814.66 kB, 249.34 kB gzipped) |

Before the fix in this commit, the wizard test "focuses the first field of the step on open, after Next and after Back" (`src/features/projects/NewProjectWizard.test.tsx`) failed in 3 of 10 full runs on 2026-10-17 (2 of 5 while writing these notes, 1 of 5 in their review) and in none of 12 later runs, so it depends on machine load: after Back, focus stayed on the Back button. The fault was in `NewProjectWizard`, and a user could hit it too. A render that no click caused, such as the one 300 ms after typing in Project ID, commits first and runs its effects a moment later. If Back was clicked in between, that older render's effect took the pending focus while the Client step was still on screen, and the Project type ref it used still pointed at the element from the Attributes step's last visit, which is no longer in the page. The pending focus now records its step, and only the render that shows that step uses it. A scratch test that forces this order (not committed) failed before the change and passes after it; 10 full runs of `npm run test` after the change all passed.

For S3 the e2e run has four create flows: a schedule from the banner, an imported schedule file, a project through the wizard and a team workspace. The project and workspace flows check that Home shows the new record without a reload. The two schedule flows end on the schedule page, so the Home update after a schedule is covered by the hook test "schedule mutations move their project to the top of recent projects" (`src/hooks/data-hooks.test.tsx`).

## Success criteria (spec §2.2)

| # | Covered by | State |
|---|---|---|
| S1 | component tests for all five Home sections; owner item 2 | tests pass; item 2 open |
| S2 | e2e keyboard-only workspace switch; owner item 1 | e2e passes; item 1 open |
| S3 | the four e2e create flows and the hook test above | pass |
| S4 | ESLint `no-restricted-imports`; item 7 below | pass |
| S5 | `npm run check` and `npm run test:e2e` | pass |
| S6 | the four screenshots; owner item 8 | item 8 open |

## Owner checklist

Items 1–6 need a person at a browser. Run `npm run dev`, or `npm run build` and `npm run preview`, in your own terminal. After editing `.env.local`, restart the dev server; for preview, run `npm run build` again, because the build reads the `VITE_*` values.

1. Keyboard only: focus order matches §6.12 (skip link → sidebar toggle → logo → workspace name → workspace chevron → project switcher → plan badge → account menu → sidebar nav → main content); every popover, menu and dialog opens, works and closes with the keyboard; focus returns to its trigger.
   - [ ] Pass
   - [ ] Fail
   - Note:
2. `.env.local` with `VITE_MOCK_SCENARIO=empty`, then `VITE_MOCK_FAIL_RATE=1`: every empty and error state of §6.6 appears, and Retry recovers after removing the fail rate.
   - [ ] Pass
   - [ ] Fail
   - Note:
3. Light theme: every screen is readable; no hard-coded dark colors.
   - [ ] Pass
   - [ ] Fail
   - Note:
4. DevTools → Rendering → `prefers-reduced-motion: reduce`: no zoom or slide animations remain.
   - [ ] Pass
   - [ ] Fail
   - Note:
5. 375 px: drawer navigation, stacked banner buttons, two table columns, compact plan badge.
   - [ ] Pass
   - [ ] Fail
   - Note:
6. `VITE_DATA_SOURCE=supabase`: the startup screen shows "Supabase data source is not implemented yet (Phase 2). Set VITE_DATA_SOURCE=mock."
   - [ ] Pass
   - [ ] Fail
   - Note:
7. `grep -rn "data/mock" src --include=*.ts --include=*.tsx` lists only files under `src/data` and `src/test`.
   - [x] Pass
   - [ ] Fail
   - Note: run on 2026-10-17. 21 lines in 10 files: `src/data/index.ts`, eight files in `src/data/mock/` and `src/test/fakes.ts`. Output:

     ```text
     src/data/index.ts:4:import { MockAuthService } from '@/data/mock/MockAuthService';
     src/data/index.ts:5:import { MockRepository } from '@/data/mock/MockRepository';
     src/data/index.ts:6:import type { Scenario } from '@/data/mock/seed';
     src/data/index.ts:7:import { createMockStore } from '@/data/mock/store';
     src/data/mock/latency.test.ts:3:import { withLatency } from '@/data/mock/latency';
     src/data/mock/MockAuthService.test.ts:2:import { MockAuthService } from '@/data/mock/MockAuthService';
     src/data/mock/MockAuthService.test.ts:3:import { createMockStore } from '@/data/mock/store';
     src/data/mock/MockAuthService.ts:2:import { withLatency, type LatencyOptions } from '@/data/mock/latency';
     src/data/mock/MockAuthService.ts:3:import type { MockStore } from '@/data/mock/store';
     src/data/mock/MockRepository.test.ts:2:import { MockRepository } from '@/data/mock/MockRepository';
     src/data/mock/MockRepository.test.ts:3:import { createMockStore, type MockStore } from '@/data/mock/store';
     src/data/mock/MockRepository.ts:2:import { withLatency, type LatencyOptions } from '@/data/mock/latency';
     src/data/mock/MockRepository.ts:3:import type { MockDb } from '@/data/mock/seed';
     src/data/mock/MockRepository.ts:4:import type { MockStore } from '@/data/mock/store';
     src/data/mock/seed.test.ts:2:import { seed } from '@/data/mock/seed';
     src/data/mock/store.test.ts:2:import { createMockStore, MOCK_DB_KEY } from '@/data/mock/store';
     src/data/mock/store.ts:1:import { seed, type MockDb, type Scenario } from '@/data/mock/seed';
     src/test/fakes.ts:2:import { MockAuthService } from '@/data/mock/MockAuthService';
     src/test/fakes.ts:3:import { MockRepository } from '@/data/mock/MockRepository';
     src/test/fakes.ts:4:import type { Scenario } from '@/data/mock/seed';
     src/test/fakes.ts:5:import { createMockStore, type MockStore } from '@/data/mock/store';
     ```

8. Screenshots (S6): compare `test-results/screens/home-1440.png`, `home-1024.png`, `home-768.png` and `home-375.png` with spec §6. Each one is sized to the full height of the Home page. `test-results/` is git-ignored, so `npm run test:e2e` writes a fresh set.
   - [ ] Pass
   - [ ] Fail
   - Note:

## Open items for the owner

Collected during Tasks 1–19 and checked against the code on 2026-10-17. Numbers are for reference in replies.

1. `package.json` has `"license": "ISC"`; which license to use is the owner's call.
2. Mock mode only: a cover photo of about 4 MB or more becomes a data URL longer than `localStorage`'s quota (about 5.2 million characters), so writing `mock-db.v1` fails. From then on every change lives in memory only and is gone after a reload. The form allows up to 5 MB.
3. `SignInPage` sends the user back to the page in `state.from`, as the plan pins; spec §6.7 says a `signed-in` result navigates to `/home`.
4. The sign-in "Continue" button shows a spinner and is disabled while pending but keeps its label; spec §6.8 asks primary buttons for a pending label.
5. `useCurrentContext` reports `status: 'error'` also when the current workspace's project list never loaded; the plan pins `error` only for a failed workspaces query.
6. A dialog can't be closed (Escape, Cancel, outside click) while its save is pending, so a request that never answers keeps it open. Proposal: the Phase 2 adapter sets a request timeout.
7. Seed: project `T-01`'s `createdAt` (37 days before seeding) is earlier than its workspace Site Operations' `createdAt` (30 days before).
8. `scripts/check-contrast.mjs` runs only when `process.argv[1]` matches `import.meta.url`. Run through a junction path the two differ, and the script prints nothing and exits 0, so a contrast failure would go unnoticed.
9. Radix's default highlight (`bg-accent`, about 1.1 : 1 against the popover) is replaced by a ring-colored outline in the workspace and project switchers, the schedule dialogs' project picker, the Project type select and the user menu. New cmdk lists must reuse `OPTION_CLASSES` (`src/components/common/popover-classes.ts`), new dropdown menus `MENU_ITEM_FOCUS_CLASSES` (`src/components/layout/top-bar-parts.tsx`).
10. A failed write of `mock-db.v1` logs one `console.warn` from `src/lib/storage.ts` ("could not write … continuing without it"). Spec §5.6 names a warning only for reseeding; the owner confirms this reading.
11. `npm run lint` reports 13 `react-refresh/only-export-components` warnings in 9 files that export a hook or helper next to a component, such as `src/auth/AuthProvider.tsx`, `src/hooks/useTheme.tsx` and `src/test/render.tsx` (3 warnings).
12. The Schedule placeholder page accepts `?scheduleId=` but does nothing with it; spec §4.4 says the route "reads" it.
13. The project placeholder pages (Files, Dashboard, Schedule) have no `h1` while the project list loads or after it fails.
14. In the cmdk lists (switchers, project picker) the highlight outline also follows the mouse, because cmdk selects the item under the pointer.
15. There is no favicon; the browser's request for `/favicon.ico` gets a 404.
16. The Playwright MCP server left console logs in `C:\scatchdule\.playwright-mcp`, outside the repo.
17. Two old git stashes ("task 14 quality fix", "task 10 partial work") are left over from interrupted sessions; `git stash drop` removes them.
18. To do: the row brought back by Undo takes focus if focus is on the page body or inside the To do panel. If the user has moved to another task's checkbox before the Undo write finishes, focus jumps to the returned row.
19. At 768 px both top bar switcher labels truncate ("My worksp…", "Riverside Office T…") while the full plan badge and the first name show (`home-768.png`).
20. `tsconfig.node.json`, which covers `e2e/`, has `lib: ["ES2023"]` without DOM, so a `page.evaluate` callback that uses `document` fails `tsc`.
21. The Projects nav item is disabled without a tooltip when there is no workspace (the spec has no copy for it; Files, Dashboard and Schedule have one). Disabled nav items are `span`s with `tabIndex={0}` and `aria-disabled`, and no role.
22. WorkspacesPanel shows `SectionError` only when the workspace list never loaded; when only the project list fails, the workspace rows stay. This is a reading of the "Workspaces fail to load" row in spec §6.10.
23. The Shared with me table's whole-row link was checked by hand in Chromium and Edge only, not in Firefox or Safari; the e2e suite runs Chromium only.
24. The Undo toast uses sonner's default duration of 4 s.
25. Phase 2 needs Docker for its local Supabase stack. On this machine Git Bash finds no `docker` command (`docker --version`, 2026-10-17).
