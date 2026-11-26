import { ArrowUpRight, X } from 'lucide-react';
import { useId } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import type {
  ActivityStatus,
  ComputedScheduleSummary,
  ComputedWbsRollup,
  ConstraintType,
  ScheduleActivity,
  ScheduleDocument,
} from '@/data/schedule-types';
import type { ActivityChanges, CommandResult, ScheduleCommand } from '@/features/schedule/commands';
import {
  formatPercent,
  formatScheduleDate,
  formatScheduleDateTime,
  formatWorkingDays,
} from '@/features/schedule/format-schedule';
import { RelationshipsTab } from '@/features/schedule/RelationshipsTab';
import { cn } from '@/lib/utils';

export type DetailsTab = 'details' | 'relationships';

export interface ScheduleDetailsPanelProps {
  document: ScheduleDocument;
  summary: ComputedScheduleSummary | null;
  rollups: Record<string, ComputedWbsRollup>;
  selectedKey: string | null;
  mode: 'view' | 'edit';
  activeTab: DetailsTab;
  onTabChange(tab: DetailsTab): void;
  onClose(): void;
  onJumpToActivity(activityId: string): void;
  onDispatch(command: ScheduleCommand): CommandResult;
  relationshipsSlot?: ReactNode;
}

const MAX_NOTES_LENGTH = 4000;

const CONSTRAINT_LABELS: Record<ConstraintType, string> = {
  start_on: 'Start on',
  start_on_or_after: 'Start on or after',
  start_on_or_before: 'Start on or before',
  finish_on: 'Finish on',
  finish_on_or_after: 'Finish on or after',
  finish_on_or_before: 'Finish on or before',
  mandatory_start: 'Mandatory start',
  mandatory_finish: 'Mandatory finish',
  as_late_as_possible: 'As late as possible',
};

const CONSTRAINT_TYPES = Object.keys(CONSTRAINT_LABELS) as ConstraintType[];

const FIELD_CLASSES =
  'h-7 w-full rounded-md border border-input bg-background px-2 text-xs text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-60';

function toDateValue(wc: string | null): string {
  return wc === null ? '' : wc.slice(0, 10);
}

function minutesToDays(minutes: number, hoursPerDay: number): string {
  const hpd = hoursPerDay > 0 ? hoursPerDay : 8;
  const days = Math.round((minutes / (hpd * 60)) * 10) / 10;
  return String(days === 0 ? 0 : days);
}

/**
 * Collapsible bottom inspector docked beneath the split pane (spec §7.2, D6).
 * Hosts the `Details` tab (status, actuals, durations, calendar, constraints, metrics, driver jump,
 * notes) and the `Relationships` tab slot (Task 35).
 */
