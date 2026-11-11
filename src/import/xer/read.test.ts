import { describe, expect, it } from 'vitest';
import fixture from '@/import/__fixtures__/two-projects.xer?bytes';
import { decodeText } from '@/import/encoding';
import { listXerProjects, readXer } from '@/import/xer/read';
import { tokenizeXer, type XerFile } from '@/import/xer/tokenize';

const file = () => tokenizeXer(decodeText(fixture, 'utf-8')) as XerFile;
const codes = (issues: { code: string }[]) => issues.map((i) => i.code).sort();
/** The fixture's text with one CALENDAR row's fields replaced. */
function withCalendar(id: string, patch: Record<string, string>): XerFile {
  const parsed = file();
  const row = parsed.tables.get('CALENDAR')!.rows.find((r) => r.clndr_id === id)!;
  Object.assign(row, patch);
  return parsed;
}

describe('readXer', () => {
  it('lists the projects of the file with their export flags', () => {
    expect(listXerProjects(file())).toEqual([
      { id: '101', code: 'NTH-A', name: 'North Plant', exportFlag: true, baselineOf: null },
      { id: '102', code: 'NTH-B', name: 'North Annex', exportFlag: false, baselineOf: null },
    ]);
  });

  it('reads project NTH-A with its counts, issues, links and settings', () => {
    const result = readXer(file(), '101');
    expect(result.counts).toEqual([
      { entity: 'calendar', read: 3, accepted: 3, adjusted: 1, skipped: 0 },
      { entity: 'wbs', read: 2, accepted: 2, adjusted: 0, skipped: 0 },
      { entity: 'activity', read: 6, accepted: 6, adjusted: 1, skipped: 0 },
      { entity: 'relationship', read: 6, accepted: 5, adjusted: 1, skipped: 1 },
    ]);
    expect(codes(result.issues)).toEqual([
      'CALENDAR_HOURS_MISMATCH',
      'LINK_TYPE_UNKNOWN',
      'XER_CROSS_PROJECT_LINK',
      'XER_EXPECTED_FINISH',
      'XER_MULTIPLE_PROJECTS',
      'XER_RESOURCE_TASK',
    ]);
    const message = (code: string) => result.issues.find((i) => i.code === code)!.message;
    expect(message('XER_MULTIPLE_PROJECTS')).toBe(
      'The file holds 2 projects. This schedule is made from NTH-A.',
    );
    expect(message('XER_CROSS_PROJECT_LINK')).toBe(
      'The link A1040 → B2020 points to another project and was skipped.',
    );
    expect(message('CALENDAR_HOURS_MISMATCH')).toBe(
      'Calendar Night Shift states 8 hours a day, but its work week has 9. 9 is used.',
    );
    expect(message('XER_EXPECTED_FINISH')).toBe(
      "1 activities have an expected finish date. Expected finish isn't used, so their remaining durations decide their dates.",
    );
    expect(result.externalLinks).toEqual([{ target: 'NTH-B', links: 1 }]);
    expect(result.notImported).toEqual([
      { table: 'CURRTYPE', rows: 1 },
      { table: 'RSRC', rows: 2 },
      { table: 'TASKRSRC', rows: 1 },
      { table: 'UDFTYPE', rows: 1 },
    ]);
    expect(result.formatVersion).toBe('20.12');
    expect(result.statusDate).toEqual({ date: '2026-10-15', time: '08:00', source: 'file' });
    expect(result.sourceProject).toEqual({
      id: '101',
      code: 'NTH-A',
      name: 'North Plant',
      projectsInFile: 2,
      rootWbsName: 'North Plant',
      mustFinishBy: '2026-12-31',
      stated: { start: '2026-09-01', finish: '2026-12-18' },
    });
    const { model } = result;
    expect(model.project).toMatchObject({
      code: 'NTH-A',
      name: 'North Plant',
      statusDate: '2026-10-15T08:00',
      defaultCalendarId: '1',
      mustFinishBy: '2026-12-31T00:00',
    });
    expect(
      model.activities.map((a) => [
        a.code,
        a.type,
        a.status,
        a.calendarId,
        a.originalDuration,
        a.remainingDuration,
      ]),
    ).toEqual([
      ['A1000', 'start_milestone', 'completed', '1', 0, 0],
      ['A1010', 'task', 'completed', '1', 2400, 0],
      ['A1020', 'task', 'in_progress', '1', 4800, 2400],
      ['A1030', 'task', 'not_started', '2', 2160, 2160],
      ['A1040', 'finish_milestone', 'not_started', '1', 0, 0],
      ['A1050', 'level_of_effort', 'in_progress', '1', 7200, 4800],
    ]);
    const a1020 = model.activities.find((a) => a.code === 'A1020')!;
    expect(a1020).toMatchObject({
      keys: { taskId: '3', uid: null, guid: null },
      wbsId: '1002',
      constraint: { type: 'start_on_or_after', date: '2026-09-08T08:00' },
      percent: { physical: 50, type: 'physical' },
    });
    expect(model.activities.find((a) => a.code === 'A1030')!.flags.resourceDependent).toBe(true);
    expect(model.relationships).toEqual([
      {
        predecessorCode: 'A1000',
        successorCode: 'A1010',
        type: 'FS',
        lagMinutes: 0,
        lagElapsed: false,
      },
      {
        predecessorCode: 'A1010',
        successorCode: 'A1020',
        type: 'SS',
        lagMinutes: 480,
        lagElapsed: false,
      },
      {
        predecessorCode: 'A1020',
        successorCode: 'A1030',
        type: 'FS',
        lagMinutes: 0,
        lagElapsed: false,
      },
      {
        predecessorCode: 'A1030',
        successorCode: 'A1040',
        type: 'FF',
        lagMinutes: -240,
        lagElapsed: false,
      },
      {
        predecessorCode: 'A1000',
        successorCode: 'A1050',
        type: 'FS',
        lagMinutes: 0,
        lagElapsed: false,
      },
    ]);
    expect(model.wbs.map((w) => [w.id, w.code, w.name, w.parentId, w.order])).toEqual([
      ['1002', 'CIV', 'Civil works', null, 10],
      ['1003', 'MEC', 'Mechanical', null, 20],
    ]);
    expect(model.calendars.map((c) => [c.id, c.name, c.kind, c.hoursPerDay])).toEqual([
      ['1', 'Standard 5 Day', 'global', 8],
      ['2', 'Night Shift', 'project', 9],
      ['3', 'Crane', 'resource', 8],
    ]);
    expect(model.calendars[0]!.week[1]).toEqual([
      { start: 480, finish: 720 },
      { start: 780, finish: 1020 },
    ]);
    expect(model.calendars[1]!.exceptions).toEqual([{ date: '2026-10-29', periods: [] }]);
    expect(model.settings).toEqual([
      { key: 'progress_mode', value: 'retained_logic' },
      { key: 'sched_calendar_on_relationship_lag', value: 'rcal_Successor' },
      { key: 'act_this_per_link_flag', value: 'Y' },
      { key: 'add_act_remain_flag', value: 'N' },
      { key: 'cost_qty_recalc_flag', value: 'N' },
      { key: 'reset_planned_flag', value: 'N' },
    ]);
  });

  it('reads project NTH-B on its own, with the project calendar for a missing one', () => {
    const result = readXer(file(), '102');
    expect(result.counts).toEqual([
      { entity: 'calendar', read: 2, accepted: 2, adjusted: 0, skipped: 0 },
      { entity: 'wbs', read: 1, accepted: 1, adjusted: 0, skipped: 0 },
      { entity: 'activity', read: 3, accepted: 3, adjusted: 1, skipped: 0 },
      { entity: 'relationship', read: 3, accepted: 2, adjusted: 0, skipped: 1 },
    ]);
    expect(codes(result.issues)).toEqual([
      'CALENDAR_MISSING',
      'XER_CROSS_PROJECT_LINK',
      'XER_MULTIPLE_PROJECTS',
    ]);
    expect(result.externalLinks).toEqual([{ target: 'NTH-A', links: 1 }]);
    expect(result.model.activities.map((a) => [a.code, a.calendarId])).toEqual([
      ['B2000', '1'],
      ['B2010', '1'],
      ['B2020', '1'],
    ]);
    expect(result.sourceProject).toMatchObject({ code: 'NTH-B', mustFinishBy: null });
  });

  it('stops on a calendar it needs but cannot read, or whose base is missing', () => {
    expect(
      codes(readXer(withCalendar('2', { clndr_data: '(0||CalendarData()(' }), '101').issues),
    ).toContain('CALENDAR_UNREADABLE');
    const missingBase = readXer(withCalendar('2', { base_clndr_id: '77' }), '101');
    expect(missingBase.issues.find((i) => i.code === 'XER_CALENDAR_BASE_MISSING')).toMatchObject({
      severity: 'warning',
      message:
        "Calendar Night Shift is based on a calendar that isn't in the file. It was read as written, with the days P6 exported for it.",
    });
  });

  it('skips an unreadable calendar nothing uses, and flags a code used twice', () => {
    const skipped = readXer(withCalendar('3', { clndr_data: '(0||CalendarData()(' }), '101');
    expect(skipped.issues.filter((i) => i.severity === 'error')).toEqual([]);
    expect(skipped.issues.find((i) => i.code === 'CALENDAR_UNUSED_SKIPPED')!.message).toBe(
      "Calendar Crane couldn't be read completely. Nothing uses it, so it was skipped.",
    );
    expect(skipped.counts[0]).toEqual({
      entity: 'calendar',
      read: 3,
      accepted: 2,
      adjusted: 1,
      skipped: 1,
    });
    const twice = file();
    twice.tables.get('TASK')!.rows.find((r) => r.task_code === 'A1050')!.task_code = 'A1000';
    expect(readXer(twice, '101').issues.find((i) => i.code === 'DUPLICATE_CODE')!.message).toBe(
      'Activity code A1000 is used more than once.',
    );
  });

  it('reads the same model from CRLF and LF text', () => {
    const lf = decodeText(fixture, 'utf-8').replaceAll('\r\n', '\n');
    expect(readXer(tokenizeXer(lf) as XerFile, '101').model).toEqual(readXer(file(), '101').model);
  });

  it('keeps the fixture in CRLF on every checkout, and reads CRLF made from LF the same (Review Focus 1)', () => {
    const text = decodeText(fixture, 'utf-8');
    expect(text).toContain('\r\n');
    expect(text.replaceAll('\r\n', '')).not.toMatch(/[\r\n]/);
    const lf = text.replaceAll('\r\n', '\n');
    expect(readXer(tokenizeXer(lf.replaceAll('\n', '\r\n')) as XerFile, '101').model).toEqual(
      readXer(tokenizeXer(lf) as XerFile, '101').model,
    );
  });
});

