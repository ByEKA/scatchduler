import { describe, expect, it } from 'vitest';
import fixture from '@/import/__fixtures__/project.xml?bytes';
import { mspdiCodeFields, readMspdi } from '@/import/mspdi/read';
import type { ImportActivity } from '@/import/model';
import { mspdiXml } from '@/import/testing';

const text = new TextDecoder().decode(fixture);
const uid = { activityCodeField: 'UID' };
const codes = (issues: { code: string }[]) => issues.map((i) => i.code).sort();
const task = (uidValue: number, inner: string) =>
  `<Task><UID>${uidValue}</UID><ID>${uidValue}</ID><Name>Task ${uidValue}</Name><OutlineLevel>1</OutlineLevel><OutlineNumber>${uidValue}</OutlineNumber>${inner}</Task>`;
const dates = (start: string, finish = start) =>
  `<Start>${start}</Start><Finish>${finish}</Finish>`;

describe('readMspdi', () => {
  it('reads the fixture with its counts, milestones, manual task and escaped text', () => {
    const result = readMspdi(text, uid);
    expect(result.counts).toEqual([
      { entity: 'calendar', read: 2, accepted: 2, adjusted: 0, skipped: 0 },
      { entity: 'wbs', read: 2, accepted: 2, adjusted: 0, skipped: 0 },
      { entity: 'activity', read: 6, accepted: 6, adjusted: 1, skipped: 0 },
      { entity: 'relationship', read: 5, accepted: 5, adjusted: 0, skipped: 0 },
    ]);
    expect(codes(result.issues)).toEqual(['MSPDI_MANUAL_TASK']);
    expect(result.issues[0]!.message).toBe(
      '4 is manually scheduled in the file. It starts on or after 2026-03-09 08:00.',
    );
    expect(result.formatVersion).toBe('14');
    expect(result.statusDate).toEqual({ date: '2026-03-20', time: '17:00', source: 'file' });
    expect(result.units).toEqual({
      minutesPerDay: 480,
      calendars: [
        { name: 'Standard', hoursPerDay: 8 },
        { name: 'Saturday crew', hoursPerDay: 8 },
      ],
    });
    const { model } = result;
    expect(
      model.activities.map((a) => [
        a.code,
        a.name,
        a.type,
        a.status,
        a.calendarId,
        a.originalDuration,
      ]),
    ).toEqual([
      ['2', 'Kickoff', 'start_milestone', 'not_started', '1', 0],
      ['3', 'Kazı & Dolgu', 'task', 'not_started', '1', 2400],
      ['4', 'Formwork', 'task', 'not_started', '1', 1440],
      ['5', 'Inspection', 'task', 'not_started', '2', 480],
      ['6', 'Handover', 'finish_milestone', 'not_started', '1', 0],
      ['8', 'Approve drawings', 'task', 'completed', '1', 960],
    ]);
    expect(model.activities.find((a) => a.code === '3')!.notes).toBe('Check İzmir crane');
    expect(model.activities.find((a) => a.code === '4')).toMatchObject({
      constraint: { type: 'start_on_or_after', date: '2026-03-09T08:00' },
      flags: { manual: true },
    });
    expect(model.wbs.map((w) => [w.code, w.name])).toEqual([
      ['1', 'Site works'],
      ['2', 'Design'],
    ]);
    expect(model.relationships.find((r) => r.successorCode === '4')).toEqual({
      predecessorCode: '3',
      successorCode: '4',
      type: 'SS',
      lagMinutes: 480,
      lagElapsed: false,
    });
    expect(model.calendars.find((c) => c.id === '1')!.exceptions).toEqual([
      { date: '2026-03-23', periods: [] },
    ]);
  });

  it('derives status from actual dates, then percent complete', () => {
    const tasks = [
      task(
        1,
        `${dates('2026-03-02T08:00:00', '2026-03-02T17:00:00')}<Duration>PT8H0M0S</Duration><ActualFinish>2026-03-02T17:00:00</ActualFinish>`,
      ),
      task(
        2,
        `${dates('2026-03-02T08:00:00', '2026-03-02T17:00:00')}<Duration>PT8H0M0S</Duration><ActualStart>2026-03-02T08:00:00</ActualStart>`,
      ),
      task(
        3,
        `${dates('2026-03-02T08:00:00', '2026-03-02T17:00:00')}<Duration>PT8H0M0S</Duration><PercentComplete>100</PercentComplete><PhysicalPercentComplete>40</PhysicalPercentComplete>`,
      ),
      task(
        4,
        `${dates('2026-03-02T08:00:00', '2026-03-02T17:00:00')}<Duration>PT8H0M0S</Duration><PercentComplete>10</PercentComplete>`,
      ),
      task(
        5,
        `${dates('2026-03-02T08:00:00', '2026-03-02T17:00:00')}<Duration>PT8H0M0S</Duration>`,
      ),
    ].join('');
    const { model } = readMspdi(mspdiXml({ tasks }), uid);
    expect(model.activities.map((a) => a.status)).toEqual([
      'completed',
      'in_progress',
      'completed',
      'in_progress',
      'not_started',
    ]);
    expect(model.activities[2]!.percent).toEqual({ duration: 100, physical: 40, type: null });
  });

  it('offers UID, ID and Text fields filled and unique on 90% of activities, with fallbacks', () => {
    const tasks = Array.from({ length: 10 }, (_, i) =>
      task(
        i + 1,
        `${dates('2026-03-02T08:00:00', '2026-03-02T17:00:00')}<Duration>PT8H0M0S</Duration>${i < 9 ? `<ExtendedAttribute><FieldID>188743731</FieldID><Value>K-${i + 1}</Value></ExtendedAttribute>` : ''}`,
      ),
    ).join('');
    const xml = mspdiXml({ tasks });
    expect(mspdiCodeFields(xml)).toEqual(['UID', 'ID', 'Text1']);
    const result = readMspdi(xml, { activityCodeField: 'Text1' });
    expect(result.model.activities.map((a) => a.code).slice(-2)).toEqual(['K-9', '10']);
    expect(result.issues.find((i) => i.code === 'CODE_FALLBACK')!.message).toBe(
      'Task 10 has no usable code in Text1. Its unique ID 10 is used.',
    );
  });

  it('fills a missing status date with the earliest task start', () => {
    const tasks =
      task(
        1,
        `${dates('2026-03-04T08:00:00', '2026-03-04T17:00:00')}<Duration>PT8H0M0S</Duration>`,
      ) +
      task(
        2,
        `${dates('2026-03-02T08:00:00', '2026-03-02T17:00:00')}<Duration>PT8H0M0S</Duration>`,
      );
    expect(readMspdi(mspdiXml({ tasks }), uid).statusDate).toEqual({
      date: '2026-03-02',
      time: '08:00',
      source: 'earliest-start',
    });
  });

  it('tells milestones at an unclear time, milestones with a duration and zero durations apart', () => {
    const tasks = [
      task(
        1,
        `<Milestone>1</Milestone>${dates('2026-03-02T10:00:00')}<Duration>PT0H0M0S</Duration>`,
      ),
      task(
        2,
        `<Milestone>1</Milestone>${dates('2026-03-02T08:00:00', '2026-03-02T17:00:00')}<Duration>PT8H0M0S</Duration>`,
      ),
      task(
        3,
        `<Milestone>0</Milestone>${dates('2026-03-02T17:00:00')}<Duration>PT0H0M0S</Duration>`,
      ),
    ].join('');
    const result = readMspdi(mspdiXml({ tasks }), uid);
    expect(result.model.activities.map((a) => a.type)).toEqual([
      'start_milestone',
      'task',
      'finish_milestone',
    ]);
    expect(codes(result.issues)).toEqual([
      'MSPDI_MILESTONE_AMBIGUOUS',
      'MSPDI_MILESTONE_WITH_DURATION',
      'MSPDI_ZERO_DURATION',
    ]);
    expect(result.issues.find((i) => i.code === 'MSPDI_MILESTONE_AMBIGUOUS')!.message).toBe(
      '1 is a milestone at 10:00, neither the start nor the end of its working day. It is imported as a start milestone.',
    );
  });

  it('drops the manual start of a task that has a constraint', () => {
    const tasks = task(
      1,
      `<Manual>1</Manual><ManualStart>2026-03-05T08:00:00</ManualStart>${dates('2026-03-05T08:00:00', '2026-03-05T17:00:00')}<Duration>PT8H0M0S</Duration><ConstraintType>4</ConstraintType><ConstraintDate>2026-03-04T08:00:00</ConstraintDate>`,
    );
    const result = readMspdi(mspdiXml({ tasks }), uid);
    expect(result.model.activities[0]!.constraint).toEqual({
      type: 'start_on_or_after',
      date: '2026-03-04T08:00',
    });
    expect(result.issues.map((i) => i.message)).toEqual([
      '1 is manually scheduled and already has a constraint. Its manual start 2026-03-05 08:00 was dropped.',
    ]);
  });

  it('gives elapsed durations the 24-hour calendar once and converts percentage lags', () => {
    const tasks = [
      task(
        1,
        `${dates('2026-03-02T08:00:00', '2026-03-04T08:00:00')}<Duration>PT48H0M0S</Duration><DurationFormat>8</DurationFormat>`,
      ),
      task(
        2,
        `${dates('2026-03-04T08:00:00', '2026-03-05T17:00:00')}<Duration>PT16H0M0S</Duration><DurationFormat>8</DurationFormat>`,
      ),
      task(
        3,
        `${dates('2026-03-06T08:00:00', '2026-03-06T17:00:00')}<Duration>PT8H0M0S</Duration><PredecessorLink><PredecessorUID>1</PredecessorUID><Type>1</Type><LinkLag>-250</LinkLag><LagFormat>19</LagFormat></PredecessorLink><PredecessorLink><PredecessorUID>2</PredecessorUID><Type>9</Type><LinkLag>14400</LinkLag><LagFormat>8</LagFormat></PredecessorLink>`,
      ),
    ].join('');
    const result = readMspdi(mspdiXml({ tasks }), uid);
    expect(result.model.calendars.filter((c) => c.id === 'gen:24h')).toHaveLength(1);
    expect(result.model.activities.map((a) => a.calendarId)).toEqual(['gen:24h', 'gen:24h', '1']);
    expect(result.model.relationships).toEqual([
      { predecessorCode: '1', successorCode: '3', type: 'FS', lagMinutes: -720, lagElapsed: false },
      { predecessorCode: '2', successorCode: '3', type: 'FS', lagMinutes: 1440, lagElapsed: true },
    ]);
    expect(codes(result.issues)).toEqual([
      'CALENDAR_GENERATED_ELAPSED',
      'ELAPSED_DURATION',
      'ELAPSED_DURATION',
      'ELAPSED_LAG',
      'LINK_TYPE_UNKNOWN',
      'PERCENT_LAG',
    ]);
    expect(result.counts[0]).toEqual({
      entity: 'calendar',
      read: 1,
      accepted: 1,
      adjusted: 0,
      skipped: 0,
    });
  });

  it('skips inactive, external and null tasks, links on summaries and links outside the file', () => {
    const tasks = [
      `<Task><UID>1</UID><ID>1</ID><Name>Phase</Name><Summary>1</Summary><OutlineLevel>1</OutlineLevel><OutlineNumber>1</OutlineNumber><PredecessorLink><PredecessorUID>2</PredecessorUID><Type>1</Type></PredecessorLink></Task>`,
      task(
        2,
        `${dates('2026-03-02T08:00:00', '2026-03-02T17:00:00')}<Duration>PT8H0M0S</Duration>`,
      ),
      task(
        3,
        `<Active>0</Active>${dates('2026-03-02T08:00:00', '2026-03-02T17:00:00')}<Duration>PT8H0M0S</Duration>`,
      ),
      task(
        4,
        `<ExternalTask>1</ExternalTask>${dates('2026-03-02T08:00:00', '2026-03-02T17:00:00')}<Duration>PT8H0M0S</Duration>`,
      ),
      `<Task><UID>5</UID><ID>5</ID><IsNull>1</IsNull></Task>`,
      task(
        6,
        `${dates('2026-03-03T08:00:00', '2026-03-03T17:00:00')}<Duration>PT8H0M0S</Duration><PredecessorLink><PredecessorUID>99</PredecessorUID><Type>1</Type><CrossProject>1</CrossProject><CrossProjectName>Other.mpp\\12</CrossProjectName></PredecessorLink>`,
      ),
    ].join('');
    const result = readMspdi(mspdiXml({ tasks }), uid);
    expect(result.model.activities.map((a) => a.code)).toEqual(['2', '6']);
    expect(codes(result.issues)).toEqual([
      'MSPDI_EXTERNAL_LINK',
      'MSPDI_EXTERNAL_TASK',
      'MSPDI_INACTIVE_TASK',
      'MSPDI_SUMMARY_LINK',
    ]);
    expect(result.externalLinks).toEqual([{ target: 'Other.mpp\\12', links: 1 }]);
    expect(result.counts.find((c) => c.entity === 'activity')).toEqual({
      entity: 'activity',
      read: 4,
      accepted: 2,
      adjusted: 0,
      skipped: 2,
    });
  });

  it('keeps outline numbers as text and reports unreadable XML', () => {
    const tasks = `<Task><UID>1</UID><ID>1</ID><Name>Phase</Name><Summary>1</Summary><OutlineLevel>1</OutlineLevel><OutlineNumber>1.10</OutlineNumber></Task>${task(2, `${dates('2026-03-02T08:00:00', '2026-03-02T17:00:00')}<Duration>PT8H0M0S</Duration>`)}`;
    expect(readMspdi(mspdiXml({ tasks }), uid).model.wbs[0]!.code).toBe('10');
    expect(
      readMspdi(
        '<Project xmlns="http://schemas.microsoft.com/project"><Tasks><Task>',
        uid,
      ).issues.map((i) => i.code),
    ).toEqual(['FILE_UNREADABLE']);
  });
});

