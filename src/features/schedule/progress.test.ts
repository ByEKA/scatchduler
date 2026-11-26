// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { ScheduleDocument, SourceDateRecord, WallClock } from '@/data/schedule-types';
import { solve } from '@/engine';
import { makeActivity, makeDocument, makeRelationship } from '@/engine/testing';
import {
  applyCommand,
  emptyHistory,
  record,
  undo,
  type ScheduleCommand,
} from '@/features/schedule/commands';
import { activityDisplayDates, progressChanges } from '@/features/schedule/progress';

const CALCULATED_AT = '2026-01-01T00:00:00.000Z';
const B_DATES = { start: '2026-01-12T08:00', finish: '2026-01-16T17:00' };

/** A→B→C (5 d each, FS), calculated with the given status date; Calculated mode. */
function chainDocument(statusDate: WallClock | null): ScheduleDocument {
  const base = makeDocument({
    activities: [
      makeActivity({ id: 'a', code: 'A', originalDuration: 2400 }),
      makeActivity({ id: 'b', code: 'B', originalDuration: 2400 }),
      makeActivity({ id: 'c', code: 'C', originalDuration: 2400 }),
    ],
    relationships: [
      makeRelationship({ id: 'r1', predecessorId: 'a', successorId: 'b' }),
      makeRelationship({ id: 'r2', predecessorId: 'b', successorId: 'c' }),
    ],
  });
  const doc = { ...base, settings: { ...base.settings, statusDate } };
  const solved = solve(doc, { calculatedAt: CALCULATED_AT });
  if (!solved.ok) throw new Error(solved.error.message);
  return { ...doc, computed: solved.summary };
}

function sourceDates(
  early: { start: WallClock | null; finish: WallClock | null },
  planned: { start: WallClock | null; finish: WallClock | null },
): SourceDateRecord {
  return {
    planned,
    early,
    late: { start: null, finish: null },
    remaining: { start: null, finish: null },
    totalFloat: null,
    freeFloat: null,
  };
}

