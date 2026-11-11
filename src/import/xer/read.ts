import type { ImportCount, ImportIssue, ISODate } from '@/data/types';
import { parseXerDate } from '../dates';
import { makeIssue, sliceText, type IssueCode } from '../issues';
import {
  emptyModel,
  type ImportActivity,
  type ImportCalendar,
  type ImportConstraintType,
  type ImportRelationship,
  type Period,
  type WallClock,
} from '../model';
import type { ReadResult } from '../read-result';
import { parseCalendarData } from './calendar-data';
import type { XerFile, XerTable } from './tokenize';

// One project of a P6 XER file as an ImportModel (P3 core spec §5.5, decisions D51–D58).

export interface XerProjectInfo {
  id: string;
  code: string | null;
  name: string | null;
  exportFlag: boolean;
  baselineOf: string | null; // the code of the project naming this one in sum_base_proj_id (D56)
}

type Row = Record<string, string>;

const READ_TABLES = new Set(['PROJECT', 'CALENDAR', 'PROJWBS', 'TASK', 'TASKPRED']);
const MAX_EXCEPTIONS = 100_000;
const MAX_BASE_LEVELS = 5;
const TEXT_LIMITS = { code: 40, name: 255 } as const;
// The issues that say an activity was changed: it counts as adjusted (once).
const ADJUSTING_ACTIVITY: ReadonlySet<string> = new Set<IssueCode>([
  'XER_RESOURCE_TASK',
  'CALENDAR_MISSING',
  'TEXT_TRUNCATED',
  'XER_UNKNOWN_VALUE',
  'CONSTRAINT_UNSUPPORTED',
]);

function rowsOf(file: XerFile, table: string): Row[] {
  return file.tables.get(table)?.rows ?? [];
}

function text(value: string | undefined): string {
  return (value ?? '').trim();
}

function textOrNull(value: string | undefined): string | null {
  const trimmed = text(value);
  return trimmed === '' ? null : trimmed;
}

function wallClock(value: string | undefined): WallClock | null {
  const parsed = parseXerDate(value ?? '');
  return parsed === 'invalid' ? null : parsed;
}

function datePart(value: WallClock | null): ISODate | null {
  return value === null ? null : value.slice(0, 10);
}

/** The root WBS node of each project: its project node (`proj_node_flag` Y). */
function rootNodes(file: XerFile): Map<string, Row> {
  const roots = new Map<string, Row>();
  for (const row of rowsOf(file, 'PROJWBS')) {
    const projectId = text(row.proj_id);
    if (text(row.proj_node_flag) === 'Y' && !roots.has(projectId)) roots.set(projectId, row);
  }
  return roots;
}

/** The projects of the file in file order; `name` is the root WBS node's name. */
export function listXerProjects(file: XerFile): XerProjectInfo[] {
  const projects = rowsOf(file, 'PROJECT');
  const roots = rootNodes(file);
  // A project named in another project's sum_base_proj_id is that project's baseline (D56).
  const baselineOf = new Map<string, string | null>();
  for (const project of projects) {
    const id = text(project.proj_id);
    const base = text(project.sum_base_proj_id);
    if (base !== '' && base !== id && !baselineOf.has(base)) {
      baselineOf.set(base, textOrNull(project.proj_short_name) ?? id);
    }
  }
  return projects.map((project) => {
    const id = text(project.proj_id);
    return {
      id,
      code: textOrNull(project.proj_short_name),
      name: textOrNull(roots.get(id)?.wbs_name),
      exportFlag: text(project.export_flag) === 'Y',
      baselineOf: baselineOf.get(id) ?? null,
    };
  });
}

// ---------------------------------------------------------------------------------------------
// Numbers (D55, D58)

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const PLAIN_NUMBER = /^[+-]?(?:\d+(?:\.(\d*))?|\.(\d+))$/;
const COMMA_DECIMAL = /^[+-]?\d*,\d+$/;

/**
 * Reads the file's numbers with the decimal and grouping symbols of the CURRTYPE row that ERMHDR's
 * currency names (D55). A comma read as a decimal the file doesn't declare gives XER_DECIMAL_COMMA
 * once.
 */
class NumberReader {
  private readonly decimal: string;
  private readonly grouped: RegExp | null;
  private readonly group: string;
  issue: ImportIssue | null = null;

