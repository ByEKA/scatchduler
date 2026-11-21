import type {
  CalculationDisplayMode,
  LagCalendarMode,
  ProgressMode,
  ScheduleActivity,
  ScheduleCalendar,
  ScheduleCalendarPeriod,
  ScheduleDocument,
  ScheduleProfileId,
  ScheduleRelationship,
  ScheduleWbsNode,
  WallClock,
} from '@/data/schedule-types';
import type { ISODate } from '@/data/types';
import type { ImportModel } from '@/import/model';

export type { ImportModel };

const DEFAULT_WORKDAY: readonly ScheduleCalendarPeriod[] = [
  { start: 480, finish: 720 },
  { start: 780, finish: 1020 },
];

function standardCalendar(id: string): ScheduleCalendar {
  return {
    id,
    name: 'Standard',
    kind: 'project',
    week: [
      [],
      DEFAULT_WORKDAY.map((p) => ({ ...p })),
      DEFAULT_WORKDAY.map((p) => ({ ...p })),
      DEFAULT_WORKDAY.map((p) => ({ ...p })),
      DEFAULT_WORKDAY.map((p) => ({ ...p })),
      DEFAULT_WORKDAY.map((p) => ({ ...p })),
      [],
    ],
    exceptions: [],
    hoursPerDay: 8,
    hoursPerWeek: 40,
    hoursPerMonth: 172,
    hoursPerYear: 2000,
  };
}

function getSetting(settings: ImportModel['settings'], key: string): string | undefined {
  for (const entry of settings) {
    if (entry.key === key) return entry.value;
  }
  return undefined;
}

function mapLagCalendar(raw: string | undefined): LagCalendarMode {
  switch (raw) {
    case 'rcal_Successor':
      return 'successor';
    case 'rcal_24Hour':
      return 'elapsed_24h';
    case 'rcal_ProjDefault':
      return 'project_default';
    default:
      return 'predecessor';
  }
}

function resolveStatusDate(
  scheduleStatusDate: ISODate | null,
  sourceStatusDate: WallClock | null,
): WallClock | null {
  if (scheduleStatusDate !== null) {
    if (sourceStatusDate !== null && sourceStatusDate.startsWith(scheduleStatusDate)) {
      return sourceStatusDate;
    }
    return `${scheduleStatusDate}T08:00`;
  }
  return sourceStatusDate;
}

function hasAnySourceDates(model: ImportModel): boolean {
  for (const activity of model.activities) {
    if (
      activity.planned.start !== null ||
      activity.planned.finish !== null ||
      activity.early.start !== null ||
      activity.early.finish !== null
    ) {
      return true;
    }
  }
  return false;
}

function resolveProfileSettings(model: ImportModel): {
  profile: ScheduleProfileId;
  progressMode: ProgressMode;
  lagCalendar: LagCalendarMode;
  displayMode: CalculationDisplayMode;
} {
  if (model.format === 'xer') {
    const progressRaw = getSetting(model.settings, 'progress_mode');
    const lagRaw = getSetting(model.settings, 'sched_calendar_on_relationship_lag');
    return {
      profile: 'p6',
      progressMode: progressRaw === 'progress_override' ? 'progress_override' : 'retained_logic',
      lagCalendar: mapLagCalendar(lagRaw),
      displayMode: 'as_imported',
    };
  }
  if (model.format === 'mspdi') {
    return {
      profile: 'msp',
      progressMode: 'retained_logic',
      lagCalendar: 'successor',
      displayMode: 'as_imported',
    };
  }
  return {
    profile: 'default',
    progressMode: 'retained_logic',
    lagCalendar: 'predecessor',
    displayMode: hasAnySourceDates(model) ? 'as_imported' : 'calculated',
  };
}

/**
 * Deterministic conversion from Phase 3's `ImportModel` into a versioned `ScheduleDocument`
 * (spec §4.1, D3, D4, D5). Preserves `sourceDates` verbatim and never mutates the input model.
 */
