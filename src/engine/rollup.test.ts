// @vitest-environment node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type {
  ComputedScheduleSummary,
  ScheduleActivity,
  ScheduleWbsNode,
} from '@/data/schedule-types';
import { rollup } from '@/engine/rollup';
import { makeActivity, makeDocument } from '@/engine/testing';

const fixture = JSON.parse(
  readFileSync(join(process.cwd(), 'src/engine/__fixtures__/rollup.json'), 'utf8'),
) as {
  wbs: ScheduleWbsNode[];
  activities: Array<Partial<ScheduleActivity> & { id: string; code: string }>;
};

describe('WBS rollup', () => {
  it('rolls up nested WBS nodes in as_imported mode using verbatim sourceDates without mutating document', () => {
    const doc = makeDocument({
      settings: { ...makeDocument().settings, displayMode: 'as_imported' },
      wbs: fixture.wbs,
      activities: fixture.activities.map((a) => makeActivity(a)),
    });
    const before = structuredClone(doc);

    const result = rollup(doc, null);
    expect(doc).toEqual(before);
    expect(result.sub1).toEqual({
      start: '2026-01-05T08:00',
      finish: '2026-01-09T17:00',
      durationMinutes: 2400,
      percentComplete: 40,
      activityCount: 2,
      hasCritical: true,
    });
    expect(result.sub2).toEqual({
      start: null,
      finish: null,
      durationMinutes: 0,
      percentComplete: null,
      activityCount: 0,
      hasCritical: false,
    });
    expect(result.root).toEqual(result.sub1);
  });

  it('uses summary.activities dates and criticality when in calculated mode', () => {
    const doc = makeDocument({
      settings: { ...makeDocument().settings, displayMode: 'calculated' },
      wbs: fixture.wbs,
      activities: fixture.activities.map((a) => makeActivity(a)),
    });
    const summary: ComputedScheduleSummary = {
      calculatedAt: '2026-01-05T08:00:00.000Z',
      durationMs: 1,
      projectStart: '2026-01-05T08:00',
      projectFinish: '2026-01-13T17:00',
      activities: {
        a: {
          earlyStart: '2026-01-05T08:00',
          earlyFinish: '2026-01-06T17:00',
          lateStart: '2026-01-05T08:00',
          lateFinish: '2026-01-06T17:00',
          totalFloat: 0,
          freeFloat: 0,
          isCritical: false,
          isNearCritical: false,
          isLongestPath: false,
          driver: { kind: 'actual' },
        },
        b: {
          earlyStart: '2026-01-09T08:00',
          earlyFinish: '2026-01-13T17:00',
          lateStart: '2026-01-09T08:00',
          lateFinish: '2026-01-13T17:00',
          totalFloat: 0,
          freeFloat: 0,
          isCritical: false,
          isNearCritical: false,
          isLongestPath: false,
          driver: { kind: 'project_start' },
        },
      },
      relationships: {},
      wbsRollups: {},
      warnings: [],
    };

    const result = rollup(doc, summary);
    expect(result.sub1).toEqual({
      start: '2026-01-05T08:00',
      finish: '2026-01-13T17:00',
      durationMinutes: 3360,
      percentComplete: 40,
      activityCount: 2,
      hasCritical: false,
    });
    expect(result.root).toEqual(result.sub1);
  });

  // Before F3: hasCritical true.
  it('never sets hasCritical from completed work in as_imported mode (D11)', () => {
    const doc = makeDocument({
      settings: { ...makeDocument().settings, displayMode: 'as_imported' },
      wbs: fixture.wbs,
      activities: [makeActivity(fixture.activities[0]!)],
    });
    const result = rollup(doc, null);
    expect(result.sub1).toEqual({
      start: '2026-01-05T08:00',
      finish: '2026-01-06T17:00',
      durationMinutes: 960,
      percentComplete: 100,
      activityCount: 1,
      hasCritical: false,
    });
    expect(result.root!.hasCritical).toBe(false);
  });

  // Before F3: hasCritical true.
  it('never sets hasCritical from completed work in calculated mode, even from a stale summary (D11)', () => {
    // A stale summary from before D11: the completed activity a is still flagged critical.
    const doc = makeDocument({
      settings: { ...makeDocument().settings, displayMode: 'calculated' },
      wbs: fixture.wbs,
      activities: fixture.activities.map((a) => makeActivity(a)),
    });
    const summary: ComputedScheduleSummary = {
      calculatedAt: '2026-01-05T08:00:00.000Z',
      durationMs: 1,
      projectStart: '2026-01-05T08:00',
      projectFinish: '2026-01-13T17:00',
      activities: {
        a: {
          earlyStart: '2026-01-05T08:00',
          earlyFinish: '2026-01-06T17:00',
          lateStart: '2026-01-05T08:00',
          lateFinish: '2026-01-06T17:00',
          totalFloat: 0,
          freeFloat: 0,
          isCritical: true,
          isNearCritical: false,
          isLongestPath: false,
          driver: { kind: 'actual' },
        },
        b: {
          earlyStart: '2026-01-09T08:00',
          earlyFinish: '2026-01-13T17:00',
          lateStart: '2026-01-09T08:00',
          lateFinish: '2026-01-13T17:00',
          totalFloat: 0,
          freeFloat: 0,
          isCritical: false,
          isNearCritical: false,
          isLongestPath: false,
          driver: { kind: 'project_start' },
        },
      },
      relationships: {},
      wbsRollups: {},
      warnings: [],
    };
    const result = rollup(doc, summary);
    expect(result.sub1).toMatchObject({
      activityCount: 2,
      percentComplete: 40,
      hasCritical: false,
    });
    expect(result.root!.hasCritical).toBe(false);
  });
});
