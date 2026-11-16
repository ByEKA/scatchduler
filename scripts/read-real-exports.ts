// Reads the owner's real schedule exports (P3 core spec §8 V9, D2, D66) and prints anonymous notes:
// per file, numbered and never named, the format and version, the size, the counts table, issue
// codes with their counts, check findings and the read time; for tables also the shapes of the
// link, duration, date, constraint and activity-type cells, with refs, digits and letters masked.
// It never prints activity names or codes, WBS names, notes, project names or file names, and it
// copies nothing. Run with `npm run real-exports [folder]`; the folder defaults to the main
// checkout's git-ignored real-exports/, read with its subfolders.
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ImportField, ImportMapping, ImportReport, TableMapping } from '../src/data/types';
import { decodeText, detectEncoding } from '../src/import/encoding';
import { analyze, inspect } from '../src/import/index';
import { csvSource, guessDelimiter } from '../src/import/table/csv';
import type { TableCell, TableSource } from '../src/import/table/normalize';
import { autoMap } from '../src/import/table/auto-map';
import { predecessorReadings } from '../src/import/table/predecessors';
import { xlsxSource } from '../src/import/table/xlsx';
import { parseCalendarData } from '../src/import/xer/calendar-data';
import { tokenizeXer } from '../src/import/xer/tokenize';

// The extensions the import form takes, and the two it takes only to refuse them (§5.2).
const READ_EXTENSIONS = new Set(['.xer', '.xml', '.xlsx', '.csv']);
const REFUSED_EXTENSIONS = new Set(['.mpp', '.xls']);
const FORM_LIMIT_BYTES = 20 * 1024 * 1024; // §5.10
const MAX_TOKENS = 40; // distinct shapes shown per kind of cell

const ENTITY_LABELS: Record<ImportReport['counts'][number]['entity'], string> = {
  calendar: 'calendars',
  wbs: 'wbs',
  activity: 'activities',
  relationship: 'relationships',
};

/** The main checkout's real-exports/ folder, also from a linked worktree. */
export function defaultExportsFolder(): string {
  const gitDir = execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], {
    encoding: 'utf8',
  }).trim();
  return join(dirname(gitDir), 'real-exports');
}

/** Every file under `folder`, subfolders included, in path order. */
function filesUnder(folder: string): string[] {
  const found: string[] = [];
  const pending = [folder];
  while (pending.length > 0) {
    const current = pending.pop()!;
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) pending.push(path);
      else if (entry.isFile()) found.push(path);
    }
  }
  const key = (path: string) => relative(folder, path).split('\\').join('/');
  return found.sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0));
}

const number = (value: number) => value.toLocaleString('en-US');
const maskDigits = (text: string) => text.replace(/\d/g, '9');
const maskAll = (text: string) => maskDigits(text.replace(/\p{L}/gu, 'A'));
const cut = (text: string, max: number) => (text.length <= max ? text : `${text.slice(0, max)}…`);

/** The report's counts, issue codes, check findings and time, as indented lines. */
function reportLines(report: ImportReport, indent: string): string[] {
  const lines = [`${indent}${'entity'.padEnd(14)}     read accepted adjusted  skipped`];
  for (const count of report.counts) {
    const cells = [count.read, count.accepted, count.adjusted, count.skipped]
      .map((value) => String(value).padStart(8))
      .join(' ');
    lines.push(`${indent}${ENTITY_LABELS[count.entity].padEnd(14)} ${cells}`);
  }
  const totals = report.issueTotals;
  lines.push(
    `${indent}issues: ${number(totals.error)} errors, ${number(totals.warning)} warnings, ${number(totals.info)} notes` +
      (report.issues.length < totals.error + totals.warning + totals.info
        ? ` (codes counted over the first ${number(report.issues.length)})`
        : ''),
  );
  const byCode = new Map<string, number>();
  for (const issue of report.issues) {
    const key = `${issue.severity} ${issue.code}`;
    byCode.set(key, (byCode.get(key) ?? 0) + 1);
  }
  for (const [key, count] of byCode) lines.push(`${indent}  ${key} ${number(count)}`);
  lines.push(
    `${indent}checks: ${report.checks.map((check) => `${check.id} ${check.findings}`).join(', ')}`,
  );
  lines.push(
    `${indent}status date: ${report.statusDate.source}; not imported: ${report.notImported.length} tables; durationMs ${report.durationMs}`,
  );
  return lines;
}