describe('progressChanges (P4 core D13)', () => {
  const b = makeActivity({ id: 'b', code: 'B', originalDuration: 2400 });

  it('leaving 0 % sets in progress and the actual start to the calculated early start', () => {
    expect(progressChanges(b, 50, B_DATES, '2026-01-14T08:00')).toEqual({
      status: 'in_progress',
      actualStart: '2026-01-12T08:00',
      actualFinish: null,
      remainingDuration: 1200,
      percent: { duration: 50, physical: 50, type: 'duration' },
    });
  });

  it('100 % also sets the actual finish to the calculated early finish, capped at the status date', () => {
    expect(progressChanges(b, 100, B_DATES, '2026-01-14T08:00')).toEqual({
      status: 'completed',
      actualStart: '2026-01-12T08:00',
      actualFinish: '2026-01-14T08:00',
      remainingDuration: 0,
      percent: { duration: 100, physical: 100, type: 'duration' },
    });
    expect(progressChanges(b, 100, B_DATES, '2026-01-19T08:00')).toMatchObject({
      actualStart: '2026-01-12T08:00',
      actualFinish: '2026-01-16T17:00',
    });
    expect(progressChanges(b, 100, B_DATES, null)).toMatchObject({
      actualStart: '2026-01-12T08:00',
      actualFinish: '2026-01-16T17:00',
    });
  });

  it('never sets an actual date after the status date', () => {
    expect(progressChanges(b, 50, B_DATES, '2026-01-05T08:00')).toMatchObject({
      status: 'in_progress',
      actualStart: '2026-01-05T08:00',
      actualFinish: null,
    });
    expect(progressChanges(b, 100, B_DATES, '2026-01-05T08:00')).toMatchObject({
      status: 'completed',
      actualStart: '2026-01-05T08:00',
      actualFinish: '2026-01-05T08:00',
    });
  });

  it('keeps existing actual dates and never finishes before the actual start', () => {
    const dates = { start: '2026-01-05T08:00', finish: '2026-01-09T17:00' };
    const started = makeActivity({
      id: 'k',
      code: 'K',
      originalDuration: 2400,
      status: 'in_progress',
      actualStart: '2026-01-06T08:00',
    });
    expect(progressChanges(started, 100, dates, '2026-01-14T08:00')).toMatchObject({
      actualStart: '2026-01-06T08:00',
      actualFinish: '2026-01-09T17:00',
    });
    const finished = makeActivity({
      id: 'k',
      code: 'K',
      originalDuration: 2400,
      status: 'completed',
      actualStart: '2026-01-06T08:00',
      actualFinish: '2026-01-08T17:00',
    });
    expect(progressChanges(finished, 100, dates, '2026-01-14T08:00')).toMatchObject({
      actualStart: '2026-01-06T08:00',
      actualFinish: '2026-01-08T17:00',
    });
    const lateStart = makeActivity({
      id: 'k',
      code: 'K',
      originalDuration: 2400,
      status: 'in_progress',
      actualStart: '2026-01-13T08:00',
    });
    expect(progressChanges(lateStart, 100, dates, '2026-01-14T08:00')).toMatchObject({
      actualStart: '2026-01-13T08:00',
      actualFinish: '2026-01-13T08:00',
    });
  });

  it('back to 0 % clears both actual dates and below 100 % clears the actual finish', () => {
    const done = makeActivity({
      id: 'b',
      code: 'B',
      originalDuration: 2400,
      status: 'completed',
      actualStart: '2026-01-12T08:00',
      actualFinish: '2026-01-16T17:00',
      percent: { duration: 100, physical: 100, type: 'duration' },
    });
    expect(progressChanges(done, 0, B_DATES, '2026-01-19T08:00')).toEqual({
      status: 'not_started',
      actualStart: null,
      actualFinish: null,
      remainingDuration: 2400,
      percent: { duration: 0, physical: 0, type: 'duration' },
    });
    expect(progressChanges(done, 60, B_DATES, '2026-01-19T08:00')).toEqual({
      status: 'in_progress',
      actualStart: '2026-01-12T08:00',
      actualFinish: null,
      remainingDuration: 960,
      percent: { duration: 60, physical: 60, type: 'duration' },
    });
  });

  it('keeps the % type and rounds to one decimal', () => {
    const physical = makeActivity({
      id: 'p',
      code: 'P',
      originalDuration: 2400,
      percent: { duration: null, physical: null, type: 'physical' },
    });
    expect(progressChanges(physical, 33.36, B_DATES, null)).toEqual({
      status: 'in_progress',
      actualStart: '2026-01-12T08:00',
      actualFinish: null,
      remainingDuration: 1598,
      percent: { duration: 33.4, physical: 33.4, type: 'physical' },
    });
  });

  it('leaves the actual dates empty when there are no dates to default from', () => {
    expect(progressChanges(b, 100, { start: null, finish: null }, '2026-01-14T08:00')).toEqual({
      status: 'completed',
      actualStart: null,
      actualFinish: null,
      remainingDuration: 0,
      percent: { duration: 100, physical: 100, type: 'duration' },
    });
  });
});

describe('activityDisplayDates', () => {
  it('uses the calculated early dates in Calculated mode and the imported dates otherwise', () => {
    const imported = makeActivity({
      id: 'i',
      code: 'I',
      originalDuration: 2400,
      sourceDates: sourceDates(
        { start: '2026-02-03T08:00', finish: '2026-02-09T17:00' },
        { start: '2026-02-02T08:00', finish: '2026-02-06T17:00' },
      ),
    });
    const plannedOnly = makeActivity({
      id: 'j',
      code: 'J',
      originalDuration: 2400,
      sourceDates: sourceDates(
        { start: null, finish: null },
        { start: '2026-02-02T08:00', finish: '2026-02-06T17:00' },
      ),
    });
    const fresh = makeActivity({ id: 'n', code: 'N', originalDuration: 2400 });
    const base = makeDocument({ activities: [imported, plannedOnly, fresh] });
    const solved = solve(base, { calculatedAt: CALCULATED_AT });
    if (!solved.ok) throw new Error(solved.error.message);
    const calculated: ScheduleDocument = { ...base, computed: solved.summary };

    expect(activityDisplayDates(calculated, imported)).toEqual({
      start: '2026-01-05T08:00',
      finish: '2026-01-09T17:00',
    });
    expect(
      activityDisplayDates(
        { ...calculated, settings: { ...calculated.settings, displayMode: 'as_imported' } },
        imported,
      ),
    ).toEqual({ start: '2026-02-03T08:00', finish: '2026-02-09T17:00' });
    // Calculated mode, never calculated: imported early dates, then planned, then nothing
    expect(activityDisplayDates(base, imported)).toEqual({
      start: '2026-02-03T08:00',
      finish: '2026-02-09T17:00',
    });
    expect(activityDisplayDates(base, plannedOnly)).toEqual({
      start: '2026-02-02T08:00',
      finish: '2026-02-06T17:00',
    });
    expect(activityDisplayDates(base, fresh)).toEqual({ start: null, finish: null });
  });
});

