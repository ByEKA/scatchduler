import type {
  ImportCount,
  ImportFormat,
  ImportIssue,
  ImportMapping,
  ImportReport,
  ISODate,
  TableMapping,
  TextEncodingName,
} from '@/data/types';
import { NAMED_CALENDAR_PREFIX } from './calendars';
import { isIsoDate } from './dates';
import { detectFormat, extensionOf, REFUSAL_MESSAGES, type Detection } from './detect';
import { byteOrderMark, decodeText, detectEncoding, invalidUtf8Bytes } from './encoding';
import { ISSUE_CATALOG, makeIssue } from './issues';
import { emptyModel, type ImportModel } from './model';
import { mspdiCodeFields, readMspdi } from './mspdi/read';
import type { ReadResult } from './read-result';
import { buildReport } from './report';
import { csvSource, guessDelimiter } from './table/csv';
import {
  defaultTableMapping,
  isEmptyCell,
  previewTable,
  readTable,
  type TablePreview,
  type TableSource,
} from './table/normalize';
import { xlsxSource } from './table/xlsx';
import { PARSER_VERSION } from './version';
import { listXerProjects, readXer, type XerProjectInfo } from './xer/read';
import { tokenizeXer, type XerFile } from './xer/tokenize';

// The parser's entry points (P3 core spec §5.1 steps 2, 4 and 6, §5.8): `inspect` reads a file
// for the File step, `preview` re-reads a table for the Columns step, `analyze` builds the model
// and the report (P4 calls it on stored originals) and `pack` builds what is stored. Nothing here
// throws: any file gives a report or a refusal message (§5.2).

export { pack } from './pack';
export type { PackResult } from './pack';
export type { TablePreview } from './table/normalize';

export type InspectOutcome =
  | { kind: 'refused'; message: string; fileName: string; size: number; parserVersion: string }
  | {
      kind: 'schedule';
      format: 'xer' | 'mspdi';
      fileName: string;
      size: number;
      sha256: string;
      formatFromContent: boolean;
      encoding: ImportReport['encoding'];
      projects: XerProjectInfo[];
      codeFields: string[];
      firstActivities: string[]; // XER: the chosen project's first five names as decoded; MSPDI: none
      mapping: ImportMapping;
    }
  | {
      kind: 'table';
      format: 'xlsx' | 'csv';
      fileName: string;
      size: number;
      sha256: string;
      formatFromContent: boolean;
      encoding: ImportReport['encoding'];
      sheets: string[];
      firstActivities: string[]; // CSV: the first five names in the guessed name column; xlsx: none
      mapping: ImportMapping;
      preview: TablePreview;
    };

export type AnalyzeOutcome =
  | { kind: 'analyzed'; model: ImportModel; report: ImportReport }
  | { kind: 'refused'; message: string };

// §5.10's count limits, enforced here (FILE_TOO_MANY_EXCEPTIONS comes from the readers, D57);
// `calendarNames` bounds the names in a table's Calendar column (D63).
const LIMITS = {
  activities: 20_000,
  relationships: 40_000,
  wbs: 10_000,
  calendars: 200,
  rows: 20_000,
  columns: 200,
  calendarNames: 200,
} as const;
const FIRST_ACTIVITIES = 5;
const EMPTY_SOURCE: TableSource = {
  rows: [],
  rowNumbers: [],
  sheets: [],
  sheet: null,
  date1904: false,
  rowsPastWindow: false,
  columnsPastWindow: false,
};

// ---------------------------------------------------------------------------------------------
// Bytes and text

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const data =
    bytes.buffer instanceof ArrayBuffer ? (bytes as Uint8Array<ArrayBuffer>) : bytes.slice();
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function detect(bytes: Uint8Array, fileName: string): Detection {
  try {
    return detectFormat(bytes, fileName);
  } catch {
    return { kind: 'refused', message: REFUSAL_MESSAGES.unsupported };
  }
}

interface Decoded {
  text: string;
  encoding: NonNullable<ImportReport['encoding']>;
  invalidBytes: number;
}

/**
 * XER and CSV text (§5.4): a byte-order mark decides; otherwise the requested encoding, when it
 * differs from the detected one, is the user's choice; else the detected one. A UTF-8 choice
 * counts the bytes it replaces, as detection does.
 */