  constructor(file: XerFile) {
    const currency = text(file.header[7]);
    const row =
      currency === ''
        ? undefined
        : rowsOf(file, 'CURRTYPE').find((r) => text(r.curr_short_name) === currency);
    const decimal = row?.decimal_symbol ?? '.';
    const group = row?.digit_group_symbol ?? '';
    this.decimal = decimal.length === 1 ? decimal : '.';
    this.group = group.length === 1 && group !== this.decimal ? group : '';
    this.grouped =
      this.group === ''
        ? null
        : new RegExp(
            `^[+-]?[1-9]\\d{0,2}(?:${escapeRegExp(this.group)}\\d{3})+${escapeRegExp(this.decimal)}\\d*$`,
          );
  }

  /**
   * The value and the number of decimals written; null when empty or not a number. A grouped number
   * starts with 1–3 digits, the first not 0, so 0,125 is never read as 125, and has the declared
   * decimal symbol after its groups: a lone separator is a decimal, so 26,667 is never 26,667 h (D59).
   */
  read(
    raw: string | undefined,
    location: string | null,
  ): { value: number; decimals: number } | null {
    let value = text(raw);
    if (value === '') return null;
    if (this.grouped?.test(value)) value = value.split(this.group).join('');
    if (this.decimal !== '.' && !value.includes('.')) value = value.replace(this.decimal, '.');
    if (COMMA_DECIMAL.test(value)) {
      value = value.replace(',', '.');
      this.issue ??= makeIssue('XER_DECIMAL_COMMA', {}, { location, original: text(raw) });
    }
    const match = PLAIN_NUMBER.exec(value);
    if (!match) return null;
    return { value: Number(value), decimals: (match[1] ?? match[2] ?? '').length };
  }

  number(raw: string | undefined, location: string | null): number | null {
    return this.read(raw, location)?.value ?? null;
  }

  /**
   * Hours as minutes (× 60). Six-decimal noise rounds to the whole minute (26.666667 h → 1600);
   * real fractions stay (0.33 h → 19.8), cleared only of floating-point noise (D58).
   */
  minutes(raw: string | undefined, location: string | null): number | null {
    const hours = this.read(raw, location);
    if (!hours) return null;
    const minutes = hours.value * 60;
    const rounded =
      hours.decimals >= 6 ? Math.round(minutes) : Math.round(minutes * 1_000_000) / 1_000_000;
    return rounded === 0 ? 0 : rounded; // never -0
  }
}

// ---------------------------------------------------------------------------------------------
// Values

const CALENDAR_KINDS: Record<string, ImportCalendar['kind']> = {
  CA_Base: 'global',
  CA_Project: 'project',
  CA_Rsrc: 'resource',
};

const TASK_TYPES: Record<string, ImportActivity['type']> = {
  TT_Task: 'task',
  TT_Rsrc: 'task',
  TT_Mile: 'start_milestone',
  TT_FinMile: 'finish_milestone',
  TT_LOE: 'level_of_effort',
  TT_WBS: 'wbs_summary',
};

const STATUSES: Record<string, ImportActivity['status']> = {
  TK_NotStart: 'not_started',
  TK_Active: 'in_progress',
  TK_Complete: 'completed',
};

const STATUS_LABELS: Record<ImportActivity['status'], string> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  completed: 'Completed',
};

const PERCENT_TYPES: Record<string, ImportActivity['percent']['type']> = {
  CP_Drtn: 'duration',
  CP_Phys: 'physical',
  CP_Units: 'units',
};

// CS_MANSTART and CS_MANFINISH are aliases (D58).
const CONSTRAINTS: Record<string, ImportConstraintType> = {
  CS_MSO: 'start_on',
  CS_MSOA: 'start_on_or_after',
  CS_MSOB: 'start_on_or_before',
  CS_MEO: 'finish_on',
  CS_MEOA: 'finish_on_or_after',
  CS_MEOB: 'finish_on_or_before',
  CS_MANDSTART: 'mandatory_start',
  CS_MANSTART: 'mandatory_start',
  CS_MANDFIN: 'mandatory_finish',
  CS_MANFINISH: 'mandatory_finish',
  CS_ALAP: 'as_late_as_possible',
};

// Bare FS, SS, FF and SF are aliases (D58).
const LINK_TYPES: Record<string, ImportRelationship['type']> = {
  PR_FS: 'FS',
  PR_SS: 'SS',
  PR_FF: 'FF',
  PR_SF: 'SF',
  FS: 'FS',
  SS: 'SS',
  FF: 'FF',
  SF: 'SF',
};

function lookup<T>(table: Record<string, T>, key: string): T | undefined {
  return Object.hasOwn(table, key) ? table[key] : undefined;
}

