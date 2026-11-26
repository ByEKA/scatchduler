import { describe, expect, it } from 'vitest';
import type { ComputedScheduleSummary, ComputedWbsRollup } from '@/data/schedule-types';
import { makeActivity, makeDocument, makeRelationship } from '@/engine/testing';
import { buildVisibleRows } from '@/features/schedule/rows';

describe('buildVisibleRows', () => {
  it('nests WBS hierarchy, hides descendants when collapsed, and switches between as_imported and calculated dates', () => {
    const doc = makeDocument({
      settings: { ...makeDocument().settings, displayMode: 'as_imported' },
      wbs: [
        { id: 'w1', parentId: null, code: '1', name: 'Phase 1', order: 0 },
        { id: 'w2', parentId: 'w1', code: '1.1', name: 'Foundations', order: 0 },
      ],
      activities: [
        makeActivity({
          id: 'a1',
          code: 'A1010',
          name: 'Excavation',
          wbsId: 'w2',
          order: 0,
          sourceDates: {
            planned: { start: '2026-01-05T08:00', finish: '2026-01-09T17:00' },
            early: { start: '2026-01-05T08:00', finish: '2026-01-09T17:00' },
            late: { start: '2026-01-05T08:00', finish: '2026-01-09T17:00' },
            remaining: { start: '2026-01-05T08:00', finish: '2026-01-09T17:00' },
            totalFloat: 0,
            freeFloat: 0,
          },
        }),
        makeActivity({
          id: 'a2',
          code: 'A1020',
          name: 'Concrete',
          wbsId: 'w2',
          order: 1,
          sourceDates: {
            planned: { start: '2026-01-12T08:00', finish: '2026-01-16T17:00' },
            early: { start: '2026-01-12T08:00', finish: '2026-01-16T17:00' },
            late: { start: '2026-01-19T08:00', finish: '2026-01-23T17:00' },
            remaining: { start: '2026-01-12T08:00', finish: '2026-01-16T17:00' },
            totalFloat: 2400,
            freeFloat: 0,
          },
        }),
      ],
      relationships: [
        makeRelationship({ id: 'r1', predecessorId: 'a1', successorId: 'a2', type: 'FS' }),
      ],
    });

    const rollups: Record<string, ComputedWbsRollup> = {
      w1: {
        start: '2026-01-05T08:00',
        finish: '2026-01-16T17:00',
        durationMinutes: 4800,
        percentComplete: 0,
        activityCount: 2,
        hasCritical: true,
      },
      w2: {
        start: '2026-01-05T08:00',
        finish: '2026-01-16T17:00',
        durationMinutes: 4800,
        percentComplete: 0,
        activityCount: 2,
        hasCritical: true,
      },
    };

    const expanded = buildVisibleRows(doc, null, rollups, new Set());
    expect(expanded.map((r) => [r.key, r.depth, r.rowIndex])).toEqual([
      ['wbs:w1', 0, 1],
      ['wbs:w2', 1, 2],
      ['act:a1', 2, 3],
      ['act:a2', 2, 4],
    ]);
    expect(expanded[2]?.start).toBe('2026-01-05T08:00');
    expect(expanded[3]?.predecessorsLabel).toBe('A1010');

    // Collapsing w1 hides w2, a1 and a2
    const collapsed = buildVisibleRows(doc, null, rollups, new Set(['w1']));
    expect(collapsed.map((r) => r.key)).toEqual(['wbs:w1']);
    expect(collapsed[0]?.isCollapsed).toBe(true);

    // Calculated mode reads from summary
    const calcDoc = { ...doc, settings: { ...doc.settings, displayMode: 'calculated' as const } };
    const summary: ComputedScheduleSummary = {
      calculatedAt: '2026-01-05T08:00:00Z',
      durationMs: 1,
      projectStart: '2026-02-02T08:00',
      projectFinish: '2026-02-06T17:00',
      activities: {
        a1: {
          earlyStart: '2026-02-02T08:00',
          earlyFinish: '2026-02-06T17:00',
          lateStart: '2026-02-02T08:00',
          lateFinish: '2026-02-06T17:00',
          totalFloat: 0,
          freeFloat: 0,
          isCritical: true,
          isNearCritical: false,
          isLongestPath: true,
          driver: { kind: 'project_start' },
        },
        a2: {
          earlyStart: '2026-02-09T08:00',
          earlyFinish: '2026-02-13T17:00',
          lateStart: '2026-02-09T08:00',
          lateFinish: '2026-02-13T17:00',
          totalFloat: 480,
          freeFloat: 0,
          isCritical: false,
          isNearCritical: true,
          isLongestPath: false,
          driver: { kind: 'predecessor', relationshipId: 'r1', predecessorId: 'a1' },
        },
      },
      relationships: { r1: { freeFloat: 0, isDriving: true } },
      wbsRollups: rollups,
      warnings: [],
    };
    const calculated = buildVisibleRows(calcDoc, summary, rollups, new Set());
    expect(calculated[2]?.start).toBe('2026-02-02T08:00');
    expect(calculated[2]?.isCritical).toBe(true);
    expect(calculated[3]?.totalFloat).toBe(480);
  });

  it('retains ancestor WBS rows when filterActivityIds is provided', () => {
    const doc = makeDocument({
      wbs: [
        { id: 'w1', parentId: null, code: '1', name: 'Site', order: 0 },
        { id: 'w2', parentId: 'w1', code: '1.1', name: 'Civil', order: 0 },
        { id: 'w3', parentId: null, code: '2', name: 'MEP', order: 1 },
      ],
      activities: [
        makeActivity({ id: 'a1', code: 'A10', wbsId: 'w2' }),
        makeActivity({ id: 'a2', code: 'A20', wbsId: 'w3' }),
      ],
    });

    const filtered = buildVisibleRows(doc, null, {}, new Set(), new Set(['a1']));
    expect(filtered.map((r) => r.key)).toEqual(['wbs:w1', 'wbs:w2', 'act:a1']);
  });

  it('never marks a completed activity critical in As imported mode (D11)', () => {
    const imported = (totalFloat: number) => ({
      planned: { start: '2026-01-05T08:00', finish: '2026-01-09T17:00' },
      early: { start: '2026-01-05T08:00', finish: '2026-01-09T17:00' },
      late: { start: '2026-01-05T08:00', finish: '2026-01-09T17:00' },
      remaining: { start: null, finish: null },
      totalFloat,
      freeFloat: 0,
    });
    const doc = makeDocument({
      settings: {
        ...makeDocument().settings,
        displayMode: 'as_imported',
        criticalThresholdMinutes: 0,
        nearCriticalThresholdMinutes: 4800,
      },
      activities: [
        makeActivity({
          id: 'done',
          code: 'A1000',
          order: 0,
          status: 'completed',
          actualStart: '2026-01-05T08:00',
          actualFinish: '2026-01-09T17:00',
          sourceDates: imported(0),
        }),
        makeActivity({
          id: 'late',
          code: 'A1005',
          order: 1,
          status: 'completed',
          actualStart: '2026-01-05T08:00',
          actualFinish: '2026-01-09T17:00',
          sourceDates: imported(2400),
        }),
        makeActivity({ id: 'open', code: 'A1010', order: 2, sourceDates: imported(0) }),
      ],
    });
    const byKey = new Map(buildVisibleRows(doc, null, {}, new Set()).map((r) => [r.key, r]));
    expect(byKey.get('act:done')).toMatchObject({ isCritical: false, isNearCritical: false });
    expect(byKey.get('act:late')).toMatchObject({ isCritical: false, isNearCritical: false });
    expect(byKey.get('act:open')).toMatchObject({ isCritical: true, isNearCritical: false });
  });
});
