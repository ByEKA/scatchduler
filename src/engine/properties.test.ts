// @vitest-environment node
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type {
  ComputedScheduleSummary,
  LagCalendarMode,
  ProgressMode,
  RelationshipType,
  ScheduleActivity,
  ScheduleCalendar,
  ScheduleDocument,
  ScheduleProfileId,
  ScheduleRelationship,
} from '@/data/schedule-types';
import { solve } from '@/engine';
import {
  addWorkingMinutes,
  compileCalendar,
  ELAPSED_CALENDAR,
  workingMinutesBetween,
  type CompiledCalendar,
} from '@/engine/calendar';
import {
  makeActivity,
  makeDocument,
  makeRelationship,
  makeStandardCalendar,
} from '@/engine/testing';
import { toMinutes } from '@/engine/time';

interface DagSpec {
  durations: number[];
  edges: Array<{ u: number; v: number; type: RelationshipType; lagMinutes: number }>;
  seed: number;
}

const dagArbitrary: fc.Arbitrary<DagSpec> = fc.integer({ min: 2, max: 18 }).chain((n) =>
  fc.record({
    durations: fc.array(fc.constantFrom(0, 240, 480, 960, 1440), { minLength: n, maxLength: n }),
    edges: fc.array(
      fc
        .tuple(
          fc.integer({ min: 0, max: n - 2 }),
          fc.integer({ min: 1, max: n - 1 }),
          fc.constantFrom<RelationshipType>('FS', 'SS', 'FF', 'SF'),
          fc.constantFrom(-240, 0, 240, 480),
        )
        .filter(([u, v]) => u < v)
        .map(([u, v, type, lagMinutes]) => ({ u, v, type, lagMinutes })),
      { minLength: 0, maxLength: n * 2 },
    ),
    seed: fc.integer({ min: 1, max: 1_000_000 }),
  }),
);

function deterministicShuffle<T>(items: readonly T[], seed: number): T[] {
  const copy = [...items];
  let state = seed >>> 0;
  for (let i = copy.length - 1; i > 0; i--) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const j = state % (i + 1);
    const tmp = copy[i]!;
    copy[i] = copy[j]!;
    copy[j] = tmp;
  }
  return copy;
}

function buildDocFromDag(spec: DagSpec) {
  const activities: ScheduleActivity[] = spec.durations.map((dur, i) =>
    makeActivity({
      id: `act:${i}`,
      code: `A${String(i + 1).padStart(3, '0')}`,
      type: dur === 0 ? 'start_milestone' : 'task',
      originalDuration: dur,
      remainingDuration: dur,
    }),
  );

  // Deduplicate (u, v, type) so shuffled documents keep the identical active edge set.
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
      }),
    );
  }

  return makeDocument({
    calendars: [makeStandardCalendar('cal:standard')],
    settings: {
      ...makeDocument().settings,
      profile: 'p6',
      projectStart: '2026-01-05T08:00',
      statusDate: '2026-01-05T08:00',
    },
    activities,
    relationships,
  });
}

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
  edges: Array<{
    u: number;
    v: number;
    type: RelationshipType;
    lagMinutes: number;
    lagElapsed: boolean;
  }>;
}

const mixedSpecArbitrary: fc.Arbitrary<MixedSpec> = fc.integer({ min: 2, max: 14 }).chain((n) =>
  fc.record({
    profile: fc.constantFrom<ScheduleProfileId>('p6', 'msp', 'default'),
    lagCalendar: fc.constantFrom<LagCalendarMode>(
      'predecessor',
      'successor',
      'elapsed_24h',
      'project_default',
    ),
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
        status === 'completed'
          ? 0
          : status === 'in_progress'
            ? Math.max(240, duration - 480)
            : duration,
      status,
      actualStart:
        status === 'completed'
          ? '2026-01-05T08:00'
          : status === 'in_progress'
            ? '2026-01-06T08:00'
            : null,
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
    if (succ.status === 'in_progress' && doc.settings.progressMode === 'progress_override')
      continue;
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
        ? {
            ...a,
            originalDuration: a.originalDuration + 4800,
            remainingDuration: a.remainingDuration + 4800,
          }
        : a,
    ),
  };
}

describe('CPM solver algebraic properties', () => {
  it('satisfies date ordering, total float formula, order invariance and monotonicity across 50 random DAGs', () => {
    const compiledCal = compileCalendar(makeStandardCalendar('cal:standard'));
    if ('code' in compiledCal) throw new Error(compiledCal.message);

    fc.assert(
      fc.property(dagArbitrary, (spec) => {
        const doc = buildDocFromDag(spec);
        const res = solve(doc, { calculatedAt: '2026-01-05T08:00:00.000Z' });
        expect(res.ok).toBe(true);
        if (!res.ok) return;

        // 1. Date ordering, finite floats and exact P6 finish-float identity.
        for (const act of doc.activities) {
          const comp = res.summary.activities[act.id]!;
          expect(comp).toBeDefined();
          const es = toMinutes(comp.earlyStart);
          const ef = toMinutes(comp.earlyFinish);
          const ls = toMinutes(comp.lateStart);
          const lf = toMinutes(comp.lateFinish);
          expect(es).toBeLessThanOrEqual(ef);
          expect(ls).toBeLessThanOrEqual(lf);
          expect(Number.isFinite(comp.totalFloat)).toBe(true);
          expect(Number.isFinite(comp.freeFloat)).toBe(true);
          expect(comp.totalFloat).toBe(workingMinutesBetween(compiledCal, ef, lf));
        }

        // 2. Shuffling activities and relationships yields identical results.
        const shuffledDoc = {
          ...doc,
          activities: deterministicShuffle(doc.activities, spec.seed),
          relationships: deterministicShuffle(doc.relationships, spec.seed ^ 0x9e3779b9),
        };
        const shuffledRes = solve(shuffledDoc, { calculatedAt: '2026-01-05T08:00:00.000Z' });
        expect(shuffledRes.ok).toBe(true);
        if (!shuffledRes.ok) return;
        expect(shuffledRes.summary.activities).toEqual(res.summary.activities);
        expect(shuffledRes.summary.relationships).toEqual(res.summary.relationships);

        // 3. Adding a non-negative-lag FS edge u -> v (u < v, preserving acyclicity) never moves ES(v) earlier.
        const uIdx = 0;
        const vIdx = doc.activities.length - 1;
        const withExtraEdge = {
          ...doc,
          relationships: [
            ...doc.relationships,
            makeRelationship({
              id: 'rel:extra-fs',
              predecessorId: `act:${uIdx}`,
              successorId: `act:${vIdx}`,
              type: 'FS',
              lagMinutes: 0,
            }),
          ],
        };
        const monoRes = solve(withExtraEdge, { calculatedAt: '2026-01-05T08:00:00.000Z' });
        expect(monoRes.ok).toBe(true);
        if (!monoRes.ok) return;
        expect(
          toMinutes(monoRes.summary.activities[`act:${vIdx}`]!.earlyStart),
        ).toBeGreaterThanOrEqual(toMinutes(res.summary.activities[`act:${vIdx}`]!.earlyStart));
      }),
      { numRuns: 50 },
    );
  });
});

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
          const { earlyStart, earlyFinish, lateStart, lateFinish } =
            before.summary.activities[act.id]!;
          expect(after.summary.activities[act.id], act.id).toMatchObject({
            earlyStart,
            earlyFinish,
            lateStart,
            lateFinish,
          });
        }
      }),
      { numRuns: 200 },
    );
  });
});