/** The table a CSV or xlsx file holds under `table`, as the parser reads it; null when it can't. */
function tableSource(
  bytes: Uint8Array,
  format: 'xlsx' | 'csv',
  mapping: ImportMapping,
  table: TableMapping,
): TableSource | null {
  if (format === 'xlsx') {
    const source = xlsxSource(bytes.slice(), table.sheet);
    return 'refused' in source ? null : source;
  }
  const detected = detectEncoding(bytes);
  const useDetected = mapping.encoding === null || mapping.encoding === detected.name;
  const text = useDetected
    ? decodeText(bytes, detected.name, detected.bomLength)
    : decodeText(bytes, mapping.encoding!);
  return csvSource(text, table.delimiter ?? guessDelimiter(text));
}

/** Adds `shape` to `shapes` while there is room; returns whether it was new. */
function note(shapes: Map<string, number>, shape: string): void {
  if (shapes.has(shape) || shapes.size < MAX_TOKENS)
    shapes.set(shape, (shapes.get(shape) ?? 0) + 1);
}

/** The shape of a cell that isn't text: its kind only. */
function kindShape(cell: TableCell): string | null {
  if (cell.kind === 'number') return cell.percent ? '#percent' : '#number';
  if (cell.kind === 'date') return cell.showsTime ? '#date-time' : '#date';
  return null;
}

/**
 * The shapes of the table's link, duration, date, constraint and activity-type cells: digits
 * become 9, the activity a link names becomes REF, and letters stay only where the cell holds
 * units or type names (in dates and unreadable links they become A).
 */
function tokenLines(source: TableSource, table: TableMapping, indent: string): string[] {
  const column = (field: ImportField) => table.columns[field]?.index;
  const kinds: Array<{ label: string; fields: ImportField[]; shape: (text: string) => string[] }> =
    [
      {
        label: 'links',
        fields: ['predecessors'],
        shape: (text) =>
          predecessorReadings(text, {
            decimal: table.decimalSeparator,
            hoursPerDay: table.hoursPerDay,
            unit: table.durationUnit,
          }).map(({ token, readings }) => {
            const reading = readings[0];
            if (reading === undefined) return `?${cut(maskAll(token), 30)}`;
            return `REF${maskDigits(token.slice(reading.ref.length))}`;
          }),
      },
      { label: 'durations', fields: ['duration'], shape: (text) => [cut(maskDigits(text), 24)] },
      {
        label: 'dates',
        fields: ['start', 'finish', 'actualStart', 'actualFinish', 'constraintDate'],
        shape: (text) => [cut(maskAll(text), 30)],
      },
      {
        label: 'constraints',
        fields: ['constraintType'],
        shape: (text) => [cut(maskDigits(text), 40)],
      },
      { label: 'types', fields: ['activityType'], shape: (text) => [cut(maskDigits(text), 40)] },
    ];
  const lines: string[] = [];
  for (const kind of kinds) {
    const shapes = new Map<string, number>();
    for (let row = 0; row < source.rows.length; row += 1) {
      if (source.rowNumbers[row]! <= table.headerRow) continue;
      for (const field of kind.fields) {
        const index = column(field);
        const cell = index === undefined ? null : source.rows[row]![index];
        if (cell === null || cell === undefined) continue;
        if (cell.kind !== 'text') note(shapes, kindShape(cell)!);
        else if (cell.text.trim() !== '')
          for (const shape of kind.shape(cell.text.trim())) note(shapes, shape);
      }
    }
    if (shapes.size === 0) continue;
    const shown = [...shapes].map(([shape, count]) => `${shape} ×${number(count)}`).join(' | ');
    lines.push(`${indent}${kind.label}: ${shown}${shapes.size >= MAX_TOKENS ? ' | …' : ''}`);
  }
  const mapped = Object.keys(table.columns).sort().join(', ');
  lines.unshift(
    `${indent}table: header row ${table.headerRow}, decimal '${table.decimalSeparator}', dates ${table.dateFormat}, delimiter ${JSON.stringify(table.delimiter)}, fields mapped: ${mapped || 'none'}`,
  );
  return lines;
}

