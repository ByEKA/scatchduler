export const meta = {
  name: 'plan-task',
  description: 'Run one plan task: TDD implementer, then spec and quality review with fix loops',
  whenToUse: 'Executing one task of a docs/superpowers/plans plan. args: task, title, lines, commit, notes; for Phase 2 also plan, spec, headLines, rulesLines (see docs/HANDOFF.md)',
  phases: [
    { title: 'Implement', detail: 'fresh implementer: failing test, code, checks, commit' },
    { title: 'Spec review', detail: 'independent check against the plan task and the spec' },
    { title: 'Quality review', detail: 'bugs, project rules, review focus' },
  ],
}

const t = args
// Phase 1 defaults; Phase 2 passes its own plan, spec and the line ranges of the plan's shared sections.
const PLAN = t.plan ?? 'docs/superpowers/plans/2026-10-14-home-shell-phase1.md'
const SPEC = t.spec ?? 'docs/superpowers/specs/2026-10-14-home-shell-design.md'
const HEAD_LINES = t.headLines ?? '13-74'
const RULES_LINES = t.rulesLines ?? '13-49'
const TRAILER = 'Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>'

const CONTEXT = `Project root: C:\\scatchdule\\scheduler-app (Git Bash path: /c/scatchdule/scheduler-app). Windows 11. Use the Bash tool (Git Bash) for the plan's shell commands; they are written for bash. Node 24, npm 11. Give the Bash tool a long timeout (600000 ms) for npm install, npx shadcn, playwright install and e2e runs.
Sources of truth: CLAUDE.md (project rules), the spec ${SPEC} and the plan ${PLAN}. The plan's Global Constraints, Review Focus and "Files beyond the spec's folder tree" (plan lines ${RULES_LINES}) apply to every task; the task table (plan lines 51-74) shows which later task delivers what. If code and spec disagree, the spec wins; names, labels and copy strings pinned in the plan's tests count as spec.
Never start \`npm run dev\` or any server in the foreground, and leave no server running when you finish.
Git: the repo has a local user.name/user.email; don't change git config. Commit messages: the plan's exact subject line; a plain-text body (no Markdown) only when there is something to record; the last line is exactly "${TRAILER}" after a blank line. Write multi-line messages with a bash heredoc or \`git commit -F <file>\`. System-level core.autocrlf=true makes git print "LF will be replaced by CRLF" warnings; they are harmless.${t.notes ? `\n\nController notes for this task (apply to implementers and reviewers):\n${t.notes}` : ''}`

const implPrompt = () => `You are the implementer for Task ${t.task} ("${t.title}") of the plan, and only that task. Earlier tasks are already committed (\`git log --oneline\`).

${CONTEXT}

Steps:
1. Read CLAUDE.md, plan lines ${HEAD_LINES}, the full text of Task ${t.task} (plan lines ${t.lines}) and every spec section the task lists under "Spec:". Read the existing code the task consumes or modifies.
2. Follow the task's steps literally and in order, test first:
   - Write each test file exactly as the plan shows. Reformatting by Prettier is fine; no changes to imports, test names, queries, assertions or strings. Write only the plan's tests (the Expected test counts depend on it); if you think a behavior lacks a test, say so under concerns.
   - Run the step's command and confirm the test FAILS for the reason the plan expects (e.g. module not found). Keep the decisive failure line for your report.
   - Implement per the task's Interfaces and Pins and the spec sections it names (spec values are requirements even when the plan doesn't repeat them).
   - Run every command the task shows and compare the output with its Expected line (test counts, printed strings, warnings).
3. Once the repo has a format script, run \`npm run format\` so files follow the repo's Prettier config, then \`npm run check\`. The task is done only when \`npm run check\` passes along with any extra command the task lists (build, e2e).
4. If a step can't be done as written (renamed CLI flag, new prompt, a library's current major behaves differently, a Windows difference), use the closest non-interactive equivalent that keeps the task's tests and the spec's behavior, and record it in the commit body: what the plan said, what you did, why.
5. STOP without committing, leave the working tree as it is, and return status NEEDS_OWNER with a precise question when the spec seems wrong or contradicts itself, or when a plan test can't pass without changing the spec or changing what the test asserts. A mechanical edit to a plan test that leaves its assertions intact (a type-only fix for strict tsc, a lint-disable line the plan anticipates) is allowed; record it as a deviation.
6. Before committing, review your own diff against the task's Files list, Interfaces and Pins.
7. Commit: \`git add -A\`, then commit with the subject exactly:
${t.commit}
   Then confirm \`git status --short\` is empty and \`git log --oneline -5\` shows the new commit.

Return the structured result. In evidence, quote the decisive output lines: the failing run before implementation, and the final passing runs (test counts, contrast line, build, e2e as applicable).`

