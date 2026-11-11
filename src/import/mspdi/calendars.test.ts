import { describe, expect, it } from 'vitest';
import { XMLParser } from 'fast-xml-parser';
import { readMspdiCalendars } from '@/import/mspdi/calendars';

const parse = (xml: string) =>
  (
    new XMLParser({
      parseTagValue: false,
      processEntities: false,
      ignoreAttributes: true,
      isArray: (n: string) => ['Calendar', 'WeekDay', 'WorkingTime', 'Exception'].includes(n),
    }).parse(`<Calendars>${xml}</Calendars>`) as { Calendars: { Calendar: unknown[] } }
  ).Calendars.Calendar;
const weekDay = (type: number, working: boolean, times = '') =>
  `<WeekDay><DayType>${type}</DayType><DayWorking>${working ? 1 : 0}</DayWorking>${times ? `<WorkingTimes>${times}</WorkingTimes>` : ''}</WeekDay>`;
const time = (from: string, to: string) =>
  `<WorkingTime><FromTime>${from}:00</FromTime><ToTime>${to}:00</ToTime></WorkingTime>`;
const base = `<Calendar><UID>1</UID><Name>Standard</Name><IsBaseCalendar>1</IsBaseCalendar><WeekDays>${weekDay(1, false)}${[2, 3, 4, 5, 6].map((d) => weekDay(d, true, time('08:00', '12:00') + time('13:00', '17:00'))).join('')}${weekDay(7, false)}</WeekDays></Calendar>`;
const span = { start: '2026-03-02', finish: '2026-04-10' };

