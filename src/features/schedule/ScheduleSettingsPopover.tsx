import { SlidersHorizontal } from 'lucide-react';
import { useId } from 'react';
import type { ReactElement } from 'react';
import { POPOVER_SHELL_CLASSES } from '@/components/common/popover-classes';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type {
  CalculationDisplayMode,
  CriticalDefinition,
  LagCalendarMode,
  ProgressMode,
  ScheduleDocument,
  ScheduleProfileId,
  ScheduleSettings,
} from '@/data/schedule-types';
import type { CommandResult, ScheduleCommand } from '@/features/schedule/commands';
import { cn } from '@/lib/utils';

export interface ScheduleSettingsPopoverProps {
  document: ScheduleDocument;
  mode: 'view' | 'edit';
  onDispatch(command: ScheduleCommand): CommandResult;
}

const SELECT_CLASSES =
  'h-7 w-full rounded-md border border-input bg-background px-2 text-xs text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-60';

function toDateInputValue(wc: string | null): string {
  if (wc === null) return '';
  return wc.slice(0, 10);
}

/**
 * Popover form for schedule calculation settings: profile, progress mode, display mode,
 * lag calendar, critical definition & thresholds, status date, must-finish-by, and
 * auto-calculate (spec §4.1, §7.2).
 */
export function ScheduleSettingsPopover({
  document,
  mode,
  onDispatch,
}: ScheduleSettingsPopoverProps): ReactElement {
  const baseId = useId();
  const { settings } = document;
  const readOnly = mode !== 'edit';
  const defaultCal =
    document.calendars.find((c) => c.id === settings.defaultCalendarId) ?? document.calendars[0];
  const hoursPerDay = defaultCal?.hoursPerDay ?? 8;
  const dayMinutes = (hoursPerDay > 0 ? hoursPerDay : 8) * 60;

  const update = (changes: Partial<ScheduleSettings>) => {
    if (readOnly) return;
    onDispatch({ type: 'updateScheduleSettings', changes });
  };

  const critDays = Math.round((settings.criticalThresholdMinutes / dayMinutes) * 10) / 10;
  const nearCritDays = Math.round((settings.nearCriticalThresholdMinutes / dayMinutes) * 10) / 10;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="xs"
          className="border-input bg-card dark:bg-card"
        >
          <SlidersHorizontal className="size-3.5" aria-hidden="true" />
          Settings
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={6}
        className={cn(POPOVER_SHELL_CLASSES, 'w-80 p-3 text-xs')}
      >
        <div className="mb-2 flex items-center justify-between">
          <span className="font-semibold text-foreground">Schedule settings</span>
          {readOnly && <span className="text-2xs text-muted-foreground">Read-only</span>}
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          <div className="flex flex-col gap-1">
            <Label htmlFor={`${baseId}-profile`} className="text-2xs text-muted-foreground">
              Profile
            </Label>
            <select
              id={`${baseId}-profile`}
              disabled={readOnly}
              value={settings.profile}
              onChange={(event) => update({ profile: event.target.value as ScheduleProfileId })}
              className={SELECT_CLASSES}
            >
              <option value="p6">P6</option>
              <option value="msp">MS Project</option>
              <option value="default">Default</option>
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <Label htmlFor={`${baseId}-progress`} className="text-2xs text-muted-foreground">
              Progress mode
            </Label>
            <select
              id={`${baseId}-progress`}
              disabled={readOnly}
              value={settings.progressMode}
              onChange={(event) => update({ progressMode: event.target.value as ProgressMode })}
              className={SELECT_CLASSES}
            >
              <option value="retained_logic">Retained logic</option>
              <option value="progress_override">Progress override</option>
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <Label htmlFor={`${baseId}-display`} className="text-2xs text-muted-foreground">
              Display mode
            </Label>
            <select
              id={`${baseId}-display`}
              disabled={readOnly}
              value={settings.displayMode}
              onChange={(event) =>
                update({ displayMode: event.target.value as CalculationDisplayMode })
              }
              className={SELECT_CLASSES}
            >
              <option value="as_imported">As imported</option>
              <option value="calculated">Calculated</option>
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <Label htmlFor={`${baseId}-lagcal`} className="text-2xs text-muted-foreground">
              Lag calendar
            </Label>
            <select
              id={`${baseId}-lagcal`}
              disabled={readOnly}
              value={settings.lagCalendar}
              onChange={(event) =>
                update({ lagCalendar: event.target.value as LagCalendarMode })
              }
              className={SELECT_CLASSES}
            >
              <option value="predecessor">Predecessor</option>
              <option value="successor">Successor</option>
              <option value="elapsed_24h">24-hour elapsed</option>
              <option value="project_default">Project default</option>
            </select>
          </div>

          <div className="col-span-2 flex flex-col gap-1">
            <Label htmlFor={`${baseId}-critdef`} className="text-2xs text-muted-foreground">
              Critical path definition
            </Label>
            <select
              id={`${baseId}-critdef`}
              disabled={readOnly}
              value={settings.criticalDefinition}
              onChange={(event) =>
                update({ criticalDefinition: event.target.value as CriticalDefinition })
              }
              className={SELECT_CLASSES}
            >
              <option value="total_float">Total float</option>
              <option value="longest_path">Longest path</option>
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <Label htmlFor={`${baseId}-critdays`} className="text-2xs text-muted-foreground">
              Critical threshold (days)
            </Label>
            <input
              id={`${baseId}-critdays`}
              type="number"
              step="0.5"
              disabled={readOnly}
              value={critDays}
              onChange={(event) => {
                const parsed = Number.parseFloat(event.target.value);
                if (Number.isFinite(parsed)) {
                  update({ criticalThresholdMinutes: Math.round(parsed * dayMinutes) });
                }
              }}
              className={SELECT_CLASSES}
            />
          </div>

          <div className="flex flex-col gap-1">
            <Label htmlFor={`${baseId}-neardays`} className="text-2xs text-muted-foreground">
              Near-critical (days)
            </Label>
            <input
              id={`${baseId}-neardays`}
              type="number"
              step="0.5"
              disabled={readOnly}
              value={nearCritDays}
              onChange={(event) => {
                const parsed = Number.parseFloat(event.target.value);
                if (Number.isFinite(parsed)) {
                  update({ nearCriticalThresholdMinutes: Math.round(parsed * dayMinutes) });
                }
              }}
              className={SELECT_CLASSES}
            />
          </div>

          <div className="flex flex-col gap-1">
            <Label htmlFor={`${baseId}-statusdate`} className="text-2xs text-muted-foreground">
              Status date
            </Label>
            <input
              id={`${baseId}-statusdate`}
              type="date"
              disabled={readOnly}
              value={toDateInputValue(settings.statusDate)}
              onChange={(event) =>
                update({
                  statusDate: event.target.value ? `${event.target.value}T08:00` : null,
                })
              }
              className={SELECT_CLASSES}
            />
          </div>

          <div className="flex flex-col gap-1">
            <Label htmlFor={`${baseId}-mfb`} className="text-2xs text-muted-foreground">
              Must finish by
            </Label>
            <input
              id={`${baseId}-mfb`}
              type="date"
              disabled={readOnly}
              value={toDateInputValue(settings.mustFinishBy)}
              onChange={(event) =>
                update({
                  mustFinishBy: event.target.value ? `${event.target.value}T17:00` : null,
                })
              }
              className={SELECT_CLASSES}
            />
          </div>

          <div className="col-span-2 flex items-center gap-2 pt-1">
            <Checkbox
              id={`${baseId}-autocalc`}
              disabled={readOnly}
              checked={settings.autoCalculate}
              onCheckedChange={(checked) => update({ autoCalculate: checked === true })}
            />
            <Label htmlFor={`${baseId}-autocalc`} className="text-xs font-normal">
              Auto-calculate after edits
            </Label>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
