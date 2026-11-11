import { describe, expect, it } from 'vitest';
import { standardCalendar, standardStartTime } from '@/import/calendars';
import { makeIssue } from '@/import/issues';

describe('standardCalendar', () => {
  it('starts at 08:00 up to 15 hours a day, and earlier for longer days so they end by 24:00 (D61)', () => {
    const monday = (hours: number) => standardCalendar(hours).week[1];
    expect(monday(4)).toEqual([{ start: 480, finish: 720 }]);
    expect(monday(4.005)).toEqual([{ start: 480, finish: 720 }]); // 240 minutes once rounded
    expect(monday(8)).toEqual([
      { start: 480, finish: 720 },
      { start: 780, finish: 1020 },
    ]);
    expect(monday(15)).toEqual([
      { start: 480, finish: 720 },
      { start: 780, finish: 1440 },
    ]);
    expect(monday(16)).toEqual([
      { start: 420, finish: 720 },
      { start: 780, finish: 1440 },
    ]);
    expect(monday(23.5)).toEqual([{ start: 30, finish: 1440 }]);
    expect(monday(24)).toEqual([{ start: 0, finish: 1440 }]);
    expect(standardCalendar(16).week[0]).toEqual([]);
    expect(standardCalendar(16).week[6]).toEqual([]);

    expect([8, 15, 16, 23.5, 24].map(standardStartTime)).toEqual([
      '08:00',
      '08:00',
      '07:00',
      '00:30',
      '00:00',
    ]);
    expect(
      makeIssue('CALENDAR_GENERATED_STANDARD', { start: standardStartTime(16), n: 16 }).message,
    ).toBe(
      'Calendar Standard was added as the default calendar: Monday to Friday from 07:00, 16 hours a day.',
    );
    expect(
      makeIssue('CALENDAR_GENERATED_FROM_NAME', {
        name: 'Night shift',
        start: standardStartTime(8),
        n: 8,
      }).message,
    ).toBe(
      'Calendar Night shift was made from its name with the standard week: Monday to Friday from 08:00, 8 hours a day.',
    );
  });
});
