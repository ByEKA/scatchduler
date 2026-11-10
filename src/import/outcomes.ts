import type { ImportFormat, ImportOutcome } from '@/data/types';

// Every source element we know, per format, with what the import does with it (P3 core spec §5.9;
// the element names are our wording, §10). The report lists the elements present with their counts.

type Catalog = ReadonlyArray<{ element: string; outcome: ImportOutcome }>;

function catalog(used: string[], kept: string[], notRead: string[]): Catalog {
  return [
    ...used.map((element) => ({ element, outcome: 'used' as const })),
    ...kept.map((element) => ({ element, outcome: 'kept' as const })),
    ...notRead.map((element) => ({ element, outcome: 'not_read' as const })),
  ];
}

const TABLE_CATALOG = catalog(
  [
    'Activity code',
    'Activity name',
    'Duration',
    'Start',
    'Finish',
    'Actual start',
    'Actual finish',
    'Activity type',
    'Calendar',
    'Constraint',
    'Constraint date',
    '% complete',
    'Predecessors',
  ],
  ['Task ID', 'WBS', 'Notes'],
  ['Unmapped columns'],
);

export const OUTCOME_CATALOG: Record<ImportFormat, Catalog> = {
  xer: catalog(
    ['Activities', 'Relationships', 'Calendars', 'Durations', 'Actual dates', 'Constraints'],
    ['WBS', 'Early and late dates', 'Total and free float', 'Scheduling settings'],
    [
      'Expected finish dates',
      'Resources',
      'Resource assignments',
      'Activity codes',
      'User-defined fields',
      'Notebook topics',
      'Other tables',
    ],
  ),
  mspdi: catalog(
    ['Tasks', 'Links', 'Calendars', 'Durations', 'Actual dates', 'Constraints', 'Manual starts'],
    [
      'Summary tasks',
      'Early and late dates',
      'Total and free slack',
      'Task notes',
      'Scheduling settings',
    ],
    [
      'Deadlines',
      'Resources',
      'Assignments',
      'Baselines',
      'Costs',
      'Custom fields',
      'Outline codes',
      'Hyperlinks',
      'Recurring task definitions',
      'Leveling and priority',
      'Timephased data',
      'Split segments',
      'Earned value',
    ],
  ),
  xlsx: TABLE_CATALOG,
  csv: TABLE_CATALOG,
};

export const OUTCOME_LABELS: Record<ImportOutcome, string> = {
  used: 'Used for dates',
  kept: 'Kept for display and export',
  not_read: 'Not read; still in the original file',
};
