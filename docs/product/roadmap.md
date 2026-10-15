# Roadmap & Improvement Options

| | |
|---|---|
| **Date** | 2026-10-14 |
| **Status** | Proposal — the owner picks priorities; each phase then gets its own spec and plan |
| **Reads with** | `docs/product/app-map.md` (what the full product contains and how modules depend on each other) |

## 1. Principles

1. **Parity on the scheduling core first.** Planners judge a scheduling tool by its engine, editor and analysis; those come before extras.
2. **Differentiate where we have an edge:** the Turkish market, construction-management methods, and the lab's digital-construction work.
3. **One phase = one spec + one plan + one execution** in Claude Code (superpowers brainstorming → writing-plans → subagent-driven-development).
4. **Keep the Phase 1 rules:** components → hooks → repository; tokens only; test-first; our own identity, wording and code.

---

## 2. Parity phases

| Phase | Scope | Depends on | Size | Main risks |
|---|---|---|---|---|
| **P1 Shell & Home** | This kit | — | S | — |
| **P2 Backend** | Supabase auth (invite-only, password + Google), Postgres schema, RLS, storage, members and roles, `SupabaseRepository` — spec `docs/superpowers/specs/2026-10-14-phase2-supabase-design.md` and plan `docs/superpowers/plans/2026-10-15-phase2-supabase.md` (approved) | P1 | M–L | RLS mistakes, migration discipline |
| **P3 Projects, files, library** | Programs; full project attributes (stage, type, sector, client, location); tile / list / map; files with folders, tags (current / baseline / update n), lock, archive, notes; **import pipeline** (XER, MSPDI XML, Excel / CSV) with a column-mapping step and an import report; library | P2 | L | Import fidelity across tools |
| **P4 Schedule core** | Activity / WBS / relationship / calendar model; **CPM engine** in a Web Worker (cycle detection, calendars, constraints, progress modes, float, critical and driving path); virtualized grid + timeline; details panel; edit mode with locking and undo / redo; search | P3 | XL | Engine correctness, performance on 10k+ activities |
| **P5 Views & assets** | Quick and advanced filters, group / sort, saved views, column sets, calendar editor, palettes, layouts, resources and curves, custom fields, scope resolution | P4 | M | Configuration sprawl |
| **P6 Analysis & dashboard** | Version diff, compare overlay, quality engine + profiles, dashboard tabs (overview, summary, milestones, quality, performance, changes) | P4 (P5 for views) | L | Metric definitions |
| **P7 Collaboration & output** | Comments with mentions, history / audit, shares and roles, print and batch print (PDF), Excel and XER export, notifications | P4 | L | Print fidelity, permission edge cases |

---

## 3. Technical decisions for the hard parts

Recommendations to confirm during each phase's brainstorming:

| Area | Recommendation | Why |
|---|---|---|
| Grid | TanStack Table + TanStack Virtual | Headless, fast, fits shadcn styling |
| Timeline | Own SVG timeline (switch to canvas above ~2 000 visible bars) | The Gantt is the product's core surface; we need full control. If a library is considered, check its license and customization depth first. |
| CPM engine | Pure TypeScript package `src/engine` (no React), run in a Web Worker (Comlink); unit + property-based tests (fast-check) + golden schedules | Correctness is everything; the same package can later run server-side for checks |
| Import | XER (tab-separated table blocks) and MSPDI XML parsed in TypeScript (fast-xml-parser for XML); Excel / CSV via ExcelJS or SheetJS; MPP (binary) needs a server-side converter (MPXJ) — optional | Covers the common exchange formats without a backend dependency |
| Export | ExcelJS for Excel; XER writer in TypeScript; PDF by printing a dedicated print route with server-side headless Chromium | Faithful Gantt printouts |
| Map | MapLibre GL JS with a tile provider whose usage policy allows production | Open-source map rendering |
| Realtime | Supabase Realtime for presence and live refresh; a CRDT (Yjs) only if true co-editing becomes a goal | Avoid premature complexity |
| Performance budgets | Open a 10 000-activity version < 2 s; recalc < 300 ms; 60 fps scroll | Measured in CI with a generated schedule |

---

## 4. Improvement options beyond parity

Value: H / M / L · Effort: S / M / L / XL · "After" = earliest phase it can follow.

### A. Local fit (Turkey)

| # | Idea | Value | Effort | After |
|---|---|---|---|---|
| A1 | **Turkish UI and formats** (tr / en, date and number formats, Turkish sorting) | H | S–M | P2 (cheap if the i18n foundation lands early) |
| A2 | **Turkish holiday calendars:** fixed national holidays plus the moving religious holidays generated per year, half-day eves, company exceptions | H | S | P4 |
| A3 | **Progress-payment–ready tracking:** link activities to bill-of-quantities items (item code, quantity, unit price), record monthly quantities, draft the monthly progress payment and the cost S-curve | H | L | P4 + P5 |

