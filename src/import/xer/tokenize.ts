import { createRecord } from '../safe-record';

// The XER text format (P3 core spec §5.5): an ERMHDR line, then tables of tab-separated lines —
// `%T` starts a table, `%F` names its fields, `%R` adds a record — and `%E` ends the file.

export interface XerTable {
  name: string;
  fields: string[];
  rows: Array<Record<string, string>>;
  firstLine: number; // the line of the table's %T
  lines: number[]; // the line of each row's %R, in row order
}

export interface XerFile {
  version: string | null;
  header: string[]; // ERMHDR's fields after the marker: version, export date, …, currency (8th)
  tables: Map<string, XerTable>;
}

// A raw line break inside a cell before the last one is rejoined only when the record then has
// exactly its field count, within this many lines (D58).
const MAX_RECORD_LINES = 8;

// Note fields (TASKMEMO's task_memo and the like) write a line break as two 0x7F bytes (D58).
const NOTE_FIELD = /_memo$/;
const BOM = '\ufeff';

function noteText(value: string): string {
  return value.replaceAll('\x7f\x7f', '\n').replaceAll('\u0000', '').replaceAll(BOM, '');
}

function isContinuation(line: string): boolean {
  return !line.startsWith('%') || line.startsWith('\t');
}

/** The values a record has after `extra` is joined to its last value after a line break. */
function joined(values: readonly string[], extra: string): string[] {
  const parts = (extra.startsWith('\t') ? extra.slice(1) : extra).split('\t');
  const result = values.slice();
  const last = result.length - 1;
  if (last < 0) return parts;
  result[last] = `${result[last]}\n${parts[0] ?? ''}`;
  return result.concat(parts.slice(1));
}

/**
 * The values of the record at `lines[start]` and the index of the line after it. Continuation lines
 * (blank lines skipped) are joined while the record keeps exactly its field count; a record that
 * starts short is rejoined only when it reaches that count within MAX_RECORD_LINES lines. Lines
 * that can't be joined are dropped.
 */
function readRecord(
  lines: readonly string[],
  start: number,
  fieldCount: number,
): { values: string[]; next: number } {
  let values = (lines[start] ?? '').split('\t').slice(1);
  let next = start + 1;
  // The continuation run: every following line up to the next marker line.
  let end = next;
  while (end < lines.length && (lines[end] === '' || isContinuation(lines[end] ?? ''))) end += 1;

  if (values.length < fieldCount) {
    let candidate = values;
    let recordLines = 1;
    let matched = -1;
    for (let i = next; i < end && recordLines < MAX_RECORD_LINES; i += 1) {
      const line = lines[i] ?? '';
      if (line === '') continue;
      candidate = joined(candidate, line);
      recordLines += 1;
      if (candidate.length === fieldCount) {
        matched = i;
        break;
      }
      if (candidate.length > fieldCount) break;
    }
    if (matched < 0) return { values, next: end };
    values = candidate;
    next = matched + 1;
  }

  if (values.length === fieldCount) {
    for (; next < end; next += 1) {
      const line = lines[next] ?? '';
      if (line === '') continue;
      const candidate = joined(values, line);
      if (candidate.length !== fieldCount) break;
      values = candidate;
    }
  }
  return { values, next: end };
}

/** Reads the tables of an XER file; `{ error: 'unreadable' }` when it can't be read through. */
export function tokenizeXer(text: string): XerFile | { error: 'unreadable' } {
  const lines = (text.startsWith(BOM) ? text.slice(1) : text).split(/\r?\n/);
  let index = 0;
  while (index < lines.length && lines[index] === '') index += 1;
  const headerTokens = (lines[index] ?? '').split('\t');
  if (headerTokens[0] !== 'ERMHDR') return { error: 'unreadable' };
  const header = headerTokens.slice(1);
  const version = header[0]?.trim() || null;
  index += 1;

  const tables = new Map<string, XerTable>();
  let table: XerTable | null = null;
  let fields: string[] | null = null;
  let ended = false;

  while (index < lines.length) {
    const line = lines[index] ?? '';
    if (line === '' || isContinuation(line)) {
      // Blank lines, and continuation lines no record could take, are ignored.
      index += 1;
      continue;
    }
    const tokens = line.split('\t');
    const marker = tokens[0];
    if (marker === '%E') {
      ended = true;
      break;
    }
    if (marker === '%T') {
      const name = tokens[1]?.trim() ?? '';
      if (name === '') return { error: 'unreadable' };
      table = tables.get(name) ?? null;
      if (!table) {
        table = { name, fields: [], rows: [], firstLine: index + 1, lines: [] };
        tables.set(name, table);
      }
      fields = null;
      index += 1;
    } else if (marker === '%F') {
      if (!table) return { error: 'unreadable' };
      fields = tokens.slice(1);
      table.fields = fields;
      index += 1;
    } else if (marker === '%R') {
      if (!table || !fields) return { error: 'unreadable' };
      const { values, next } = readRecord(lines, index, fields.length);
      const row = createRecord<string>();
      fields.forEach((field, position) => {
        const value = values[position];
        if (value !== undefined) row[field] = NOTE_FIELD.test(field) ? noteText(value) : value;
      });
      table.rows.push(row);
      table.lines.push(index + 1);
      index = next;
    } else {
      // A marker we don't know: skipped.
      index += 1;
    }
  }

  // A file without %E was cut short (§5.2).
  if (!ended) return { error: 'unreadable' };
  return { version, header, tables };
}
