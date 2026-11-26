// @vitest-environment node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type {
  ComputedScheduleSummary,
  ScheduleActivity,
  ScheduleDocument,
  ScheduleProfileId,
  ScheduleRelationship,
  ScheduleSettings,
} from '@/data/schedule-types';
import { solve } from '@/engine';
import { compileCalendar, type CompiledCalendar } from '@/engine/calendar';
import {
  computeFloatsAndCriticality,
  runBackwardPass,
  runForwardPass,
  runPostPasses,
} from '@/engine/cpm';
import { traceDrivingPath } from '@/engine/driving';
import { buildGraph } from '@/engine/graph';
import { resolveRules } from '@/engine/profiles';
import {
  generateLargeDocument,
  makeActivity,
  makeDocument,
  makeRelationship,
} from '@/engine/testing';
import { toMinutes, toWallClock } from '@/engine/time';

interface FloatFixtureSpec {
  settings?: Partial<ScheduleSettings>;
  activities: Array<Partial<ScheduleActivity> & { id: string; code: string }>;
  relationships: Array<
    Partial<ScheduleRelationship> & { predecessorId: string; successorId: string }
  >;
}

const fixtures = JSON.parse(
  readFileSync(join(process.cwd(), 'src/engine/__fixtures__/floats.json'), 'utf8'),
) as Record<string, FloatFixtureSpec>;

function runFullCpm(doc: ScheduleDocument): ComputedScheduleSummary {
  const compiled = new Map<string, CompiledCalendar>();
  for (const cal of doc.calendars) {
    const res = compileCalendar(cal);
    if ('code' in res) throw new Error(res.message);
    compiled.set(cal.id, res);
  }
  const graphRes = buildGraph(doc);
  if (!graphRes.ok) throw new Error(graphRes.error.message);
  const rules = resolveRules(doc.settings.profile, doc.settings.ruleOverrides);
  const forward = runForwardPass(doc, graphRes.graph, compiled, rules);
  const backward = runBackwardPass(doc, graphRes.graph, compiled, rules, forward);
  runPostPasses(doc, graphRes.graph, compiled, rules, forward, backward);
  const floats = computeFloatsAndCriticality(
    doc,
    graphRes.graph,
    compiled,
    rules,
    forward,
    backward,
  );

  return {
    calculatedAt: '2026-01-05T08:00:00.000Z',
    durationMs: 0,
    projectStart: toWallClock(forward.projectStart),
    projectFinish: toWallClock(backward.projectFinish),
    activities: floats.activities,
    relationships: floats.relationships,
    wbsRollups: {},
    warnings: [...forward.warnings, ...backward.warnings, ...floats.warnings],
  };
}

function docFromFixture(
  key: string,
  settingsOverride?: Partial<ScheduleSettings>,
): ScheduleDocument {
  const spec = fixtures[key]!;
  return makeDocument({
    settings: {
      ...makeDocument().settings,
      ...spec.settings,
      ...settingsOverride,
    },
    activities: spec.activities.map((a) => makeActivity(a)),
    relationships: spec.relationships.map((r) => makeRelationship(r)),
  });
}

