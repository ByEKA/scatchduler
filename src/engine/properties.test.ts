// @vitest-environment node
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type {
  RelationshipType,
  ScheduleActivity,
  ScheduleRelationship,
} from '@/data/schedule-types';
import { solve } from '@/engine';
import { compileCalendar, workingMinutesBetween } from '@/engine/calendar';
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