describe('readMspdi (decisions D52, D58 and D60)', () => {
  const day = (start: string, finish: string) =>
    `${dates(start, finish)}<Duration>PT8H0M0S</Duration>`;
  const link = (predecessor: number, type: number, extra = '') =>
    `<PredecessorLink><PredecessorUID>${predecessor}</PredecessorUID><Type>${type}</Type>${extra}</PredecessorLink>`;

  it('drops fractional seconds and zones from dates once and reads NA as empty (D52)', () => {
    const tasks = task(
      1,
      `<Start>2026-03-02T08:00:00.000Z</Start><Finish>2026-03-02T17:00:00+03:00</Finish><Duration>PT8H0M0S</Duration><ActualStart>NA</ActualStart><PercentComplete>NA</PercentComplete>`,
    );
    const result = readMspdi(mspdiXml({ project: '<StatusDate>NA</StatusDate>', tasks }), uid);
    expect(result.model.activities[0]).toMatchObject({
      planned: { start: '2026-03-02T08:00', finish: '2026-03-02T17:00' },
      actual: { start: null, finish: null },
      percent: { duration: null },
      status: 'not_started',
    });
    expect(result.statusDate).toEqual({
      date: '2026-03-02',
      time: '08:00',
      source: 'earliest-start',
    });
    expect(result.issues.map((i) => i.code)).toEqual(['MSPDI_DATE_ZONE_DROPPED']);
    expect(result.issues[0]!.message).toBe(
      'Some dates carry a time zone or fractions of a second. They were read as the times written.',
    );
  });

  it('reads NA as empty in calendar references, constraint and link types, IDs and settings (D52)', () => {
    const workDay = (type: number, from: string, to: string) =>
      `<WeekDay><DayType>${type}</DayType><DayWorking>1</DayWorking><WorkingTimes><WorkingTime><FromTime>${from}:00</FromTime><ToTime>${to}:00</ToTime></WorkingTime></WorkingTimes></WeekDay>`;
    const calendars = [
      `<Calendar><UID>1</UID><Name>Standard</Name><IsBaseCalendar>1</IsBaseCalendar><WeekDays>${workDay(2, '08:00', '16:00')}${workDay(3, '08:00', '16:00')}</WeekDays></Calendar>`,
      `<Calendar><UID>2</UID><Name>Crew</Name><IsBaseCalendar>0</IsBaseCalendar><BaseCalendarUID>NA</BaseCalendarUID><WeekDays>${workDay(3, '07:00', '15:00')}</WeekDays></Calendar>`,
    ].join('');
    const tasks = [
      `<Task><UID>1</UID><ID>NA</ID><Name>Excavate</Name><OutlineLevel>1</OutlineLevel>${day('2026-03-02T08:00:00', '2026-03-02T16:00:00')}<CalendarUID>NA</CalendarUID><ConstraintType>NA</ConstraintType><Deadline>NA</Deadline></Task>`,
      `<Task><UID>2</UID><ID>2</ID><Name>Pour</Name><OutlineLevel>1</OutlineLevel>${day('2026-03-03T07:00:00', '2026-03-03T15:00:00')}<CalendarUID>2</CalendarUID><PredecessorLink><PredecessorUID>1</PredecessorUID><Type>NA</Type></PredecessorLink></Task>`,
    ].join('');
    const xml = `<?xml version="1.0" encoding="UTF-8"?><Project xmlns="http://schemas.microsoft.com/project"><SaveVersion>NA</SaveVersion><ScheduleFromStart>NA</ScheduleFromStart><CalendarUID>NA</CalendarUID><MinutesPerDay>480</MinutesPerDay><Calendars>${calendars}</Calendars><Tasks>${tasks}</Tasks></Project>`;
    const result = readMspdi(xml, uid);
    expect(result.issues).toEqual([]);
    expect(result.model.calendars.map((c) => [c.id, c.kind, c.week[1]])).toEqual([
      ['1', 'project', [{ start: 480, finish: 960 }]],
      ['2', 'global', []],
    ]);
    expect(result.model.activities.map((a) => [a.code, a.calendarId, a.constraint])).toEqual([
      ['1', '1', null],
      ['2', '2', null],
    ]);
    expect(result.model.relationships.map((r) => [r.predecessorCode, r.type])).toEqual([
      ['1', 'FS'],
    ]);
    expect(result.counts.map((count) => count.adjusted)).toEqual([0, 0, 0, 0]);
    expect(result.formatVersion).toBeNull();
    expect(result.model.settings).toEqual([{ key: 'MinutesPerDay', value: '480' }]);
    expect(result.elements.map((e) => e.element)).not.toContain('Deadlines');
    const byId = readMspdi(xml, { activityCodeField: 'ID' });
    expect(byId.model.activities.map((a) => a.code)).toEqual(['1', '2']);
    expect(codes(byId.issues)).toEqual(['CODE_FALLBACK']);
  });

  it('reads booleans written true or false (D58)', () => {
    const tasks = [
      '<Task><UID>1</UID><ID>1</ID><Name>Phase</Name><Summary>true</Summary><OutlineLevel>1</OutlineLevel><OutlineNumber>1</OutlineNumber></Task>',
      `<Task><UID>2</UID><ID>2</ID><Name>Gate</Name><Summary>false</Summary><Milestone>true</Milestone><OutlineLevel>2</OutlineLevel><OutlineNumber>1.1</OutlineNumber>${dates('2026-03-02T08:00:00')}<Duration>PT0H0M0S</Duration></Task>`,
      task(3, `<Active>false</Active>${day('2026-03-02T08:00:00', '2026-03-02T17:00:00')}`),
    ].join('');
    const result = readMspdi(mspdiXml({ tasks }), uid);
    expect(result.model.wbs.map((w) => w.name)).toEqual(['Phase']);
    expect(result.model.activities.map((a) => [a.code, a.type, a.wbsId])).toEqual([
      ['2', 'start_milestone', '1'],
    ]);
    expect(codes(result.issues)).toEqual(['MSPDI_INACTIVE_TASK']);
  });

  it('treats CrossProject links as external before looking up their UID and keys repeated links on their type (D58)', () => {
    const tasks = [
      task(1, day('2026-03-02T08:00:00', '2026-03-02T17:00:00')),
      task(
        2,
        `${day('2026-03-03T08:00:00', '2026-03-03T17:00:00')}${link(1, 1)}${link(1, 3)}${link(1, 1)}${link(1, 1, '<CrossProject>true</CrossProject><CrossProjectName>Depot.mpp\\1</CrossProjectName>')}`,
      ),
    ].join('');
    const result = readMspdi(mspdiXml({ tasks }), uid);
    expect(
      result.model.relationships.map((r) => [r.predecessorCode, r.successorCode, r.type]),
    ).toEqual([
      ['1', '2', 'FS'],
      ['1', '2', 'SS'],
    ]);
    expect(codes(result.issues)).toEqual(['LINK_DUPLICATE', 'MSPDI_EXTERNAL_LINK']);
    expect(result.externalLinks).toEqual([{ target: 'Depot.mpp\\1', links: 1 }]);
    expect(result.counts[3]).toEqual({
      entity: 'relationship',
      read: 4,
      accepted: 2,
      adjusted: 0,
      skipped: 2,
    });
  });

  it('reads lag formats 19, 20, 51 and 52 as tenths of a percent, 20 and 52 in elapsed time (D58)', () => {
    const percentLag = (format: number) =>
      link(1, 1, `<LinkLag>500</LinkLag><LagFormat>${format}</LagFormat>`);
    const tasks = [
      task(
        1,
        `${dates('2026-03-02T08:00:00', '2026-03-03T17:00:00')}<Duration>PT16H0M0S</Duration>`,
      ),
      ...[19, 20, 51, 52].map((format, i) =>
        task(i + 2, `${day('2026-03-04T08:00:00', '2026-03-04T17:00:00')}${percentLag(format)}`),
      ),
    ].join('');
    const result = readMspdi(mspdiXml({ tasks }), uid);
    expect(
      result.model.relationships.map((r) => [r.successorCode, r.lagMinutes, r.lagElapsed]),
    ).toEqual([
      ['2', 480, false],
      ['3', 480, true],
      ['4', 480, false],
      ['5', 480, true],
    ]);
    expect(codes(result.issues)).toEqual([
      'ELAPSED_LAG',
      'ELAPSED_LAG',
      'PERCENT_LAG',
      'PERCENT_LAG',
      'PERCENT_LAG',
      'PERCENT_LAG',
    ]);
    expect(result.issues.find((i) => i.code === 'PERCENT_LAG')!.message).toBe(
      'The lag on 1 → 2 is a percentage. It was converted to 8 h.',
    );
  });

  it('reads the remaining window from Resume to Finish, empty without Resume (D60)', () => {
    const tasks =
      task(
        1,
        `${dates('2026-03-02T08:00:00', '2026-03-06T17:00:00')}<Duration>PT40H0M0S</Duration><ActualStart>2026-03-02T08:00:00</ActualStart><Stop>2026-03-03T17:00:00</Stop><Resume>2026-03-05T08:00:00</Resume><PercentComplete>40</PercentComplete>`,
      ) +
      task(2, `${day('2026-03-09T08:00:00', '2026-03-09T17:00:00')}<Resume>NA</Resume>`) +
      task(3, day('2026-03-10T08:00:00', '2026-03-10T17:00:00'));
    const result = readMspdi(mspdiXml({ tasks }), uid);
    expect(result.model.activities.map((a) => [a.code, a.remaining])).toEqual([
      ['1', { start: '2026-03-05T08:00', finish: '2026-03-06T17:00' }],
      ['2', { start: null, finish: null }],
      ['3', { start: null, finish: null }],
    ]);
  });

  it('takes the project calendar from Project/CalendarUID, else the first calendar (D58)', () => {
    const calendar = (uidValue: number, name: string) =>
      `<Calendar><UID>${uidValue}</UID><Name>${name}</Name><IsBaseCalendar>1</IsBaseCalendar><WeekDays><WeekDay><DayType>2</DayType><DayWorking>1</DayWorking><WorkingTimes><WorkingTime><FromTime>08:00:00</FromTime><ToTime>17:00:00</ToTime></WorkingTime></WorkingTimes></WeekDay></WeekDays></Calendar>`;
    const tasks = task(1, day('2026-03-02T08:00:00', '2026-03-02T17:00:00'));
    const named = readMspdi(
      mspdiXml({ calendars: calendar(2, 'Night') + calendar(1, 'Standard'), tasks }),
      uid,
    );
    expect(named.model.project.defaultCalendarId).toBe('1');
    expect(named.model.activities[0]!.calendarId).toBe('1');
    const first = readMspdi(
      mspdiXml({ calendars: calendar(3, 'Day') + calendar(4, 'Night'), tasks }),
      uid,
    );
    expect(first.model.project.defaultCalendarId).toBe('3');
    expect(first.model.calendars.map((c) => [c.id, c.kind])).toEqual([
      ['3', 'project'],
      ['4', 'global'],
    ]);
  });

  it('reports bad characters in the values codes are read from and in the project name', () => {
    const text1 = (value: string) =>
      `<ExtendedAttribute><FieldID>188743731</FieldID><Value>${value}</Value></ExtendedAttribute>`;
    const work = day('2026-03-02T08:00:00', '2026-03-02T17:00:00');
    const tasks = [
      `<Task><UID>1</UID><ID>1</ID><Name>Phase</Name><Summary>1</Summary><OutlineLevel>1</OutlineLevel><OutlineNumber>&#xD800;</OutlineNumber></Task>`,
      `<Task><UID>2</UID><ID>A&#0;</ID><Name>Task 2</Name><OutlineLevel>2</OutlineLevel><OutlineNumber>1.1</OutlineNumber>${work}${text1('K&#0;2')}</Task>`,
      `<Task><UID>3&#x110000;</UID><ID>B</ID><Name>Task 3</Name><OutlineLevel>2</OutlineLevel><OutlineNumber>1.2</OutlineNumber>${work}${text1('K-3')}</Task>`,
    ].join('');
    const xml = mspdiXml({ project: '<Name>Dep&#0;ot</Name>', tasks });
    const bad = (issues: { code: string; location: string | null; original: string | null }[]) =>
      issues.filter((i) => i.code === 'XML_BAD_CHARACTER').map((i) => [i.location, i.original]);
    const byText = readMspdi(xml, { activityCodeField: 'Text1' });
    expect(byText.model.project.name).toBe('Dep�ot');
    expect(byText.sourceProject.name).toBe('Dep�ot');
    expect(byText.model.wbs.map((w) => w.code)).toEqual(['�']);
    expect(byText.model.activities.map((a) => a.code)).toEqual(['K�2', 'K-3']);
    expect(bad(byText.issues)).toEqual([
      ['Task UID 1', '&#xD800;'],
      ['Task UID 2', '&#0;'],
      ['Task UID 3�', '&#x110000;'],
      [null, '&#0;'],
    ]);
    expect(byText.counts.map((c) => c.adjusted)).toEqual([0, 1, 2, 0]);
    const byId = readMspdi(xml, { activityCodeField: 'ID' });
    expect(byId.model.activities.map((a) => a.code)).toEqual(['A�', 'B']);
    expect(bad(byId.issues)).toEqual(bad(byText.issues));
    expect(byId.counts.map((c) => c.adjusted)).toEqual([0, 1, 2, 0]);
    const byUid = readMspdi(xml, uid);
    expect(byUid.model.activities.map((a) => a.code)).toEqual(['2', '3�']);
    expect(bad(byUid.issues)).toEqual([
      ['Task UID 1', '&#xD800;'],
      ['Task UID 3�', '&#x110000;'],
      [null, '&#0;'],
    ]);
    expect(byUid.counts.map((c) => c.adjusted)).toEqual([0, 1, 1, 0]);
  });

  it('keys calendars by their decoded UID and reports bad characters in it', () => {
    const calendar = (uidText: string, name: string, base?: string) =>
      `<Calendar><UID>${uidText}</UID><Name>${name}</Name>${base === undefined ? '<IsBaseCalendar>1</IsBaseCalendar>' : `<IsBaseCalendar>0</IsBaseCalendar><BaseCalendarUID>${base}</BaseCalendarUID>`}<WeekDays><WeekDay><DayType>2</DayType><DayWorking>1</DayWorking><WorkingTimes><WorkingTime><FromTime>&#48;8:00:00</FromTime><ToTime>17:00:00</ToTime></WorkingTime></WorkingTimes></WeekDay></WeekDays></Calendar>`;
    const work = day('2026-03-02T08:00:00', '2026-03-02T17:00:00');
    const referenced = readMspdi(
      mspdiXml({
        calendars: calendar('&#49;', 'Standard') + calendar('2', 'Crew', '1'),
        tasks: task(1, `${work}<CalendarUID>2</CalendarUID>`),
      }),
      uid,
    );
    expect(referenced.issues).toEqual([]);
    expect(referenced.model.calendars.map((c) => [c.id, c.kind, c.week[1]])).toEqual([
      ['1', 'project', [{ start: 480, finish: 1020 }]],
      ['2', 'global', [{ start: 480, finish: 1020 }]],
    ]);
    expect(referenced.model.activities[0]!.calendarId).toBe('2');
    expect(referenced.counts[0]).toEqual({
      entity: 'calendar',
      read: 2,
      accepted: 2,
      adjusted: 0,
      skipped: 0,
    });
    const bad = readMspdi(
      mspdiXml({
        calendars: calendar('1&#0;', 'Standard'),
        tasks: task(1, `${work}<CalendarUID>1&#0;</CalendarUID>`),
      }),
      uid,
    );
    expect(bad.model.calendars.map((c) => c.id)).toEqual(['1�']);
    expect(bad.model.project.defaultCalendarId).toBe('1�');
    expect(bad.model.activities[0]!.calendarId).toBe('1�');
    expect(bad.issues.map((i) => [i.code, i.location, i.original])).toEqual([
      ['XML_BAD_CHARACTER', 'Calendar UID 1�', '&#0;'],
    ]);
    expect(bad.counts[0]).toEqual({
      entity: 'calendar',
      read: 1,
      accepted: 1,
      adjusted: 1,
      skipped: 0,
    });
  });

  it('reports bad characters in the settings, the format version and external link targets once each, without a location', () => {
    const work = day('2026-03-02T08:00:00', '2026-03-02T17:00:00');
    const tasks = [
      task(
        1,
        `<ExternalTask>1</ExternalTask><ExternalTaskProject>Pl&#xD800;ant.mpp</ExternalTaskProject>${work}`,
      ),
      task(
        2,
        `${work}${link(9, 1, '<CrossProject>1</CrossProject><CrossProjectName>Ot&#0;her</CrossProjectName>')}${link(1, 1)}<PredecessorLink><PredecessorUID>8&#xDFFF;</PredecessorUID><Type>1</Type><CrossProject>1</CrossProject></PredecessorLink>`,
      ),
    ].join('');
    const xml = mspdiXml({ tasks }).replace(
      '<SaveVersion>14</SaveVersion>',
      '<SaveVersion>14&#0;</SaveVersion><DefaultStartTime>08:00&#0;</DefaultStartTime>',
    );
    const result = readMspdi(xml, uid);
    expect(result.formatVersion).toBe('14�');
    expect(result.model.settings).toEqual([
      { key: 'CalendarUID', value: '1' },
      { key: 'MinutesPerDay', value: '480' },
      { key: 'DefaultStartTime', value: '08:00�' },
    ]);
    expect(result.externalLinks).toEqual([
      { target: 'Ot�her', links: 1 },
      { target: 'Pl�ant.mpp', links: 1 },
      { target: '8�', links: 1 },
    ]);
    expect(
      result.issues
        .filter((i) => i.code === 'XML_BAD_CHARACTER')
        .map((i) => [i.location, i.original]),
    ).toEqual([
      [null, '&#0;'],
      [null, '&#xD800;'],
      [null, '&#xDFFF;'],
    ]);
    expect(codes(result.issues)).toEqual([
      'MSPDI_EXTERNAL_LINK',
      'MSPDI_EXTERNAL_LINK',
      'MSPDI_EXTERNAL_LINK',
      'MSPDI_EXTERNAL_TASK',
      'XML_BAD_CHARACTER',
      'XML_BAD_CHARACTER',
      'XML_BAD_CHARACTER',
    ]);
    expect(result.counts.map((c) => c.adjusted)).toEqual([0, 0, 0, 0]);
  });

  it('reports links stored on an external task to a task in the file as links outside the file', () => {
    const work = day('2026-03-02T08:00:00', '2026-03-02T17:00:00');
    const tasks = [
      `<Task><UID>1</UID><ID>1</ID><Name>Phase</Name><Summary>1</Summary><OutlineLevel>1</OutlineLevel><OutlineNumber>1</OutlineNumber></Task>`,
      `<Task><UID>2</UID><ID>2</ID><Name>Task 2</Name><OutlineLevel>2</OutlineLevel><OutlineNumber>1.1</OutlineNumber>${work}</Task>`,
      task(3, `<Active>0</Active>${work}`),
      // Links to the inactive task, another external task, an unknown UID and another project
      // have no end kept from this file and go with the external task.
      task(
        4,
        `<ExternalTask>1</ExternalTask><ExternalTaskProject>Other.mpp</ExternalTaskProject>${work}${link(2, 1)}${link(1, 1)}${link(3, 1)}${link(5, 1)}${link(99, 1)}${link(2, 1, '<CrossProject>1</CrossProject><CrossProjectName>Third.mpp\\7</CrossProjectName>')}`,
      ),
      task(5, `<ExternalTask>1</ExternalTask>${work}${link(2, 1)}`),
      `<Task><UID>6</UID><ID>6</ID><Name>Plant works</Name><Summary>1</Summary><IsSubproject>1</IsSubproject><OutlineLevel>1</OutlineLevel><OutlineNumber>4</OutlineNumber>${link(2, 3)}</Task>`,
    ].join('');
    const result = readMspdi(mspdiXml({ tasks }), uid);
    expect(result.model.activities.map((a) => a.code)).toEqual(['2']);
    expect(result.model.relationships).toEqual([]);
    expect(
      result.issues
        .filter((i) => i.code.endsWith('_LINK'))
        .map((i) => [i.code, i.location, i.message]),
    ).toEqual([
      [
        'MSPDI_EXTERNAL_LINK',
        'Task UID 4',
        'The link to Other.mpp points outside this file and was skipped.',
      ],
      [
        'MSPDI_SUMMARY_LINK',
        'Task UID 4',
        "The link on summary task Phase was skipped. Summary tasks can't have links.",
      ],
      [
        'MSPDI_EXTERNAL_LINK',
        'Task UID 5',
        'The link to Task 5 points outside this file and was skipped.',
      ],
      [
        'MSPDI_EXTERNAL_LINK',
        'Task UID 6',
        'The link to Plant works points outside this file and was skipped.',
      ],
    ]);
    expect(result.externalLinks).toEqual([
      { target: 'Other.mpp', links: 1 },
      { target: 'Task 5', links: 1 },
      { target: 'Plant works', links: 1 },
    ]);
    expect(codes(result.issues)).toEqual([
      'MSPDI_EXTERNAL_LINK',
      'MSPDI_EXTERNAL_LINK',
      'MSPDI_EXTERNAL_LINK',
      'MSPDI_EXTERNAL_TASK',
      'MSPDI_EXTERNAL_TASK',
      'MSPDI_EXTERNAL_TASK',
      'MSPDI_INACTIVE_TASK',
      'MSPDI_SUMMARY_LINK',
    ]);
    expect(result.counts.slice(1)).toEqual([
      { entity: 'wbs', read: 2, accepted: 1, adjusted: 0, skipped: 1 },
      { entity: 'activity', read: 4, accepted: 1, adjusted: 0, skipped: 3 },
      { entity: 'relationship', read: 4, accepted: 0, adjusted: 0, skipped: 4 },
    ]);
  });

  it('keeps slack, early and late dates, the GUID and the remaining duration as written', () => {
    const tasks =
      task(
        1,
        `${dates('2026-03-02T08:00:00', '2026-03-03T17:00:00')}<Duration>PT16H0M0S</Duration><RemainingDuration>PT4H30M0S</RemainingDuration><GUID>6F1C2A3B-0D4E-4F50-8A61-72B3C4D5E6F7</GUID><EarlyStart>2026-03-02T13:00:00</EarlyStart><EarlyFinish>2026-03-04T12:00:00</EarlyFinish><LateStart>2026-03-04T08:00:00</LateStart><LateFinish>2026-03-05T17:00:00</LateFinish><TotalSlack>-4800</TotalSlack><FreeSlack>2400</FreeSlack>`,
      ) + task(2, day('2026-03-04T08:00:00', '2026-03-04T17:00:00'));
    const result = readMspdi(mspdiXml({ tasks }), uid);
    const kept = (a: ImportActivity) => ({
      keys: a.keys,
      remainingDuration: a.remainingDuration,
      early: a.early,
      late: a.late,
      totalFloat: a.totalFloat,
      freeFloat: a.freeFloat,
    });
    // TotalSlack and FreeSlack are tenths of a minute; early and late dates fall back to the
    // task's start and finish.
    expect(result.model.activities.map(kept)).toEqual([
      {
        keys: { taskId: null, uid: '1', guid: '6F1C2A3B-0D4E-4F50-8A61-72B3C4D5E6F7' },
        remainingDuration: 270,
        early: { start: '2026-03-02T13:00', finish: '2026-03-04T12:00' },
        late: { start: '2026-03-04T08:00', finish: '2026-03-05T17:00' },
        totalFloat: -480,
        freeFloat: 240,
      },
      {
        keys: { taskId: null, uid: '2', guid: null },
        remainingDuration: null,
        early: { start: '2026-03-04T08:00', finish: '2026-03-04T17:00' },
        late: { start: '2026-03-04T08:00', finish: '2026-03-04T17:00' },
        totalFloat: null,
        freeFloat: null,
      },
    ]);
    expect(result.issues).toEqual([]);
  });

  it('never links a predecessor without a UID to a task without one', () => {
    const tasks =
      `<Task><ID>1</ID><Name>Lost</Name><OutlineLevel>1</OutlineLevel>${day('2026-03-02T08:00:00', '2026-03-02T17:00:00')}</Task>` +
      task(
        2,
        `${day('2026-03-03T08:00:00', '2026-03-03T17:00:00')}<PredecessorLink><Type>1</Type></PredecessorLink>`,
      );
    const result = readMspdi(mspdiXml({ tasks }), uid);
    expect(result.model.relationships).toEqual([]);
    expect(
      result.issues.filter((i) => i.code.startsWith('LINK_')).map((i) => [i.code, i.location]),
    ).toEqual([['LINK_UNKNOWN_ACTIVITY', 'Task UID 2']]);
    expect(result.counts[3]).toEqual({
      entity: 'relationship',
      read: 1,
      accepted: 0,
      adjusted: 0,
      skipped: 1,
    });
  });

  it('shortens codes, names and notes without splitting a character made of two code units (§5.10)', () => {
    const text1 = `<ExtendedAttribute><FieldID>188743731</FieldID><Value>${'K'.repeat(39)}😀</Value></ExtendedAttribute>`;
    const tasks = task(
      1,
      `${day('2026-03-02T08:00:00', '2026-03-02T17:00:00')}${text1}<Notes>${'n'.repeat(3999)}😀</Notes>`,
    ).replace('<Name>Task 1</Name>', `<Name>${'a'.repeat(254)}😀</Name>`);
    const result = readMspdi(mspdiXml({ tasks }), { activityCodeField: 'Text1' });
    const [activity] = result.model.activities;
    expect([activity!.code, activity!.name, activity!.notes]).toEqual([
      'K'.repeat(39),
      'a'.repeat(254),
      'n'.repeat(3999),
    ]);
    expect(result.issues.map((i) => i.message)).toEqual([
      `The code of ${'K'.repeat(39)}😀 was longer than 40 characters and was shortened.`,
      `The name of ${'K'.repeat(39)} was longer than 255 characters and was shortened.`,
      `The notes of ${'K'.repeat(39)} was longer than 4,000 characters and was shortened.`,
    ]);
  });
});