describe('setPercentComplete command', () => {
  it('applies the helper to the calculated dates, marks the schedule stale and undoes in one step', () => {
    const calculated = chainDocument(null);
    // Status date moved to 14.01.2026 after the calculation (no recalculation yet)
    const doc: ScheduleDocument = {
      ...calculated,
      settings: { ...calculated.settings, statusDate: '2026-01-14T08:00' },
    };
    const command: ScheduleCommand = {
      type: 'setPercentComplete',
      activityId: 'b',
      percentComplete: 100,
    };
    const res = applyCommand(doc, command);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.stale).toBe(true);
    expect(res.selectId).toBe('b');
    expect(res.forward).toHaveLength(1);
    expect(res.document.activities[1]).toMatchObject({
      status: 'completed',
      actualStart: '2026-01-12T08:00',
      actualFinish: '2026-01-14T08:00',
      remainingDuration: 0,
      percent: { duration: 100, physical: 100, type: 'duration' },
    });
    const undone = undo(
      res.document,
      record(emptyHistory(), { command, forward: res.forward, inverse: res.inverse }),
    )!;
    expect(undone.document.activities[1]).toEqual(doc.activities[1]);
  });

  it('typing 100 in B of A→B→C keeps B in place without MISSING_ACTUAL_DATE', () => {
    const doc = chainDocument(null);
    const res = applyCommand(doc, {
      type: 'setPercentComplete',
      activityId: 'b',
      percentComplete: 100,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.document.activities[1]).toMatchObject({
      status: 'completed',
      actualStart: '2026-01-12T08:00',
      actualFinish: '2026-01-16T17:00',
    });

    const solved = solve(res.document, { calculatedAt: CALCULATED_AT });
    expect(solved.ok).toBe(true);
    if (!solved.ok) return;
    expect(solved.summary.activities['a']).toMatchObject({
      earlyStart: '2026-01-05T08:00',
      earlyFinish: '2026-01-09T17:00',
    });
    expect(solved.summary.activities['b']).toMatchObject({
      earlyStart: '2026-01-12T08:00',
      earlyFinish: '2026-01-16T17:00',
    });
    expect(solved.summary.activities['c']).toMatchObject({
      earlyStart: '2026-01-19T08:00',
      earlyFinish: '2026-01-23T17:00',
    });
    expect(solved.summary.projectFinish).toBe('2026-01-23T17:00');
    // B is done while its FS predecessor A is not: a real out-of-sequence warning, no missing actuals
    expect(solved.summary.warnings.map((w) => w.code)).toEqual(['OUT_OF_SEQUENCE']);

    // In sequence (A then B to 100 %): same dates and no warnings
    const aDone = applyCommand(doc, {
      type: 'setPercentComplete',
      activityId: 'a',
      percentComplete: 100,
    });
    if (!aDone.ok) throw new Error(aDone.error);
    const bothDone = applyCommand(aDone.document, {
      type: 'setPercentComplete',
      activityId: 'b',
      percentComplete: 100,
    });
    if (!bothDone.ok) throw new Error(bothDone.error);
    const solvedInSequence = solve(bothDone.document, { calculatedAt: CALCULATED_AT });
    if (!solvedInSequence.ok) throw new Error(solvedInSequence.error.message);
    expect(solvedInSequence.summary.activities['b']).toMatchObject({
      earlyStart: '2026-01-12T08:00',
      earlyFinish: '2026-01-16T17:00',
    });
    expect(solvedInSequence.summary.projectFinish).toBe('2026-01-23T17:00');
    expect(solvedInSequence.summary.warnings).toEqual([]);
  });
});
