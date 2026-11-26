// @vitest-environment node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type {
  ComputedScheduleSummary,
  ScheduleActivity,
  ScheduleDocument,
  ScheduleRelationship,
  ScheduleSettings,
} from '@/data/schedule-types';
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
import { toWallClock } from '@/engine/time';

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
    const p6 = runFullCpm(docFromFixture('splitFloat', { profile: 'p6' }));
    const msp = runFullCpm(docFromFixture('splitFloat', { profile: 'msp' }));
    expect(p6.activities.a!.totalFloat).toBe(960);
    expect(msp.activities.a!.totalFloat).toBe(0);
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