function decodeWith(bytes: Uint8Array, requested: TextEncodingName | null): Decoded {
  const detected = detectEncoding(bytes);
  if (detected.detectedBy === 'bom' || requested === null || requested === detected.name) {
    return {
      text: decodeText(bytes, detected.name, detected.bomLength),
      encoding: { name: detected.name, detectedBy: detected.detectedBy },
      invalidBytes: detected.invalidBytes,
    };
  }
  return {
    text: decodeText(bytes, requested),
    encoding: { name: requested, detectedBy: 'user' },
    invalidBytes: requested === 'utf-8' ? invalidUtf8Bytes(bytes) : 0,
  };
}

const XML_ENCODING = /^\s*<\?xml[^>]*?\sencoding\s*=\s*["']([A-Za-z0-9._:-]+)["']/;

/**
 * Microsoft Project XML text: a byte-order mark decides, else the XML declaration's encoding (a
 * UTF-16 label without a mark can't be right, since detection read the text as bytes), else UTF-8.
 */
function decodeXml(bytes: Uint8Array): string {
  const bom = byteOrderMark(bytes);
  if (bom) return decodeText(bytes, bom.name, bom.length);
  const head = String.fromCharCode(...bytes.subarray(0, 256));
  const label = XML_ENCODING.exec(head)?.[1]?.toLowerCase();
  if (label !== undefined && !label.startsWith('utf-16') && !label.startsWith('ucs')) {
    try {
      return new TextDecoder(label).decode(bytes);
    } catch {
      // A label the platform doesn't know: read as UTF-8.
    }
  }
  return new TextDecoder('utf-8').decode(bytes);
}

/**
 * The workbook's sheet. SheetJS adds its read cursor (`l`, `read_shift`, …) to the array it reads,
 * so it reads a copy and the caller's bytes stay as they were.
 */
function workbookSource(
  bytes: Uint8Array,
  sheet: string | null,
): TableSource | { refused: string } {
  return xlsxSource(bytes.slice(), sheet);
}

// ---------------------------------------------------------------------------------------------
// Reads

function emptyCounts(): ImportCount[] {
  return (['calendar', 'wbs', 'activity', 'relationship'] as const).map((entity) => ({
    entity,
    read: 0,
    accepted: 0,
    adjusted: 0,
    skipped: 0,
  }));
}

/** A read that found nothing, with FILE_EMPTY or FILE_UNREADABLE. */
function failedRead(format: ImportFormat, code: 'FILE_EMPTY' | 'FILE_UNREADABLE'): ReadResult {
  return {
    model: emptyModel(format),
    issues: [makeIssue(code)],
    counts: emptyCounts(),
    formatVersion: null,
    sourceProject: {
      id: null,
      code: null,
      name: null,
      projectsInFile: 0,
      rootWbsName: null,
      mustFinishBy: null,
      stated: { start: null, finish: null },
    },
    units: { minutesPerDay: null, calendars: [] },
    externalLinks: [],
    notImported: [],
    elements: [],
    statusDate: { date: null, time: null, source: 'none' },
  };
}

/**
 * The project a new import starts from (D56): the first one P6 flagged for export that isn't
 * another project's baseline, else the first that isn't a baseline, else the first.
 */
function defaultProjectId(projects: readonly XerProjectInfo[]): string | null {
  const chosen =
    projects.find((p) => p.exportFlag && p.baselineOf === null) ??
    projects.find((p) => p.baselineOf === null) ??
    projects[0];
  return chosen?.id ?? null;
}

function counted(read: ReadResult, entity: ImportCount['entity']): number {
  return read.counts.find((count) => count.entity === entity)?.read ?? 0;
}

/** FILE_TOO_MANY_* for the entities read (§5.10); `calendars` is what the file defines. */
function countLimits(
  read: ReadResult,
  checked: { activities: boolean; calendars: number | null },
): ImportIssue[] {
  const issues: ImportIssue[] = [];
  const activities = counted(read, 'activity');
  const relationships = counted(read, 'relationship');
  const wbs = counted(read, 'wbs');
  if (checked.activities && activities > LIMITS.activities) {
    issues.push(makeIssue('FILE_TOO_MANY_ACTIVITIES', { n: activities }));
  }
  if (relationships > LIMITS.relationships) {
    issues.push(makeIssue('FILE_TOO_MANY_RELATIONSHIPS', { n: relationships }));
  }
  if (wbs > LIMITS.wbs) issues.push(makeIssue('FILE_TOO_MANY_WBS', { n: wbs }));
  if (checked.calendars !== null && checked.calendars > LIMITS.calendars) {
    issues.push(makeIssue('FILE_TOO_MANY_CALENDARS', { n: checked.calendars }));
  }
  return issues;
}

/**
 * FILE_TOO_MANY_ROWS and FILE_TOO_MANY_COLUMNS: data rows after the header, and the widest row. An
 * xlsx sheet whose range runs past the read window is too long as well, and one with a cell past
 * the columns kept is too wide, so no row or cell is dropped without an error (D65, D69).
 */
function tableLimits(source: TableSource, headerRow: number): ImportIssue[] {
  let rows = 0;
  let columns = 0;
  source.rows.forEach((cells, index) => {
    if ((source.rowNumbers[index] ?? index + 1) > headerRow) rows += 1;
    for (let column = cells.length - 1; column >= columns; column -= 1) {
      if (!isEmptyCell(cells[column])) {
        columns = column + 1;
        break;
      }
    }
  });
  const issues: ImportIssue[] = [];
  if (rows > LIMITS.rows || source.rowsPastWindow) issues.push(makeIssue('FILE_TOO_MANY_ROWS'));
  if (columns > LIMITS.columns || source.columnsPastWindow) {
    issues.push(makeIssue('FILE_TOO_MANY_COLUMNS'));
  }
  return issues;
}

/**
 * TABLE_TOO_MANY_CALENDARS (D63): the distinct names in the Calendar column, counted as the reader
 * makes calendars of them: names folding to the same text are one, and one folding to "standard"
 * is the generated Standard, so the calendars made from names are what is counted.
 */
function calendarNameLimit(read: ReadResult): ImportIssue[] {
  let names = 0;
  for (const calendar of read.model.calendars) {
    if (calendar.id.startsWith(NAMED_CALENDAR_PREFIX)) names += 1;
  }
  return names > LIMITS.calendarNames ? [makeIssue('TABLE_TOO_MANY_CALENDARS', { n: names })] : [];
}

interface FileRead {
  read: ReadResult;
  limits: ImportIssue[];
  encoding: ImportReport['encoding'];
  invalidBytes: number;
  table: TableMapping | null;
  activityCodeField: string | null;
}

function readFile(
  bytes: Uint8Array,
  detection: Extract<Detection, { kind: 'format' }>,
  mapping: ImportMapping,
): FileRead | { refused: string } {
  const { format } = detection;
  const empty = bytes.length === detection.bomLength;
  const activityCodeField = format === 'mspdi' ? (mapping.activityCodeField ?? 'UID') : null;
  const textEncoding = format === 'xer' || format === 'csv';
  const decoded = textEncoding ? decodeWith(bytes, mapping.encoding) : null;
  const done = (read: ReadResult, limits: ImportIssue[], table: TableMapping | null): FileRead => ({
    read,
    limits,
    encoding: decoded?.encoding ?? null,
    invalidBytes: decoded?.invalidBytes ?? 0,
    table,
    activityCodeField,
  });
  if (empty) {
    const table = format === 'csv' || format === 'xlsx' ? mapping.table : null;
    return done(failedRead(format, 'FILE_EMPTY'), [], table);
  }

  switch (format) {
    case 'xer': {
      const file = tokenizeXer(decoded?.text ?? '');
      if ('error' in file) return done(failedRead('xer', 'FILE_UNREADABLE'), [], null);
      const projectId = mapping.sourceProjectId ?? defaultProjectId(listXerProjects(file)) ?? '';
      const read = readXer(file, projectId);
      const calendars = file.tables.get('CALENDAR')?.rows.length ?? 0;
      return done(read, countLimits(read, { activities: true, calendars }), null);
    }
    case 'mspdi': {
      const read = readMspdi(decodeXml(bytes), { activityCodeField: activityCodeField ?? 'UID' });
      return done(
        read,
        countLimits(read, { activities: true, calendars: counted(read, 'calendar') }),
        null,
      );
    }
    case 'csv':
    case 'xlsx': {
      let source: TableSource;
      let table: TableMapping;
      if (format === 'csv') {
        const text = decoded?.text ?? '';
        const delimiter = mapping.table?.delimiter ?? guessDelimiter(text);
        source = csvSource(text, delimiter);
        table = mapping.table ?? defaultTableMapping(source, { delimiter });
      } else {
        const workbook = workbookSource(bytes, mapping.table?.sheet ?? null);
        if ('refused' in workbook) return workbook;
        source = workbook;
        table = mapping.table ?? defaultTableMapping(source, { delimiter: null });
      }
      const read = readTable(source, table, { format, encoding: decoded?.encoding ?? null });
      // The row limit stands in for the activity limit; tables define no calendars (D43), but
      // the names in their Calendar column have a limit of their own (D63).
      const limits = tableLimits(source, table.headerRow).concat(
        countLimits(read, { activities: false, calendars: null }),
        calendarNameLimit(read),
      );
      return done(read, limits, table);
    }
  }
}

/** The read's issues with the limit errors first and FILE_NO_ACTIVITIES when nothing was read. */
function withFileIssues(read: ReadResult, limits: readonly ImportIssue[]): ReadResult {
  const accepted = read.counts.find((count) => count.entity === 'activity')?.accepted ?? 0;
  const failed = read.issues.some(
    (issue) => issue.code === 'FILE_UNREADABLE' || issue.code === 'FILE_EMPTY',
  );
  const after = accepted === 0 && !failed ? [makeIssue('FILE_NO_ACTIVITIES')] : [];
  if (limits.length === 0 && after.length === 0) return read;
  return { ...read, issues: limits.concat(read.issues, after) };
}

// ---------------------------------------------------------------------------------------------
// Entry points

/**
 * Reads a file for the File step: the format from the content, the encoding, the SHA-256, and
 * the projects (XER), the activity-code fields (MSPDI) or the sheets, the detected mapping and its
 * preview (tables); or the refusal message.
 */
export async function inspect(bytes: Uint8Array, fileName: string): Promise<InspectOutcome> {
  const size = bytes.length;
  const refused = (message: string): InspectOutcome => ({
    kind: 'refused',
    message,
    fileName,
    size,
    parserVersion: PARSER_VERSION,
  });
  const detection = detect(bytes, fileName);
  if (detection.kind === 'refused') return refused(detection.message);
  try {
    const sha256 = await sha256Hex(bytes);
    const empty = bytes.length === detection.bomLength;
    const base = { fileName, size, sha256, formatFromContent: detection.fromContent };
    switch (detection.format) {
      case 'xer': {
        const decoded = decodeWith(bytes, null);
        const file = empty ? null : tokenizeXer(decoded.text);
        const xer = file !== null && !('error' in file) ? file : null;
        const projects = xer === null ? [] : listXerProjects(xer);
        const sourceProjectId = defaultProjectId(projects);
        return {
          kind: 'schedule',
          format: 'xer',
          ...base,
          encoding: decoded.encoding,
          projects,
          codeFields: [],
          firstActivities: xer === null ? [] : firstTaskNames(xer, sourceProjectId),
          mapping: {
            schemaVersion: 1,
            format: 'xer',
            encoding: decoded.encoding.name,
            sourceProjectId,
            activityCodeField: null,
            table: null,
          },
        };
      }
      case 'mspdi':
        return {
          kind: 'schedule',
          format: 'mspdi',
          ...base,
          encoding: null,
          projects: [],
          codeFields: empty ? ['UID', 'ID'] : mspdiCodeFields(decodeXml(bytes)),
          firstActivities: [],
          mapping: {
            schemaVersion: 1,
            format: 'mspdi',
            encoding: null,
            sourceProjectId: null,
            activityCodeField: 'UID',
            table: null,
          },
        };
      case 'csv': {
        const decoded = decodeWith(bytes, null);
        const delimiter = guessDelimiter(decoded.text);
        const source = empty ? EMPTY_SOURCE : csvSource(decoded.text, delimiter);
        const table = defaultTableMapping(source, { delimiter });
        const shown = previewTable(source, table);
        return {
          kind: 'table',
          format: 'csv',
          ...base,
          encoding: decoded.encoding,
          sheets: [],
          firstActivities: firstNames(shown, table),
          mapping: tableMapping('csv', decoded.encoding.name, table),
          preview: shown,
        };
      }
      case 'xlsx': {
        const source = empty ? EMPTY_SOURCE : workbookSource(bytes, null);
        if ('refused' in source) return refused(source.refused);
        const table = defaultTableMapping(source, { delimiter: null });
        return {
          kind: 'table',
          format: 'xlsx',
          ...base,
          encoding: null,
          sheets: source.sheets,
          firstActivities: [],
          mapping: tableMapping('xlsx', null, table),
          preview: previewTable(source, table),
        };
      }
    }
  } catch {
    return refused(ISSUE_CATALOG.FILE_UNREADABLE.message);
  }
}

function tableMapping(
  format: 'csv' | 'xlsx',
  encoding: TextEncodingName | null,
  table: TableMapping,
): ImportMapping {
  return {
    schemaVersion: 1,
    format,
    encoding,
    sourceProjectId: null,
    activityCodeField: null,
    table,
  };
}

/**
 * The first five names, as decoded, of the TASK rows of the project inspect chooses (all rows
 * when the file names no project), so they belong to the schedule the Review step starts from.
 */
function firstTaskNames(file: XerFile, projectId: string | null): string[] {
  const names: string[] = [];
  for (const row of file.tables.get('TASK')?.rows ?? []) {
    if (projectId !== null && (row.proj_id ?? '').trim() !== projectId) continue;
    const name = (row.task_name ?? '').trim();
    if (name !== '') names.push(name);
    if (names.length === FIRST_ACTIVITIES) break;
  }
  return names;
}

/** The first five names in the preview's name column, as decoded. */
function firstNames(shown: TablePreview, table: TableMapping): string[] {
  const column = table.columns.name?.index;
  if (column === undefined) return [];
  return shown.rows
    .map((row) => (row.cells[column]?.text ?? '').trim())
    .filter((name) => name !== '')
    .slice(0, FIRST_ACTIVITIES);
}

/** The Columns step's preview of a table through `table`, read with `encoding` (CSV). */
export function preview(
  bytes: Uint8Array,
  fileName: string,
  table: TableMapping,
  encoding: TextEncodingName | null,
): TablePreview {
  try {
    const detection = detect(bytes, fileName);
    if (detection.kind === 'refused') return { headers: [], rows: [] };
    let source: TableSource | null = null;
    if (detection.format === 'csv') {
      const { text } = decodeWith(bytes, encoding);
      source = csvSource(text, table.delimiter ?? guessDelimiter(text));
    } else if (detection.format === 'xlsx') {
      const workbook = workbookSource(bytes, table.sheet);
      source = 'refused' in workbook ? null : workbook;
    }
    return source === null ? { headers: [], rows: [] } : previewTable(source, table);
  } catch {
    return { headers: [], rows: [] };
  }
}

/**
 * The reader P4 calls (§5.8): decodes with the mapping's encoding, reads the source schedule the
 * mapping names, enforces §5.10's counts, runs the checks against `options.statusDate` when it is
 * a `YYYY-MM-DD` day, else the file's, and builds the dry-run report. A workbook that can't be
 * opened safely is refused with its message; anything else that can't be read is a report with
 * FILE_UNREADABLE.
 */
export async function analyze(
  bytes: Uint8Array,
  fileName: string,
  mapping: ImportMapping,
  options: { statusDate?: ISODate | null } = {},
): Promise<AnalyzeOutcome> {
  const started = performance.now();
  const detection = detect(bytes, fileName);
  if (detection.kind === 'refused') return { kind: 'refused', message: detection.message };
  let sha256 = '';
  try {
    sha256 = await sha256Hex(bytes);
  } catch {
    // Left empty: the platform has no SHA-256.
  }
  const analyzed = (fileRead: FileRead): AnalyzeOutcome => {
    const read = withFileIssues(fileRead.read, fileRead.limits);
    const report = buildReport(read, {
      format: detection.format,
      fileName,
      size: bytes.length,
      sha256,
      formatFromContent: detection.fromContent,
      extension: extensionOf(fileName),
      encoding: fileRead.encoding,
      invalidBytes: fileRead.invalidBytes,
      noNamespace: detection.noNamespace,
      table: fileRead.table,
      activityCodeField: fileRead.activityCodeField,
      // A status date that isn't a 'YYYY-MM-DD' day, '' included, is not given (§5.8 3, D37).
      statusDate: isIsoDate(options.statusDate) ? options.statusDate : null,
      durationMs: 0, // set below, once the checks and the report are built too
    });
    const durationMs = Math.round(performance.now() - started);
    return { kind: 'analyzed', model: read.model, report: { ...report, durationMs } };
  };
  try {
    const result = readFile(bytes, detection, mapping);
    return 'refused' in result ? { kind: 'refused', message: result.refused } : analyzed(result);
  } catch {
    // A failure no reader foresaw: the file couldn't be read through.
    return analyzed({
      read: failedRead(detection.format, 'FILE_UNREADABLE'),
      limits: [],
      encoding: null,
      invalidBytes: 0,
      table: null,
      activityCodeField: detection.format === 'mspdi' ? (mapping.activityCodeField ?? 'UID') : null,
    });
  }
}
