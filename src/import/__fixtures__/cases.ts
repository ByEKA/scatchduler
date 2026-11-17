import type { ImportMapping, TableAssumptions, TableMapping } from '@/data/types';

// The golden cases (P3 core spec S4, §5.8): each fixture read through a mapping written out here
// in full, so a change to detection or the automatic mapping can't change what a golden pins.
// `npm run goldens` writes <name>.report.json (without durationMs and parserVersion) and
// <name>.model.json from them; each golden is a pinned decision, checked by hand.

export interface GoldenCase {
  name: string;
  file: string;
  mapping: ImportMapping;
}

const ASSUMPTIONS: TableAssumptions = {
  duration: 'original',
  startFinish: 'planned',
  percentComplete: 'duration',
  dateOnlyStart: '08:00',
  dateOnlyFinish: '17:00',
  weekUnitDays: 5,
  defaultWorkWeek: 'mon-fri',
};

// Both workbooks hold the same plan, one in each Excel date system.
const PLAN_SHEET: TableMapping = {
  sheet: 'Plan',
  headerRow: 1,
  delimiter: null,
  decimalSeparator: '.',
  dateFormat: 'DD.MM.YYYY',
  durationUnit: 'days',
  hoursPerDay: 8,
  predecessorRef: 'code',
  skipRowsWithIssues: false,
  columns: {
    code: { index: 0, header: 'Code' },
    name: { index: 1, header: 'Name' },
    duration: { index: 2, header: 'Duration' },
    start: { index: 3, header: 'Start' },
    finish: { index: 4, header: 'Finish' },
    percentComplete: { index: 5, header: '% Complete' },
    predecessors: { index: 6, header: 'Predecessors' },
  },
  assumptions: ASSUMPTIONS,
};

