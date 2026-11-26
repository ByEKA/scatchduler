import type {
  ScheduleActivity,
  ScheduleCalendar,
  ScheduleDocument,
  ScheduleRelationship,
  ScheduleSettings,
  ScheduleWbsNode,
} from '@/data/schedule-types';

const STANDARD_WORKDAY = [
  { start: 480, finish: 720 },
  { start: 780, finish: 1020 },
];

export function makeStandardCalendar(
  id = 'cal:standard',
  overrides?: Partial<ScheduleCalendar>,
): ScheduleCalendar {
  return {
    id,
    name: 'Standard',
    kind: 'project',
    week: [
      [],
      STANDARD_WORKDAY.map((p) => ({ ...p })),
      STANDARD_WORKDAY.map((p) => ({ ...p })),
      STANDARD_WORKDAY.map((p) => ({ ...p })),
      STANDARD_WORKDAY.map((p) => ({ ...p })),
      STANDARD_WORKDAY.map((p) => ({ ...p })),
      [],
    ],
    exceptions: [],
    hoursPerDay: 8,
    hoursPerWeek: 40,
    hoursPerMonth: 172,
    hoursPerYear: 2000,
    ...overrides,
  };
}

export function makeActivity(
  overrides: Partial<ScheduleActivity> & { id: string; code: string },
): ScheduleActivity {
  const type = overrides.type ?? 'task';
  const isMilestone = type === 'start_milestone' || type === 'finish_milestone';
  const originalDuration = overrides.originalDuration ?? (isMilestone ? 0 : 480);
  const status = overrides.status ?? 'not_started';
  const remainingDuration =
    overrides.remainingDuration ?? (status === 'completed' ? 0 : originalDuration);

  return {
    id: overrides.id,
    code: overrides.code,
    name: overrides.name ?? overrides.code,
    wbsId: overrides.wbsId ?? null,
    calendarId: overrides.calendarId ?? 'cal:standard',
    type,
    order: overrides.order ?? 0,
    originalDuration,
    remainingDuration,
    status,
    actualStart: overrides.actualStart ?? null,
    actualFinish: overrides.actualFinish ?? null,
    percent: overrides.percent ?? { duration: null, physical: null, type: 'duration' },
    constraint: overrides.constraint ?? null,
    secondaryConstraint: overrides.secondaryConstraint ?? null,
    notes: overrides.notes ?? null,
    flags: overrides.flags ?? { manual: false, elapsed: false, resourceDependent: false },
    keys: overrides.keys ?? { taskId: null, uid: null, guid: null },
    sourceDates: overrides.sourceDates ?? null,
  };
}

export function makeRelationship(
  overrides: Partial<ScheduleRelationship> & { predecessorId: string; successorId: string },
): ScheduleRelationship {
  return {
    id: overrides.id ?? `rel:${overrides.predecessorId}->${overrides.successorId}`,
    predecessorId: overrides.predecessorId,
    successorId: overrides.successorId,
    type: overrides.type ?? 'FS',
    lagMinutes: overrides.lagMinutes ?? 0,
    lagElapsed: overrides.lagElapsed ?? false,
  };
}

export function makeDocument(overrides?: Partial<ScheduleDocument>): ScheduleDocument {
  const calendars = overrides?.calendars ?? [makeStandardCalendar('cal:standard')];
  const defaultCalendarId = calendars[0]?.id ?? 'cal:standard';
  const defaultSettings: ScheduleSettings = {
    profile: 'default',
    ruleOverrides: {},
    progressMode: 'retained_logic',
    displayMode: 'calculated',
    lagCalendar: 'predecessor',
    criticalDefinition: 'total_float',
    criticalThresholdMinutes: 0,
    nearCriticalThresholdMinutes: 4800,
    projectStart: '2026-01-05T08:00',
    mustFinishBy: null,
    statusDate: '2026-01-05T08:00',
    defaultCalendarId,
    autoCalculate: false,
  };

  return {
    schemaVersion: 1,
    sourceFormat: overrides?.sourceFormat ?? null,
    settings: { ...defaultSettings, ...overrides?.settings },
    calendars,
    wbs: overrides?.wbs ?? [],
    activities: overrides?.activities ?? [],
    relationships: overrides?.relationships ?? [],
    computed: overrides?.computed ?? null,
  };
}

/**
 * Generates a deterministic acyclic schedule document with `activityCount` activities and
 * `relationshipCount` relationships. The first `min(relationshipCount, activityCount - 1)`
 * links form a chain `0 -> 1 -> ... -> n - 1` so deep-graph and cycle-closing tests work directly.
 */
export function generateLargeDocument(
  activityCount: number,
  relationshipCount: number,
): ScheduleDocument {
  const wbsGroupSize = 100;
  const wbsCount = Math.max(1, Math.ceil(activityCount / wbsGroupSize));
  const wbs: ScheduleWbsNode[] = new Array<ScheduleWbsNode>(wbsCount);
  for (let w = 0; w < wbsCount; w++) {
    wbs[w] = {
      id: `wbs:${w}`,
      parentId: w === 0 ? null : 'wbs:0',
      code: `W${String(w + 1).padStart(4, '0')}`,
      name: `Section ${w + 1}`,
      order: w,
    };
  }

  const activities: ScheduleActivity[] = new Array<ScheduleActivity>(activityCount);
  for (let i = 0; i < activityCount; i++) {
    const id = `act:${String(i).padStart(5, '0')}`;
    const code = `A${String(i + 1).padStart(5, '0')}`;
    activities[i] = {
      id,
      code,
      name: `Activity ${i + 1}`,
      wbsId: `wbs:${Math.floor(i / wbsGroupSize)}`,
      calendarId: 'cal:standard',
      type: 'task',
      order: i % wbsGroupSize,
      originalDuration: 60,
      remainingDuration: 60,
      status: 'not_started',
      actualStart: null,
      actualFinish: null,
      percent: { duration: null, physical: null, type: 'duration' },
      constraint: null,
      secondaryConstraint: null,
      notes: null,
      flags: { manual: false, elapsed: false, resourceDependent: false },
      keys: { taskId: null, uid: null, guid: null },
      sourceDates: null,
    };
  }

  const relationships: ScheduleRelationship[] = [];
  const maxChain = Math.min(relationshipCount, Math.max(0, activityCount - 1));
  for (let i = 0; i < maxChain; i++) {
    relationships.push({
      id: `rel:${String(relationships.length).padStart(6, '0')}`,
      predecessorId: activities[i]!.id,
      successorId: activities[i + 1]!.id,
      type: 'FS',
      lagMinutes: 0,
      lagElapsed: false,
    });
  }

  for (
    let stride = 2;
    relationships.length < relationshipCount && stride < activityCount;
    stride++
  ) {
    for (let i = 0; i + stride < activityCount && relationships.length < relationshipCount; i++) {
      relationships.push({
        id: `rel:${String(relationships.length).padStart(6, '0')}`,
        predecessorId: activities[i]!.id,
        successorId: activities[i + stride]!.id,
        type: 'FS',
        lagMinutes: 0,
        lagElapsed: false,
      });
    }
  }

  return makeDocument({
    wbs,
    activities,
    relationships,
  });
}