/** The notes of one file; the file name appears nowhere in them. */
async function fileLines(path: string, label: string): Promise<string[]> {
  const extension = extname(path).toLowerCase();
  const bytes = new Uint8Array(readFileSync(path));
  const size = `${number(bytes.length)} bytes${bytes.length > FORM_LIMIT_BYTES ? " (over the form's 20 MB limit)" : ''}`;
  // The parser sees a neutral name, so no message can repeat the real one.
  const name = `export${extension}`;
  const outcome = await inspect(bytes, name);
  if (outcome.kind === 'refused')
    return [`${label}: refused (${extension}, ${size}): ${outcome.message}`];

  const encoding =
    outcome.encoding === null
      ? 'no text encoding'
      : `${outcome.encoding.name} by ${outcome.encoding.detectedBy}`;
  const fromContent = outcome.formatFromContent ? ', format from content' : '';
  const lines: string[] = [];
  const runs: Array<{ title: string | null; mapping: ImportMapping }> =
    outcome.kind === 'schedule' && outcome.format === 'xer'
      ? outcome.projects.map((project, index) => ({
          title: `Project ${index + 1}${project.exportFlag ? ', flagged for export' : ''}${project.baselineOf === null ? '' : ', a baseline'}${project.id === outcome.mapping.sourceProjectId ? ', chosen by default' : ''}`,
          mapping: { ...outcome.mapping, sourceProjectId: project.id },
        }))
      : [{ title: null, mapping: outcome.mapping }];

  let version: string | null = null;
  for (const run of runs) {
    const indent = run.title === null ? '  ' : '    ';
    if (run.title !== null) lines.push(`  ${run.title}`);
    const analyzed = await analyze(bytes, name, run.mapping);
    if (analyzed.kind === 'refused') {
      lines.push(`${indent}refused: ${analyzed.message}`);
      continue;
    }
    version ??= analyzed.report.formatVersion;
    for (const line of reportLines(analyzed.report, indent)) lines.push(line);
    if (outcome.kind === 'table' && run.mapping.table !== null) {
      const source = tableSource(bytes, outcome.format, run.mapping, run.mapping.table);
      if (source !== null)
        for (const line of tokenLines(source, run.mapping.table, indent)) lines.push(line);
    }
  }
  const projects =
    outcome.kind === 'schedule' && outcome.format === 'xer'
      ? `, ${outcome.projects.length} projects`
      : outcome.kind === 'table' && outcome.format === 'xlsx'
        ? `, ${outcome.sheets.length} sheets`
        : '';
  lines.unshift(
    `${label}: ${outcome.format}${version === null ? '' : ` ${version}`}, ${size}, ${encoding}${fromContent}${projects}`,
  );
  return lines;
}

/**
 * The notes for every .xer, .xml, .xlsx and .csv file under `folder` (and the refusal of every
 * .mpp and .xls file). Throws `No exports found in {folder}` when the folder is missing or holds
 * none of the four.
 */
export async function readExports(folder: string): Promise<string> {
  let files: string[];
  try {
    files = statSync(folder).isDirectory() ? filesUnder(folder) : [];
  } catch {
    files = [];
  }
  const extensionOf = (path: string) => extname(path).toLowerCase();
  if (!files.some((path) => READ_EXTENSIONS.has(extensionOf(path))))
    throw new Error(`No exports found in ${folder}`);

  const lines: string[] = [];
  const skipped = new Map<string, number>();
  let fileNumber = 0;
  let threw = 0;
  for (const path of files) {
    const extension = extensionOf(path);
    if (!READ_EXTENSIONS.has(extension) && !REFUSED_EXTENSIONS.has(extension)) {
      skipped.set(extension || '(none)', (skipped.get(extension || '(none)') ?? 0) + 1);
      continue;
    }
    fileNumber += 1;
    const label = `File ${fileNumber}`;
    try {
      for (const line of await fileLines(path, label)) lines.push(line);
    } catch (error) {
      // Nothing in the parser may throw (§5.2): a throw here is a finding. Only the error's kind
      // and where it was thrown are shown, never its message.
      threw += 1;
      const frame = error instanceof Error ? (error.stack ?? '').split('\n')[1]?.trim() : undefined;
      lines.push(
        `${label}: THREW ${error instanceof Error ? error.name : 'a non-error'} (${extension}) ${frame === undefined ? '' : frame.replace(/\(.*[\\/](src|node_modules)[\\/]/, '($1/')}`,
      );
    }
    lines.push('');
  }
  const others = [...skipped].sort().map(([extension, count]) => `${extension} ×${count}`);
  lines.unshift(
    `Real exports: ${fileNumber} files read${threw === 0 ? '' : `, ${threw} threw`}${others.length === 0 ? '' : `; not read: ${others.join(', ')}`}`,
    '',
  );
  return lines.join('\n').trimEnd();
}