/** A field cut to its limit (§5.10), never inside a surrogate pair, with TEXT_TRUNCATED. */
function limited(
  value: string,
  limit: number,
  field: string,
  code: string,
  location: string | null,
  issues: ImportIssue[],
): string {
  if (value.length <= limit) return value;
  issues.push(
    makeIssue('TEXT_TRUNCATED', { field, code, n: limit }, { location, original: value }),
  );
  return sliceText(value, limit);
}

/** Hours per day of a work week: the most common length of its working days, the longer on a tie. */
function weekHoursPerDay(week: Period[][]): number | null {
  const counts = new Map<number, number>();
  for (const day of week) {
    const minutes = day.reduce((total, period) => total + period.finish - period.start, 0);
    if (minutes > 0) counts.set(minutes, (counts.get(minutes) ?? 0) + 1);
  }
  let best: [number, number] | null = null;
  for (const entry of counts) {
    if (!best || entry[1] > best[1] || (entry[1] === best[1] && entry[0] > best[0])) best = entry;
  }
  return best === null ? null : Math.round((best[0] / 60) * 100) / 100;
}

// ---------------------------------------------------------------------------------------------
// The reader

interface WbsNode {
  row: Row;
  index: number;
  id: string;
}

interface WbsEntry {
  node: WbsNode;
  order: number;
  idNumber: number;
}

function bySiblingOrder(a: WbsEntry, b: WbsEntry): number {
  if (a.order !== b.order) return a.order - b.order;
  if (a.idNumber !== b.idNumber) return a.idNumber < b.idNumber ? -1 : 1;
  return a.node.index - b.node.index;
}

/** A node's parent: null when it is outside the project's nodes (the root among them) or loops back. */
function wbsParent(node: WbsNode, nodeById: ReadonlyMap<string, WbsNode>): string | null {
  const parent = text(node.row.parent_wbs_id);
  if (!nodeById.has(parent)) return null;
  const seen = new Set<string>();
  let current: string | null = parent;
  while (current !== null && !seen.has(current)) {
    if (current === node.id) return null;
    seen.add(current);
    const above = text(nodeById.get(current)?.row.parent_wbs_id);
    current = nodeById.has(above) ? above : null;
  }
  return parent;
}

interface CalendarSource {
  id: string;
  row: Row;
  index: number;
  kind: ImportCalendar['kind'];
}

function emptyResult(file: XerFile): ReadResult {
  return {
    model: emptyModel('xer'),
    issues: [],
    counts: (['calendar', 'wbs', 'activity', 'relationship'] as const).map((entity) => ({
      entity,
      read: 0,
      accepted: 0,
      adjusted: 0,
      skipped: 0,
    })),
    formatVersion: file.version,
    sourceProject: {
      id: null,
      code: null,
      name: null,
      projectsInFile: rowsOf(file, 'PROJECT').length,
      rootWbsName: null,
      mustFinishBy: null,
      stated: { start: null, finish: null },
    },
    units: { minutesPerDay: null, calendars: [] },
    externalLinks: [],
    notImported: notImported(file),
    elements: [],
    statusDate: { date: null, time: null, source: 'none' },
  };
}

function notImported(file: XerFile): ReadResult['notImported'] {
  return [...file.tables.values()]
    .filter((table) => !READ_TABLES.has(table.name))
    .map((table) => ({ table: table.name, rows: table.rows.length }));
}

function locationOf(table: XerTable | undefined, index: number): string | null {
  const line = table?.lines[index];
  return table && line !== undefined ? `${table.name} line ${line}` : null;
}