describe('readMspdiCalendars', () => {
  it('inherits weekdays and exceptions down a derived chain, cycle-safe', () => {
    const derived = `<Calendar><UID>2</UID><Name>Saturday crew</Name><IsBaseCalendar>0</IsBaseCalendar><BaseCalendarUID>1</BaseCalendarUID><WeekDays>${weekDay(7, true, time('08:00', '12:00'))}</WeekDays></Calendar>`;
    const looped = `<Calendar><UID>3</UID><Name>Loop A</Name><IsBaseCalendar>0</IsBaseCalendar><BaseCalendarUID>4</BaseCalendarUID></Calendar><Calendar><UID>4</UID><Name>Loop B</Name><IsBaseCalendar>0</IsBaseCalendar><BaseCalendarUID>3</BaseCalendarUID></Calendar>`;
    const { calendars, unreadable } = readMspdiCalendars(parse(base + derived + looped), span);
    expect(calendars.get('2')!.week[6]).toEqual([{ start: 480, finish: 720 }]);
    expect(calendars.get('2')!.week[1]).toEqual([
      { start: 480, finish: 720 },
      { start: 780, finish: 1020 },
    ]);
    expect([...unreadable].sort()).toEqual(['3', '4']);
  });

  it('expands weekly and yearly recurrences up to 10,000 dates and reports what it cannot read', () => {
    const exception = (inner: string) =>
      `<Calendar><UID>5</UID><Name>Holidays</Name><IsBaseCalendar>0</IsBaseCalendar><BaseCalendarUID>1</BaseCalendarUID><Exceptions><Exception>${inner}</Exception></Exceptions></Calendar>`;
    const weekly = exception(
      '<EnteredByOccurrences>0</EnteredByOccurrences><TimePeriod><FromDate>2026-03-06T00:00:00</FromDate><ToDate>2026-03-27T23:59:00</ToDate></TimePeriod><Type>6</Type><Period>1</Period><DaysOfWeek>32</DaysOfWeek><DayWorking>0</DayWorking>',
    );
    expect(
      readMspdiCalendars(parse(base + weekly), span)
        .calendars.get('5')!
        .exceptions.map((e) => e.date),
    ).toEqual(['2026-03-06', '2026-03-13', '2026-03-20', '2026-03-27']);
    const yearly = exception(
      '<EnteredByOccurrences>0</EnteredByOccurrences><TimePeriod><FromDate>2026-01-01T00:00:00</FromDate><ToDate>2049-12-31T23:59:00</ToDate></TimePeriod><Type>2</Type><Month>0</Month><MonthDay>1</MonthDay><DayWorking>0</DayWorking>',
    );
    expect(
      readMspdiCalendars(parse(base + yearly), span)
        .calendars.get('5')!
        .exceptions.map((e) => e.date)
        .slice(0, 2),
    ).toEqual(['2027-01-01', '2028-01-01']);
    const daily = exception(
      '<EnteredByOccurrences>0</EnteredByOccurrences><TimePeriod><FromDate>2026-01-01T00:00:00</FromDate><ToDate>2060-12-31T23:59:00</ToDate></TimePeriod><Type>1</Type><Period>1</Period><DayWorking>0</DayWorking>',
    );
    const capped = readMspdiCalendars(parse(base + daily), {
      start: '2026-03-02',
      finish: '2036-04-10',
    });
    expect(capped.calendars.get('5')!.exceptions).toHaveLength(10000);
    expect(capped.issues.map((i) => i.code)).toEqual(['CALENDAR_RECURRENCE_CAPPED']);
    expect(capped.issues[0]!.message).toBe(
      'Calendar Holidays repeats an exception more than 10,000 times. Dates after 2053-07-17 were left out.',
    );
    const odd = readMspdiCalendars(
      parse(base + exception('<Type>99</Type><DayWorking>0</DayWorking>')),
      span,
    );
    expect([...odd.unreadable]).toEqual(['5']);
    expect(odd.issues.map((i) => i.code)).toEqual(['CALENDAR_RECURRENCE_UNSUPPORTED']);
  });

  it('expands yearly by position, monthly by day and monthly by position recurrences, and counts occurrences from their first date', () => {
    const datesOf = (inner: string) =>
      readMspdiCalendars(
        parse(
          `${base}<Calendar><UID>5</UID><Name>Holidays</Name><IsBaseCalendar>0</IsBaseCalendar><BaseCalendarUID>1</BaseCalendarUID><Exceptions><Exception>${inner}</Exception></Exceptions></Calendar>`,
        ),
        span,
      )
        .calendars.get('5')!
        .exceptions.map((e) => e.date);
    const recurrence = (
      from: string,
      to: string,
      type: number,
      fields: string,
      occurrences: number | null = null,
    ) =>
      `<EnteredByOccurrences>${occurrences === null ? 0 : 1}</EnteredByOccurrences>${occurrences === null ? '' : `<Occurrences>${occurrences}</Occurrences>`}<TimePeriod><FromDate>${from}T00:00:00</FromDate><ToDate>${to}T23:59:00</ToDate></TimePeriod><Type>${type}</Type>${fields}<DayWorking>0</DayWorking>`;
    const position = (item: number, at: number, period = 1) =>
      `<Period>${period}</Period><MonthItem>${item}</MonthItem><MonthPosition>${at}</MonthPosition>`;

    // Type 3, yearly by position: the last (4) Monday (4) of May (4), from years before the span.
    expect(
      datesOf(recurrence('2020-01-01', '2028-12-31', 3, `<Month>4</Month>${position(4, 4)}`)),
    ).toEqual(['2026-05-25', '2027-05-31', '2028-05-29']);
    // Type 4, monthly by day: the 31st in the months that have one, and every third month's 15th
    // from before the span.
    expect(
      datesOf(
        recurrence('2026-03-01', '2026-08-31', 4, '<Period>1</Period><MonthDay>31</MonthDay>'),
      ),
    ).toEqual(['2026-03-31', '2026-05-31', '2026-07-31', '2026-08-31']);
    expect(
      datesOf(
        recurrence('2024-01-15', '2026-12-31', 4, '<Period>3</Period><MonthDay>15</MonthDay>'),
      ),
    ).toEqual(['2026-04-15', '2026-07-15', '2026-10-15']);
    // Type 5, monthly by position: the last Friday (8), the second weekend day (2), and the first
    // weekday (1) of every other month from before the span.
    expect(datesOf(recurrence('2026-03-01', '2026-06-30', 5, position(8, 4)))).toEqual([
      '2026-03-27',
      '2026-04-24',
      '2026-05-29',
      '2026-06-26',
    ]);
    expect(datesOf(recurrence('2026-03-01', '2026-05-31', 5, position(2, 1)))).toEqual([
      '2026-03-07',
      '2026-04-05',
      '2026-05-03',
    ]);
    expect(datesOf(recurrence('2025-11-01', '2026-07-31', 5, position(1, 0, 2)))).toEqual([
      '2026-03-02',
      '2026-05-01',
      '2026-07-01',
    ]);
    // Counted recurrences count from their first date, before the span starts: the first day (0)
    // of five months from December, and six days from 26 February.
    expect(datesOf(recurrence('2025-12-01', '2026-12-31', 5, position(0, 0), 5))).toEqual([
      '2026-04-01',
    ]);
    expect(datesOf(recurrence('2026-02-26', '2026-12-31', 1, '<Period>1</Period>', 6))).toEqual([
      '2026-03-02',
      '2026-03-03',
    ]);
  });
});

