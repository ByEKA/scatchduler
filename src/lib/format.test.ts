import { describe, expect, it } from 'vitest';
import { RepositoryError } from '@/data/errors';
import {
  dueLabel,
  errorMessage,
  fileSize,
  greetingDate,
  initials,
  pluralize,
  relativeTime,
  shortDate,
} from '@/lib/format';

const now = new Date(2026, 9, 14, 10, 0, 0); // local time (suite runs in America/Los_Angeles)

describe('format', () => {
  it('formats the greeting date', () => {
    expect(greetingDate(now)).toBe('Wednesday, 14 October 2026');
  });

  it('keeps the calendar day of date-only values', () => {
    expect(shortDate('2026-10-12')).toBe('Oct 12, 2026');
    expect(shortDate(null)).toBe('—');
  });

  it('formats relative times', () => {
    expect(relativeTime(new Date(2026, 9, 14, 9, 57).toISOString(), now)).toBe('3 minutes ago');
    expect(relativeTime(new Date(2026, 9, 12, 10, 0).toISOString(), now)).toBe('2 days ago');
  });

  it('pluralizes counts', () => {
    expect(pluralize(0, 'schedule')).toBe('0 schedules');
    expect(pluralize(1, 'schedule')).toBe('1 schedule');
    expect(pluralize(2, 'project')).toBe('2 projects');
  });

  it('builds initials with an email fallback', () => {
    expect(initials({ firstName: 'deniz', lastName: 'kaya' })).toBe('DK');
    expect(initials({ firstName: '', lastName: '', email: 'mert@example.com' })).toBe('ME');
  });

  it('formats file sizes', () => {
    expect(fileSize(512)).toBe('512 B');
    expect(fileSize(1229)).toBe('1.2 KB');
    expect(fileSize(3.4 * 1024 * 1024)).toBe('3.4 MB');
  });

  it('labels due dates against local calendar days', () => {
    expect(dueLabel(null, now)).toBeNull();
    expect(dueLabel('2026-10-14', now)).toEqual({ text: 'Due today', overdue: false });
    expect(dueLabel('2026-10-15', now)).toEqual({ text: 'Due tomorrow', overdue: false });
    expect(dueLabel('2026-10-20', now)).toEqual({ text: 'Due Oct 20', overdue: false });
    expect(dueLabel('2026-10-10', now)).toEqual({ text: 'Overdue · Oct 10', overdue: true });
  });

  it('maps errors to user-facing copy', () => {
    expect(errorMessage(new RepositoryError('network', 'x'))).toBe(
      "Can't reach the server. Check your connection and try again.",
    );
    expect(
      errorMessage(new RepositoryError('conflict', 'This ID is already used in this workspace')),
    ).toBe('This ID is already used in this workspace');
    expect(errorMessage(new Error('boom'))).toBe('Something went wrong. Please try again.');
  });

  it('uses strict wording and never reads a newer instant as future', () => {
    // useNow() ticks once a minute, so a record saved since the last tick is newer than `now`.
    expect(relativeTime(new Date(2026, 9, 14, 9, 59, 15).toISOString(), now)).toBe(
      '45 seconds ago',
    );
    expect(relativeTime(new Date(2026, 9, 14, 10, 0, 30).toISOString(), now)).toBe('0 seconds ago');
  });

  it('keeps one decimal from 1 KB up', () => {
    expect(fileSize(1024)).toBe('1.0 KB');
    expect(fileSize(1048575)).toBe('1.0 MB');
  });

  it('shows the generic copy for other repository errors', () => {
    expect(errorMessage(new RepositoryError('not_found', 'Project not found'))).toBe(
      'Something went wrong. Please try again.',
    );
  });
});
