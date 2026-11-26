import type { ImportFormat, ISODate, ISODateTime } from '@/data/types';

/** Timezone-free civil wall-clock timestamp (`'YYYY-MM-DDTHH:mm'`), matching `src/import/model.ts`. */
export type WallClock = string;

export type ScheduleProfileId = 'p6' | 'msp' | 'default';
export type ProgressMode = 'retained_logic' | 'progress_override';
export type CalculationDisplayMode = 'as_imported' | 'calculated';
export type LagCalendarMode = 'predecessor' | 'successor' | 'elapsed_24h' | 'project_default';
export type CriticalDefinition = 'total_float' | 'longest_path';
export type ActivityType =
  'task' | 'start_milestone' | 'finish_milestone' | 'level_of_effort' | 'wbs_summary';
export type ActivityStatus = 'not_started' | 'in_progress' | 'completed';
export type ConstraintType =
  | 'start_on'
  | 'start_on_or_after'
  | 'start_on_or_before'
  | 'finish_on'
  | 'finish_on_or_after'
  | 'finish_on_or_before'
  | 'mandatory_start'
  | 'mandatory_finish'
  | 'as_late_as_possible';
export type RelationshipType = 'FS' | 'SS' | 'FF' | 'SF';

export interface ProfileRuleOverrides {
  statusDateFloorForUnstarted?: boolean;
  inProgressResumeMode?: 'p6_remaining_from_status' | 'msp_latest_of_status_logic_elapsed';
  completedLateDates?: 'keep_actuals' | 'recalculate';
  ssLagFromInProgress?: 'remaining_from_actual_start' | 'from_start';
  completedPredLag?: 'unelapsed_only' | 'full';
  totalFloatFormula?: 'finish_float' | 'min_start_finish';
  freeFloatFloorZero?: boolean;
  finishMilestoneOnPredFinish?: boolean;
  alapBehavior?: 'within_free_float' | 'to_late_dates';
  progressOverrideLateSide?: 'ignore_link_to_started' | 'keep_late_logic';
}

export interface ScheduleSettings {
  profile: ScheduleProfileId;
  ruleOverrides: ProfileRuleOverrides;
  progressMode: ProgressMode;
  displayMode: CalculationDisplayMode;
  lagCalendar: LagCalendarMode;
  criticalDefinition: CriticalDefinition;
  criticalThresholdMinutes: number;
  nearCriticalThresholdMinutes: number;
  projectStart: WallClock | null;
  mustFinishBy: WallClock | null;
  statusDate: WallClock | null;
  defaultCalendarId: string;
  autoCalculate: boolean;
}

export interface ScheduleCalendarPeriod {
  start: number;
  finish: number;
}

export interface ScheduleCalendar {
  id: string;
  name: string;
  kind: 'project' | 'global' | 'resource' | 'task';
  /** 7 entries, 0 = Sunday; minutes 0–1440. */
  week: ScheduleCalendarPeriod[][];
  exceptions: Array<{ date: ISODate; periods: ScheduleCalendarPeriod[] }>;
  hoursPerDay: number;
  hoursPerWeek: number | null;
  hoursPerMonth: number | null;
  hoursPerYear: number | null;
}

export interface ScheduleWbsNode {
  id: string;
  parentId: string | null;
  code: string;
  name: string;
  order: number;
}

export interface SourceDateRecord {
  planned: { start: WallClock | null; finish: WallClock | null };
  early: { start: WallClock | null; finish: WallClock | null };
  late: { start: WallClock | null; finish: WallClock | null };
  remaining: { start: WallClock | null; finish: WallClock | null };
  totalFloat: number | null;
  freeFloat: number | null;
}

export interface ScheduleActivity {
  id: string;
  code: string;
  name: string;
  wbsId: string | null;
  calendarId: string;
  type: ActivityType;
  order: number;
  originalDuration: number;
  remainingDuration: number;
  status: ActivityStatus;
  actualStart: WallClock | null;
  actualFinish: WallClock | null;
  percent: {
    duration: number | null;
    physical: number | null;
    type: 'duration' | 'physical' | 'units';
  };
  constraint: { type: ConstraintType; date: WallClock | null } | null;
  secondaryConstraint: { type: ConstraintType; date: WallClock | null } | null;
  notes: string | null;
  flags: { manual: boolean; elapsed: boolean; resourceDependent: boolean };
  keys: { taskId: string | null; uid: string | null; guid: string | null };
  /** Preserved verbatim from import for "As imported" display and oracle checks; null for user-created tasks. */
  sourceDates: SourceDateRecord | null;
}

export interface ScheduleRelationship {
  id: string;
  predecessorId: string;
  successorId: string;
  type: RelationshipType;
  lagMinutes: number;
  lagElapsed: boolean;
}

export type DriverReason =
  | { kind: 'predecessor'; relationshipId: string; predecessorId: string }
  | { kind: 'constraint'; constraint: ConstraintType }
  | { kind: 'status_date' }
  | { kind: 'project_start' }
  | { kind: 'actual' };

export interface ComputedActivityResult {
  earlyStart: WallClock;
  earlyFinish: WallClock;
  lateStart: WallClock;
  lateFinish: WallClock;
  totalFloat: number;
  freeFloat: number;
  isCritical: boolean;
  isNearCritical: boolean;
  isLongestPath: boolean;
  driver: DriverReason;
}

export interface ComputedRelationshipResult {
  freeFloat: number;
  isDriving: boolean;
}

export interface ComputedWbsRollup {
  start: WallClock | null;
  finish: WallClock | null;
  durationMinutes: number;
  percentComplete: number | null;
  activityCount: number;
  hasCritical: boolean;
}

export interface SolverWarning {
  code:
    | 'OUT_OF_SEQUENCE'
    | 'NEGATIVE_FLOAT'
    | 'MISSED_MUST_FINISH_BY'
    | 'CONSTRAINT_VIOLATED'
    | 'TRUNCATED_LEAD'
    | 'LOE_UNBOUNDED'
    | 'MISSING_ACTUAL_DATE';
  activityId: string | null;
  relationshipId: string | null;
  message: string;
}

export interface ComputedScheduleSummary {
  calculatedAt: ISODateTime;
  durationMs: number;
  projectStart: WallClock | null;
  projectFinish: WallClock | null;
  activities: Record<string, ComputedActivityResult>;
  relationships: Record<string, ComputedRelationshipResult>;
  wbsRollups: Record<string, ComputedWbsRollup>;
  warnings: SolverWarning[];
}

export interface ScheduleDocument {
  schemaVersion: 1;
  sourceFormat: ImportFormat | null;
  settings: ScheduleSettings;
  calendars: ScheduleCalendar[];
  wbs: ScheduleWbsNode[];
  activities: ScheduleActivity[];
  relationships: ScheduleRelationship[];
  /** Last successful engine solve cached in the snapshot so calculated schedules paint immediately on open. */
  computed: ComputedScheduleSummary | null;
}

export type SolverError =
  | { code: 'SCHEDULE_CYCLE'; cycleIds: string[]; cycleCodes: string[]; message: string }
  | { code: 'CALENDAR_NO_WORKING_TIME'; calendarId: string; message: string };

export type SolveResult =
  { ok: true; summary: ComputedScheduleSummary } | { ok: false; error: SolverError };

export interface DrivingPath {
  activityIds: string[];
  relationshipIds: string[];
  hops: number;
}

export const SCHEDULE_DOCUMENT_SCHEMA_VERSION = 1;
export const MAX_SCHEDULE_ACTIVITIES = 50_000;
export const MAX_SCHEDULE_RELATIONSHIPS = 150_000;
