import {
  addDays,
  format,
  formatDistanceStrict,
  isBefore,
  isSameDay,
  parseISO,
  startOfDay,
} from 'date-fns';
import { RepositoryError } from '@/data/errors';
import type { ISODate, ISODateTime } from '@/data/types';

// Date-only values ('YYYY-MM-DD') go through parseISO, which reads them as local midnight.
// new Date('2026-10-12') reads them as UTC midnight, and that is still Oct 11 in the Americas.

export function greetingDate(now: Date): string {
  return format(now, 'EEEE, d MMMM yyyy');
}

export function shortDate(date: ISODate | null): string {
  return date === null ? '—' : format(parseISO(date), 'MMM d, yyyy');
}

/**
 * "3 minutes ago", "2 days ago". Takes `now` as an argument so components never read the clock.
 * `now` comes from a once-a-minute tick, so a record saved since the last tick is newer than it;
 * such instants read as `now` ("0 seconds ago") instead of "in 30 seconds".
 */
export function relativeTime(iso: ISODateTime, now: Date): string {
  const date = parseISO(iso);
  return formatDistanceStrict(date > now ? now : date, now, { addSuffix: true });
}

export function pluralize(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

export function fullName(person: { firstName: string; lastName: string }): string {
  return [person.firstName, person.lastName]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(' ');
}

function firstLetter(value: string): string {
  return Array.from(value.trim())[0] ?? '';
}

/** First letters of first and last name; else the first two letters of the email; else "?". */
export function initials(person: { firstName: string; lastName: string; email?: string }): string {
  const fromName = firstLetter(person.firstName) + firstLetter(person.lastName);
  if (fromName) return fromName.toUpperCase();
  const localPart = person.email?.trim().split('@')[0] ?? '';
  const fromEmail = Array.from(localPart).slice(0, 2).join('');
  return fromEmail ? fromEmail.toUpperCase() : '?';
}

/** "512 B" below 1 KB, then one decimal: "1.2 KB", "3.4 MB". */
export function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  let value = bytes / 1024;
  let unit = 'KB';
  for (const larger of ['MB', 'GB']) {
    // Steps up before rounding could print "1024.0 KB" (1 048 575 bytes reads "1.0 MB").
    if (Number(value.toFixed(1)) < 1024) break;
    value /= 1024;
    unit = larger;
  }
  return `${value.toFixed(1)} ${unit}`;
}

/** Due text for a task, compared as local calendar days; `null` when the task has no due date. */
export function dueLabel(
  dueDate: ISODate | null,
  now: Date,
): { text: string; overdue: boolean } | null {
  if (dueDate === null) return null;
  const date = parseISO(dueDate);
  if (isSameDay(date, now)) return { text: 'Due today', overdue: false };
  if (isSameDay(date, addDays(now, 1))) return { text: 'Due tomorrow', overdue: false };
  const day = format(date, 'MMM d');
  if (isBefore(date, startOfDay(now))) return { text: `Overdue · ${day}`, overdue: true };
  return { text: `Due ${day}`, overdue: false };
}

/** User-facing copy for an error from the data layer (spec §5.4). */
export function errorMessage(error: unknown): string {
  if (error instanceof RepositoryError) {
    if (error.code === 'network') {
      return "Can't reach the server. Check your connection and try again.";
    }
    if (error.code === 'conflict') return error.message;
  }
  return 'Something went wrong. Please try again.';
}
