import type { ISODate } from '@/data/types';
import { xerDayToIsoDate } from '../dates';
import type { Period } from '../model';

// P6's CALENDAR.clndr_data (P3 core spec §5.5): nested `(0||key(attributes)(children))` entries,
// separated by line breaks or 0x7F. `CalendarData` holds `DaysOfWeek` (days 1–7, 1 = Sunday, each
// with `(s|08:00|f|12:00)` periods) and `Exceptions` (`(d|<days since 1899-12-30>)` with their
// periods; none = non-working). Known damage is repaired and reported (D53): one stray `)` before
// `Exceptions`, several `Exceptions` containers, a date listed twice (the working entry wins), and
// compact `(s|…|f|…)` periods and `(d|<day>(…))` exception records written without the
// `0||n(…)(…)` wrapper. Anything else that doesn't read cleanly makes the calendar unreadable.

export interface CalendarData {
  week: Period[][]; // 7 entries, 0 = Sunday; [] = non-working day
  exceptions: Array<{ date: ISODate; periods: Period[] }>; // sorted by date; [] = non-working
  repaired: boolean; // known damage was repaired (D53)
}

/** A parenthesized group: the text before its first nested group, then the nested groups. */
interface Group {
  text: string;
  items: Group[];
}

const MAX_DEPTH = 64;
const SEPARATORS = /^[\s\x7f]*$/;
const EDGE_SEPARATORS = /^[\s\x7f]+|[\s\x7f]+$/g;

/** The single top-level group of `text`, or null when the parentheses don't nest cleanly. */
function parseTree(text: string): Group | null {
  const top: Group = { text: '', items: [] };
  const stack: Group[] = [top];
  let i = 0;
  while (i < text.length) {
    const char = text[i];
    if (char === '(') {
      let end = i + 1;
      while (end < text.length && text[end] !== '(' && text[end] !== ')') end += 1;
      const group: Group = { text: text.slice(i + 1, end).replace(EDGE_SEPARATORS, ''), items: [] };
      stack[stack.length - 1]!.items.push(group);
      stack.push(group);
      if (stack.length > MAX_DEPTH) return null;
      i = end;
    } else if (char === ')') {
      if (stack.length === 1) return null;
      stack.pop();
      let end = i + 1;
      while (end < text.length && text[end] !== '(' && text[end] !== ')') end += 1;
      // Between groups only separators may stand.
      if (!SEPARATORS.test(text.slice(i + 1, end))) return null;
      i = end;
    } else {
      // Before the first group.
      if (!SEPARATORS.test(char ?? '')) return null;
      i += 1;
    }
  }
  if (stack.length !== 1 || top.items.length !== 1) return null;
  return top.items[0] ?? null;
}

