# Handoff: continuing on another computer

Written 2026-10-18 and updated on 2026-10-19 on the second computer. Phase 1 is done and tagged `v0.1.0`; Phase 2 (Supabase) is in progress.

## Where things stand

- The default branch is `main` (renamed from `master` on 2026-10-19, P2 spec D20). It holds Phase 1: 20 plan tasks, one commit each, plus fix and docs commits. `v0.1.0` is the commit `docs: record the phase 1 browser checks`.
- Checks at that commit: `npm run check` passes (257 unit tests, `Contrast OK: 37 checks passed`, lint 0 errors and 13 react-refresh warnings), `npm run test:e2e` gives `12 passed`, and `npm run build` succeeds.
- The owner's decisions made during Phase 1 are rows D9–D15 of the spec's decisions log (`docs/superpowers/specs/2026-10-14-home-shell-design.md`, §10). One more, on 2026-10-17: e2e builds into `dist-e2e` and serves it on port 4174, and never reuses a running server (`playwright.config.ts`).
- The browser checklist and 25 open items are in `docs/superpowers/plans/2026-10-14-phase1-verification.md`.
- Phase 2 continues on the second computer (Windows 11, Docker Desktop 29 with the WSL 2 engine, the repo at `C:\Users\EkA\Desktop\scatchduler`). Each finished plan task is one commit, so `git log` shows how far it got. Task 1's assumption checks all passed (`docs/superpowers/plans/2026-10-15-phase2-verification.md`).
- The owner's Phase 2 decisions are rows D17–D21 of the P2 spec's decisions log (§13), each pinned in the plan task it affects.

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
- Per task: implementer, then spec review, then quality review, one after the other; findings are fixed and folded into the task's commit (`git commit --amend`).
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
| 1 | 85–337 | 11 | 2080–2290 |
| 2 | 338–524 | 12 | 2291–2392 |
| 3 | 525–755 | 13 | 2393–2648 |
| 4 | 756–1072 | 14 | 2649–2878 |
| 5 | 1073–1324 | 15 | 2879–2964 |
| 6 | 1325–1537 | 16 | 2965–3120 |
| 7 | 1538–1625 | 17 | 3121–3216 |
| 8 | 1626–1760 | 18 | 3217–3366 |
| 9 | 1761–1959 | 19 | 3367–3418 |
| 10 | 1960–2079 | | |

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
| Task 3 | 7 | When Task 3 edits `seed.ts`, keep T-01's `createdAt` after its workspace's, so Task 15's local seed doesn't inherit the inversion. |
| Task 4 | 3, 4 | Task 4 rewrites `SignInPage`; P2 spec §5.4 already returns to `state.from` or `/home`. Check that the new button reads "Signing in…" while pending. |
| Task 6 | 9, 22 | Give the Role selects the ring-outline highlight (as in `AttributesStep.tsx`). The owner confirmed the WorkspacesPanel error reading (P2 spec D17). |
| Task 8 | 2 | Task 8's cover shrinking (long edge 1600 px, JPEG 0.85) should bring mock covers under the `localStorage` quota; check it. |
| Task 14 | 6 | Requests time out after 60 s (P2 spec D18, pinned in Task 14). |
| Task 17 | 26 | Give `playwright.supabase.config.ts` its own port and build folder and `reuseExistingServer: false`, as Phase 1's e2e config has. |
| Task 18 | 1, 27 | `"license": "UNLICENSED"` and `"private": true` (P2 spec D19). `master` becomes `main` (D20); the owner renames it on GitHub before CI is pushed. |
| Task 18 | 8, 15 | Make `check-contrast.mjs`'s main-module guard compare real paths and reuse it in `check-secrets.mjs`; add a favicon the owner approves. |
| Later | 11–14, 18–21, 23, 24 | Cosmetic or later-phase items; the verification notes list each one. |

The Phase 2 plan was written before the Phase 1 decisions D9–D15. Each task's notes should tell the implementer which of them it touches (for example D11–D13 for the dialogs, D14 for the shared table, D15 for To do), so plan assertions that predate them follow the spec.

## Owner tasks

- Before Phase 2: install Docker (done on the second computer).
- During Phase 2: the decisions in the table above are taken (P2 spec D17–D21). Still to do: rename `master` to `main` on GitHub (Settings → General → Default branch) before CI is pushed.
- After Task 19, the plan's owner checklist (plan lines 3392–3399): the Google "G" mark file, the production runbook end to end, Google sign-in for invited and uninvited accounts, Cloudflare Pages deep links and headers, an invite accepted from a university inbox, the KVKK cross-border transfer check and privacy notice, and the Supabase plan limits.
- Billing stays a placeholder (`/settings/billing`); the owner chose to leave it for now.

## Left on the first computer

Nothing here is needed on the new computer.

- Two git stashes from cut-off sessions (`task 14 quality fix`, `task 10 partial work`); both tasks were redone and committed.
- `C:\scatchdule\.playwright-mcp`: browser logs from the Playwright MCP server, outside the repo.
- Claude Code's session history and memory for this project stay in that machine's `~/.claude` folder; this file replaces them.
