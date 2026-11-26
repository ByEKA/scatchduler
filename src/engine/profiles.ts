import type {
  LagCalendarMode,
  ProfileRuleOverrides,
  ScheduleProfileId,
} from '@/data/schedule-types';

/**
 * Resolved behavioural rules consumed by the CPM solver (spec §5.1).
 * The solver reads `rules.*` exclusively and never branches on `profile` or `sourceFormat`.
 */
export interface ResolvedRules {
  readonly statusDateFloorForUnstarted: boolean;
  readonly inProgressResumeMode: 'p6_remaining_from_status' | 'msp_latest_of_status_logic_elapsed';
  readonly completedLateDates: 'keep_actuals' | 'recalculate';
  readonly ssLagFromInProgress: 'remaining_from_actual_start' | 'from_start';
  readonly completedPredLag: 'unelapsed_only' | 'full';
  readonly totalFloatFormula: 'finish_float' | 'min_start_finish' | 'start_float';
  readonly freeFloatFloorZero: boolean;
  readonly finishMilestoneOnPredFinish: boolean;
  readonly alapBehavior: 'within_free_float' | 'to_late_dates';
  readonly progressOverrideLateSide: 'ignore_link_to_started' | 'keep_late_logic';
  readonly defaultLagCalendar: LagCalendarMode;
}

const P6_RULES: ResolvedRules = Object.freeze({
  statusDateFloorForUnstarted: true,
  inProgressResumeMode: 'p6_remaining_from_status',
  completedLateDates: 'keep_actuals',
  ssLagFromInProgress: 'remaining_from_actual_start',
  completedPredLag: 'unelapsed_only',
  totalFloatFormula: 'finish_float',
  freeFloatFloorZero: true,
  finishMilestoneOnPredFinish: false,
  alapBehavior: 'within_free_float',
  progressOverrideLateSide: 'ignore_link_to_started',
  defaultLagCalendar: 'predecessor',
});

const MSP_RULES: ResolvedRules = Object.freeze({
  statusDateFloorForUnstarted: false,
  inProgressResumeMode: 'msp_latest_of_status_logic_elapsed',
  completedLateDates: 'recalculate',
  ssLagFromInProgress: 'from_start',
  completedPredLag: 'full',
  totalFloatFormula: 'min_start_finish',
  freeFloatFloorZero: false,
  finishMilestoneOnPredFinish: true,
  alapBehavior: 'to_late_dates',
  progressOverrideLateSide: 'keep_late_logic',
  defaultLagCalendar: 'successor',
});

export const PROFILE_DEFAULTS: Record<ScheduleProfileId, ResolvedRules> = Object.freeze({
  p6: P6_RULES,
  msp: MSP_RULES,
  default: P6_RULES,
});

export function resolveRules(
  profile: ScheduleProfileId,
  overrides?: ProfileRuleOverrides,
): ResolvedRules {
  const base = PROFILE_DEFAULTS[profile];
  if (!overrides) return { ...base };
  return {
    statusDateFloorForUnstarted:
      overrides.statusDateFloorForUnstarted ?? base.statusDateFloorForUnstarted,
    inProgressResumeMode: overrides.inProgressResumeMode ?? base.inProgressResumeMode,
    completedLateDates: overrides.completedLateDates ?? base.completedLateDates,
    ssLagFromInProgress: overrides.ssLagFromInProgress ?? base.ssLagFromInProgress,
    completedPredLag: overrides.completedPredLag ?? base.completedPredLag,
    totalFloatFormula: overrides.totalFloatFormula ?? base.totalFloatFormula,
    freeFloatFloorZero: overrides.freeFloatFloorZero ?? base.freeFloatFloorZero,
    finishMilestoneOnPredFinish:
      overrides.finishMilestoneOnPredFinish ?? base.finishMilestoneOnPredFinish,
    alapBehavior: overrides.alapBehavior ?? base.alapBehavior,
    progressOverrideLateSide: overrides.progressOverrideLateSide ?? base.progressOverrideLateSide,
    defaultLagCalendar: base.defaultLagCalendar,
  };
}
