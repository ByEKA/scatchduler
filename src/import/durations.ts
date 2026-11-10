import { foldForMatch } from '@/lib/search';
import { parseNumber } from './numbers';

// Table durations (P3 core spec §5.4): a number with an optional unit, spaces allowed, English or
// Turkish. Working units: a day is hoursPerDay hours, a week 5 days, a month 20 days. An `e` before
// the unit is elapsed time: a day is 1,440 minutes, a week 7 days, a month 30 days. A trailing `?`
// (Microsoft Project's estimate mark) is dropped and reported by the caller.

export type DurationResult =
  | { kind: 'empty' }
  | { kind: 'invalid' }
  | { kind: 'ok'; minutes: number; elapsed: boolean; estimated: boolean };

export interface DurationOptions {
  unit: 'days' | 'hours';
  hoursPerDay: number;
  decimal: ',' | '.';
}

type Unit = 'minute' | 'hour' | 'day' | 'week' | 'month';

// Folded with foldForMatch, so 'gün' is 'gun'. 'mins', 'minute', 'minutes', 'dy' and 'dys' are D50.
const UNITS: ReadonlyMap<string, Unit> = new Map<string, Unit>([
  ...['m', 'min', 'mins', 'minute', 'minutes', 'dk', 'dakika'].map(
    (word) => [word, 'minute'] as const,
  ),
  ...['h', 'hr', 'hrs', 'hour', 'hours', 'sa', 'saat'].map((word) => [word, 'hour'] as const),
  ...['d', 'dy', 'dys', 'day', 'days', 'g', 'gun'].map((word) => [word, 'day'] as const),
  ...['w', 'wk', 'wks', 'week', 'weeks', 'hf', 'hafta'].map((word) => [word, 'week'] as const),
  ...['mo', 'mon', 'mons', 'month', 'months', 'ay'].map((word) => [word, 'month'] as const),
]);

const DAY_MINUTES = 1440;

function unitMinutes(unit: Unit, elapsed: boolean, hoursPerDay: number): number {
  const day = elapsed ? DAY_MINUTES : hoursPerDay * 60;
  switch (unit) {
    case 'minute':
      return 1;
    case 'hour':
      return 60;
    case 'day':
      return day;
    case 'week':
      return (elapsed ? 7 : 5) * day;
    case 'month':
      return (elapsed ? 30 : 20) * day;
  }
}

const DURATION = /^(\d[\d.,]*|[.,]\d+)\s*(.*)$/s;

export function parseDuration(text: string, options: DurationOptions): DurationResult {
  let value = text.trim();
  if (value === '') return { kind: 'empty' };
  const estimated = value.endsWith('?');
  if (estimated) value = value.slice(0, -1).trimEnd();

  const match = DURATION.exec(value);
  if (!match) return { kind: 'invalid' };
  const amount = parseNumber(match[1] ?? '', options.decimal);
  if (amount === null || !Number.isFinite(amount)) return { kind: 'invalid' };

  const word = foldForMatch(match[2] ?? '');
  let unit: Unit;
  let elapsed = false;
  if (word === '') {
    unit = options.unit === 'hours' ? 'hour' : 'day';
  } else {
    const working = UNITS.get(word);
    const elapsedUnit = word.startsWith('e') ? UNITS.get(word.slice(1).trimStart()) : undefined;
    if (working) unit = working;
    else if (elapsedUnit) {
      unit = elapsedUnit;
      elapsed = true;
    } else return { kind: 'invalid' };
  }

  const minutes = Math.round(amount * unitMinutes(unit, elapsed, options.hoursPerDay));
  return { kind: 'ok', minutes, elapsed, estimated };
}
