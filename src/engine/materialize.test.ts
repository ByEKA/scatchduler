// @vitest-environment node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ScheduleDocument } from '@/data/schedule-types';
import { solve } from '@/engine';
import { createBlankDocument, fromImportModel, type ImportModel } from '@/engine/materialize';

const loadModel = (name: string) =>
  JSON.parse(
    readFileSync(join(process.cwd(), 'src/import/__fixtures__', name), 'utf8'),
  ) as ImportModel;

describe('materialize', () => {
  it('materializes XER models with P6 profile, progress mode, lag calendar and verbatim sourceDates', () => {
    const docA = fromImportModel(loadModel('two-projects.NTH-A.model.json'), {
      scheduleStatusDate: '2026-10-15',
    });
    expect(docA.settings).toMatchObject({
      profile: 'p6',
      progressMode: 'retained_logic',
      lagCalendar: 'successor',
      displayMode: 'as_imported',
      statusDate: '2026-10-15T08:00',
      projectStart: '2026-09-01T08:00',
      mustFinishBy: '2026-12-31T00:00',
      defaultCalendarId: 'cal:1',
    });
    expect(docA.activities).toHaveLength(6);
    expect(docA.relationships).toHaveLength(5);
    expect(docA.activities[0]!.id).toBe('act:00000');
    expect(docA.activities[0]!.sourceDates?.early.start).toBe('2026-09-01T08:00');
    expect(docA.computed).toBeNull();
    // Deterministic across repeated calls
    expect(
      fromImportModel(loadModel('two-projects.NTH-A.model.json'), {
        scheduleStatusDate: '2026-10-15',
      }),
    ).toEqual(docA);

    const legacy = fromImportModel(loadModel('legacy-p6.model.json'), {
      scheduleStatusDate: '2026-03-20',
    });
    expect(legacy.settings).toMatchObject({
      profile: 'p6',
      progressMode: 'progress_override',
      lagCalendar: 'predecessor',
      displayMode: 'as_imported',
      statusDate: '2026-03-20T00:00',
    });
  });

  it('materializes MSPDI and CSV models with their profiles and preserves matching status time', () => {
    const msp = fromImportModel(loadModel('project.model.json'), {
      scheduleStatusDate: '2026-03-20',
    });
    expect(msp.settings).toMatchObject({
      profile: 'msp',
      lagCalendar: 'successor',
      displayMode: 'as_imported',
      statusDate: '2026-03-20T17:00',
    });
    expect(msp.activities).toHaveLength(6);

    const mspOverridden = fromImportModel(loadModel('project.model.json'), {
      scheduleStatusDate: '2026-04-01',
    });
    expect(mspOverridden.settings.statusDate).toBe('2026-04-01T08:00');

    const csv = fromImportModel(loadModel('utf8.model.json'), { scheduleStatusDate: null });
    expect(csv.settings).toMatchObject({
      profile: 'default',
      lagCalendar: 'predecessor',
      displayMode: 'as_imported',
      statusDate: null,
    });
    expect(csv.activities).toHaveLength(5);
  });

  it('handles fallback calendars, missing calendar refs, unresolved links and dateless tables', () => {
    const csvModel = loadModel('utf8.model.json');
    const dateless: ImportModel = {
      ...csvModel,
      calendars: [],
      activities: csvModel.activities.map((a) => ({
        ...a,
        calendarId: 'missing-cal',
        planned: { start: null, finish: null },
        early: { start: null, finish: null },
      })),
      relationships: [
        {
          predecessorCode: 'm1',
          successorCode: 'a1',
          type: 'FS',
          lagMinutes: 0,
          lagElapsed: false,
        },
        {
          predecessorCode: 'UNKNOWN',
          successorCode: 'A1',
          type: 'FS',
          lagMinutes: 0,
          lagElapsed: false,
        },
      ],
    };

    const doc = fromImportModel(dateless, { scheduleStatusDate: '2026-03-02' });
    expect(doc.settings.displayMode).toBe('calculated');
    expect(doc.settings.defaultCalendarId).toBe('cal:default');
    expect(doc.calendars).toHaveLength(1);
    expect(doc.calendars[0]!.id).toBe('cal:default');
    expect(doc.activities.every((a) => a.calendarId === 'cal:default')).toBe(true);
    expect(doc.relationships).toHaveLength(1);
    expect(doc.relationships[0]).toMatchObject({
      id: 'rel:00000',
      predecessorId: 'act:00000',
      successorId: 'act:00001',
    });
  });

  it('creates a blank calculated document with a standard 8h calendar', () => {
    const blank = createBlankDocument('2026-01-05');
    expect(blank.schemaVersion).toBe(1);
    expect(blank.sourceFormat).toBeNull();
    expect(blank.settings).toMatchObject({
      profile: 'default',
      displayMode: 'calculated',
      statusDate: '2026-01-05T08:00',
      projectStart: '2026-01-05T08:00',
      defaultCalendarId: 'cal:standard',
    });
    expect(blank.calendars).toHaveLength(1);
    expect(blank.calendars[0]!.hoursPerDay).toBe(8);
    expect(blank.activities).toEqual([]);
    expect(blank.relationships).toEqual([]);
    expect(blank.computed).toBeNull();

    const undated = createBlankDocument(null);
    expect(undated.settings.statusDate).toBeNull();
    expect(undated.settings.projectStart).toBeNull();
  });
});