/** Reads the project `sourceProjectId` of an XER file. */
export function readXer(file: XerFile, sourceProjectId: string): ReadResult {
  const projects = rowsOf(file, 'PROJECT');
  const project = projects.find((row) => text(row.proj_id) === sourceProjectId);
  if (!project) return emptyResult(file);

  const issues: ImportIssue[] = [];
  const numbers = new NumberReader(file);
  const model = emptyModel('xer');
  const projectCode = textOrNull(project.proj_short_name);
  const shortNames = new Map(
    projects.map((row) => [
      text(row.proj_id),
      textOrNull(row.proj_short_name) ?? text(row.proj_id),
    ]),
  );
  if (projects.length > 1) {
    issues.push(
      makeIssue('XER_MULTIPLE_PROJECTS', {
        n: projects.length,
        code: projectCode ?? sourceProjectId,
      }),
    );
  }

  const taskTable = file.tables.get('TASK');
  const calendarTable = file.tables.get('CALENDAR');
  const wbsTable = file.tables.get('PROJWBS');
  const predTable = file.tables.get('TASKPRED');

  // Every task of the file by id, and this project's tasks in file order.
  const taskById = new Map<string, { row: Row; index: number; projectId: string }>();
  rowsOf(file, 'TASK').forEach((row, index) => {
    const id = text(row.task_id);
    if (!taskById.has(id)) taskById.set(id, { row, index, projectId: text(row.proj_id) });
  });
  const projectTasks = rowsOf(file, 'TASK')
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => text(row.proj_id) === sourceProjectId);

  // ---- Calendars ------------------------------------------------------------------------------
  const calendarById = new Map<string, CalendarSource>();
  rowsOf(file, 'CALENDAR').forEach((row, index) => {
    const id = text(row.clndr_id);
    if (id !== '' && !calendarById.has(id)) {
      calendarById.set(id, {
        id,
        row,
        index,
        kind: lookup(CALENDAR_KINDS, text(row.clndr_type)) ?? 'global',
      });
    }
  });
  const assignable = (id: string): boolean => {
    const calendar = calendarById.get(id);
    return calendar !== undefined && calendar.kind !== 'resource';
  };
  // The project's calendar, else the first calendar an activity may use.
  const projectCalendarId = text(project.clndr_id);
  const defaultCalendarId = assignable(projectCalendarId)
    ? projectCalendarId
    : ([...calendarById.values()].find((c) => c.kind !== 'resource')?.id ?? null);

  const baseOf = (id: string): string => text(calendarById.get(id)?.row.base_clndr_id);
  // The chain of present bases above `id`, nearest first; `cyclic` when it leads back to `id`.
  const baseChain = (id: string): { chain: string[]; cyclic: boolean } => {
    const chain: string[] = [];
    const seen = new Set([id]);
    let current = baseOf(id);
    while (current !== '' && calendarById.has(current) && chain.length < MAX_BASE_LEVELS) {
      if (current === id) return { chain: [], cyclic: true };
      if (seen.has(current)) break;
      seen.add(current);
      chain.push(current);
      current = baseOf(current);
    }
    return { chain, cyclic: false };
  };

  const activityCalendar = (row: Row): string | null => {
    const id = text(row.clndr_id);
    return assignable(id) ? id : defaultCalendarId;
  };
  const used = new Set<string>();
  const addUsed = (id: string | null) => {
    if (id === null || used.has(id)) return;
    used.add(id);
    for (const base of baseChain(id).chain) used.add(base);
  };
  addUsed(defaultCalendarId);
  for (const { row } of projectTasks) addUsed(activityCalendar(row));
  const readIds = new Set(used);
  for (const calendar of calendarById.values()) {
    if (calendar.kind === 'resource' && !readIds.has(calendar.id)) {
      readIds.add(calendar.id);
      for (const base of baseChain(calendar.id).chain) readIds.add(base);
    }
  }
  const toRead = [...calendarById.values()]
    .filter((calendar) => readIds.has(calendar.id))
    .sort((a, b) => a.index - b.index);

  const calendarCount: ImportCount = {
    entity: 'calendar',
    read: toRead.length,
    accepted: 0,
    adjusted: 0,
    skipped: 0,
  };
  const parsed = new Map<string, NonNullable<ReturnType<typeof parseCalendarData>>>();
  const adjustedCalendars = new Set<string>();
  const calendarIssues = new Map<string, ImportIssue[]>();
  const issueFor = (id: string, issue: ImportIssue) => {
    const list = calendarIssues.get(id) ?? [];
    list.push(issue);
    calendarIssues.set(id, list);
  };
  for (const calendar of toRead) {
    const name = text(calendar.row.clndr_name) || calendar.id;
    const location = locationOf(calendarTable, calendar.index);
    const data = parseCalendarData(calendar.row.clndr_data ?? '');
    if (!data) {
      const code: IssueCode = used.has(calendar.id)
        ? 'CALENDAR_UNREADABLE'
        : 'CALENDAR_UNUSED_SKIPPED';
      issueFor(calendar.id, makeIssue(code, { name }, { location }));
      continue;
    }
    parsed.set(calendar.id, data);
    if (data.repaired) {
      issueFor(calendar.id, makeIssue('CALENDAR_DATA_REPAIRED', { name }, { location }));
      adjustedCalendars.add(calendar.id);
    }
  }

  let exceptionTotal = 0;
  for (const calendar of toRead) {
    const data = parsed.get(calendar.id);
    if (!data) continue;
    const name = text(calendar.row.clndr_name) || calendar.id;
    const location = locationOf(calendarTable, calendar.index);

    // Inheritance (§5.5, D51): the exceptions of the bases above it that it doesn't list itself.
    // A missing, self-referencing or cyclic base is a warning, and the calendar is read as written.
    const baseId = baseOf(calendar.id);
    const exceptions = new Map(data.exceptions.map((e) => [e.date, e.periods]));
    if (baseId !== '') {
      const { chain, cyclic } = baseChain(calendar.id);
      if (!calendarById.has(baseId) || baseId === calendar.id || cyclic) {
        issueFor(
          calendar.id,
          makeIssue('XER_CALENDAR_BASE_MISSING', { name }, { location, original: baseId }),
        );
        adjustedCalendars.add(calendar.id);
      } else {
        for (const base of chain) {
          for (const exception of parsed.get(base)?.exceptions ?? []) {
            if (!exceptions.has(exception.date)) exceptions.set(exception.date, exception.periods);
          }
        }
      }
    }
    exceptionTotal += exceptions.size;

    // Hours per day: the work week's, when day_hr_cnt says otherwise (§5.5).
    const stated = numbers.number(calendar.row.day_hr_cnt, location);
    const actual = weekHoursPerDay(data.week);
    const hoursPerDay = actual ?? stated ?? 8;
    if (actual !== null && stated !== null && Math.abs(actual - stated) > 0.005) {
      issueFor(
        calendar.id,
        makeIssue('CALENDAR_HOURS_MISMATCH', { name, stated, actual }, { location }),
      );
      adjustedCalendars.add(calendar.id);
    }

    model.calendars.push({
      id: calendar.id,
      name,
      kind: calendar.kind,
      week: data.week,
      exceptions: [...exceptions.entries()]
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([date, periods]) => ({ date, periods })),
      hoursPerDay,
      hoursPerWeek: numbers.number(calendar.row.week_hr_cnt, location),
      hoursPerMonth: numbers.number(calendar.row.month_hr_cnt, location),
      hoursPerYear: numbers.number(calendar.row.year_hr_cnt, location),
    });
    calendarCount.accepted += 1;
  }
  calendarCount.skipped = calendarCount.read - calendarCount.accepted;
  calendarCount.adjusted = model.calendars.filter((c) => adjustedCalendars.has(c.id)).length;
  for (const calendar of toRead) issues.push(...(calendarIssues.get(calendar.id) ?? []));
  if (exceptionTotal > MAX_EXCEPTIONS) issues.push(makeIssue('FILE_TOO_MANY_EXCEPTIONS'));

  // ---- WBS ------------------------------------------------------------------------------------
  const root = rootNodes(file).get(sourceProjectId) ?? null;
  const rootName = textOrNull(root?.wbs_name);
  const wbsNodes: WbsNode[] = rowsOf(file, 'PROJWBS')
    .map((row, index) => ({ row, index, id: text(row.wbs_id) }))
    .filter(({ row }) => text(row.proj_id) === sourceProjectId && row !== root);
  const nodeById = new Map(wbsNodes.map((node) => [node.id, node]));
  const wbsCount: ImportCount = {
    entity: 'wbs',
    read: wbsNodes.length,
    accepted: wbsNodes.length,
    adjusted: 0,
    skipped: 0,
  };
  const children = new Map<string | null, WbsEntry[]>();
  for (const node of wbsNodes) {
    const parentId = wbsParent(node, nodeById);
    const idNumber = node.id === '' ? NaN : Number(node.id);
    const entry: WbsEntry = {
      node,
      order: numbers.number(node.row.seq_num, locationOf(wbsTable, node.index)) ?? 0,
      idNumber: Number.isFinite(idNumber) ? idNumber : Infinity,
    };
    const siblings = children.get(parentId);
    if (siblings) siblings.push(entry);
    else children.set(parentId, [entry]);
  }
  const siblingsOf = (parentId: string | null): WbsEntry[] =>
    (children.get(parentId) ?? []).sort(bySiblingOrder);
  // Pre-order, siblings by seq_num, then numeric wbs_id, then line (D58).
  const stack = siblingsOf(null)
    .reverse()
    .map((entry) => ({ entry, parentId: null as string | null }));
  while (stack.length > 0) {
    const { entry, parentId } = stack.pop()!;
    const location = locationOf(wbsTable, entry.node.index);
    const code = text(entry.node.row.wbs_short_name);
    const before = issues.length;
    const name = limited(
      entry.node.row.wbs_name ?? '',
      TEXT_LIMITS.name,
      'name',
      code,
      location,
      issues,
    );
    if (issues.length > before) wbsCount.adjusted += 1;
    model.wbs.push({ id: entry.node.id, parentId, code, name, order: entry.order });
    for (const child of siblingsOf(entry.node.id).reverse())
      stack.push({ entry: child, parentId: entry.node.id });
  }

  // ---- Activities -----------------------------------------------------------------------------
  const activityCount: ImportCount = {
    entity: 'activity',
    read: projectTasks.length,
    accepted: 0,
    adjusted: 0,
    skipped: 0,
  };
  const codeByTaskId = new Map<string, string>();
  const seenCodes = new Set<string>();
  const reportedCodes = new Set<string>();
  let expectedFinishes = 0;
  let noCalendarReported = false;
  for (const { row, index } of projectTasks) {
    const location = locationOf(taskTable, index);
    const before = issues.length;
    const rawCode = text(row.task_code);
    const code = limited(rawCode, TEXT_LIMITS.code, 'code', rawCode, location, issues);
    const name = limited(row.task_name ?? '', TEXT_LIMITS.name, 'name', code, location, issues);
    if (seenCodes.has(code) && !reportedCodes.has(code)) {
      issues.push(makeIssue('DUPLICATE_CODE', { code }, { location }));
      reportedCodes.add(code);
    }
    seenCodes.add(code);
    codeByTaskId.set(text(row.task_id), code);

    // Type (D54: an unknown task_type reads as task).
    const rawType = text(row.task_type);
    let type = lookup(TASK_TYPES, rawType);
    if (type === undefined) {
      type = 'task';
      issues.push(
        makeIssue(
          'XER_UNKNOWN_VALUE',
          { code, field: 'type', value: rawType || 'empty', used: 'Task' },
          { location, original: rawType || null, used: 'task' },
        ),
      );
    }
    const resourceDependent = rawType === 'TT_Rsrc';
    if (resourceDependent) issues.push(makeIssue('XER_RESOURCE_TASK', { code }, { location }));

    // Calendar: a task without a known calendar uses the project's (§5.5).
    let calendarId = text(row.clndr_id);
    if (!assignable(calendarId)) {
      if (defaultCalendarId !== null) {
        issues.push(
          makeIssue(
            'CALENDAR_MISSING',
            { code },
            { location, original: calendarId || null, used: defaultCalendarId },
          ),
        );
        calendarId = defaultCalendarId;
      } else if (!noCalendarReported) {
        // Nothing the activities could be scheduled on.
        issues.push(makeIssue('FILE_UNREADABLE', {}, { location }));
        noCalendarReported = true;
      }
    }

    const actual = { start: wallClock(row.act_start_date), finish: wallClock(row.act_end_date) };
    const physical = numbers.number(row.phys_complete_pct, location);

    // Status (D54: a blank or unknown status_code is derived as MSPDI's is, §5.6).
    const rawStatus = text(row.status_code);
    let status = lookup(STATUSES, rawStatus);
    if (status === undefined) {
      if (actual.finish !== null) status = 'completed';
      else if (actual.start !== null) status = 'in_progress';
      else if (physical !== null && physical >= 100) status = 'completed';
      else if (physical !== null && physical > 0) status = 'in_progress';
      else status = 'not_started';
      issues.push(
        makeIssue(
          'XER_UNKNOWN_VALUE',
          { code, field: 'status', value: rawStatus || 'empty', used: STATUS_LABELS[status] },
          { location, original: rawStatus || null, used: status },
        ),
      );
    }

    const constraint = (typeField: string, dateField: string): ImportActivity['constraint'] => {
      const raw = text(row[typeField]);
      if (raw === '') return null;
      const constraintType = lookup(CONSTRAINTS, raw);
      if (constraintType === undefined) {
        issues.push(
          makeIssue('CONSTRAINT_UNSUPPORTED', { code, value: raw }, { location, original: raw }),
        );
        return null;
      }
      return {
        type: constraintType,
        date: constraintType === 'as_late_as_possible' ? null : wallClock(row[dateField]),
      };
    };

    if (wallClock(row.expect_end_date) !== null) expectedFinishes += 1;
    const wbsId = text(row.wbs_id);
    model.activities.push({
      keys: { taskId: text(row.task_id), uid: null, guid: null },
      code,
      name,
      // An activity whose WBS lies outside its project (or is the project node) is at the top (D58).
      wbsId: nodeById.has(wbsId) ? wbsId : null,
      calendarId,
      type,
      originalDuration: numbers.minutes(row.target_drtn_hr_cnt, location),
      remainingDuration: numbers.minutes(row.remain_drtn_hr_cnt, location),
      planned: { start: wallClock(row.target_start_date), finish: wallClock(row.target_end_date) },
      early: { start: wallClock(row.early_start_date), finish: wallClock(row.early_end_date) },
      late: { start: wallClock(row.late_start_date), finish: wallClock(row.late_end_date) },
      actual,
      remaining: { start: wallClock(row.restart_date), finish: wallClock(row.reend_date) },
      constraint: constraint('cstr_type', 'cstr_date'),
      secondaryConstraint: constraint('cstr_type2', 'cstr_date2'),
      status,
      percent: {
        duration: null,
        physical,
        type: lookup(PERCENT_TYPES, text(row.complete_pct_type)) ?? null,
      },
      totalFloat: numbers.minutes(row.total_float_hr_cnt, location),
      freeFloat: numbers.minutes(row.free_float_hr_cnt, location),
      notes: null,
      flags: { manual: false, elapsed: false, resourceDependent },
    });
    activityCount.accepted += 1;
    if (issues.slice(before).some((issue) => ADJUSTING_ACTIVITY.has(issue.code)))
      activityCount.adjusted += 1;
  }
  if (expectedFinishes > 0) issues.push(makeIssue('XER_EXPECTED_FINISH', { n: expectedFinishes }));

  // ---- Relationships --------------------------------------------------------------------------
  const relationshipCount: ImportCount = {
    entity: 'relationship',
    read: 0,
    accepted: 0,
    adjusted: 0,
    skipped: 0,
  };
  const externalLinks = new Map<string, number>();
  const linkKeys = new Set<string>();
  rowsOf(file, 'TASKPRED').forEach((row, index) => {
    const successorId = text(row.task_id);
    const predecessorId = text(row.pred_task_id);
    const successor = taskById.get(successorId);
    const predecessor = taskById.get(predecessorId);
    const inProject = (task: typeof successor) => task?.projectId === sourceProjectId;
    if (!inProject(successor) && !inProject(predecessor)) return;
    relationshipCount.read += 1;
    const location = locationOf(predTable, index);
    const codeOf = (id: string, task: typeof successor) =>
      codeByTaskId.get(id) ?? textOrNull(task?.row.task_code) ?? id;
    const names = {
      predecessor: codeOf(predecessorId, predecessor),
      successor: codeOf(successorId, successor),
    };
    const skip = (issue: ImportIssue) => {
      issues.push(issue);
      relationshipCount.skipped += 1;
    };

    if (successorId === predecessorId)
      return skip(makeIssue('LINK_SELF', { code: names.successor }, { location }));
    // The other end's project: its TASK row's, or, when its task isn't in the file, the project this
    // row names for it (pred_proj_id or proj_id), as P6 writes for links to other projects (§5.5).
    const otherIsPredecessor = inProject(successor);
    const other = otherIsPredecessor ? predecessor : successor;
    const otherProject = other
      ? other.projectId
      : (textOrNull(otherIsPredecessor ? row.pred_proj_id : row.proj_id) ?? sourceProjectId);
    if (otherProject !== sourceProjectId) {
      const target = shortNames.get(otherProject) ?? otherProject;
      externalLinks.set(target, (externalLinks.get(target) ?? 0) + 1);
      return skip(makeIssue('XER_CROSS_PROJECT_LINK', names, { location }));
    }
    if (!successor || !predecessor)
      return skip(makeIssue('LINK_UNKNOWN_ACTIVITY', names, { location }));

    const rawType = text(row.pred_type);
    const type = lookup(LINK_TYPES, rawType) ?? 'FS';
    // A repeated link keys on predecessor, successor and type (D58).
    const key = `${predecessorId}\u0000${successorId}\u0000${type}`;
    if (linkKeys.has(key)) return skip(makeIssue('LINK_DUPLICATE', names, { location }));
    linkKeys.add(key);
    if (lookup(LINK_TYPES, rawType) === undefined) {
      issues.push(
        makeIssue(
          'LINK_TYPE_UNKNOWN',
          { ...names, value: rawType || 'empty' },
          { location, original: rawType || null, used: 'FS' },
        ),
      );
      relationshipCount.adjusted += 1;
    }
    model.relationships.push({
      predecessorCode: names.predecessor,
      successorCode: names.successor,
      type,
      lagMinutes: numbers.minutes(row.lag_hr_cnt, location) ?? 0,
      lagElapsed: false,
    });
    relationshipCount.accepted += 1;
  });

  if (numbers.issue) issues.push(numbers.issue);

  // ---- Project --------------------------------------------------------------------------------
  // The status date is last_recalc_date; data_date only when that is absent (D58).
  const statusClock = wallClock(project.last_recalc_date) ?? wallClock(project.data_date);
  const statedStart = wallClock(project.plan_start_date);
  const statedFinish = wallClock(project.scd_end_date);
  const mustFinishBy = wallClock(project.plan_end_date);
  model.project = {
    code: projectCode,
    name: rootName,
    rootWbsName: rootName,
    statedStart,
    statedFinish,
    mustFinishBy,
    statusDate: statusClock,
    defaultCalendarId,
  };
  model.settings = settingsOf(project);

  const { activities } = model;
  const count = (test: (activity: ImportActivity) => boolean) => activities.filter(test).length;
  const tableRows = (...names: string[]) =>
    names.reduce((total, name) => total + rowsOf(file, name).length, 0);
  const otherRows = [...file.tables.values()]
    .filter((table) => !READ_TABLES.has(table.name) && !COVERED_TABLES.has(table.name))
    .reduce((total, table) => total + table.rows.length, 0);
  const elements = [
    { element: 'Activities', items: activities.length },
    { element: 'Relationships', items: model.relationships.length },
    { element: 'Calendars', items: model.calendars.length },
    {
      element: 'Durations',
      items: count((a) => a.originalDuration !== null || a.remainingDuration !== null),
    },
    {
      element: 'Actual dates',
      items: count((a) => a.actual.start !== null || a.actual.finish !== null),
    },
    {
      element: 'Constraints',
      items: count((a) => a.constraint !== null || a.secondaryConstraint !== null),
    },
    { element: 'WBS', items: model.wbs.length },
    {
      element: 'Early and late dates',
      items: count((a) =>
        [a.early.start, a.early.finish, a.late.start, a.late.finish].some((d) => d !== null),
      ),
    },
    {
      element: 'Total and free float',
      items: count((a) => a.totalFloat !== null || a.freeFloat !== null),
    },
    { element: 'Scheduling settings', items: model.settings.length },
    { element: 'Expected finish dates', items: expectedFinishes },
    { element: 'Resources', items: tableRows('RSRC', 'RSRCRATE') },
    { element: 'Resource assignments', items: tableRows('TASKRSRC') },
    { element: 'Activity codes', items: tableRows('ACTVTYPE', 'ACTVCODE', 'TASKACTV') },
    { element: 'User-defined fields', items: tableRows('UDFTYPE', 'UDFVALUE') },
    { element: 'Notebook topics', items: tableRows('TASKMEMO', 'MEMOTYPE') },
    { element: 'Other tables', items: otherRows },
  ].filter((element) => element.items > 0);

  return {
    model,
    issues,
    counts: [calendarCount, wbsCount, activityCount, relationshipCount],
    formatVersion: file.version,
    sourceProject: {
      id: sourceProjectId,
      code: projectCode,
      name: rootName,
      projectsInFile: projects.length,
      rootWbsName: rootName,
      mustFinishBy: datePart(mustFinishBy),
      stated: { start: datePart(statedStart), finish: datePart(statedFinish) },
    },
    units: {
      minutesPerDay: null,
      calendars: model.calendars.map((c) => ({ name: c.name, hoursPerDay: c.hoursPerDay })),
    },
    externalLinks: [...externalLinks.entries()].map(([target, links]) => ({ target, links })),
    notImported: notImported(file),
    elements,
    statusDate:
      statusClock === null
        ? { date: null, time: null, source: 'none' }
        : { date: statusClock.slice(0, 10), time: statusClock.slice(11, 16), source: 'file' },
  };
}