export function ScheduleDetailsPanel({
  document,
  summary,
  rollups,
  selectedKey,
  mode,
  activeTab,
  onTabChange,
  onClose,
  onJumpToActivity,
  onDispatch,
  relationshipsSlot,
}: ScheduleDetailsPanelProps): ReactElement {
  const baseId = useId();
  const readOnly = mode !== 'edit';

  const selectedActivity: ScheduleActivity | null =
    selectedKey !== null && selectedKey.startsWith('act:')
      ? (document.activities.find((a) => a.id === selectedKey.slice(4)) ?? null)
      : null;

  const selectedWbs =
    selectedKey !== null && selectedKey.startsWith('wbs:')
      ? (document.wbs.find((w) => w.id === selectedKey.slice(4)) ?? null)
      : null;

  const defaultCal =
    document.calendars.find((c) => c.id === document.settings.defaultCalendarId) ??
    document.calendars[0];

  const actCal = selectedActivity
    ? (document.calendars.find((c) => c.id === selectedActivity.calendarId) ?? defaultCal)
    : defaultCal;
  const hoursPerDay = actCal?.hoursPerDay ?? 8;
  const dayMinutes = (hoursPerDay > 0 ? hoursPerDay : 8) * 60;

  const updateActivity = (changes: ActivityChanges) => {
    if (readOnly || !selectedActivity) return;
    const res = onDispatch({
      type: 'updateActivity',
      activityId: selectedActivity.id,
      changes,
    });
    if (!res.ok) toast.error(res.error);
  };

  const useCalculated = document.settings.displayMode === 'calculated' && summary !== null;
  const computed =
    selectedActivity && useCalculated ? summary.activities[selectedActivity.id] : undefined;

  const earlyStart =
    computed?.earlyStart ??
    selectedActivity?.sourceDates?.early.start ??
    selectedActivity?.sourceDates?.planned.start ??
    null;
  const earlyFinish =
    computed?.earlyFinish ??
    selectedActivity?.sourceDates?.early.finish ??
    selectedActivity?.sourceDates?.planned.finish ??
    null;
  const lateStart = computed?.lateStart ?? selectedActivity?.sourceDates?.late.start ?? null;
  const lateFinish = computed?.lateFinish ?? selectedActivity?.sourceDates?.late.finish ?? null;
  const totalFloat = computed?.totalFloat ?? selectedActivity?.sourceDates?.totalFloat ?? null;
  const freeFloat = computed?.freeFloat ?? selectedActivity?.sourceDates?.freeFloat ?? null;

  const driver = computed?.driver ?? null;
  const driverPredecessor =
    driver?.kind === 'predecessor'
      ? (document.activities.find((a) => a.id === driver.predecessorId) ?? null)
      : null;

  const isMilestone =
    selectedActivity?.type === 'start_milestone' || selectedActivity?.type === 'finish_milestone';

  const currentPercent = selectedActivity
    ? selectedActivity.percent.type === 'physical'
      ? (selectedActivity.percent.physical ?? 0)
      : (selectedActivity.percent.duration ?? 0)
    : 0;

  return (
    <section
      aria-label="Activity details"
      className="flex h-64 shrink-0 flex-col overflow-hidden rounded-lg border border-border bg-card text-xs"
    >
      {/* Header bar with tabs */}
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-border px-3">
        <div className="flex min-w-0 items-center gap-3">
          <div role="tablist" aria-label="Inspector sections" className="flex items-center gap-1">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'details'}
              onClick={() => onTabChange('details')}
              className={cn(
                'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                activeTab === 'details'
                  ? 'bg-accent text-accent-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              Details
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'relationships'}
              onClick={() => onTabChange('relationships')}
              className={cn(
                'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                activeTab === 'relationships'
                  ? 'bg-accent text-accent-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              Relationships
            </button>
          </div>

          {selectedActivity !== null && (
            <span className="truncate font-medium text-foreground">
              <span className="font-mono text-muted-foreground">{selectedActivity.code}</span>
              {' · '}
              {selectedActivity.name}
            </span>
          )}
          {selectedWbs !== null && (
            <span className="truncate font-medium text-foreground">
              <span className="font-mono text-muted-foreground">{selectedWbs.code}</span>
              {' · '}
              {selectedWbs.name}
            </span>
          )}
        </div>

        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label="Close details panel"
          onClick={onClose}
        >
          <X className="size-3.5" aria-hidden="true" />
        </Button>
      </div>

      {/* Body */}
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {selectedActivity === null && selectedWbs === null ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            Select an activity to inspect its details.
          </p>
        ) : selectedWbs !== null ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
            <div>
              <div className="text-2xs text-muted-foreground">WBS code</div>
              <div className="mt-0.5 font-mono font-medium">{selectedWbs.code}</div>
            </div>
            <div>
              <div className="text-2xs text-muted-foreground">Activities</div>
              <div className="mt-0.5 font-medium tabular-nums">
                {rollups[selectedWbs.id]?.activityCount ?? 0}
              </div>
            </div>
            <div>
              <div className="text-2xs text-muted-foreground">Duration</div>
              <div className="mt-0.5 font-medium tabular-nums">
                {formatWorkingDays(
                  rollups[selectedWbs.id]?.durationMinutes ?? null,
                  defaultCal?.hoursPerDay ?? 8,
                )}
              </div>
            </div>
            <div>
              <div className="text-2xs text-muted-foreground">Start / Finish</div>
              <div className="mt-0.5 font-medium tabular-nums">
                {formatScheduleDate(rollups[selectedWbs.id]?.start ?? null)} →{' '}
                {formatScheduleDate(rollups[selectedWbs.id]?.finish ?? null)}
              </div>
            </div>
            <div>
              <div className="text-2xs text-muted-foreground">% complete</div>
              <div className="mt-0.5 font-medium tabular-nums">
                {formatPercent(rollups[selectedWbs.id]?.percentComplete ?? null)}
              </div>
            </div>
          </div>
        ) : activeTab === 'relationships' ? (
          (relationshipsSlot ?? (
            <RelationshipsTab
              document={document}
              summary={summary}
              activity={selectedActivity!}
              mode={mode}
              onJumpToActivity={onJumpToActivity}
              onDispatch={onDispatch}
            />
          ))
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            {/* Column 1: Status, Actuals, Progress & Durations */}
            <div className="grid grid-cols-2 gap-2.5">
              <div className="flex flex-col gap-1">
                <Label htmlFor={`${baseId}-status`} className="text-2xs text-muted-foreground">
                  Status
                </Label>
                <select
                  id={`${baseId}-status`}
                  disabled={readOnly}
                  value={selectedActivity!.status}
                  onChange={(event) =>
                    updateActivity({ status: event.target.value as ActivityStatus })
                  }
                  className={FIELD_CLASSES}
                >
                  <option value="not_started">Not started</option>
                  <option value="in_progress">In progress</option>
                  <option value="completed">Completed</option>
                </select>
              </div>

              <div className="flex flex-col gap-1">
                <Label htmlFor={`${baseId}-cal`} className="text-2xs text-muted-foreground">
                  Calendar
                </Label>
                <select
                  id={`${baseId}-cal`}
                  disabled={readOnly}
                  value={selectedActivity!.calendarId}
                  onChange={(event) => updateActivity({ calendarId: event.target.value })}
                  className={FIELD_CLASSES}
                >
                  {document.calendars.map((cal) => (
                    <option key={cal.id} value={cal.id}>
                      {cal.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-1">
                <Label htmlFor={`${baseId}-origdur`} className="text-2xs text-muted-foreground">
                  Original duration (days)
                </Label>
                <input
                  id={`${baseId}-origdur`}
                  type="number"
                  min={0}
                  step="0.5"
                  disabled={readOnly || isMilestone}
                  value={minutesToDays(selectedActivity!.originalDuration, hoursPerDay)}
                  onChange={(event) => {
                    const num = Number.parseFloat(event.target.value);
                    if (Number.isFinite(num) && num >= 0) {
                      const mins = Math.round(num * dayMinutes);
                      updateActivity({
                        originalDuration: mins,
                        ...(selectedActivity!.status === 'not_started'
                          ? { remainingDuration: mins }
                          : {}),
                      });
                    }
                  }}
                  className={FIELD_CLASSES}
                />
              </div>

              <div className="flex flex-col gap-1">
                <Label htmlFor={`${baseId}-remdur`} className="text-2xs text-muted-foreground">
                  Remaining duration (days)
                </Label>
                <input
                  id={`${baseId}-remdur`}
                  type="number"
                  min={0}
                  step="0.5"
                  disabled={readOnly || isMilestone}
                  value={minutesToDays(selectedActivity!.remainingDuration, hoursPerDay)}
                  onChange={(event) => {
                    const num = Number.parseFloat(event.target.value);
                    if (Number.isFinite(num) && num >= 0) {
                      updateActivity({ remainingDuration: Math.round(num * dayMinutes) });
                    }
                  }}
                  className={FIELD_CLASSES}
                />
              </div>

              <div className="flex flex-col gap-1">
                <Label htmlFor={`${baseId}-actstart`} className="text-2xs text-muted-foreground">
                  Actual start
                </Label>
                <input
                  id={`${baseId}-actstart`}
                  type="date"
                  disabled={readOnly}
                  value={toDateValue(selectedActivity!.actualStart)}
                  onChange={(event) =>
                    updateActivity({
                      actualStart: event.target.value ? `${event.target.value}T08:00` : null,
                    })
                  }
                  className={FIELD_CLASSES}
                />
              </div>

              <div className="flex flex-col gap-1">
                <Label htmlFor={`${baseId}-actfinish`} className="text-2xs text-muted-foreground">
                  Actual finish
                </Label>
                <input
                  id={`${baseId}-actfinish`}
                  type="date"
                  disabled={readOnly}
                  value={toDateValue(selectedActivity!.actualFinish)}
                  onChange={(event) =>
                    updateActivity({
                      actualFinish: event.target.value ? `${event.target.value}T17:00` : null,
                    })
                  }
                  className={FIELD_CLASSES}
                />
              </div>

              <div className="flex flex-col gap-1">
                <Label htmlFor={`${baseId}-pct`} className="text-2xs text-muted-foreground">
                  % complete
                </Label>
                <input
                  id={`${baseId}-pct`}
                  type="number"
                  min={0}
                  max={100}
                  disabled={readOnly}
                  value={Math.round(currentPercent)}
                  onChange={(event) => {
                    const num = Number.parseFloat(event.target.value);
                    if (Number.isFinite(num) && num >= 0 && num <= 100) {
                      updateActivity({
                        percent: {
                          ...selectedActivity!.percent,
                          duration: num,
                          physical: num,
                        },
                      });
                    }
                  }}
                  className={FIELD_CLASSES}
                />
              </div>

              <div className="flex flex-col gap-1">
                <Label htmlFor={`${baseId}-pcttype`} className="text-2xs text-muted-foreground">
                  % type
                </Label>
                <select
                  id={`${baseId}-pcttype`}
                  disabled={readOnly}
                  value={selectedActivity!.percent.type}
                  onChange={(event) =>
                    updateActivity({
                      percent: {
                        ...selectedActivity!.percent,
                        type: event.target.value as 'duration' | 'physical' | 'units',
                      },
                    })
                  }
                  className={FIELD_CLASSES}
                >
                  <option value="duration">Duration</option>
                  <option value="physical">Physical</option>
                  <option value="units">Units</option>
                </select>
              </div>
            </div>

            {/* Column 2: Read-only CPM Dates, Floats, Driver & Constraints */}
            <div className="flex flex-col gap-2.5">
              <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 rounded-md bg-muted/40 p-2">
                <div>
                  <div className="text-2xs text-muted-foreground">Early start</div>
                  <div className="font-medium tabular-nums">
                    {formatScheduleDateTime(earlyStart)}
                  </div>
                </div>
                <div>
                  <div className="text-2xs text-muted-foreground">Early finish</div>
                  <div className="font-medium tabular-nums">
                    {formatScheduleDateTime(earlyFinish)}
                  </div>
                </div>
                <div>
                  <div className="text-2xs text-muted-foreground">Late start</div>
                  <div className="font-medium tabular-nums">
                    {formatScheduleDateTime(lateStart)}
                  </div>
                </div>
                <div>
                  <div className="text-2xs text-muted-foreground">Late finish</div>
                  <div className="font-medium tabular-nums">
                    {formatScheduleDateTime(lateFinish)}
                  </div>
                </div>
                <div>
                  <div className="text-2xs text-muted-foreground">Total float</div>
                  <div className="font-medium tabular-nums">
                    {formatWorkingDays(totalFloat, hoursPerDay, { signed: true })}
                  </div>
                </div>
                <div>
                  <div className="text-2xs text-muted-foreground">Free float</div>
                  <div className="font-medium tabular-nums">
                    {formatWorkingDays(freeFloat, hoursPerDay, { signed: true })}
                  </div>
                </div>
              </div>

              {driver !== null && (
                <div className="flex items-center gap-1.5 text-xs">
                  <span className="text-muted-foreground">Driven by</span>
                  {driver.kind === 'predecessor' && driverPredecessor !== null ? (
                    <button
                      type="button"
                      onClick={() => onJumpToActivity(driver.predecessorId)}
                      className="inline-flex items-center gap-1 rounded-sm font-medium text-link hover:underline"
                    >
                      <span>
                        {driverPredecessor.code} · {driverPredecessor.name}
                      </span>
                      <ArrowUpRight className="size-3" aria-hidden="true" />
                    </button>
                  ) : (
                    <span className="font-medium text-foreground">
                      {driver.kind === 'constraint'
                        ? `Constraint (${CONSTRAINT_LABELS[driver.constraint]})`
                        : driver.kind === 'status_date'
                          ? 'Status date'
                          : driver.kind === 'project_start'
                            ? 'Project start'
                            : 'Actual'}
                    </span>
                  )}
                </div>
              )}

              <div className="grid grid-cols-2 gap-2">
                <div className="flex flex-col gap-1">
                  <Label htmlFor={`${baseId}-c1`} className="text-2xs text-muted-foreground">
                    Primary constraint
                  </Label>
                  <select
                    id={`${baseId}-c1`}
                    disabled={readOnly}
                    value={selectedActivity!.constraint?.type ?? ''}
                    onChange={(event) => {
                      const val = event.target.value as ConstraintType | '';
                      updateActivity({
                        constraint:
                          val === ''
                            ? null
                            : {
                                type: val,
                                date:
                                  val === 'as_late_as_possible'
                                    ? null
                                    : (selectedActivity!.constraint?.date ?? null),
                              },
                      });
                    }}
                    className={FIELD_CLASSES}
                  >
                    <option value="">None</option>
                    {CONSTRAINT_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {CONSTRAINT_LABELS[type]}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col gap-1">
                  <Label htmlFor={`${baseId}-c1date`} className="text-2xs text-muted-foreground">
                    Constraint date
                  </Label>
                  <input
                    id={`${baseId}-c1date`}
                    type="date"
                    disabled={
                      readOnly ||
                      selectedActivity!.constraint === null ||
                      selectedActivity!.constraint.type === 'as_late_as_possible'
                    }
                    value={toDateValue(selectedActivity!.constraint?.date ?? null)}
                    onChange={(event) => {
                      if (!selectedActivity!.constraint) return;
                      updateActivity({
                        constraint: {
                          type: selectedActivity!.constraint.type,
                          date: event.target.value ? `${event.target.value}T08:00` : null,
                        },
                      });
                    }}
                    className={FIELD_CLASSES}
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <Label htmlFor={`${baseId}-c2`} className="text-2xs text-muted-foreground">
                    Secondary constraint
                  </Label>
                  <select
                    id={`${baseId}-c2`}
                    disabled={readOnly}
                    value={selectedActivity!.secondaryConstraint?.type ?? ''}
                    onChange={(event) => {
                      const val = event.target.value as ConstraintType | '';
                      updateActivity({
                        secondaryConstraint:
                          val === ''
                            ? null
                            : {
                                type: val,
                                date:
                                  val === 'as_late_as_possible'
                                    ? null
                                    : (selectedActivity!.secondaryConstraint?.date ?? null),
                              },
                      });
                    }}
                    className={FIELD_CLASSES}
                  >
                    <option value="">None</option>
                    {CONSTRAINT_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {CONSTRAINT_LABELS[type]}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col gap-1">
                  <Label htmlFor={`${baseId}-c2date`} className="text-2xs text-muted-foreground">
                    Secondary date
                  </Label>
                  <input
                    id={`${baseId}-c2date`}
                    type="date"
                    disabled={
                      readOnly ||
                      selectedActivity!.secondaryConstraint === null ||
                      selectedActivity!.secondaryConstraint.type === 'as_late_as_possible'
                    }
                    value={toDateValue(selectedActivity!.secondaryConstraint?.date ?? null)}
                    onChange={(event) => {
                      if (!selectedActivity!.secondaryConstraint) return;
                      updateActivity({
                        secondaryConstraint: {
                          type: selectedActivity!.secondaryConstraint.type,
                          date: event.target.value ? `${event.target.value}T08:00` : null,
                        },
                      });
                    }}
                    className={FIELD_CLASSES}
                  />
                </div>
              </div>
            </div>

            {/* Column 3: Notes */}
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <Label htmlFor={`${baseId}-notes`} className="text-2xs text-muted-foreground">
                  Notes
                </Label>
                <span className="text-2xs text-muted-foreground tabular-nums">
                  {(selectedActivity!.notes ?? '').length} / {MAX_NOTES_LENGTH}
                </span>
              </div>
              <textarea
                id={`${baseId}-notes`}
                disabled={readOnly}
                maxLength={MAX_NOTES_LENGTH}
                value={selectedActivity!.notes ?? ''}
                onChange={(event) =>
                  updateActivity({
                    notes: event.target.value === '' ? null : event.target.value,
                  })
                }
                placeholder="Add activity notes…"
                className="min-h-[140px] w-full flex-1 resize-none rounded-md border border-input bg-background p-2 text-xs text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60"
              />
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