/** A new record for a row added to a table in a test. */
const row = (values: Record<string, string>): Record<string, string> =>
  Object.assign(Object.create(null) as Record<string, string>, values);
const taskRow = (parsed: XerFile, code: string) =>
  parsed.tables.get('TASK')!.rows.find((r) => r.task_code === code)!;

describe('readXer decisions D51-D58', () => {
  it('reads a calendar as written when its base is missing, is itself or lies on a cycle, with a warning, and counts it adjusted (D51)', () => {
    const missing = readXer(withCalendar('2', { base_clndr_id: '77' }), '101');
    expect(missing.issues.filter((i) => i.severity === 'error')).toEqual([]);
    expect(codes(missing.issues)).toEqual([
      'CALENDAR_HOURS_MISMATCH',
      'LINK_TYPE_UNKNOWN',
      'XER_CALENDAR_BASE_MISSING',
      'XER_CROSS_PROJECT_LINK',
      'XER_EXPECTED_FINISH',
      'XER_MULTIPLE_PROJECTS',
      'XER_RESOURCE_TASK',
    ]);
    expect(missing.issues.find((i) => i.code === 'XER_CALENDAR_BASE_MISSING')).toMatchObject({
      original: '77',
      location: expect.stringMatching(/^CALENDAR line \d+$/),
    });
    // Read as written: Night Shift lists no exceptions of its own and inherits none.
    expect(missing.model.calendars[1]).toMatchObject({ id: '2', exceptions: [] });
    expect(missing.model.activities.find((a) => a.code === 'A1030')!.calendarId).toBe('2');

    const self = readXer(withCalendar('2', { base_clndr_id: '2' }), '101');
    expect(self.issues.filter((i) => i.severity === 'error')).toEqual([]);
    expect(self.issues.find((i) => i.code === 'XER_CALENDAR_BASE_MISSING')).toMatchObject({
      severity: 'warning',
      location: expect.stringMatching(/^CALENDAR line \d+$/),
    });
    expect(self.model.calendars[1]!.exceptions).toEqual([]);

    const cycle = withCalendar('1', { base_clndr_id: '2' });
    const result = readXer(cycle, '101');
    expect(
      result.issues.filter((i) => i.code === 'XER_CALENDAR_BASE_MISSING').map((i) => i.message),
    ).toEqual([
      "Calendar Standard 5 Day is based on a calendar that isn't in the file. It was read as written, with the days P6 exported for it.",
      "Calendar Night Shift is based on a calendar that isn't in the file. It was read as written, with the days P6 exported for it.",
    ]);
    expect(result.issues.filter((i) => i.severity === 'error')).toEqual([]);
    expect(result.counts[0]).toEqual({
      entity: 'calendar',
      read: 3,
      accepted: 3,
      adjusted: 2,
      skipped: 0,
    });
  });

  it('reports a repaired calendar once and counts it adjusted (D53)', () => {
    const parsed = file();
    const standard = parsed.tables.get('CALENDAR')!.rows.find((r) => r.clndr_id === '1')!;
    standard.clndr_data = standard
      .clndr_data!.replace('\x7f(0||Exceptions', ')\x7f(0||Exceptions')
      .replace('(0||0(d|46324)())', '(0||0(d|46324)())(0||1(d|46324)())');
    const result = readXer(parsed, '101');
    expect(result.issues.filter((i) => i.code === 'CALENDAR_DATA_REPAIRED')).toEqual([
      expect.objectContaining({
        severity: 'info',
        message: 'Calendar Standard 5 Day had damaged data that was repaired.',
      }),
    ]);
    expect(result.counts[0]).toEqual({
      entity: 'calendar',
      read: 3,
      accepted: 3,
      adjusted: 2,
      skipped: 0,
    });
    expect(result.model.calendars[0]!.exceptions).toEqual([{ date: '2026-10-29', periods: [] }]);
  });

  it('reads an unknown activity type as a task and derives a blank or unknown status (D54)', () => {
    const parsed = file();
    taskRow(parsed, 'A1030').task_type = 'TT_Robot';
    taskRow(parsed, 'A1020').status_code = '';
    taskRow(parsed, 'A1040').status_code = 'TK_Paused';
    const result = readXer(parsed, '101');
    const activity = (code: string) => result.model.activities.find((a) => a.code === code)!;
    expect([
      activity('A1030').type,
      activity('A1030').flags.resourceDependent,
      activity('A1020').status,
      activity('A1040').status,
    ]).toEqual(['task', false, 'in_progress', 'not_started']);
    expect(
      result.issues
        .filter((i) => i.code === 'XER_UNKNOWN_VALUE')
        .map((i) => [i.severity, i.message]),
    ).toEqual([
      ['warning', "A1020 has a status we don't know (empty). In progress is used."],
      ['warning', "A1030 has a type we don't know (TT_Robot). Task is used."],
      ['warning', "A1040 has a status we don't know (TK_Paused). Not started is used."],
    ]);
    expect(result.counts[2]).toEqual({
      entity: 'activity',
      read: 6,
      accepted: 6,
      adjusted: 3,
      skipped: 0,
    });
  });

  it('reads numbers with the symbols the file declares, and undeclared decimal commas with one warning (D55)', () => {
    const declared = file();
    Object.assign(declared.tables.get('CURRTYPE')!.rows[0]!, {
      decimal_symbol: ',',
      digit_group_symbol: '.',
    });
    Object.assign(taskRow(declared, 'A1030'), {
      target_drtn_hr_cnt: '1.234,5',
      remain_drtn_hr_cnt: '36,5',
      total_float_hr_cnt: '0.125',
    });
    const withRow = readXer(declared, '101');
    expect(withRow.model.activities.find((a) => a.code === 'A1030')).toMatchObject({
      originalDuration: 74070,
      remainingDuration: 2190,
      totalFloat: 7.5, // no digit group starts with 0
    });
    expect(codes(withRow.issues)).not.toContain('XER_DECIMAL_COMMA');

    // The fixture's own row declares '.' and ','; 0,125 can't be grouped, so it is a comma decimal.
    const ownRow = file();
    Object.assign(taskRow(ownRow, 'A1030'), {
      target_drtn_hr_cnt: '1,234.5',
      remain_drtn_hr_cnt: '0,125',
    });
    const withOwnRow = readXer(ownRow, '101');
    expect(withOwnRow.model.activities.find((a) => a.code === 'A1030')).toMatchObject({
      originalDuration: 74070,
      remainingDuration: 7.5,
    });
    expect(withOwnRow.issues.filter((i) => i.code === 'XER_DECIMAL_COMMA')).toEqual([
      expect.objectContaining({ original: '0,125' }),
    ]);

    const undeclared = file();
    undeclared.tables.delete('CURRTYPE');
    Object.assign(taskRow(undeclared, 'A1030'), {
      target_drtn_hr_cnt: '36,5',
      remain_drtn_hr_cnt: '36,5',
    });
    const withoutRow = readXer(undeclared, '101');
    expect(withoutRow.model.activities.find((a) => a.code === 'A1030')).toMatchObject({
      originalDuration: 2190,
      remainingDuration: 2190,
    });
    expect(withoutRow.issues.filter((i) => i.code === 'XER_DECIMAL_COMMA')).toEqual([
      expect.objectContaining({
        severity: 'warning',
        message:
          "Numbers in this file use a decimal comma the file doesn't declare. They were read as decimals; check durations and percentages.",
      }),
    ]);
  });

  it('groups digits only when the declared decimal symbol follows; a lone separator is a decimal (D59)', () => {
    // The fixture's own row declares '.' and ','; 26,667 has no '.', so it is a comma decimal.
    const ownRow = file();
    Object.assign(taskRow(ownRow, 'A1030'), {
      target_drtn_hr_cnt: '1,234.5',
      remain_drtn_hr_cnt: '26,667',
    });
    const withOwnRow = readXer(ownRow, '101');
    expect(withOwnRow.model.activities.find((a) => a.code === 'A1030')).toMatchObject({
      originalDuration: 74070,
      remainingDuration: 1600.02,
    });
    expect(withOwnRow.issues.filter((i) => i.code === 'XER_DECIMAL_COMMA')).toEqual([
      expect.objectContaining({ original: '26,667' }),
    ]);

    const declared = file();
    Object.assign(declared.tables.get('CURRTYPE')!.rows[0]!, {
      decimal_symbol: ',',
      digit_group_symbol: '.',
    });
    Object.assign(taskRow(declared, 'A1030'), {
      target_drtn_hr_cnt: '1.234,5',
      remain_drtn_hr_cnt: '26.667',
    });
    const withRow = readXer(declared, '101');
    expect(withRow.model.activities.find((a) => a.code === 'A1030')).toMatchObject({
      originalDuration: 74070,
      remainingDuration: 1600.02,
    });
    expect(codes(withRow.issues)).not.toContain('XER_DECIMAL_COMMA');
  });

  it('names a project that another project names as its baseline (D56)', () => {
    const parsed = file();
    const [north, annex] = parsed.tables.get('PROJECT')!.rows;
    north!.sum_base_proj_id = '102';
    annex!.sum_base_proj_id = '102';
    expect(listXerProjects(parsed).map((p) => [p.code, p.baselineOf])).toEqual([
      ['NTH-A', null],
      ['NTH-B', 'NTH-A'],
    ]);
  });

  it('stops on more than 100,000 calendar exception dates (D57)', () => {
    const week =
      '(0||DaysOfWeek()((0||1()())(0||2()((0||0(s|08:00|f|17:00)())))(0||3()())(0||4()())(0||5()())(0||6()())(0||7()())))';
    const crane = (count: number) => ({
      clndr_data: `(0||CalendarData()(${week}(0||Exceptions()(${Array.from({ length: count }, (_, i) => `(0||${i}(d|${40000 + i})())`).join('')}))))`,
    });
    // Standard 5 Day holds one exception and Night Shift inherits it: two dates besides Crane's.
    expect(
      readXer(withCalendar('3', crane(99998)), '101').issues.filter((i) => i.severity === 'error'),
    ).toEqual([]);
    expect(
      readXer(withCalendar('3', crane(99999)), '101').issues.filter((i) => i.severity === 'error'),
    ).toEqual([
      expect.objectContaining({
        code: 'FILE_TOO_MANY_EXCEPTIONS',
        message: "The file's calendars hold more than 100,000 exception dates.",
      }),
    ]);
    // More dates in one container than a call can take as arguments still give the issue.
    expect(
      readXer(withCalendar('3', crane(130_000)), '101')
        .issues.filter((i) => i.severity === 'error')
        .map((i) => i.code),
    ).toEqual(['FILE_TOO_MANY_EXCEPTIONS']);
  });

  it('rounds six-decimal hour noise to the whole minute and keeps real fractions (D58)', () => {
    const parsed = file();
    Object.assign(taskRow(parsed, 'A1030'), {
      target_drtn_hr_cnt: '26.666667',
      remain_drtn_hr_cnt: '0.33',
      total_float_hr_cnt: '1.016667',
      free_float_hr_cnt: '2.3',
    });
    parsed.tables.get('TASKPRED')!.rows[0]!.lag_hr_cnt = '0.083333';
    const result = readXer(parsed, '101');
    expect(result.model.activities.find((a) => a.code === 'A1030')).toMatchObject({
      originalDuration: 1600,
      remainingDuration: 19.8,
      totalFloat: 61,
      freeFloat: 138,
    });
    expect(result.model.relationships[0]!.lagMinutes).toBe(5);
  });

  it('orders WBS siblings by seq_num, numeric wbs_id and line, and lifts activities whose WBS lies outside the project (D58)', () => {
    const parsed = file();
    const wbs = (id: string, parent: string, seq: string, code: string) =>
      row({
        wbs_id: id,
        proj_id: '101',
        parent_wbs_id: parent,
        seq_num: seq,
        proj_node_flag: 'N',
        wbs_short_name: code,
        wbs_name: code,
      });
    parsed.tables
      .get('PROJWBS')!
      .rows.push(
        wbs('1010', '1001', '20', 'ELE'),
        wbs('999', '1001', '20', 'PLB'),
        wbs('1004', '1001', '5', 'DES'),
        wbs('1005', '1003', '1', 'PMP'),
        wbs('1010.0', '1001', '20', 'HVC'),
      );
    taskRow(parsed, 'A1050').wbs_id = '2002';
    taskRow(parsed, 'A1000').wbs_id = '1001';
    const result = readXer(parsed, '101');
    expect(result.model.wbs.map((w) => [w.code, w.parentId, w.order])).toEqual([
      ['DES', null, 5],
      ['CIV', null, 10],
      ['PLB', null, 20],
      ['MEC', null, 20],
      ['PMP', '1003', 1],
      ['ELE', null, 20],
      ['HVC', null, 20],
    ]);
    expect(result.model.activities.filter((a) => a.wbsId === null).map((a) => a.code)).toEqual([
      'A1000',
      'A1050',
    ]);
  });

  it('takes data_date as the status date only when last_recalc_date is absent (D58)', () => {
    const parsed = file();
    const project = parsed.tables.get('PROJECT')!.rows[0]!;
    project.data_date = '2026-10-20 08:00';
    expect(readXer(parsed, '101').statusDate).toEqual({
      date: '2026-10-15',
      time: '08:00',
      source: 'file',
    });
    delete project.last_recalc_date;
    expect(readXer(parsed, '101')).toMatchObject({
      statusDate: { date: '2026-10-20', time: '08:00', source: 'file' },
      model: { project: { statusDate: '2026-10-20T08:00' } },
    });
    delete project.data_date;
    expect(readXer(parsed, '101').statusDate).toEqual({ date: null, time: null, source: 'none' });
  });

  it('reads constraint and link-type aliases and keeps one copy of a repeated link per type (D58)', () => {
    const parsed = file();
    Object.assign(taskRow(parsed, 'A1030'), {
      cstr_type: 'CS_MANSTART',
      cstr_date: '2026-10-22 13:00',
    });
    Object.assign(taskRow(parsed, 'A1040'), {
      cstr_type: 'CS_MANFINISH',
      cstr_date: '2026-12-18 17:00',
    });
    const links = parsed.tables.get('TASKPRED')!.rows;
    links[1]!.pred_type = 'SS';
    const link = (id: string, type: string) =>
      row({
        task_pred_id: id,
        task_id: '3',
        pred_task_id: '2',
        proj_id: '101',
        pred_proj_id: '101',
        pred_type: type,
        lag_hr_cnt: '0',
      });
    links.push(link('9', 'PR_SS'), link('10', 'FF'));
    const result = readXer(parsed, '101');
    const constraint = (code: string) =>
      result.model.activities.find((a) => a.code === code)!.constraint;
    expect([constraint('A1030'), constraint('A1040')]).toEqual([
      { type: 'mandatory_start', date: '2026-10-22T13:00' },
      { type: 'mandatory_finish', date: '2026-12-18T17:00' },
    ]);
    expect(
      result.model.relationships
        .filter((r) => r.successorCode === 'A1020')
        .map((r) => [r.type, r.lagMinutes]),
    ).toEqual([
      ['SS', 480],
      ['FF', 0],
    ]);
    expect(result.issues.filter((i) => i.code === 'LINK_DUPLICATE').map((i) => i.message)).toEqual([
      'The link A1010 → A1020 appears more than once. One copy was kept.',
    ]);
    expect(result.counts[3]).toEqual({
      entity: 'relationship',
      read: 8,
      accepted: 6,
      adjusted: 1,
      skipped: 2,
    });
  });
});

