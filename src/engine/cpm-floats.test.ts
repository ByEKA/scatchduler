// @vitest-environment node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type {
  ComputedScheduleSummary,
  ProfileRuleOverrides,
  ScheduleActivity,
  ScheduleDocument,
  ScheduleProfileId,
  ScheduleRelationship,
  ScheduleSettings,
  ScheduleWbsNode,
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
  wbs?: ScheduleWbsNode[];
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
    wbs: spec.wbs ?? [],
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

  it('applies totalFloatFormula start_float (P4 D14)', () => {
    // The plan's splitFloat fixture became completedEarly in F2 and no longer splits the floats,
    // so the split is set on the pass output as above: finish float 960, start float 0.
    function splitFloatWith(ruleOverrides: ProfileRuleOverrides, reversed = false) {
      const doc = makeDocument({
        settings: { ...makeDocument().settings, profile: 'p6', ruleOverrides },
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
      if (reversed) {
        backward.ls[a] = toMinutes('2026-01-07T08:00'); // start float 2 d
        backward.lf[a] = forward.ef[a]!; // finish float 0
      } else {
        backward.ls[a] = toMinutes('2026-01-05T08:00'); // start float 0
        backward.lf[a] = toMinutes('2026-01-07T17:00'); // finish float 2 d
      }
      return computeFloatsAndCriticality(doc, graphRes.graph, compiled, rules, forward, backward)
        .activities.a!;
    }
    expect(splitFloatWith({ totalFloatFormula: 'start_float' }).totalFloat).toBe(0);
    expect(splitFloatWith({}).totalFloat).toBe(960);

    // The reversed split (start float 960, finish float 0) tells start_float from the other two.
    expect(splitFloatWith({ totalFloatFormula: 'start_float' }, true).totalFloat).toBe(960);
    expect(splitFloatWith({ totalFloatFormula: 'min_start_finish' }, true).totalFloat).toBe(0);
    expect(splitFloatWith({ totalFloatFormula: 'finish_float' }, true).totalFloat).toBe(0);

    // A formula this version doesn't know (a document from a later version) falls back to finish
    // float, the P6 default.
    const unknown = { totalFloatFormula: 'something_else' as never };
    expect(splitFloatWith(unknown).totalFloat).toBe(960);
    expect(splitFloatWith(unknown, true).totalFloat).toBe(0);
  });

  it('measures start float of an in-progress activity from its remaining early start (P4 D14)', () => {
    // Started 05.01 08:00, 2 d of 4 d left at the status date 07.01 08:00: remaining early start
    // 07.01 08:00, early finish 08.01 17:00. Must finish by 13.01 17:00 sets the late finish, so
    // the late start is 12.01 08:00 (late finish − remaining duration).
    function inProgressWith(ruleOverrides: ProfileRuleOverrides) {
      const doc = makeDocument({
        settings: {
          ...makeDocument().settings,
          profile: 'p6',
          ruleOverrides,
          statusDate: '2026-01-07T08:00',
          mustFinishBy: '2026-01-13T17:00',
        },
        activities: [
          makeActivity({
            id: 'a',
            code: 'A10',
            status: 'in_progress',
            actualStart: '2026-01-05T08:00',
            originalDuration: 1920,
            remainingDuration: 960,
          }),
        ],
      });
      return runFullCpm(doc).activities.a!;
    }

    const startFloat = inProgressWith({ totalFloatFormula: 'start_float' });
    expect(startFloat).toMatchObject({
      earlyStart: '2026-01-05T08:00',
      earlyFinish: '2026-01-08T17:00',
      lateStart: '2026-01-12T08:00',
      lateFinish: '2026-01-13T17:00',
    });
    // 07.01 08:00 → 12.01 08:00 is 3 working days. Measured from the actual start it would be
    // 5 d (2400), the 2 d already worked counted as float.
    expect(startFloat.totalFloat).toBe(1440);
    // Finish float 08.01 17:00 → 13.01 17:00 is the same 3 d.
    expect(inProgressWith({ totalFloatFormula: 'finish_float' }).totalFloat).toBe(1440);
    expect(inProgressWith({ totalFloatFormula: 'min_start_finish' }).totalFloat).toBe(1440);
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

  // Before F3: r1 {3780,false} / {3780,false} / {900,false}; a.isLongestPath false; trace ['b'].
  it.each([
    'elapsedLagOverWeekend',
    'elapsedLagCalendarOverWeekend',
    'elapsedLagThreeDays',
  ] as const)(
    'marks a link driving when its successor sits at the calendar-snapped bound (%s)',
    (key) => {
      const doc = docFromFixture(key);
      const summary = runFullCpm(doc);
      expect(summary.relationships.r1).toEqual({ freeFloat: 0, isDriving: true });
      expect(summary.activities.a).toMatchObject({
        totalFloat: 0,
        freeFloat: 0,
        isLongestPath: true,
      });
      expect(summary.activities.b).toMatchObject({
        earlyStart: '2026-01-12T08:00',
        isLongestPath: true,
      });
      expect(traceDrivingPath(doc, summary, 'b')).toEqual({
        activityIds: ['b', 'a'],
        relationshipIds: ['r1'],
        hops: 1,
      });
    },
  );

  // Before F3: r1 {-480,true}, a.freeFloat -480 in both documents.
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

  // Before F3: byLink r1 {-960,true}; byStatus r1 {0,true}, trace ['b','a'].
  it('measures links into an in-progress activity to its remaining start', () => {
    const byLink = runFullCpm(docFromFixture('inProgressDrivenByLink'));
    expect(byLink.activities.b!.driver).toEqual({
      kind: 'predecessor',
      relationshipId: 'r1',
      predecessorId: 'a',
    });
    expect(byLink.relationships.r1).toEqual({ freeFloat: 0, isDriving: true });

    const statusDoc = docFromFixture('inProgressDrivenByStatusDate');
    const byStatus = runFullCpm(statusDoc);
    expect(byStatus.activities.b!.driver).toEqual({ kind: 'actual' });
    expect(byStatus.relationships.r1).toEqual({ freeFloat: 480, isDriving: false });
    expect(traceDrivingPath(statusDoc, byStatus, 'b')).toEqual({
      activityIds: ['b'],
      relationshipIds: [],
      hops: 0,
    });
  });

  // Before F3: a {isCritical true}; longest_path a.isNearCritical true; chain a {isCritical true, isLongestPath true}.
  it('never marks completed work critical, near-critical or on the longest path (D11)', () => {
    const byFloat = runFullCpm(docFromFixture('completedWork'));
    expect(byFloat.activities.a).toMatchObject({
      totalFloat: 0,
      isCritical: false,
      isNearCritical: false,
      isLongestPath: false,
    });
    expect(byFloat.activities.c).toMatchObject({
      totalFloat: 0,
      isCritical: true,
      isLongestPath: true,
    });

    const byPath = runFullCpm(
      docFromFixture('completedWork', { criticalDefinition: 'longest_path' }),
    );
    expect(byPath.activities.a).toMatchObject({
      isCritical: false,
      isNearCritical: false,
      isLongestPath: false,
    });

    const chainDoc = docFromFixture('completedDrivesLongest');
    const chain = runFullCpm(chainDoc);
    expect(chain.activities.a).toMatchObject({ isCritical: false, isLongestPath: false });
    expect(chain.activities.b).toMatchObject({
      totalFloat: 0,
      isCritical: true,
      isLongestPath: true,
    });
    expect(traceDrivingPath(chainDoc, chain, 'b')).toEqual({
      activityIds: ['b', 'a'],
      relationshipIds: ['r1'],
      hops: 1,
    });
  });

  // Before F3: w1.hasCritical true.
  it('never takes a WBS hasCritical from completed work (D11)', () => {
    const res = solve(docFromFixture('completedWork'), {
      calculatedAt: '2026-01-05T08:00:00.000Z',
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.summary.wbsRollups.w1!.hasCritical).toBe(false);
    expect(res.summary.wbsRollups.w2!.hasCritical).toBe(true);
  });

  // Before F3: b.freeFloat 0 in all three.
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

  // Before F3: a.freeFloat 2400 > totalFloat 1440.
  it('caps free float at the working time to the project finish when only start-side links follow', () => {
    const summary = runFullCpm(docFromFixture('startToStartOnly'));
    expect(summary.relationships.r1).toEqual({ freeFloat: 2400, isDriving: false });
    expect(summary.activities.a).toMatchObject({ totalFloat: 1440, freeFloat: 1440 });
    expect(summary.activities.b!.earlyStart).toBe('2026-01-12T08:00');
  });
});
