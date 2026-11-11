import { parseDuration } from '../durations';
import { parseNumber } from '../numbers';

// The Predecessors cell (P3 core spec §5.7): tokens separated by ';' (or ',' when the decimal
// separator is '.'), each `<ref> [type] [lag]` with spaces allowed between the parts. The ref is
// an activity code or a Task ID (no spaces, no '+'); the type FS, SS, FF or SF (default FS, any
// case); the lag '+' or '-', a number and an optional duration unit (§5.4), or a percentage.
//
// A token can read in more than one way when a ref holds '-' or ends in a type's letters: "A-1"
// is the ref A-1, or A with a lag of -1; "ACCESS" is the ref ACCESS, or ACCE with type SS. The
// reader of a whole table knows the refs its file names, so it passes them and gets the longest
// ref the file names; without them, or when the file names none, the shortest ref is read.

export type PredecessorToken =
  | {
      ref: string;
      type: 'FS' | 'SS' | 'FF' | 'SF';
      lag: { minutes: number; elapsed: boolean } | { percent: number };
    }
  | { invalid: string };

export type PredecessorLink = Extract<PredecessorToken, { ref: string }>;

/** One token of a Predecessors cell and every way it reads, shortest ref first (none: unreadable). */
export interface PredecessorReadings {
  token: string;
  readings: PredecessorLink[];
}

export interface PredecessorOptions {
  decimal: ',' | '.';
  hoursPerDay: number;
  unit: 'days' | 'hours';
}

// The longest ref a token can have: no spaces and no '+'.
const REF = /^[^\s+]+/;
// What follows the ref: an optional type, then an optional lag.
const REST =
  /^\s*(FS|SS|FF|SF)?\s*(?:([+-])\s*(\d+(?:[.,]\d+)*|[.,]\d+)\s*(%|\p{L}+(?:\s\p{L}+)?)?)?$/iu;
// Where a shorter ref can end: before a type or a lag's sign.
const REF_END = /[fs-]/i;
// Longer tokens are never links; refusing them keeps the readings few.
const MAX_TOKEN_LENGTH = 200;

function noNegativeZero(value: number): number {
  return value === 0 ? 0 : value;
}

/** The token read with `ref` as its ref, or null when the rest isn't a type and a lag. */
function readAs(ref: string, rest: string, options: PredecessorOptions): PredecessorLink | null {
  const match = REST.exec(rest);
  if (!match) return null;
  const [, typeText, sign, amount, unit] = match;
  const type = (typeText?.toUpperCase() ?? 'FS') as PredecessorLink['type'];
  if (sign === undefined || amount === undefined) {
    return { ref, type, lag: { minutes: 0, elapsed: false } };
  }
  const direction = sign === '-' ? -1 : 1;
  if (unit === '%') {
    const percent = parseNumber(amount, options.decimal);
    if (percent === null || !Number.isFinite(percent)) return null;
    return { ref, type, lag: { percent: noNegativeZero(direction * percent) } };
  }
  const duration = parseDuration(unit === undefined ? amount : `${amount} ${unit}`, options);
  if (duration.kind !== 'ok' || duration.estimated) return null;
  return {
    ref,
    type,
    lag: { minutes: noNegativeZero(direction * duration.minutes), elapsed: duration.elapsed },
  };
}

function readingsOf(token: string, options: PredecessorOptions): PredecessorLink[] {
  if (token.length > MAX_TOKEN_LENGTH) return [];
  const longest = REF.exec(token)?.[0].length ?? 0;
  const readings: PredecessorLink[] = [];
  for (let length = 1; length <= longest; length += 1) {
    if (length < longest && !REF_END.test(token.charAt(length))) continue;
    const reading = readAs(token.slice(0, length), token.slice(length), options);
    if (reading !== null) readings.push(reading);
  }
  return readings;
}

/** The tokens of a Predecessors cell in order, each with every way it reads; an empty cell has none. */
export function predecessorReadings(
  cell: string,
  options: PredecessorOptions,
): PredecessorReadings[] {
  return cell
    .split(options.decimal === '.' ? /[;,]/ : /;/)
    .map((token) => token.trim())
    .filter((token) => token !== '')
    .map((token) => ({ token, readings: readingsOf(token, options) }));
}

/**
 * The reading of a token: the longest ref that `names` accepts, else the shortest ref; an
 * unreadable token is `{ invalid }`.
 */
export function chooseReading(
  { token, readings }: PredecessorReadings,
  names?: (ref: string) => boolean,
): PredecessorToken {
  if (names !== undefined) {
    for (let index = readings.length - 1; index >= 0; index -= 1) {
      const reading = readings[index];
      if (reading !== undefined && names(reading.ref)) return reading;
    }
  }
  return readings[0] ?? { invalid: token };
}

/**
 * The tokens of a Predecessors cell in order; an empty cell has none. `names`, when given, tells
 * the refs the file names, which a token that reads in more than one way prefers.
 */
export function parsePredecessors(
  cell: string,
  options: PredecessorOptions,
  names?: (ref: string) => boolean,
): PredecessorToken[] {
  return predecessorReadings(cell, options).map((token) => chooseReading(token, names));
}