describe('XER scheduling options (P4 D14)', () => {
  const BASE = [
    { key: 'progress_mode', value: 'progress_override' },
    { key: 'sched_calendar_on_relationship_lag', value: 'rcal_Predecessor' },
  ];
  /** legacy-p6 with its settings replaced (and an optional patch), materialized at status 2026-03-20. */
  function legacyDoc(
    extra: Array<{ key: string; value: string }>,
    patch?: (m: ImportModel) => void,
  ) {
    const model = loadModel('legacy-p6.model.json');
    model.settings = [...BASE, ...extra];
    patch?.(model);
    return fromImportModel(model, { scheduleStatusDate: '2026-03-20' });
  }
  function solved(doc: ScheduleDocument) {
    const res = solve(doc, { calculatedAt: '2026-01-05T08:00:00.000Z' });
    if (!res.ok) throw new Error(res.error.message);
    return res.summary.activities;
  }

  it("maps the file's total float type, critical path type and threshold (D14)", () => {
    const finishFloat = legacyDoc([
      { key: 'sched_float_type', value: 'FT_FF' },
      { key: 'critical_path_type', value: 'CT_DrivPath' },
      { key: 'critical_drtn_hr_cnt', value: '40' },
    ]).settings;
    expect(finishFloat.ruleOverrides).toEqual({ totalFloatFormula: 'finish_float' });
    expect(finishFloat.criticalDefinition).toBe('longest_path');
    expect(finishFloat.criticalThresholdMinutes).toBe(2400);
    expect(finishFloat.sourceNotes).toBeUndefined();

    const startFloat = legacyDoc([{ key: 'sched_float_type', value: 'FT_SS' }]).settings;
    expect(startFloat.ruleOverrides).toEqual({ totalFloatFormula: 'start_float' });
    expect(startFloat.sourceNotes).toBeUndefined();

    const unknown = legacyDoc([
      { key: 'sched_float_type', value: 'FT_XX' },
      { key: 'critical_path_type', value: 'CT_TotFloat' },
      { key: 'critical_drtn_hr_cnt', value: '1.5' },
    ]).settings;
    expect(unknown.ruleOverrides).toEqual({});
    expect(unknown.criticalDefinition).toBe('total_float');
    expect(unknown.criticalThresholdMinutes).toBe(90);
    expect(unknown.sourceNotes).toBeUndefined();

    const threshold = (value: string) =>
      legacyDoc([{ key: 'critical_drtn_hr_cnt', value }]).settings.criticalThresholdMinutes;
    expect(threshold('0,5')).toBe(30);
    expect(threshold('-8')).toBe(-480);
    expect(threshold('abc')).toBe(0);
    expect(threshold('')).toBe(0);

    const none = legacyDoc([]).settings;
    expect(none.ruleOverrides).toEqual({});
    expect(none.criticalDefinition).toBe('total_float');
    expect(none.criticalThresholdMinutes).toBe(0);
    expect(none.sourceNotes).toBeUndefined();
  });

  it('notes the P6 options the engine cannot calculate and keeps the profile rules (D14)', () => {
    const model = loadModel('legacy-p6.model.json');
    model.settings = [
      { key: 'progress_mode', value: 'actual_dates' },
      { key: 'sched_calendar_on_relationship_lag', value: 'rcal_Predecessor' },
      { key: 'sched_float_type', value: 'FT_SS' },
      { key: 'sched_open_critical_flag', value: 'Y' },
      { key: 'sched_lag_early_start_flag', value: 'Y' },
      { key: 'sched_use_expect_end_flag', value: 'Y' },
    ];
    const noted = fromImportModel(model, { scheduleStatusDate: '2026-03-20' }).settings;
    expect(noted.progressMode).toBe('retained_logic');
    expect(noted.ruleOverrides).toEqual({ totalFloatFormula: 'start_float' });
    // The SS lag and expected-finish flags are recorded only.
    expect(noted.sourceNotes).toEqual(['p6_actual_dates', 'p6_open_ends_critical']);

    // What the sample files say.
    expect(
      legacyDoc([
        { key: 'sched_open_critical_flag', value: 'N' },
        { key: 'sched_lag_early_start_flag', value: 'Y' },
        { key: 'sched_use_expect_end_flag', value: 'Y' },
      ]).settings.sourceNotes,
    ).toBeUndefined();
    expect(
      legacyDoc([
        { key: 'sched_open_critical_flag', value: 'N' },
        { key: 'sched_lag_early_start_flag', value: 'N' },
        { key: 'sched_use_expect_end_flag', value: 'Y' },
      ]).settings.sourceNotes,
    ).toBeUndefined();

    // The regenerated golden.
    const golden = fromImportModel(loadModel('legacy-p6.model.json'), {
      scheduleStatusDate: '2026-03-20',
    }).settings;
    expect(golden.ruleOverrides).toEqual({});
    expect(golden.sourceNotes).toBeUndefined();
  });

  it("calculates with the file's options (D14)", () => {
    // Threshold.
    const threshold40 = solved(legacyDoc([{ key: 'critical_drtn_hr_cnt', value: '40' }]));
    expect(threshold40['act:00003']).toMatchObject({ totalFloat: 480, isCritical: true });
    expect(threshold40['act:00001']).toMatchObject({ totalFloat: 960, isCritical: true });
    const threshold0 = solved(legacyDoc([]));
    expect(threshold0['act:00003']).toMatchObject({ totalFloat: 480, isCritical: false });
    expect(threshold0['act:00001']).toMatchObject({ totalFloat: 960, isCritical: false });

    // Longest path, with a later must finish by.
    const patch = (m: ImportModel) => {
      m.project.mustFinishBy = '2026-03-27T17:00';
    };
    expect(
      solved(legacyDoc([{ key: 'critical_path_type', value: 'CT_DrivPath' }], patch))['act:00002'],
    ).toMatchObject({ totalFloat: 1440, isLongestPath: true, isCritical: true });
    expect(
      solved(legacyDoc([{ key: 'critical_path_type', value: 'CT_TotFloat' }], patch))['act:00002'],
    ).toMatchObject({ totalFloat: 1440, isLongestPath: true, isCritical: false });

    // Open ends, a substitution: P6 would make act:00003 critical; the note says so.
    expect(
      solved(legacyDoc([{ key: 'sched_open_critical_flag', value: 'Y' }]))['act:00003'],
    ).toMatchObject({ totalFloat: 480, isCritical: false });

    // Start float of the in-progress act:00001 runs from its remaining early start, so it equals
    // its finish float. Measured from the actual start (03-04) it would be 7680.
    expect(
      solved(legacyDoc([{ key: 'sched_float_type', value: 'FT_SS' }]))['act:00001'],
    ).toMatchObject({
      earlyStart: '2026-03-04T08:00',
      lateStart: '2026-03-23T08:00',
      lateFinish: '2026-03-24T17:00',
      totalFloat: 960,
      isCritical: false,
    });
  });
});