const specPrompt = (round, previous) => `You are the spec-compliance reviewer for Task ${t.task} ("${t.title}") of the plan. Verify independently; don't trust any implementer report. Do not edit, create or delete project files and do not commit.

${CONTEXT}

Read CLAUDE.md, plan lines ${HEAD_LINES}, the full Task ${t.task} text (plan lines ${t.lines}) and every spec section it lists. Then inspect the task's commit: \`git log --oneline -5\`, \`git show --stat HEAD\`, \`git show HEAD\`, and read the resulting files in full where needed.

Check item by item:
- Files: every file in the task's Files list was created or modified as listed; no unrelated changes. One commit for this task with the subject exactly "${t.commit}" and a message ending with the line "${TRAILER}".
- Tests: each test file matches the plan's code block apart from formatting: same imports, test names, queries, assertions and strings. Any semantic difference is a finding unless the commit body records it as a mechanical change that leaves the assertions intact.
- Interfaces and Pins: every exported name, signature, return shape and pinned behavior is implemented as written.
- Copy and identifiers: labels, aria-labels, ids, storage keys, query keys and strings pinned by the plan or spec are verbatim.
- Spec values from the sections the task names (sizes, tokens, states, behavior) are implemented. Things the plan assigns to a later task (see the task table) are not findings.
- Deviations recorded in the commit body are real necessities and keep the tests and the spec's behavior.
- Run \`npm run check\` and the task's other commands; compare with the plan's Expected lines.
${round > 1 ? `\nThis is re-review round ${round}. Earlier findings and the fixer's report:\n${previous}\nConfirm each was fixed (or rightly rejected) and that nothing regressed.\n` : ''}
Report real, specific findings only, with file and line and the plan or spec text each one violates. Severity must_fix: violates the plan or spec, or a check fails. Severity note: worth knowing, no change needed. Set ownerDecision true only when the plan or spec itself seems wrong or contradictory and only the owner can decide. approved = no must_fix findings.`

const qualityPrompt = (round, previous) => `You are the code-quality reviewer for Task ${t.task} ("${t.title}") of the plan. Spec compliance was already checked. Do not edit, create or delete project files and do not commit.

${CONTEXT}

Read CLAUDE.md, plan lines ${RULES_LINES} and the Task ${t.task} text (plan lines ${t.lines}). Review the task's commit (\`git show HEAD\`) and the code it touches for:
- correctness bugs, each with a concrete scenario (inputs or state -> wrong result or crash);
- CLAUDE.md rules: layering and import restrictions, query keys only from src/hooks/query-keys.ts, localStorage only through src/lib/storage.ts, no hard-coded colors (token utilities; the banner's white overlays are allowed), TypeScript rules (import type; no enum, namespace, parameter properties or any), React rules (no setState in effects, no Date/Math.random during render, no autoFocus, forms noValidate), accessibility (aria-label on icon-only controls, labels bound to inputs, visible focus, keyboard operation);
- the plan's Review Focus items that apply to this task;
- tests that would pass even if the behavior broke.
Don't report style preferences or alternatives that conflict with the plan's explicit instructions; the plan wins over taste. Things the plan assigns to a later task are not findings.
${round > 1 ? `\nThis is re-review round ${round}. Earlier findings and the fixer's report:\n${previous}\nConfirm each was fixed (or rightly rejected) and that nothing regressed.\n` : ''}
Severity critical: broken behavior or a CLAUDE.md rule violation. important: a likely bug or spec drift that should be fixed now. minor: optional improvement. Set ownerDecision true only when the plan or spec itself seems wrong. approved = no critical or important findings.`

const fixPrompt = (findings, kind) => `You are fixing ${kind} review findings for Task ${t.task} ("${t.title}") of the plan.

${CONTEXT}

Read CLAUDE.md, plan lines ${RULES_LINES} and the Task ${t.task} text (plan lines ${t.lines}), plus the spec sections it lists as needed. Fix each finding below. Keep the plan's tests as the plan shows them. If a finding is wrong (it conflicts with the plan or the spec, or describes something that isn't so), don't apply it; explain why under rejected.

Findings:
${JSON.stringify(findings, null, 2)}

Then run \`npm run format\` (if the script exists) and \`npm run check\` (plus the task's other commands, e.g. build) until they pass, and fold the changes into the task's commit with \`git add -A && git commit --amend\`, keeping the subject "${t.commit}", adding or updating body lines only for deviations from the plan, and keeping "${TRAILER}" as the last line. Confirm \`git status --short\` is empty and the task still has one commit. If a finding can only be resolved by changing the spec, don't change anything for it; put the question in needsOwner.`