// One `)` too many right before `(0||Exceptions` closes CalendarData's children early.
const STRAY_BEFORE_EXCEPTIONS = /\)(?=[\s\x7f]*\([\s\x7f]*\d*\|\|Exceptions[\s\x7f]*\()/;

interface Reading {
  repaired: boolean;
}

/**
 * Appends `items` one by one: a group may hold more entries than a call takes as spread arguments
 * (about 125,000 in V8, fewer elsewhere), and a file must never make the parser throw (§5.2, D57).
 */
function append(target: Group[], items: readonly Group[]): void {
  for (const item of items) target.push(item);
}

/** The key of an entry: the text after `0||`, or the whole text for a compact record. */
function keyOf(group: Group): string {
  const separator = group.text.indexOf('||');
  return separator < 0 ? group.text : group.text.slice(separator + 2);
}

/**
 * The entries an entry holds: those of every group after its attributes; null when an entry stands
 * there itself, outside a children group. Given `stray`, an `Exceptions` entry may stand after the
 * children group: one stray `)` before it closed the group early and the final `)` is missing (only
 * CalendarData's entries are read this way; the reading counts as repaired).
 */
function childrenOf(group: Group, stray?: Reading): Group[] | null {
  const children: Group[] = [];
  let opened = false;
  for (const item of group.items.slice(1)) {
    if (item.text === '') {
      append(children, item.items);
      opened = true;
    } else if (stray && opened && keyOf(item) === 'Exceptions') {
      stray.repaired = true;
      children.push(item);
    } else {
      return null;
    }
  }
  return children;
}

/** How many entries in the whole tree are `DaysOfWeek` and `Exceptions` entries. */
function countContainers(root: Group): { daysOfWeek: number; exceptions: number } {
  const count = { daysOfWeek: 0, exceptions: 0 };
  const pending = [root];
  for (let k = 0; k < pending.length; k += 1) {
    const group = pending[k]!;
    const key = keyOf(group);
    if (key === 'DaysOfWeek') count.daysOfWeek += 1;
    else if (key === 'Exceptions') count.exceptions += 1;
    append(pending, group.items);
  }
  return count;
}

const TIME = /^(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s*([ap])\.?m\.?)?$/i;

/** Minutes from midnight; `24:00` only as a finish; non-zero seconds are unreadable. */
function readTime(text: string, role: 'start' | 'finish'): number | null {
  const match = TIME.exec(text.trim());
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2]);
  if (match[3] !== undefined && Number(match[3]) !== 0) return null;
  const meridiem = match[4]?.toLowerCase();
  if (meridiem !== undefined) {
    if (hour < 1 || hour > 12) return null;
    hour = (hour % 12) + (meridiem === 'p' ? 12 : 0);
  }
  if (minute > 59) return null;
  if (hour === 24 && minute === 0 && meridiem === undefined) return role === 'finish' ? 1440 : null;
  if (hour > 23) return null;
  return hour * 60 + minute;
}

/** `s|08:00|f|12:00` as a period; a finish of 00:00 is midnight at the end of the day. */
function readPeriod(attributes: string): Period | null {
  const parts = attributes.split('|');
  if (parts.length % 2 !== 0) return null;
  let start: number | null = null;
  let finish: number | null = null;
  for (let k = 0; k < parts.length; k += 2) {
    const name = parts[k]?.trim();
    const value = parts[k + 1] ?? '';
    if (name === 's') start = readTime(value, 'start');
    else if (name === 'f') finish = readTime(value, 'finish');
  }
  if (start === null || finish === null) return null;
  if (finish === 0) finish = 1440;
  return finish > start ? { start, finish } : null;
}

const COMPACT_PERIOD = /^s\|/;

/** A period written without its wrapper: `(s|08:00|f|12:00)`. */
function isCompactPeriod(group: Group): boolean {
  return COMPACT_PERIOD.test(group.text) && group.items.length === 0;
}

/** A period entry as P6 writes it: `(0||0(s|08:00|f|12:00)())`. */
function isPeriodEntry(group: Group): boolean {
  const attributes = group.items[0];
  return group.text.includes('||') && attributes !== undefined && isCompactPeriod(attributes);
}

/**
 * The periods held by `entries`: standard `(0||n(s|…|f|…)())` entries, or compact `(s|…|f|…)`
 * groups (repaired). Sorted; overlapping periods are unreadable.
 */
function readPeriods(entries: readonly Group[], reading: Reading): Period[] | null {
  const periods: Period[] = [];
  for (const entry of entries) {
    let period: Period | null;
    if (isCompactPeriod(entry)) {
      period = readPeriod(entry.text);
      reading.repaired = true;
    } else {
      const attributes = entry.items[0];
      if (!attributes || attributes.items.length > 0 || childrenOf(entry)?.length !== 0) {
        return null;
      }
      period = readPeriod(attributes.text);
    }
    if (!period) return null;
    periods.push(period);
  }
  periods.sort((a, b) => a.start - b.start);
  for (let k = 1; k < periods.length; k += 1) {
    if (periods[k]!.start < periods[k - 1]!.finish) return null;
  }
  return periods;
}

const DAY_KEY = /^[1-7]$/;
const DATE_ATTRIBUTE = /^d\|(\d+)$/;