// ---------------------------------------------------------------------------------------------
// Shapes: what the files are made of, for V9's questions about field names, value forms and
// calendars the reader can't read. Field names and type codes are the tools' own; every value is
// shown with its digits as 9, and words the formats don't define as A.

// The fields the XER reader uses (src/import/xer/read.ts), by table.
const XER_FIELDS: Record<string, readonly string[]> = {
  PROJECT: [
    'proj_id',
    'proj_short_name',
    'export_flag',
    'last_recalc_date',
    'data_date',
    'plan_start_date',
    'plan_end_date',
    'scd_end_date',
    'clndr_id',
    'sum_base_proj_id',
    'sched_retained_logic',
    'sched_progress_override',
  ],
  CALENDAR: [
    'clndr_id',
    'clndr_name',
    'clndr_type',
    'base_clndr_id',
    'proj_id',
    'day_hr_cnt',
    'week_hr_cnt',
    'month_hr_cnt',
    'year_hr_cnt',
    'clndr_data',
  ],
  PROJWBS: [
    'wbs_id',
    'proj_id',
    'parent_wbs_id',
    'wbs_short_name',
    'wbs_name',
    'seq_num',
    'proj_node_flag',
  ],
  TASK: [
    'task_id',
    'proj_id',
    'wbs_id',
    'clndr_id',
    'task_code',
    'task_name',
    'task_type',
    'status_code',
    'phys_complete_pct',
    'complete_pct_type',
    'target_drtn_hr_cnt',
    'remain_drtn_hr_cnt',
    'act_start_date',
    'act_end_date',
    'early_start_date',
    'early_end_date',
    'late_start_date',
    'late_end_date',
    'target_start_date',
    'target_end_date',
    'restart_date',
    'reend_date',
    'expect_end_date',
    'total_float_hr_cnt',
    'free_float_hr_cnt',
    'cstr_type',
    'cstr_date',
    'cstr_type2',
    'cstr_date2',
  ],
  TASKPRED: ['task_id', 'pred_task_id', 'proj_id', 'pred_proj_id', 'pred_type', 'lag_hr_cnt'],
  CURRTYPE: ['curr_short_name', 'decimal_symbol', 'digit_group_symbol'],
};
// Fields whose values are type codes of the format, shown as written.
const XER_CODES: Record<string, readonly string[]> = {
  PROJECT: ['export_flag', 'sched_retained_logic', 'sched_progress_override'],
  CALENDAR: ['clndr_type'],
  PROJWBS: ['proj_node_flag'],
  TASK: [
    'task_type',
    'status_code',
    'complete_pct_type',
    'duration_type',
    'cstr_type',
    'cstr_type2',
  ],
  TASKPRED: ['pred_type'],
  CURRTYPE: ['decimal_symbol', 'digit_group_symbol'],
};
const CALENDAR_WORDS = new Set(['CalendarData', 'DaysOfWeek', 'Exceptions', 'VIEW', 'ShowTotal']);

type Tally = Map<string, number>;
const tally = (into: Tally, key: string) => into.set(key, (into.get(key) ?? 0) + 1);
const tallyText = (counts: Tally, max = 30) =>
  [...counts]
    .sort((a, b) => b[1] - a[1])
    .slice(0, max)
    .map(([key, count]) => `${key === '' ? '(empty)' : key} ×${number(count)}`)
    .join(' | ') + (counts.size > max ? ' | …' : '');
/** A type code as written when it looks like one (letters, digits, `_`, or one symbol), else masked. */
const codeShape = (value: string) =>
  /^[A-Za-z_][A-Za-z0-9_]{0,24}$|^[^\p{L}\d]?$/u.test(value) ? value : cut(maskAll(value), 20);
