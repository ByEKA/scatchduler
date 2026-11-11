import { describe, expect, it } from 'vitest';
import msp from '@/import/__fixtures__/msp-table.csv?bytes';
import turkish from '@/import/__fixtures__/turkish-1254.csv?bytes';
import utf8 from '@/import/__fixtures__/utf8.csv?bytes';
import { decodeText, detectEncoding } from '@/import/encoding';
import { csvSource, guessDelimiter } from '@/import/table/csv';
import { defaultTableMapping, previewTable, readTable } from '@/import/table/normalize';

function load(bytes: Uint8Array) {
  const encoding = detectEncoding(bytes);
  const text = decodeText(bytes, encoding.name, encoding.bomLength);
  const delimiter = guessDelimiter(text);
  const source = csvSource(text, delimiter);
  const mapping = defaultTableMapping(source, { delimiter });
  const meta = {
    format: 'csv' as const,
    encoding: { name: encoding.name, detectedBy: encoding.detectedBy },
  };
  return { source, mapping, read: () => readTable(source, mapping, meta), meta };
}
const codes = (issues: { code: string }[]) => issues.map((i) => i.code).sort();

describe('readTable', () => {
  it('reads the Windows-1254 CSV with decimal commas, Turkish headers and calendar names', () => {
    const { mapping, read } = load(turkish);
    expect(mapping).toMatchObject({
      delimiter: ';',
      decimalSeparator: ',',
      dateFormat: 'DD.MM.YYYY',
      headerRow: 1,
      predecessorRef: 'code',
    });
    const result = read();
    expect(result.counts).toEqual([
      { entity: 'calendar', read: 0, accepted: 0, adjusted: 0, skipped: 0 },
      { entity: 'wbs', read: 0, accepted: 0, adjusted: 0, skipped: 0 },
      { entity: 'activity', read: 5, accepted: 4, adjusted: 1, skipped: 1 },
      { entity: 'relationship', read: 3, accepted: 3, adjusted: 0, skipped: 0 },
    ]);
    expect(codes(result.issues)).toEqual([
      'CALENDAR_GENERATED_FROM_NAME',
      'CALENDAR_GENERATED_STANDARD',
      'TABLE_BAD_NUMBER',
      'TABLE_MISSING_CODE',
    ]);
    expect(
      result.model.activities.map((a) => [
        a.code,
        a.name,
        a.originalDuration,
        a.calendarId,
        a.percent.duration,
      ]),
    ).toEqual([
      ['T100', 'Şantiye kurulumu', 1200, 'gen:name:gunduz', 100],
      ['T110', 'Kazı işleri', 2400, 'gen:name:gunduz', 40],
      ['T120', 'Temel betonu', 1440, 'gen:standard', 0],
      ['T130', 'İskele', null, 'gen:standard', null],
    ]);
    expect(result.model.activities[0]!.planned).toEqual({
      start: '2026-03-02T08:00',
      finish: '2026-03-04T17:00',
    });
    expect(result.model.relationships[1]).toEqual({
      predecessorCode: 'T110',
      successorCode: 'T120',
      type: 'SS',
      lagMinutes: 480,
      lagElapsed: false,
    });
    expect(result.model.calendars.map((c) => c.id)).toEqual(['gen:standard', 'gen:name:gunduz']);
  });

  it('reads the UTF-8 CSV with WBS paths, types, constraints and repeated links', () => {
    const result = load(utf8).read();
    expect(result.counts.slice(1)).toEqual([
      { entity: 'wbs', read: 3, accepted: 3, adjusted: 0, skipped: 0 },
      { entity: 'activity', read: 5, accepted: 5, adjusted: 1, skipped: 0 },
      { entity: 'relationship', read: 6, accepted: 4, adjusted: 0, skipped: 2 },
    ]);
    expect(codes(result.issues)).toEqual([
      'CALENDAR_GENERATED_STANDARD',
      'CONSTRAINT_UNSUPPORTED',
      'LINK_DUPLICATE',
      'LINK_SELF',
    ]);
    expect(
      result.model.activities.map((a) => [a.code, a.type, a.constraint?.type ?? null, a.wbsId]),
    ).toEqual([
      ['M1', 'start_milestone', null, '1'],
      ['A1', 'task', 'start_on_or_after', '1.1'],
      ['A2', 'task', 'finish_on_or_before', '1.2'],
      ['A3', 'task', null, '1.2'],
      ['M2', 'finish_milestone', null, '1'],
    ]);
    expect(result.model.wbs.map((w) => [w.id, w.code, w.name, w.parentId])).toEqual([
      ['1', '1', '1', null],
      ['1.1', '1.1', '1', '1'],
      ['1.2', '1.2', '2', '1'],
    ]);
  });

  it('reads the Microsoft Project–style table with Task IDs, unit durations and weekday dates', () => {
    const { mapping, read } = load(msp);
    expect(mapping).toMatchObject({
      delimiter: ',',
      dateFormat: 'MM/DD/YYYY',
      predecessorRef: 'taskId',
    });
    expect(mapping.columns.taskId).toEqual({ index: 0, header: 'ID' });
    const result = read();
    expect(result.model.activities.map((a) => [a.code, a.originalDuration, a.calendarId])).toEqual([
      ['101', 480, 'gen:standard'],
      ['102', 2400, 'gen:standard'],
      ['103', 4800, 'gen:standard'],
      ['104', 4320, 'gen:24h'],
      ['105', 240, 'gen:standard'],
    ]);
    expect(result.model.activities[0]!.planned).toEqual({
      start: '2026-03-02T08:00',
      finish: '2026-03-02T17:00',
    });
    expect(
      result.model.relationships.map((r) => [
        r.predecessorCode,
        r.successorCode,
        r.type,
        r.lagMinutes,
      ]),
    ).toEqual([
      ['101', '102', 'FS', 0],
      ['102', '103', 'FS', 960],
      ['103', '104', 'FS', 0],
      ['104', '105', 'SS', -1080],
    ]);
    expect(codes(result.issues)).toEqual([
      'CALENDAR_GENERATED_ELAPSED',
      'CALENDAR_GENERATED_STANDARD',
      'ELAPSED_DURATION',
      'PERCENT_LAG',
      'TABLE_ESTIMATED_DURATION',
    ]);
    expect(result.issues.find((i) => i.code === 'PERCENT_LAG')!.message).toBe(
      'The lag on 104 → 105 is a percentage. It was converted to -18 h.',
    );
  });

  it('skips rows with problems when asked', () => {
    const { source, mapping, meta } = load(turkish);
    const result = readTable(source, { ...mapping, skipRowsWithIssues: true }, meta);
    expect(result.model.activities.map((a) => a.code)).toEqual(['T100', 'T110', 'T120']);
    expect(result.issues.find((i) => i.code === 'TABLE_ROW_SKIPPED')).toMatchObject({
      message: "This row was skipped because “abc” in % Tamamlanma couldn't be read.",
      location: 'Line 5',
    });
    expect(codes(result.issues)).not.toContain('TABLE_BAD_NUMBER');
  });

  it('previews the first 10 data rows with invalid cells marked and no empty trailing headers', () => {
    const { source, mapping } = load(turkish);
    const preview = previewTable(source, mapping);
    expect(preview.headers).toEqual([
      'Aktivite Kodu',
      'Aktivite Adı',
      'Süre',
      'Başlangıç',
      'Bitiş',
      'Öncüller',
      '% Tamamlanma',
      'Takvim',
    ]);
    expect(preview.rows.map((r) => r.rowNumber)).toEqual([2, 3, 4, 5, 6]);
    expect(preview.rows[3]!.cells[6]).toEqual({ text: 'abc', invalid: true });
    const wide = csvSource('Kod;Ad;;\nA1;Bir;;\n', ';');
    expect(previewTable(wide, defaultTableMapping(wide, { delimiter: ';' })).headers).toEqual([
      'Kod',
      'Ad',
    ]);
  });

  it('keeps links of different types between the same two activities (D58)', () => {
    const source = csvSource('Code,Name,Predecessors\nA1,One,\nA2,Two,A1SS;A1FF;A1SS\n', ',');
    const result = readTable(source, defaultTableMapping(source, { delimiter: ',' }), {
      format: 'csv',
      encoding: null,
    });
    expect(
      result.model.relationships.map((r) => [r.predecessorCode, r.successorCode, r.type]),
    ).toEqual([
      ['A1', 'A2', 'SS'],
      ['A1', 'A2', 'FF'],
    ]);
    expect(result.issues.filter((i) => i.code === 'LINK_DUPLICATE')).toHaveLength(1);
  });

  it('links codes with dashes and type letters by the activities the table names', () => {
    const source = csvSource(
      [
        'Code,Name,Predecessors',
        'A,One,',
        'A-1,Two,',
        'A-2,Three,A-1',
        'CON-1000,Four,',
        'CON-1010,Five,CON-1000',
        'EX-110,Six,',
        'ACCESS,Seven,EX-110SS; A-1FS+2d',
        'STAFF,Eight,ACCESS',
      ].join('\n'),
      ',',
    );
    const result = readTable(source, defaultTableMapping(source, { delimiter: ',' }), {
      format: 'csv',
      encoding: null,
    });
    expect(
      result.model.relationships.map((r) => [
        r.predecessorCode,
        r.successorCode,
        r.type,
        r.lagMinutes,
      ]),
    ).toEqual([
      ['A-1', 'A-2', 'FS', 0],
      ['CON-1000', 'CON-1010', 'FS', 0],
      ['EX-110', 'ACCESS', 'SS', 0],
      ['A-1', 'ACCESS', 'FS', 960],
      ['ACCESS', 'STAFF', 'FS', 0],
    ]);
    expect(codes(result.issues)).toEqual(['CALENDAR_GENERATED_STANDARD']);
  });

  it('names the real start of the generated calendars and keeps the date-only times (D61)', () => {
    const source = csvSource('Code;Name;Start;Calendar\nA1;One;02.03.2026;Gece\n', ';');
    const mapping = defaultTableMapping(source, { delimiter: ';' });
    const read = (hoursPerDay: number) =>
      readTable(source, { ...mapping, hoursPerDay }, { format: 'csv', encoding: null });
    const generated = (hoursPerDay: number) =>
      read(hoursPerDay)
        .issues.filter((i) => i.code.startsWith('CALENDAR_GENERATED'))
        .map((i) => i.message);
    expect(generated(8)).toEqual([
      'Calendar Standard was added as the default calendar: Monday to Friday from 08:00, 8 hours a day.',
      'Calendar Gece was made from its name with the standard week: Monday to Friday from 08:00, 8 hours a day.',
    ]);
    expect(generated(16)).toEqual([
      'Calendar Standard was added as the default calendar: Monday to Friday from 07:00, 16 hours a day.',
      'Calendar Gece was made from its name with the standard week: Monday to Friday from 07:00, 16 hours a day.',
    ]);
    expect(read(16).model.activities[0]!.planned.start).toBe('2026-03-02T08:00');
  });
});
