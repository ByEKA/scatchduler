# Start here

This folder is a ready-to-build project kit for Claude Code. It holds the design spec and a test-first implementation plan for the first slice of a construction-scheduling app: the signed-in app shell and the Home screen, running on mock data and ready to move to Supabase later.

## What's inside

| Path | What it is |
|---|---|
| `CLAUDE.md` | Project rules Claude Code loads automatically in every session |
| `docs/superpowers/specs/2026-10-14-home-shell-design.md` | What to build: layout, design tokens, components, states, data model, Phase 2 schema |
| `docs/superpowers/plans/2026-10-14-home-shell-phase1.md` | How to build it: 20 test-first tasks with exact files, interfaces, tests and commands |
| `docs/product/app-map.md` | The full product: every module, the domain model, the scheduling-engine rules and module dependencies |
| `docs/product/roadmap.md` | Phases P2–P7 to complete the product, plus improvement options beyond it |
| `docs/superpowers/specs/2026-10-14-phase2-supabase-design.md` | Phase 2 design: Supabase backend, invite-only sign-in (password + Google), members and roles |
| `docs/superpowers/plans/2026-10-15-phase2-supabase.md` | Phase 2 plan: 19 test-first tasks (local Supabase in Docker, database tests, Edge Function, adapters, CI, production runbook) |

## Before you start

- Node.js 22 LTS or newer (`node -v`), npm and Git
- Claude Code (run `claude` in a terminal)
- Recommended: the superpowers plugin for Claude Code (https://github.com/obra/superpowers). The plan is written for its `subagent-driven-development` and `executing-plans` skills; install it as its README describes. Without it, use the second kickoff prompt.

## Build it

1. Unzip the kit where you keep projects and open a terminal in `scheduler-app/` (keep the folder otherwise empty — Task 1 sets up git and npm here).
2. Start Claude Code: `claude`
3. Paste one of the kickoff prompts below.
4. Follow along through the commits: every plan task ends with one. Claude stops and asks when the spec needs a decision.
5. When it's done: `npm run dev`, open http://localhost:5173, and sign in with any email (demo mode).

### Kickoff prompt — with superpowers (recommended)

```text
Read CLAUDE.md, the spec (docs/superpowers/specs/2026-10-14-home-shell-design.md) and the plan (docs/superpowers/plans/2026-10-14-home-shell-phase1.md).
Execute the plan with superpowers:subagent-driven-development, task by task, in order.
For every task: write the failing test first, run the commands shown and compare with the expected output, then commit.
If a step can't be done as written (for example, a CLI flag changed), use the closest equivalent that keeps the task's tests and the spec's behavior, and say so in the commit body.
Stop and ask me if the spec seems wrong or a test can't pass without changing the spec.
After Task 20, show me the screenshots in test-results/screens/ and summarize what was built.
```

### Kickoff prompt — without plugins

```text
Read CLAUDE.md, the spec and the plan in docs/superpowers/.
Implement the plan yourself, one task at a time, in order. Before each task, re-read its Interfaces block. Follow its steps literally: failing test first, run the commands shown, compare with the expected output, commit.
After each task, give me a two-line status. Stop and ask me if the spec seems wrong or a test can't pass without changing it.
```

## Tips

- If a session is interrupted, open a new one and say: "Continue the plan. Check `git log` to see which tasks are already done."
- To see empty and error states: create `.env.local` with `VITE_MOCK_SCENARIO=empty` or `VITE_MOCK_FAIL_RATE=1`, restart `npm run dev`, then run `__resetMockDb()` in the browser console.
- The product name and color are placeholders: change them in `src/config/brand.ts` and the six `--brand-*` values in `src/index.css`.

## Next: Phase 2

The Phase 2 spec and plan are ready. Start them once Phase 1 is merged and tagged. Phase 1 is tagged `v0.1.0`; `docs/HANDOFF.md` has the current state, the working rules and the Phase 2 kickoff prompt.

You'll also need:
- Docker Desktop (or another Docker engine) running, for the local Supabase stack;
- for production, a Supabase account and a Cloudflare account.

Task 1 checks the local stack and stops if one of the spec's assumptions about Supabase doesn't hold.

```text
Phase 1 is merged. Read CLAUDE.md, the Phase 2 spec (docs/superpowers/specs/2026-10-14-phase2-supabase-design.md) and the Phase 2 plan (docs/superpowers/plans/2026-10-15-phase2-supabase.md).
Docker is running. Execute the plan with superpowers:subagent-driven-development, task by task, in order.
For every task: write the failing test first, run the commands shown and compare with the expected output, then commit.
Stop and ask me if a Supabase assumption check fails, the spec seems wrong, or a test can't pass without changing the spec.
After Task 19, show me the verification notes and the owner checklist.
```

Before going live, the plan's last task leaves you a short checklist. It covers:
- the Google mark file you add yourself;
- the production runbook;
- a Google sign-in test;
- a data-protection check.

Later phases follow `docs/product/roadmap.md`; its last section has a ready kickoff prompt for any phase.