export const GOLDEN_CASES: GoldenCase[] = [
  {
    name: 'two-projects.NTH-A',
    file: 'two-projects.xer',
    mapping: {
      schemaVersion: 1,
      format: 'xer',
      encoding: 'utf-8',
      sourceProjectId: '101',
      activityCodeField: null,
      table: null,
    },
  },
  {
    name: 'two-projects.NTH-B',
    file: 'two-projects.xer',
    mapping: {
      schemaVersion: 1,
      format: 'xer',
      encoding: 'utf-8',
      sourceProjectId: '102',
      activityCodeField: null,
      table: null,
    },
  },
  {
    name: 'project',
    file: 'project.xml',
    mapping: {
      schemaVersion: 1,
      format: 'mspdi',
      encoding: null,
      sourceProjectId: null,
      activityCodeField: 'UID',
      table: null,
    },
  },
  {
    name: 'turkish-1254',
    file: 'turkish-1254.csv',
    mapping: {
      schemaVersion: 1,
      format: 'csv',
      encoding: 'windows-1254',
      sourceProjectId: null,
      activityCodeField: null,
      table: {
        sheet: null,
        headerRow: 1,
        delimiter: ';',
        decimalSeparator: ',',
        dateFormat: 'DD.MM.YYYY',
        durationUnit: 'days',
        hoursPerDay: 8,
        predecessorRef: 'code',
        skipRowsWithIssues: false,
        columns: {
          code: { index: 0, header: 'Aktivite Kodu' },
          name: { index: 1, header: 'Aktivite Adı' },
          duration: { index: 2, header: 'Süre' },
          start: { index: 3, header: 'Başlangıç' },
          finish: { index: 4, header: 'Bitiş' },
          predecessors: { index: 5, header: 'Öncüller' },
          percentComplete: { index: 6, header: '% Tamamlanma' },
          calendar: { index: 7, header: 'Takvim' },
        },
        assumptions: ASSUMPTIONS,
      },
    },
  },
  {
    name: 'utf8',
    file: 'utf8.csv',
    mapping: {
      schemaVersion: 1,
      format: 'csv',
      encoding: 'utf-8',
      sourceProjectId: null,
      activityCodeField: null,
      table: {
        sheet: null,
        headerRow: 1,
        delimiter: ',',
        decimalSeparator: '.',
        dateFormat: 'YYYY-MM-DD',
        durationUnit: 'days',
        hoursPerDay: 8,
        predecessorRef: 'code',
        skipRowsWithIssues: false,
        columns: {
          code: { index: 0, header: 'Activity ID' },
          name: { index: 1, header: 'Activity Name' },
          duration: { index: 2, header: 'Duration' },
          start: { index: 3, header: 'Start' },
          finish: { index: 4, header: 'Finish' },
          predecessors: { index: 5, header: 'Predecessors' },
          activityType: { index: 6, header: 'Activity Type' },
          constraintType: { index: 7, header: 'Constraint' },
          constraintDate: { index: 8, header: 'Constraint Date' },
          wbs: { index: 9, header: 'WBS' },
        },
        assumptions: ASSUMPTIONS,
      },
    },
  },
  {
    name: 'msp-table',
    file: 'msp-table.csv',
    mapping: {
      schemaVersion: 1,
      format: 'csv',
      encoding: 'utf-8',
      sourceProjectId: null,
      activityCodeField: null,
      table: {
        sheet: null,
        headerRow: 1,
        delimiter: ',',
        decimalSeparator: '.',
        dateFormat: 'MM/DD/YYYY',
        durationUnit: 'days',
        hoursPerDay: 8,
        predecessorRef: 'taskId',
        skipRowsWithIssues: false,
        columns: {
          taskId: { index: 0, header: 'ID' },
          code: { index: 1, header: 'Unique ID' },
          name: { index: 2, header: 'Name' },
          duration: { index: 3, header: 'Duration' },
          start: { index: 4, header: 'Start' },
          finish: { index: 5, header: 'Finish' },
          predecessors: { index: 6, header: 'Predecessors' },
          percentComplete: { index: 7, header: '% Complete' },
        },
        assumptions: ASSUMPTIONS,
      },
    },
  },
  {
    name: 'dates-1900',
    file: 'dates-1900.xlsx',
    mapping: {
      schemaVersion: 1,
      format: 'xlsx',
      encoding: null,
      sourceProjectId: null,
      activityCodeField: null,
      table: PLAN_SHEET,
    },
  },
  {
    name: 'dates-1904',
    file: 'dates-1904.xlsx',
    mapping: {
      schemaVersion: 1,
      format: 'xlsx',
      encoding: null,
      sourceProjectId: null,
      activityCodeField: null,
      table: PLAN_SHEET,
    },
  },
  // Readings taken from real exports (D68, D69): an older P6 export, and a workbook with title rows.
  {
    name: 'legacy-p6',
    file: 'legacy-p6.xer',
    mapping: {
      schemaVersion: 1,
      format: 'xer',
      encoding: 'utf-8',
      sourceProjectId: '201',
      activityCodeField: null,
      table: null,
    },
  },
  {
    name: 'title-rows',
    file: 'title-rows.xlsx',
    mapping: {
      schemaVersion: 1,
      format: 'xlsx',
      encoding: null,
      sourceProjectId: null,
      activityCodeField: null,
      // The workbook's defaultTableMapping: the header row guessed below the two title rows, the
      // decimal comma taken from the lag "1,5 g".
      table: {
        sheet: 'Program',
        headerRow: 4,
        delimiter: null,
        decimalSeparator: ',',
        dateFormat: 'DD.MM.YYYY',
        durationUnit: 'days',
        hoursPerDay: 8,
        predecessorRef: 'code',
        skipRowsWithIssues: false,
        columns: {
          code: { index: 0, header: 'Activity ID' },
          name: { index: 1, header: 'Activity Name' },
          duration: { index: 2, header: 'Duration' },
          start: { index: 3, header: 'Start' },
          finish: { index: 4, header: 'Finish' },
          percentComplete: { index: 5, header: '% of Complete' },
          predecessors: { index: 6, header: 'Predecessors' },
        },
        assumptions: ASSUMPTIONS,
      },
    },
  },
];
