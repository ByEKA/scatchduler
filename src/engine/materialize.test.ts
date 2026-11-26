// @vitest-environment node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
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