describe('readXer links to other projects', () => {
  it('skips a link whose other activity is missing but whose project field names another project (§5.5)', () => {
    const parsed = file();
    const link = (
      id: string,
      successor: string,
      predecessor: string,
      successorProject: string,
      predecessorProject: string,
    ) =>
      row({
        task_pred_id: id,
        task_id: successor,
        pred_task_id: predecessor,
        proj_id: successorProject,
        pred_proj_id: predecessorProject,
        pred_type: 'PR_FS',
        lag_hr_cnt: '0',
      });
    parsed.tables.get('TASKPRED')!.rows.push(
      link('9', '1', '999', '101', '300'), // the predecessor's project isn't in the file
      link('10', '998', '6', '102', '101'), // the successor's project is NTH-B
      link('11', '2', '997', '101', '101'), // the predecessor is said to be in this project
    );
    const result = readXer(parsed, '101');
    expect(
      result.issues.filter((i) => i.code === 'XER_CROSS_PROJECT_LINK').map((i) => i.message),
    ).toEqual([
      'The link A1040 → B2020 points to another project and was skipped.',
      'The link 999 → A1000 points to another project and was skipped.',
      'The link A1050 → 998 points to another project and was skipped.',
    ]);
    expect(
      result.issues.filter((i) => i.code === 'LINK_UNKNOWN_ACTIVITY').map((i) => i.message),
    ).toEqual(["The link 997 → A1010 names an activity that isn't in the file and was skipped."]);
    expect(result.externalLinks).toEqual([
      { target: 'NTH-B', links: 2 },
      { target: '300', links: 1 },
    ]);
    expect(result.counts[3]).toEqual({
      entity: 'relationship',
      read: 9,
      accepted: 5,
      adjusted: 1,
      skipped: 4,
    });
  });
});

describe('readXer text limits (§5.10)', () => {
  it('shortens codes and names without splitting a character made of two code units', () => {
    const parsed = file();
    Object.assign(taskRow(parsed, 'A1050'), {
      task_code: `${'S'.repeat(39)}😀`,
      task_name: `${'a'.repeat(254)}😀`,
    });
    const result = readXer(parsed, '101');
    expect(
      result.model.activities.filter((a) => a.code.startsWith('S')).map((a) => [a.code, a.name]),
    ).toEqual([['S'.repeat(39), 'a'.repeat(254)]]);
    expect(result.issues.filter((i) => i.code === 'TEXT_TRUNCATED').map((i) => i.message)).toEqual([
      `The code of ${'S'.repeat(39)}😀 was longer than 40 characters and was shortened.`,
      `The name of ${'S'.repeat(39)} was longer than 255 characters and was shortened.`,
    ]);
  });
});
