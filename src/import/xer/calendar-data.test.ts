import { describe, expect, it } from 'vitest';
import { parseCalendarData } from '@/import/xer/calendar-data';

const day = (n: number, periods: string) => `(0||${n}()(${periods}))`;
const period = (s: string, f: string) => `(0||0(s|${s}|f|${f})())`;
const data = (days: string, exceptions = '') =>
  `(0||CalendarData()(\n(0||DaysOfWeek()(\n${days}))\n(0||Exceptions()(${exceptions}))))`;

describe('parseCalendarData', () => {
  it('reads the week, several periods a day, 24-hour and AM/PM times, and exceptions', () => {
    const week = [1, 2, 3, 4, 5, 6, 7]
      .map((n) =>
        n === 1 || n === 7
          ? day(n, '')
          : n === 2
            ? day(n, period('8:00 AM', '12:00 PM') + period('13:00', '17:00'))
            : day(n, period('08:00', '17:00')),
      )
      .join('\n');
    const parsed = parseCalendarData(
      data(week, '(0||0(d|46324)())(0||1(d|46325)((0||0(s|08:00|f|12:00)())))'),
    )!;
    expect(parsed.week[0]).toEqual([]);
    expect(parsed.week[1]).toEqual([
      { start: 480, finish: 720 },
      { start: 780, finish: 1020 },
    ]);
    expect(parsed.week[2]).toEqual([{ start: 480, finish: 1020 }]);
    expect(parsed.exceptions).toEqual([
      { date: '2026-10-29', periods: [] },
      { date: '2026-10-30', periods: [{ start: 480, finish: 720 }] },
    ]);
  });

  it('accepts 0x7F separators and answers null for data it cannot read', () => {
    const week = [1, 2, 3, 4, 5, 6, 7]
      .map((n) => day(n, n === 2 ? period('08:00', '17:00') : ''))
      .join('\x7f');
    expect(parseCalendarData(data(week).replaceAll('\n', '\x7f'))!.week[1]).toEqual([
      { start: 480, finish: 1020 },
    ]);
    expect(parseCalendarData('(0||CalendarData()((0||DaysOfWeek(')).toBeNull();
  });

  it('repairs known damage and says so (D53)', () => {
    const week = [1, 2, 3, 4, 5, 6, 7]
      .map((n) => day(n, n === 2 ? period('08:00', '17:00') : ''))
      .join('\n');
    const clean = parseCalendarData(data(week, '(0||0(d|46324)())'))!;
    expect(clean.repaired).toBe(false);

    // One stray ')' before Exceptions.
    const stray = parseCalendarData(
      `(0||CalendarData()((0||DaysOfWeek()(${week})))(0||Exceptions()((0||0(d|46324)())))))`,
    )!;
    expect(stray).toEqual({ ...clean, repaired: true });

    // The same stray ')' with the closing ')' at the end missing: Exceptions is still read.
    const balanced = parseCalendarData(
      `(0||CalendarData()((0||DaysOfWeek()(${week})))(0||Exceptions()((0||0(d|46324)()))))`,
    )!;
    expect(balanced).toEqual({ ...clean, repaired: true });

    // Several Exceptions containers, merged.
    const several = parseCalendarData(
      `(0||CalendarData()((0||DaysOfWeek()(${week}))(0||Exceptions()((0||0(d|46325)())))(0||Exceptions()((0||0(d|46324)())))))`,
    )!;
    expect(several).toMatchObject({ repaired: true });
    expect(several.exceptions.map((e) => e.date)).toEqual(['2026-10-29', '2026-10-30']);

    // A date listed twice: the working entry wins.
    const twice = parseCalendarData(
      data(week, '(0||0(d|46324)((0||0(s|08:00|f|12:00)())))(0||1(d|46324)())'),
    )!;
    expect(twice).toMatchObject({
      repaired: true,
      exceptions: [{ date: '2026-10-29', periods: [{ start: 480, finish: 720 }] }],
    });

    // Compact (s|…|f|…) periods and d|epoch(…) exception records.
    const compactWeek = [1, 2, 3, 4, 5, 6, 7]
      .map((n) => day(n, n === 2 ? '(s|08:00|f|12:00)(s|13:00|f|17:00)' : ''))
      .join('\n');
    const compact = parseCalendarData(
      data(compactWeek, '(0||d|46324()())(d|46325((s|08:00|f|12:00)))'),
    )!;
    expect(compact).toMatchObject({
      repaired: true,
      exceptions: [
        { date: '2026-10-29', periods: [] },
        { date: '2026-10-30', periods: [{ start: 480, finish: 720 }] },
      ],
    });
    expect(compact.week[1]).toEqual([
      { start: 480, finish: 720 },
      { start: 780, finish: 1020 },
    ]);
  });

  it('repairs a stray ")" only where it stands before Exceptions (D53)', () => {
    const workday = day(2, period('08:00', '17:00'));
    const week = [1, 2, 3, 4, 5, 6, 7].map((n) => (n === 2 ? workday : day(n, ''))).join('\n');
    // P6 writes a VIEW entry between DaysOfWeek and Exceptions.
    const withView = (days: string) =>
      `(0||CalendarData()(\n(0||DaysOfWeek()(\n${days}))\n(0||VIEW(ShowTotal|Y)())\n(0||Exceptions()((0||0(d|46324)())))))`;
    const clean = parseCalendarData(withView(week))!;
    expect(clean).toMatchObject({
      repaired: false,
      exceptions: [{ date: '2026-10-29', periods: [] }],
    });
    const stray = withView(week).replace('\n(0||Exceptions', ')\n(0||Exceptions');
    expect(parseCalendarData(stray)).toEqual({ ...clean, repaired: true });

    // An extra ')' at the end.
    expect(parseCalendarData(`${withView(week)})`)).toBeNull();
    expect(parseCalendarData(`${data(week, '(0||0(d|46324)())')})`)).toBeNull();
    // An extra ')' after a day inside DaysOfWeek, also with the final ')' missing.
    const extraInWeek = week.replace(workday, `${workday})`);
    expect(parseCalendarData(withView(extraInWeek))).toBeNull();
    expect(parseCalendarData(data(extraInWeek, '(0||0(d|46324)())'))).toBeNull();
    expect(parseCalendarData(withView(extraInWeek).slice(0, -1))).toBeNull();
  });

  it('reads more exception dates in one container than a call can take as arguments (D57)', () => {
    const week = [1, 2, 3, 4, 5, 6, 7]
      .map((n) => day(n, n === 2 ? period('08:00', '17:00') : ''))
      .join('\n');
    const entries = Array.from({ length: 130_000 }, (_, i) => `(0||${i}(d|${40000 + i})())`);
    const parsed = parseCalendarData(data(week, entries.join('')))!;
    expect(parsed.exceptions).toHaveLength(130_000);
    expect(parsed.exceptions[0]).toEqual({ date: '2009-07-06', periods: [] });
  });

  it('still refuses overlapping periods, seconds and 24:00 as a start (D53)', () => {
    const weekWith = (periods: string) =>
      [1, 2, 3, 4, 5, 6, 7].map((n) => day(n, n === 2 ? periods : '')).join('\n');
    expect(
      parseCalendarData(data(weekWith(period('08:00', '12:00') + period('11:00', '17:00')))),
    ).toBeNull();
    expect(parseCalendarData(data(weekWith(period('08:00:30', '17:00'))))).toBeNull();
    expect(parseCalendarData(data(weekWith(period('24:00', '24:00'))))).toBeNull();
    expect(parseCalendarData(data(weekWith(period('08:00:00', '24:00'))))!.week[1]).toEqual([
      { start: 480, finish: 1440 },
    ]);
  });
});