describe('readMspdi calendar problems (§5.5)', () => {
  const work = `${dates('2026-03-02T08:00:00', '2026-03-02T17:00:00')}<Duration>PT8H0M0S</Duration>`;
  const calendar = (
    uidValue: number,
    name: string,
    baseUid: number | null,
    from = '08:00',
    to = '17:00',
  ) =>
    `<Calendar><UID>${uidValue}</UID><Name>${name}</Name>${baseUid === null ? '<IsBaseCalendar>1</IsBaseCalendar>' : `<IsBaseCalendar>0</IsBaseCalendar><BaseCalendarUID>${baseUid}</BaseCalendarUID>`}<WeekDays><WeekDay><DayType>2</DayType><DayWorking>1</DayWorking><WorkingTimes><WorkingTime><FromTime>${from}:00</FromTime><ToTime>${to}:00</ToTime></WorkingTime></WorkingTimes></WeekDay></WeekDays></Calendar>`;
  const standard = calendar(1, 'Standard', null);
  // Its working time ends before it starts: it can't be read.
  const night = calendar(2, 'Night', null, '22:00', '06:00');
  const nightCrew = calendar(3, 'Night crew', 2);
  const orphan = calendar(4, 'Orphan crew', 42);
  const read = (calendars: string, calendarUid: number | null, projectCalendar = 1) =>
    readMspdi(
      mspdiXml({
        calendars,
        tasks: task(
          1,
          `${work}${calendarUid === null ? '' : `<CalendarUID>${calendarUid}</CalendarUID>`}`,
        ),
      }).replace('<CalendarUID>1</CalendarUID>', `<CalendarUID>${projectCalendar}</CalendarUID>`),
      uid,
    );
  const problems = (result: ReturnType<typeof readMspdi>) =>
    result.issues.map((i) => [i.code, i.severity, i.location]);

  it('skips a calendar nothing uses that cannot be read, with a warning', () => {
    const unused = read(standard + night + nightCrew + orphan, null);
    expect(problems(unused)).toEqual([
      ['CALENDAR_UNUSED_SKIPPED', 'warning', 'Calendar UID 2'],
      ['CALENDAR_UNUSED_SKIPPED', 'warning', 'Calendar UID 3'],
      ['CALENDAR_UNUSED_SKIPPED', 'warning', 'Calendar UID 4'],
    ]);
    expect(unused.issues[0]!.message).toBe(
      "Calendar Night couldn't be read completely. Nothing uses it, so it was skipped.",
    );
    expect(unused.model.calendars.map((c) => c.id)).toEqual(['1']);
    expect(unused.counts[0]).toEqual({
      entity: 'calendar',
      read: 4,
      accepted: 1,
      adjusted: 0,
      skipped: 3,
    });
  });

  it('stops on a calendar a task, a derived calendar or the project uses that cannot be read, or whose base is missing', () => {
    expect(problems(read(standard + night, 2))).toEqual([
      ['CALENDAR_UNREADABLE', 'error', 'Calendar UID 2'],
    ]);
    expect(read(standard + night, 2).issues[0]!.message).toBe(
      "Calendar Night couldn't be read, and dates that use it would be wrong. Fix it in your planning tool and export again.",
    );
    expect(problems(read(standard + night + nightCrew, 3))).toEqual([
      ['CALENDAR_UNREADABLE', 'error', 'Calendar UID 2'],
      ['CALENDAR_UNREADABLE', 'error', 'Calendar UID 3'],
    ]);
    expect(problems(read(standard + night, null, 2))).toEqual([
      ['CALENDAR_UNREADABLE', 'error', 'Calendar UID 2'],
    ]);
    const missingBase = read(standard + orphan, 4);
    expect(missingBase.issues.map((i) => [i.code, i.severity, i.location, i.original])).toEqual([
      ['CALENDAR_BASE_MISSING', 'error', 'Calendar UID 4', '42'],
    ]);
    expect(missingBase.issues[0]!.message).toBe(
      "Calendar Orphan crew is based on a calendar that isn't in the file. Export the file with that calendar included.",
    );
  });
});