describe('readMspdiCalendars (decisions D51, D57 and D58)', () => {
  it('reads BaseCalendarUID -1, 0 and -65533 as no base and reports any other missing base (D51)', () => {
    const rooted = (uid: number, baseUid: string) =>
      `<Calendar><UID>${uid}</UID><Name>Root ${uid}</Name><IsBaseCalendar>0</IsBaseCalendar><BaseCalendarUID>${baseUid}</BaseCalendarUID><WeekDays>${weekDay(2, true, time('07:00', '15:00'))}</WeekDays></Calendar>`;
    const result = readMspdiCalendars(
      parse(rooted(6, '-1') + rooted(7, '0') + rooted(8, '-65533') + rooted(9, '42')),
      span,
    );
    expect([...result.calendars.keys()]).toEqual(['6', '7', '8']);
    expect(result.calendars.get('7')!.week).toEqual([
      [],
      [{ start: 420, finish: 900 }],
      [],
      [],
      [],
      [],
      [],
    ]);
    expect([...result.unreadable]).toEqual(['9']);
    expect(result.issues.map((i) => [i.code, i.location])).toEqual([
      ['CALENDAR_BASE_MISSING', 'Calendar UID 9'],
    ]);
  });

  it('counts exception dates after inheritance and reports more than 100,000 (D57)', () => {
    const wide = { start: '2026-03-02', finish: '2036-04-10' };
    const holidays = `<Calendar><UID>1</UID><Name>Standard</Name><IsBaseCalendar>1</IsBaseCalendar><WeekDays>${weekDay(2, true, time('08:00', '12:00'))}</WeekDays><Exceptions><Exception><EnteredByOccurrences>0</EnteredByOccurrences><TimePeriod><FromDate>2026-03-02T00:00:00</FromDate><ToDate>2053-07-17T23:59:00</ToDate></TimePeriod><Type>1</Type><Period>1</Period><DayWorking>0</DayWorking></Exception></Exceptions></Calendar>`;
    const derived = (count: number) =>
      Array.from(
        { length: count },
        (_, i) =>
          `<Calendar><UID>${i + 10}</UID><Name>Crew ${i + 1}</Name><IsBaseCalendar>0</IsBaseCalendar><BaseCalendarUID>1</BaseCalendarUID></Calendar>`,
      ).join('');
    const atLimit = readMspdiCalendars(parse(holidays + derived(9)), wide);
    expect(atLimit.calendars.get('18')!.exceptions).toHaveLength(10000);
    expect(atLimit.issues).toEqual([]);
    const over = readMspdiCalendars(parse(holidays + derived(10)), wide);
    expect(over.issues.map((i) => i.code)).toEqual(['FILE_TOO_MANY_EXCEPTIONS']);
  });

  it('reads legacy exceptions only without an Exceptions element, 00:00 to 00:00 as the whole day, and skips exceptions without both dates (D58)', () => {
    const legacy =
      '<WeekDay><DayType>0</DayType><DayWorking>0</DayWorking><TimePeriod><FromDate>2026-03-10T00:00:00</FromDate><ToDate>2026-03-11T23:59:00</ToDate></TimePeriod></WeekDay>';
    const calendar = (inner: string) =>
      `<Calendar><UID>5</UID><Name>Site</Name><IsBaseCalendar>false</IsBaseCalendar><BaseCalendarUID>1</BaseCalendarUID>${inner}</Calendar>`;
    const exceptionsOf = (inner: string) =>
      readMspdiCalendars(parse(base + calendar(inner)), span).calendars.get('5')!.exceptions;
    expect(exceptionsOf(`<WeekDays>${legacy}</WeekDays>`).map((e) => e.date)).toEqual([
      '2026-03-10',
      '2026-03-11',
    ]);
    const roundTheClock = `<Exception><TimePeriod><FromDate>2026-03-20T00:00:00</FromDate><ToDate>2026-03-20T23:59:00</ToDate></TimePeriod><Type>1</Type><Period>1</Period><DayWorking>true</DayWorking><WorkingTimes>${time('00:00', '00:00')}</WorkingTimes></Exception>`;
    expect(
      exceptionsOf(`<WeekDays>${legacy}</WeekDays><Exceptions>${roundTheClock}</Exceptions>`),
    ).toEqual([{ date: '2026-03-20', periods: [{ start: 0, finish: 1440 }] }]);
    const undated =
      '<Exception><Type>1</Type><DayWorking>0</DayWorking></Exception><Exception><TimePeriod><FromDate>2026-03-24T00:00:00</FromDate></TimePeriod><Type>1</Type><DayWorking>0</DayWorking></Exception>';
    const repaired = readMspdiCalendars(
      parse(base + calendar(`<Exceptions>${undated}${roundTheClock}</Exceptions>`)),
      span,
    );
    expect(repaired.calendars.get('5')!.exceptions.map((e) => e.date)).toEqual(['2026-03-20']);
    expect(repaired.issues.map((i) => [i.code, i.location])).toEqual([
      ['CALENDAR_DATA_REPAIRED', 'Calendar UID 5'],
    ]);
  });

  it('skips an exception whose dates run backwards as damaged data, as one without both dates (D58)', () => {
    const backwards =
      '<Exception><TimePeriod><FromDate>2026-03-10T00:00:00</FromDate><ToDate>2026-03-05T23:59:00</ToDate></TimePeriod><Type>1</Type><Period>1</Period><DayWorking>0</DayWorking></Exception>';
    const sameDay =
      '<Exception><TimePeriod><FromDate>2026-03-12T08:00:00</FromDate><ToDate>2026-03-12T00:00:00</ToDate></TimePeriod><Type>1</Type><Period>1</Period><DayWorking>0</DayWorking></Exception>';
    const result = readMspdiCalendars(
      parse(
        `${base}<Calendar><UID>5</UID><Name>Site</Name><IsBaseCalendar>0</IsBaseCalendar><BaseCalendarUID>1</BaseCalendarUID><Exceptions>${backwards}${sameDay}</Exceptions></Calendar>`,
      ),
      span,
    );
    expect(result.calendars.get('5')!.exceptions.map((e) => e.date)).toEqual(['2026-03-12']);
    expect(result.issues.map((i) => [i.code, i.location])).toEqual([
      ['CALENDAR_DATA_REPAIRED', 'Calendar UID 5'],
    ]);
  });

  it('makes a calendar unreadable when a recurrence adds no date in 100,000 steps (D58)', () => {
    const never = `<Calendar><UID>5</UID><Name>Holidays</Name><IsBaseCalendar>0</IsBaseCalendar><BaseCalendarUID>1</BaseCalendarUID><Exceptions><Exception><EnteredByOccurrences>0</EnteredByOccurrences><TimePeriod><FromDate>2026-01-01T00:00:00</FromDate><ToDate>4100-12-31T23:59:00</ToDate></TimePeriod><Type>6</Type><Period>1</Period><DaysOfWeek>0</DaysOfWeek><DayWorking>0</DayWorking></Exception></Exceptions></Calendar>`;
    const short = readMspdiCalendars(parse(base + never), span);
    expect(short.calendars.get('5')!.exceptions).toEqual([]);
    expect(short.issues).toEqual([]);
    const wide = readMspdiCalendars(parse(base + never), {
      start: '2026-03-02',
      finish: '4090-12-31',
    });
    expect([...wide.unreadable]).toEqual(['5']);
    expect(wide.issues.map((i) => i.code)).toEqual(['CALENDAR_RECURRENCE_UNSUPPORTED']);
  });
});