describe('CPM floats, criticality, longest path and driving trace', () => {
  it('computes diamond floats, criticality, driving links and driving path', () => {
    const doc = docFromFixture('diamond');
    const summary = runFullCpm(doc);

    expect(summary.activities.a).toMatchObject({
      totalFloat: 0,
      freeFloat: 0,
      isCritical: true,
      isNearCritical: false,
      isLongestPath: true,
    });
    expect(summary.activities.b).toMatchObject({
      totalFloat: 1440,
      freeFloat: 1440,
      isCritical: false,
      isNearCritical: true,
      isLongestPath: false,
    });
    expect(summary.relationships.r3).toEqual({ freeFloat: 0, isDriving: true });
    expect(summary.relationships.r4).toEqual({ freeFloat: 1440, isDriving: false });

    const trace = traceDrivingPath(doc, summary, 'm2');
    expect(trace).toEqual({
      activityIds: ['m2', 'a', 'm1'],
      relationshipIds: ['r3', 'r1'],
      hops: 2,
    });
  });

  it('distinguishes total_float vs longest_path critical definitions and warns NEGATIVE_FLOAT', () => {
    const byFloat = runFullCpm(
      docFromFixture('constrainedBranch', { criticalDefinition: 'total_float' }),
    );
    expect(byFloat.activities.a!.isCritical).toBe(true);
    expect(byFloat.activities.a!.isLongestPath).toBe(true);
    expect(byFloat.activities.b!.totalFloat).toBe(-480);
    expect(byFloat.activities.b!.isCritical).toBe(true);
    expect(byFloat.activities.b!.isLongestPath).toBe(false);
    expect(
      byFloat.warnings.some(
        (w) => w.code === 'NEGATIVE_FLOAT' && w.message === 'B10 has negative total float (-1 d).',
      ),
    ).toBe(true);

    const byLongest = runFullCpm(
      docFromFixture('constrainedBranch', { criticalDefinition: 'longest_path' }),
    );
    expect(byLongest.activities.a!.isCritical).toBe(true);
    expect(byLongest.activities.b!.isCritical).toBe(false);
  });

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

  // X FS→ B, A (ALAP) SS→ B lag −240 elapsed, B FS→ D lag +480 elapsed. The first pass finishes
  // on 07.01 17:00; the ALAP limit overshoots across the lunch break, so the re-run pushes B to
  // 09:00 and D to 08.01. The project finish, late dates and floats follow the final early dates.
  function alapRerunDoc(profile: ScheduleProfileId, mustFinishBy: string | null = null) {
    return makeDocument({
      settings: { ...makeDocument().settings, profile, mustFinishBy },
      activities: [
        makeActivity({ id: 'x', code: 'X10', originalDuration: 480 }),
        makeActivity({
          id: 'a',
          code: 'A10',
          originalDuration: 240,
          constraint: { type: 'as_late_as_possible', date: null },
        }),
        makeActivity({ id: 'b', code: 'B10', originalDuration: 480 }),
        makeActivity({ id: 'd', code: 'D10', originalDuration: 480 }),
      ],
      relationships: [
        makeRelationship({ id: 'r1', predecessorId: 'x', successorId: 'b', type: 'FS' }),
        makeRelationship({
          id: 'r2',
          predecessorId: 'a',
          successorId: 'b',
          type: 'SS',
          lagMinutes: -240,
          lagElapsed: true,
        }),
        makeRelationship({
          id: 'r3',
          predecessorId: 'b',
          successorId: 'd',
          type: 'FS',
          lagMinutes: 480,
          lagElapsed: true,
        }),
      ],
    });
  }

  for (const profile of ['p6', 'msp', 'default'] as const) {
    it(`alap-rerun-refreshes-project-finish (${profile})`, () => {
      const res = solve(alapRerunDoc(profile), { calculatedAt: '2026-01-05T08:00:00.000Z' });
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      const { summary } = res;
      const ids = Object.keys(summary.activities); // no LOE in this schedule
      const maxEf = ids
        .map((id) => summary.activities[id]!.earlyFinish)
        .reduce((max, ef) => (ef > max ? ef : max));
      expect(summary.projectFinish).toBe(maxEf);
      expect(summary.warnings.map((w) => w.code)).not.toContain('NEGATIVE_FLOAT');
      for (const id of ids) {
        expect(summary.activities[id]!.totalFloat, id).toBeGreaterThanOrEqual(0);
      }
      const longest = ids.filter((id) => summary.activities[id]!.isLongestPath);
      expect(longest.length).toBeGreaterThan(0);
      const finishing = ids.filter((id) => summary.activities[id]!.earlyFinish === maxEf);
      for (const id of finishing) expect(longest).toContain(id);

      expect(summary.projectFinish).toBe('2026-01-08T17:00');
      expect(summary.activities.x).toMatchObject({
        earlyStart: '2026-01-05T08:00',
        earlyFinish: '2026-01-05T17:00',
        lateStart: '2026-01-06T08:00',
        lateFinish: '2026-01-06T17:00',
        totalFloat: 480,
      });
      expect(summary.activities.a).toMatchObject({
        earlyStart: '2026-01-06T13:00',
        earlyFinish: '2026-01-06T17:00',
        lateStart: '2026-01-07T13:00',
        lateFinish: '2026-01-07T17:00',
        totalFloat: 480,
      });
      expect(summary.activities.b).toMatchObject({
        earlyStart: '2026-01-06T09:00',
        earlyFinish: '2026-01-07T09:00',
        lateStart: '2026-01-07T08:00',
        lateFinish: '2026-01-07T17:00',
        totalFloat: 420,
      });
      expect(summary.activities.d).toMatchObject({
        earlyStart: '2026-01-08T08:00',
        earlyFinish: '2026-01-08T17:00',
        lateStart: '2026-01-08T08:00',
        lateFinish: '2026-01-08T17:00',
        totalFloat: 0,
        isLongestPath: true,
      });
    });
  }

  it('keeps must finish by as the late anchor when the ALAP re-run moves the finish past it', () => {
    const res = solve(alapRerunDoc('p6', '2026-01-07T17:00'), {
      calculatedAt: '2026-01-05T08:00:00.000Z',
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.summary.projectFinish).toBe('2026-01-08T17:00');
    expect(res.summary.activities.d).toMatchObject({
      earlyFinish: '2026-01-08T17:00',
      lateFinish: '2026-01-07T17:00',
      isLongestPath: true,
    });
    expect(res.summary.warnings.filter((w) => w.code === 'MISSED_MUST_FINISH_BY')).toEqual([
      expect.objectContaining({
        message: 'Projected finish (2026-01-08T17:00) is after must finish by (2026-01-07T17:00).',
      }),
    ]);
  });

  it('reports the ALAP successor finish as the project finish under must finish by (msp)', () => {
    const doc = makeDocument({
      settings: { ...makeDocument().settings, profile: 'msp', mustFinishBy: '2026-01-14T17:00' },
      activities: [
        makeActivity({ id: 'c', code: 'C10', originalDuration: 2400 }),
        makeActivity({
          id: 'a',
          code: 'A10',
          originalDuration: 480,
          constraint: { type: 'as_late_as_possible', date: null },
        }),
        makeActivity({ id: 'b', code: 'B10', originalDuration: 480 }),
      ],
      relationships: [
        makeRelationship({ id: 'r1', predecessorId: 'a', successorId: 'b', type: 'FS' }),
      ],
    });
    const res = solve(doc, { calculatedAt: '2026-01-05T08:00:00.000Z' });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const { summary } = res;
    expect(summary.activities.a).toMatchObject({
      earlyStart: '2026-01-13T08:00',
      earlyFinish: '2026-01-13T17:00',
    });
    expect(summary.activities.b).toMatchObject({
      earlyStart: '2026-01-14T08:00',
      earlyFinish: '2026-01-14T17:00',
      lateFinish: '2026-01-14T17:00',
      isLongestPath: true,
    });
    expect(summary.projectFinish).toBe(summary.activities.b!.earlyFinish);
    expect(summary.warnings.map((w) => w.code)).toEqual([]);
  });

  it('applies freeFloatFloorZero (true on p6 vs false on msp)', () => {
    const p6 = runFullCpm(docFromFixture('negativeFreeFloat', { profile: 'p6' }));
    const msp = runFullCpm(docFromFixture('negativeFreeFloat', { profile: 'msp' }));
    expect(p6.activities.a!.freeFloat).toBe(0);
    expect(msp.activities.a!.freeFloat).toBe(-480);
  });

  it('traces a 50,000-node driving chain iteratively without stack overflow', () => {
    const chain = generateLargeDocument(50_000, 49_999);
    const summary = runFullCpm(chain);
    const trace = traceDrivingPath(chain, summary, chain.activities[49_999]!.id);
    expect(trace.activityIds).toHaveLength(50_000);
    expect(trace.relationshipIds).toHaveLength(49_999);
    expect(trace.hops).toBe(49_999);
  });
});
