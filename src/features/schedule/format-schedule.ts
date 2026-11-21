import type { WallClock } from '@/data/schedule-types';

const DATE_PART_RE = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/;

/** Formats a civil wall-clock timestamp or ISO date as `DD.MM.YYYY`, or `'—'` when null (D6). */
export function formatScheduleDate(wc: WallClock | null): string {
  if (wc === null) return '—';
  const match = DATE_PART_RE.exec(wc);
  if (!match) return '—';
  return `${match[3]}.${match[2]}.${match[1]}`;
}

/**
 * Formats a civil wall-clock timestamp as `DD.MM.YYYY · HH:mm` when time is present,
 * `DD.MM.YYYY` for date-only strings, or `'—'` when null (D6).
 */
export function formatScheduleDateTime(wc: WallClock | null): string {
  if (wc === null) return '—';
  const match = DATE_PART_RE.exec(wc);
  if (!match) return '—';
  const date = `${match[3]}.${match[2]}.${match[1]}`;
  if (match[4] === undefined || match[5] === undefined) return date;
  return `${date} · ${match[4]}:${match[5]}`;
}

/**
 * Formats working minutes as working days using the activity calendar's `hoursPerDay`
 * (`'5 d'`, `'2.5 d'`, `'0 d'`; signed: `'+12 d'`, `'0 d'`, `'-3 d'`). Trailing `.0` is omitted.
 */
export function formatWorkingDays(
  minutes: number | null,
  hoursPerDay: number,
  options?: { signed?: boolean },
): string {
  if (minutes === null || !Number.isFinite(minutes)) return '—';
  const hpd = hoursPerDay > 0 ? hoursPerDay : 8;
  const days = minutes / (hpd * 60);
  const rounded = Math.round(days * 10) / 10;
  const normalized = rounded === 0 ? 0 : rounded;
  const abs = Math.abs(normalized);
  const numStr = Number.isInteger(abs) ? String(abs) : abs.toFixed(1);

  if (normalized === 0) return '0 d';
  if (normalized < 0) return `-${numStr} d`;
  return options?.signed ? `+${numStr} d` : `${numStr} d`;
}

/** Formats a 0–100 percent complete value, or `'—'` when null. */
export function formatPercent(percent: number | null): string {
  if (percent === null || !Number.isFinite(percent)) return '—';
  return `${Math.round(percent)}%`;
}