/** A value with every run of digits as one 9 and every word as A: 2026-03-05 08:00 → 9-9-9 9:9. */
const runShape = (value: string) => cut(value.replace(/\d+/g, '9').replace(/\p{L}+/gu, 'A'), 24);
/** clndr_data with digit runs as 9 and words the format doesn't define as A. */
const calendarShape = (value: string) =>
  value
    .replace(/\d+/g, '9')
    .replace(/\p{L}+/gu, (word) => (CALENDAR_WORDS.has(word) || /^[sfd]$/.test(word) ? word : 'A'));

interface VersionShapes {
  files: number;
  headerFields: Tally;
  tables: Map<string, { files: number; missing: Tally; codes: Map<string, Tally> }>;
  dates: Tally;
  numbers: Tally;
  calendars: {
    read: number;
    repaired: number;
    unreadable: number;
    shapes: Tally;
    repairedShapes: Tally;
  };
  optionFields: Tally; // the field names of SCHEDOPTIONS, where P6 keeps a project's settings
}

/** Adds one XER file's shapes to its version's entry; returns the file's one-line label. */
function xerShapes(bytes: Uint8Array, shapes: Map<string, VersionShapes>): string {
  const detected = detectEncoding(bytes);
  const file = tokenizeXer(decodeText(bytes, detected.name, detected.bomLength));
  if ('error' in file) return 'xer, unreadable';
  const version = file.version ?? '(none)';
  let entry = shapes.get(version);
  if (entry === undefined) {
    entry = {
      files: 0,
      headerFields: new Map(),
      tables: new Map(),
      dates: new Map(),
      numbers: new Map(),
      calendars: {
        read: 0,
        repaired: 0,
        unreadable: 0,
        shapes: new Map(),
        repairedShapes: new Map(),
      },
      optionFields: new Map(),
    };
    shapes.set(version, entry);
  }
  entry.files += 1;
  tally(entry.headerFields, String(file.header.length));
  for (const field of file.tables.get('SCHEDOPTIONS')?.fields ?? [])
    tally(entry.optionFields, field);
  for (const [name, used] of Object.entries(XER_FIELDS)) {
    const table = file.tables.get(name);
    let seen = entry.tables.get(name);
    if (seen === undefined) {
      seen = { files: 0, missing: new Map(), codes: new Map() };
      entry.tables.set(name, seen);
    }
    if (table === undefined) continue;
    seen.files += 1;
    for (const field of used) if (!table.fields.includes(field)) tally(seen.missing, field);
    for (const row of table.rows) {
      for (const field of XER_CODES[name] ?? []) {
        if (!table.fields.includes(field)) continue;
        let counts = seen.codes.get(field);
        if (counts === undefined) {
          counts = new Map();
          seen.codes.set(field, counts);
        }
        tally(counts, codeShape(row[field] ?? ''));
      }
      if (name !== 'TASK' && name !== 'PROJECT' && name !== 'TASKPRED') continue;
      for (const field of used) {
        const value = row[field];
        if (value === undefined || value === '') continue;
        if (field.endsWith('_date')) tally(entry.dates, runShape(value));
        else if (field.endsWith('_hr_cnt') || field.endsWith('_pct'))
          tally(entry.numbers, runShape(value));
      }
    }
  }
  for (const row of file.tables.get('CALENDAR')?.rows ?? []) {
    const data = parseCalendarData(row.clndr_data ?? '');
    if (data === null) {
      entry.calendars.unreadable += 1;
      const shape = calendarShape(row.clndr_data ?? '');
      tally(
        entry.calendars.shapes,
        shape.length <= 900 ? shape : `${shape.slice(0, 900)}… (${shape.length} characters)`,
      );
    } else {
      entry.calendars.read += 1;
      if (data.repaired) {
        entry.calendars.repaired += 1;
        tally(entry.calendars.repairedShapes, cut(calendarShape(row.clndr_data ?? ''), 420));
      }
    }
  }
  return `xer ${version}`;
}