export function fromImportModel(
  model: ImportModel,
  options: { scheduleStatusDate: ISODate | null },
): ScheduleDocument {
  const calendars: ScheduleCalendar[] =
    model.calendars.length === 0
      ? [standardCalendar('cal:default')]
      : model.calendars.map((c) => ({
          id: `cal:${c.id}`,
          name: c.name,
          kind: c.kind,
          week: Array.from({ length: 7 }, (_, day) =>
            (c.week[day] ?? []).map((p) => ({ start: p.start, finish: p.finish })),
          ),
          exceptions: c.exceptions.map((ex) => ({
            date: ex.date,
            periods: ex.periods.map((p) => ({ start: p.start, finish: p.finish })),
          })),
          hoursPerDay: c.hoursPerDay > 0 ? c.hoursPerDay : 8,
          hoursPerWeek: c.hoursPerWeek,
          hoursPerMonth: c.hoursPerMonth,
          hoursPerYear: c.hoursPerYear,
        }));

  const calendarIds = new Set(calendars.map((c) => c.id));
  const candidateDefaultCal =
    model.project.defaultCalendarId !== null ? `cal:${model.project.defaultCalendarId}` : null;
  const defaultCalendarId =
    candidateDefaultCal !== null && calendarIds.has(candidateDefaultCal)
      ? candidateDefaultCal
      : calendars[0]!.id;

  const sourceWbsIds = new Set(model.wbs.map((w) => w.id));
  const wbs: ScheduleWbsNode[] = model.wbs.map((w) => ({
    id: `wbs:${w.id}`,
    parentId: w.parentId !== null && sourceWbsIds.has(w.parentId) ? `wbs:${w.parentId}` : null,
    code: w.code,
    name: w.name,
    order: w.order,
  }));

  const orderByWbs = new Map<string, number>();
  const codeToId = new Map<string, string>();
  const activities: ScheduleActivity[] = model.activities.map((a, index) => {
    const id = `act:${String(index).padStart(5, '0')}`;
    const wbsId = a.wbsId !== null && sourceWbsIds.has(a.wbsId) ? `wbs:${a.wbsId}` : null;
    const wbsKey = wbsId ?? '';
    const order = orderByWbs.get(wbsKey) ?? 0;
    orderByWbs.set(wbsKey, order + 1);

    const mappedCal = `cal:${a.calendarId}`;
    const calendarId = calendarIds.has(mappedCal) ? mappedCal : defaultCalendarId;

    const isMilestone = a.type === 'start_milestone' || a.type === 'finish_milestone';
    const originalDuration = isMilestone
      ? 0
      : Math.max(0, a.originalDuration ?? a.remainingDuration ?? 0);
    const remainingDuration =
      a.status === 'completed' || isMilestone
        ? 0
        : Math.max(0, a.remainingDuration ?? originalDuration);

    const codeKey = a.code.trim().toLowerCase();
    if (!codeToId.has(codeKey)) {
      codeToId.set(codeKey, id);
    }

    return {
      id,
      code: a.code,
      name: a.name,
      wbsId,
      calendarId,
      type: a.type,
      order,
      originalDuration,
      remainingDuration,
      status: a.status,
      actualStart: a.actual.start,
      actualFinish: a.actual.finish,
      percent: {
        duration: a.percent.duration,
        physical: a.percent.physical,
        type: a.percent.type ?? 'duration',
      },
      constraint: a.constraint ? { type: a.constraint.type, date: a.constraint.date } : null,
      secondaryConstraint: a.secondaryConstraint
        ? { type: a.secondaryConstraint.type, date: a.secondaryConstraint.date }
        : null,
      notes: a.notes,
      flags: {
        manual: a.flags.manual,
        elapsed: a.flags.elapsed,
        resourceDependent: a.flags.resourceDependent,
      },
      keys: {
        taskId: a.keys.taskId,
        uid: a.keys.uid,
        guid: a.keys.guid,
      },
      sourceDates: {
        planned: { start: a.planned.start, finish: a.planned.finish },
        early: { start: a.early.start, finish: a.early.finish },
        late: { start: a.late.start, finish: a.late.finish },
        remaining: { start: a.remaining.start, finish: a.remaining.finish },
        totalFloat: a.totalFloat,
        freeFloat: a.freeFloat,
      },
    };
  });

  const relationships: ScheduleRelationship[] = [];
  for (const rel of model.relationships) {
    const predecessorId = codeToId.get(rel.predecessorCode.trim().toLowerCase());
    const successorId = codeToId.get(rel.successorCode.trim().toLowerCase());
    if (predecessorId === undefined || successorId === undefined) continue;
    relationships.push({
      id: `rel:${String(relationships.length).padStart(5, '0')}`,
      predecessorId,
      successorId,
      type: rel.type,
      lagMinutes: rel.lagMinutes,
      lagElapsed: rel.lagElapsed,
    });
  }

  const profileSettings = resolveProfileSettings(model);

  return {
    schemaVersion: 1,
    sourceFormat: model.format,
    settings: {
      profile: profileSettings.profile,
      ruleOverrides: {},
      progressMode: profileSettings.progressMode,
      displayMode: profileSettings.displayMode,
      lagCalendar: profileSettings.lagCalendar,
      criticalDefinition: 'total_float',
      criticalThresholdMinutes: 0,
      nearCriticalThresholdMinutes: 4800,
      projectStart: model.project.statedStart,
      mustFinishBy: model.project.mustFinishBy,
      statusDate: resolveStatusDate(options.scheduleStatusDate, model.project.statusDate),
      defaultCalendarId,
      autoCalculate: false,
    },
    calendars,
    wbs,
    activities,
    relationships,
    computed: null,
  };
}

/** Creates an empty calculated `ScheduleDocument` with a standard Mon–Fri 8 h calendar (spec §4.1). */
export function createBlankDocument(statusDate: ISODate | null): ScheduleDocument {
  const statusClock: WallClock | null = statusDate !== null ? `${statusDate}T08:00` : null;
  return {
    schemaVersion: 1,
    sourceFormat: null,
    settings: {
      profile: 'default',
      ruleOverrides: {},
      progressMode: 'retained_logic',
      displayMode: 'calculated',
      lagCalendar: 'predecessor',
      criticalDefinition: 'total_float',
      criticalThresholdMinutes: 0,
      nearCriticalThresholdMinutes: 4800,
      projectStart: statusClock,
      mustFinishBy: null,
      statusDate: statusClock,
      defaultCalendarId: 'cal:standard',
      autoCalculate: false,
    },
    calendars: [standardCalendar('cal:standard')],
    wbs: [],
    activities: [],
    relationships: [],
    computed: null,
  };
}