const IMPL = {
  type: 'object',
  properties: {
    status: { type: 'string', enum: ['DONE', 'DONE_WITH_CONCERNS', 'NEEDS_OWNER', 'BLOCKED'] },
    commitSha: { type: 'string' },
    summary: { type: 'string' },
    evidence: { type: 'string' },
    deviations: { type: 'array', items: { type: 'string' } },
    concerns: { type: 'array', items: { type: 'string' } },
    ownerQuestion: { type: 'string' },
  },
  required: ['status', 'summary', 'evidence', 'deviations', 'concerns'],
}
const FINDING = {
  type: 'object',
  properties: {
    severity: { type: 'string', enum: ['must_fix', 'note', 'critical', 'important', 'minor'] },
    file: { type: 'string' },
    line: { type: 'string' },
    issue: { type: 'string' },
    requirement: { type: 'string' },
    ownerDecision: { type: 'boolean' },
  },
  required: ['severity', 'issue'],
}
const REVIEW = {
  type: 'object',
  properties: {
    approved: { type: 'boolean' },
    checksRun: { type: 'string' },
    findings: { type: 'array', items: FINDING },
  },
  required: ['approved', 'checksRun', 'findings'],
}
const FIX = {
  type: 'object',
  properties: {
    commitSha: { type: 'string' },
    fixed: { type: 'array', items: { type: 'string' } },
    rejected: {
      type: 'array',
      items: { type: 'object', properties: { finding: { type: 'string' }, reason: { type: 'string' } }, required: ['finding', 'reason'] },
    },
    evidence: { type: 'string' },
    needsOwner: { type: 'string' },
  },
  required: ['fixed', 'rejected', 'evidence'],
}

const fixes = []

async function reviewLoop(kind, phaseTitle, promptFn, blocking) {
  const rounds = []
  let previous = ''
  for (let round = 1; round <= 3; round += 1) {
    const review = await agent(promptFn(round, previous), { label: `${kind} review ${round} (task ${t.task})`, phase: phaseTitle, schema: REVIEW })
    if (!review) return { ok: false, reason: `${kind} reviewer failed`, rounds }
    rounds.push(review)
    const owner = review.findings.filter((f) => f.ownerDecision && blocking.includes(f.severity))
    if (owner.length) return { ok: false, reason: 'owner decision needed', owner, rounds }
    const toFix = review.findings.filter((f) => blocking.includes(f.severity))
    if (!toFix.length) return { ok: true, rounds }
    if (round === 3) return { ok: false, reason: 'unresolved after 3 rounds', toFix, rounds }
    const minor = review.findings.filter((f) => f.severity === 'minor')
    const batch = [...toFix, ...minor]
    log(`Task ${t.task}: ${toFix.length} blocking ${kind} finding(s), fixing`)
    const fix = await agent(fixPrompt(batch, kind), { label: `fix ${kind} ${round} (task ${t.task})`, phase: phaseTitle, schema: FIX })
    fixes.push(fix)
    if (!fix) return { ok: false, reason: 'fixer failed', rounds }
    if (fix.needsOwner) return { ok: false, reason: 'owner decision needed', owner: [fix.needsOwner], rounds }
    previous = JSON.stringify({ findings: batch, fixer: fix }, null, 2)
  }
  return { ok: false, reason: 'loop exhausted', rounds }
}

const brief = (f) => `[${f.severity}${f.ownerDecision ? ', owner' : ''}] ${f.file || ''}${f.line ? ':' + f.line : ''} ${f.issue}${f.requirement ? ' | req: ' + f.requirement : ''}`
const summarize = (loop) => loop && {
  ok: loop.ok,
  reason: loop.reason,
  rounds: loop.rounds ? loop.rounds.length : 0,
  owner: loop.owner,
  findingsByRound: (loop.rounds || []).map((r) => r.findings.map(brief)),
}
const report = (outcome, spec, quality) => ({
  task: t.task,
  outcome,
  commit: impl && impl.commitSha,
  implStatus: impl && impl.status,
  ownerQuestion: impl && impl.ownerQuestion,
  deviations: impl && impl.deviations,
  concerns: impl && impl.concerns,
  evidence: impl && impl.evidence,
  spec: summarize(spec),
  quality: summarize(quality),
  fixes: fixes.map((f) => f && { commitSha: f.commitSha, fixed: f.fixed, rejected: f.rejected, needsOwner: f.needsOwner }),
})

// t.startAt: 'spec' skips the implementer (the task is already committed as t.resumeCommit);
// 'quality' also skips the spec review.
let impl
if (t.startAt === 'spec' || t.startAt === 'quality') {
  impl = { status: 'RESUMED', commitSha: t.resumeCommit }
  log(`Task ${t.task}: starting at the ${t.startAt} review on commit ${t.resumeCommit || 'HEAD'}`)
} else {
  phase('Implement')
  impl = await agent(implPrompt(), { label: `implement task ${t.task}`, phase: 'Implement', schema: IMPL })
  if (!impl) return { task: t.task, outcome: 'implementer-failed' }
  if (impl.status === 'NEEDS_OWNER' || impl.status === 'BLOCKED') return report('needs-owner', null, null)
  log(`Task ${t.task} implemented (${impl.status}), commit ${impl.commitSha || '?'}`)
}

let spec = { ok: true, rounds: [], reason: 'skipped (startAt quality)' }
if (t.startAt !== 'quality') {
  phase('Spec review')
  spec = await reviewLoop('spec', 'Spec review', specPrompt, ['must_fix'])
  if (!spec.ok) return report('spec-review-stopped', spec, null)
}

phase('Quality review')
const quality = await reviewLoop('quality', 'Quality review', qualityPrompt, ['critical', 'important'])
return report(quality.ok ? 'complete' : 'quality-review-stopped', spec, quality)