### B. Construction planning methods

| # | Idea | Value | Effort | After |
|---|---|---|---|---|
| B1 | **Lookahead + Last Planner:** 2 / 4 / 6-week lookahead from the master schedule, constraint log (make-ready), weekly work plans, percent plan complete and reasons for variance | H | M | P4 |
| B2 | **Location-based scheduling / line of balance** for repetitive work (floors, units, sections) | M–H | M–L | P4 |
| B3 | **Takt planning board** | M | M | B2 |

### C. Digital construction (lab showcase)

| # | Idea | Value | Effort | After |
|---|---|---|---|---|
| C1 | **4D BIM:** IFC model viewer in the browser, link model elements to activities (by rules or by hand), play the schedule over the model, use quantities to suggest durations | H for the lab | L | P4 |
| C2 | **Site evidence:** geotagged photos and drone captures attached to activities and updates | M | M | P7 |

### D. Analytics and risk

| # | Idea | Value | Effort | After |
|---|---|---|---|---|
| D1 | **Schedule risk analysis:** Monte Carlo on three-point durations; P50 / P80 finish dates; criticality index; tornado chart | H | M | P4 |
| D2 | **Earned value and cost loading:** budgets by resource, S-curves, CPI / SPI, forecasts | H | M–L | P5 |
| D3 | **Delay analysis:** windows analysis across updates; time-impact analysis with fragnets; exportable narrative | M–H | L | P6 |
| D4 | **Portfolio analytics:** cross-project health, milestone heatmap, resource demand | M | M | P6 |
| D5 | **Learning from history:** duration estimates and delay-risk scoring from past versions (ML research track) | M | L | P6 + data volume |

### E. AI assistant (Claude API)

| # | Idea | Value | Effort | After |
|---|---|---|---|---|
| E1 | **Explain quality findings and propose fixes** (e.g. "add a successor to activity X"), applied with one click in edit mode | H | S–M | P6 |
| E2 | **Change narrative between updates** — a monthly report draft from the version diff | H | S | P6 |
| E3 | **Natural-language filters and questions** ("critical activities starting in the next two weeks") | M | S | P5 |
| E4 | **Draft schedule from a scope description** plus library templates | M | M | P4 + library |

### F. Collaboration and field

| # | Idea | Value | Effort | After |
|---|---|---|---|---|
| F1 | **Update workflow:** submit update → review the diff → approve → becomes current | H | M | P3 + P6 |
| F2 | **Mobile / PWA field updates:** offline progress, actual dates, photos | H | M | P7 |
| F3 | **Notifications** (in-app, email) for mentions, approvals, milestone slips | M | S–M | P7 |
| F4 | **Real-time presence and co-editing** | M | L | P7 |

### G. Integrations

| # | Idea | Value | Effort | After |
|---|---|---|---|---|
| G1 | Public REST API + webhooks | M | M | P2 |
| G2 | Calendar feed (ICS) for milestones | L–M | S | P4 |
| G3 | MPP import through a conversion service | M | M | P3 |
| G4 | Connectors to common construction platforms | M | L | P7 |

---

## 5. Recommended sequence

**Owner priorities (2026-10-14):** construction planning methods (B), analytics + AI (D, E), 4D BIM (C). Local-fit ideas (A) are deferred until asked for.

1. **P2 Supabase** — next; spec and plan are ready (start after Phase 1 is merged).
2. **P3**, then **P4** — the engine is the heart; everything chosen below builds on it.
3. Right after P4: **Lookahead + Last Planner (B1)** and **Monte Carlo risk (D1)**.
4. **P6**, immediately followed by the AI wins **E1 + E2** (they reuse the quality engine and the diff), then **E3**.
5. **4D BIM (C1)** as the lab showcase, then **site evidence (C2)**.
6. **Line of balance / takt (B2, B3)** and **earned value (D2)**; **delay analysis (D3)** and **portfolio analytics (D4)** after them.
7. **P5 / P7** pieces as pilot users need them; local-fit ideas (A1–A3) on request.

---

## 6. Starting a phase in Claude Code

```text
Read CLAUDE.md, docs/product/app-map.md and docs/product/roadmap.md.
Use superpowers:brainstorming to design Phase <N> (<name>) from roadmap §2 and the matching app-map sections.
Keep the architecture rules in CLAUDE.md. Write the spec to docs/superpowers/specs/, get my approval, then use superpowers:writing-plans.
```