/** The first rows of a table: how many cells each holds and how many of them name a field. */
function tableShapes(source: TableSource): string[] {
  const lines: string[] = [];
  for (let row = 0; row < Math.min(source.rows.length, 6); row += 1) {
    const texts = source.rows[row]!.map((cell) =>
      cell === null ? '' : cell.kind === 'text' ? cell.text.trim() : (kindShape(cell) ?? ''),
    );
    const filled = texts.filter((text) => text !== '');
    const mapped = new Set(Object.values(autoMap(texts)).map((column) => column.index));
    const distinct = new Set(filled).size;
    // A row naming at least two fields is a header row: its other labels are shown as written.
    const rest =
      mapped.size >= 2
        ? texts
            .filter((text, index) => text !== '' && !mapped.has(index))
            .map((text) => cut(text, 40))
        : filled.slice(0, 8).map((text) => (text.startsWith('#') ? text : cut(maskAll(text), 24)));
    lines.push(
      `    row ${source.rowNumbers[row]}: ${filled.length} cells, ${distinct} distinct, ${mapped.size} name a field; ${mapped.size >= 2 ? 'other labels' : 'cells'}: ${rest.join(' | ') || 'none'}`,
    );
  }
  return lines;
}

/**
 * What the files under `folder` are made of: per P6 version, the reader's fields the tables lack,
 * the type codes used, the forms of dates and numbers and the calendars that can't be read; per
 * table file, its first rows. Values are masked; names and codes of the schedule never appear.
 */
export async function readExportShapes(folder: string): Promise<string> {
  let files: string[];
  try {
    files = statSync(folder).isDirectory() ? filesUnder(folder) : [];
  } catch {
    files = [];
  }
  const extensionOf = (path: string) => extname(path).toLowerCase();
  if (!files.some((path) => READ_EXTENSIONS.has(extensionOf(path))))
    throw new Error(`No exports found in ${folder}`);

  const lines: string[] = [];
  const versions = new Map<string, VersionShapes>();
  let fileNumber = 0;
  for (const path of files) {
    const extension = extensionOf(path);
    if (!READ_EXTENSIONS.has(extension) && !REFUSED_EXTENSIONS.has(extension)) continue;
    fileNumber += 1;
    if (extension !== '.xer' && extension !== '.xlsx' && extension !== '.csv') continue;
    const bytes = new Uint8Array(readFileSync(path));
    if (extension === '.xer') {
      lines.push(`File ${fileNumber}: ${xerShapes(bytes, versions)}`);
      continue;
    }
    const outcome = await inspect(bytes, `export${extension}`);
    if (outcome.kind !== 'table' || outcome.mapping.table === null) continue;
    const source = tableSource(bytes, outcome.format, outcome.mapping, outcome.mapping.table);
    lines.push(
      `File ${fileNumber}: ${outcome.format}, header row guessed ${outcome.mapping.table.headerRow}`,
    );
    if (source !== null) for (const line of tableShapes(source)) lines.push(line);
  }
  for (const [version, entry] of [...versions].sort()) {
    lines.push(
      '',
      `XER ${version}: ${entry.files} files; ERMHDR fields ${tallyText(entry.headerFields)}`,
    );
    for (const [name, seen] of entry.tables) {
      const missing = seen.missing.size === 0 ? 'none' : tallyText(seen.missing, 40);
      lines.push(`  ${name}: in ${seen.files} files; reader's fields missing: ${missing}`);
      for (const [field, counts] of seen.codes) lines.push(`    ${field}: ${tallyText(counts)}`);
    }
    lines.push(`  dates: ${tallyText(entry.dates)}`);
    lines.push(`  numbers: ${tallyText(entry.numbers)}`);
    const calendars = entry.calendars;
    lines.push(
      `  calendars: ${calendars.read} read (${calendars.repaired} repaired), ${calendars.unreadable} unreadable`,
    );
    for (const [shape, count] of calendars.shapes) lines.push(`    ×${count} ${shape}`);
    const repaired = [...calendars.repairedShapes].sort((a, b) => b[1] - a[1]).slice(0, 4);
    for (const [shape, count] of repaired) lines.push(`    repaired ×${count} ${shape}`);
    lines.push(
      `  SCHEDOPTIONS fields: ${[...entry.optionFields.keys()].map(codeShape).join(', ') || 'no such table'}`,
    );
  }
  return lines.join('\n').trimEnd();
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    const folder = args.find((arg) => !arg.startsWith('--')) ?? defaultExportsFolder();
    console.log(await (args.includes('--shapes') ? readExportShapes(folder) : readExports(folder)));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
