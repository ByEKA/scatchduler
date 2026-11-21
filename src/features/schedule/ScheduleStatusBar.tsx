import type { ReactElement } from 'react';
import type {
  CalculationDisplayMode,
  ScheduleProfileId,
  WallClock,
} from '@/data/schedule-types';
import { formatScheduleDate } from '@/features/schedule/format-schedule';
import type { GanttZoom } from '@/features/schedule/gantt/timescale';

export interface ScheduleStatusBarProps {
  code: string;
  statusDate: WallClock | null;
  displayMode: CalculationDisplayMode;
  profile: ScheduleProfileId;
  stale: boolean;
  totalActivities: number;
  shownActivities: number;
  isFiltered: boolean;
  zoom: GanttZoom;
  durationMs: number | null;
}

const PROFILE_LABELS: Record<ScheduleProfileId, string> = {
  p6: 'P6',
  msp: 'MSP',
  default: 'Default',
};

const ZOOM_LABELS: Record<GanttZoom, string> = {
  day: 'Day',
  week: 'Week',
  month: 'Month',
  quarter: 'Quarter',
};

/**
 * Compact bottom status bar displaying schedule code, status date, calculation/display state,
 * visible activity count, zoom level, and last solve duration (spec §7.2).
 */
export function ScheduleStatusBar({
  code,
  statusDate,
  displayMode,
  profile,
  stale,
  totalActivities,
  shownActivities,
  isFiltered,
  zoom,
  durationMs,
}: ScheduleStatusBarProps): ReactElement {
  const modeText = stale
    ? 'Recalculate needed'
    : displayMode === 'as_imported'
      ? 'As imported'
      : `Calculated (${PROFILE_LABELS[profile]})`;

  const countText = isFiltered
    ? `${shownActivities.toLocaleString('en-US')} of ${totalActivities.toLocaleString('en-US')}`
    : `${totalActivities.toLocaleString('en-US')} ${totalActivities === 1 ? 'activity' : 'activities'}`;

  return (
    <footer
      role="region"
      aria-label="Schedule status"
      className="flex h-7 shrink-0 flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-card px-3 text-2xs text-muted-foreground"
    >
      <div className="flex min-w-0 items-center truncate">
        <span className="font-mono font-medium text-foreground">{code}</span>
        <span aria-hidden="true">{' · '}</span>
        <span>Status date {formatScheduleDate(statusDate)}</span>
        <span aria-hidden="true">{' · '}</span>
        <span className={stale ? 'font-medium text-warning-foreground' : 'text-foreground'}>
          {modeText}
        </span>
      </div>
      <div className="flex shrink-0 items-center tabular-nums">
        <span>{countText}</span>
        <span aria-hidden="true">{' · '}</span>
        <span>{ZOOM_LABELS[zoom]}</span>
        {durationMs !== null && (
          <>
            <span aria-hidden="true">{' · '}</span>
            <span>Calculated in {Math.round(durationMs)} ms</span>
          </>
        )}
      </div>
    </footer>
  );
}