function readWeek(daysOfWeek: Group, reading: Reading): Period[][] | null {
  const week: Array<Period[] | null> = [null, null, null, null, null, null, null];
  const days = childrenOf(daysOfWeek);
  if (!days) return null;
  for (const day of days) {
    const key = keyOf(day);
    if (!DAY_KEY.test(key)) return null;
    const index = Number(key) - 1;
    if (week[index] !== null) return null;
    const entries = childrenOf(day);
    const periods = entries && readPeriods(entries, reading);
    if (!periods) return null;
    week[index] = periods;
  }
  return week.map((periods) => periods ?? []);
}

/** Every entry below `group` that is a period, standard or compact. */
function periodEntries(group: Group): Group[] {
  const found: Group[] = [];
  const pending = [...group.items];
  for (let k = 0; k < pending.length; k += 1) {
    const item = pending[k]!;
    if (isCompactPeriod(item) || isPeriodEntry(item)) found.push(item);
    else append(pending, item.items);
  }
  return found;
}

/** One exception record: `(0||n(d|<day>)(periods))`, or `(d|<day>(…))` written compact (repaired). */
function readException(
  entry: Group,
  reading: Reading,
): { date: ISODate; periods: Period[] } | null {
  let day: string | undefined;
  let periodGroups: Group[] | null;
  const compact = DATE_ATTRIBUTE.exec(keyOf(entry));
  if (compact) {
    day = compact[1];
    periodGroups = periodEntries(entry);
    reading.repaired = true;
  } else {
    const attributes = entry.items[0];
    day =
      attributes && attributes.items.length === 0
        ? DATE_ATTRIBUTE.exec(attributes.text)?.[1]
        : undefined;
    periodGroups = childrenOf(entry);
  }
  if (day === undefined || periodGroups === null) return null;
  const date = xerDayToIsoDate(Number(day));
  const periods = readPeriods(periodGroups, reading);
  if (date === null || periods === null) return null;
  return { date, periods };
}

function readCalendar(root: Group, reading: Reading): Omit<CalendarData, 'repaired'> | null {
  if (keyOf(root) !== 'CalendarData') return null;
  const children = childrenOf(root, reading);
  if (!children) return null;
  const daysOfWeek = children.filter((child) => keyOf(child) === 'DaysOfWeek');
  const containers = children.filter((child) => keyOf(child) === 'Exceptions');
  // A DaysOfWeek or Exceptions entry nested anywhere else (inside VIEW, say) would go unread: the
  // parentheses are damaged in a way that isn't repaired.
  const total = countContainers(root);
  if (daysOfWeek.length !== 1 || total.daysOfWeek !== 1) return null;
  if (total.exceptions !== containers.length) return null;
  const week = readWeek(daysOfWeek[0]!, reading);
  if (!week) return null;

  if (containers.length > 1) reading.repaired = true;
  const entries: Group[] = [];
  for (const container of containers) {
    const held = childrenOf(container);
    if (!held) return null;
    append(entries, held);
  }
  const byDate = new Map<ISODate, Period[]>();
  for (const entry of entries) {
    const exception = readException(entry, reading);
    if (!exception) return null;
    const listed = byDate.get(exception.date);
    if (listed === undefined) {
      byDate.set(exception.date, exception.periods);
      continue;
    }
    // A date listed twice: the working entry wins.
    reading.repaired = true;
    if (listed.length === 0 && exception.periods.length > 0) {
      byDate.set(exception.date, exception.periods);
    }
  }
  const exceptions = [...byDate.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([date, periods]) => ({ date, periods }));
  return { week, exceptions };
}

/** The work week and exceptions of `clndr_data`; null when the data can't be read completely. */
export function parseCalendarData(clndrData: string): CalendarData | null {
  const reading: Reading = { repaired: false };
  let root = parseTree(clndrData);
  if (!root) {
    // The tree read without that `)` is accepted only when it reads cleanly: readCalendar refuses an
    // Exceptions entry the removal left nested elsewhere and any entry outside its children group.
    const stray = STRAY_BEFORE_EXCEPTIONS.exec(clndrData);
    if (!stray) return null;
    root = parseTree(clndrData.slice(0, stray.index) + clndrData.slice(stray.index + 1));
    if (!root) return null;
    reading.repaired = true;
  }
  const calendar = readCalendar(root, reading);
  return calendar ? { ...calendar, repaired: reading.repaired } : null;
}