// Tables an outcome element other than "Other tables" covers.
const COVERED_TABLES = new Set([
  'RSRC',
  'RSRCRATE',
  'TASKRSRC',
  'ACTVTYPE',
  'ACTVCODE',
  'TASKACTV',
  'UDFTYPE',
  'UDFVALUE',
  'TASKMEMO',
  'MEMOTYPE',
]);

/** The scheduling options kept for P4, in a fixed order, when the PROJECT row has the field. */
function settingsOf(project: Row): Array<{ key: string; value: string }> {
  const has = (field: string) => Object.hasOwn(project, field);
  const settings: Array<{ key: string; value: string }> = [];
  if (has('sched_retained_logic') || has('sched_progress_override')) {
    let mode = 'actual_dates';
    if (text(project.sched_retained_logic) === 'Y') mode = 'retained_logic';
    else if (text(project.sched_progress_override) === 'Y') mode = 'progress_override';
    settings.push({ key: 'progress_mode', value: mode });
  }
  for (const field of [
    'sched_calendar_on_relationship_lag',
    'act_this_per_link_flag',
    'add_act_remain_flag',
    'cost_qty_recalc_flag',
    'reset_planned_flag',
  ]) {
    if (has(field)) settings.push({ key: field, value: project[field] ?? '' });
  }
  return settings;
}
