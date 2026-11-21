import { defaultFilter } from 'cmdk';
import { Check, ChevronDown, Lock } from 'lucide-react';
import { Popover as PopoverPrimitive } from 'radix-ui';
import { useMemo, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { useMatch, useNavigate, useSearchParams } from 'react-router';
import { OPTION_CLASSES, POPOVER_SHELL_CLASSES } from '@/components/common/popover-classes';
import { TagBadges } from '@/components/common/TagBadges';
import { FOCUS_OUTLINE_CLASSES, NameTooltip } from '@/components/layout/top-bar-parts';
import { Command, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverTrigger } from '@/components/ui/popover';
import { Skeleton } from '@/components/ui/skeleton';
import type { Schedule } from '@/data/types';
import { useCurrentContext } from '@/hooks/useCurrentContext';
import { useProjectSchedules } from '@/hooks/useProjectSchedules';
import { cn } from '@/lib/utils';

const EMPTY_SCHEDULES: readonly Schedule[] = [];

function matchingSchedules(schedules: readonly Schedule[], search: string): Schedule[] {
  if (search.trim() === '') return [...schedules];
  return schedules.filter(
    (schedule) => defaultFilter(`${schedule.name} ${schedule.code ?? ''}`, search) > 0,
  );
}

/**
 * The active schedule and a searchable list of the project's non-archived schedules in the TopBar
 * (P4 spec §7.1). Renders only on `/w/:workspaceId/p/:projectId/schedule` when a project is active.
 */
export function ScheduleSwitcher(): ReactElement | null {
  const match = useMatch('/w/:workspaceId/p/:projectId/schedule');
  const { workspace, project } = useCurrentContext();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const labelRef = useRef<HTMLSpanElement>(null);

  const activeProjectId =
    match !== null && project !== null && project.id === match.params.projectId
      ? project.id
      : undefined;
  const schedulesQuery = useProjectSchedules(activeProjectId);

  const allSchedules = schedulesQuery.data ?? EMPTY_SCHEDULES;
  const nonArchived = useMemo(
    () => allSchedules.filter((schedule) => schedule.archivedAt === null),
    [allSchedules],
  );
  const visible = useMemo(() => matchingSchedules(nonArchived, search), [nonArchived, search]);

  if (match === null || workspace === null || activeProjectId === undefined) {
    return null;
  }

  if (schedulesQuery.data === undefined && schedulesQuery.isPending) {
    return <Skeleton className="h-7 w-24 shrink-0 sm:w-36" />;
  }

  const requestedId = searchParams.get('scheduleId');
  const activeSchedule =
    (requestedId ? allSchedules.find((s) => s.id === requestedId) : undefined) ??
    nonArchived.find((s) => s.isCurrent) ??
    nonArchived[0] ??
    null;

  if (nonArchived.length === 0 && activeSchedule === null) {
    return null;
  }

  const handleOpenChange = (next: boolean) => {
    if (next) setSearch('');
    setOpen(next);
  };

  const selectSchedule = (scheduleId: string) => {
    setOpen(false);
    void navigate(`/w/${workspace.id}/p/${activeProjectId}/schedule?scheduleId=${scheduleId}`);
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <NameTooltip name={activeSchedule?.name ?? 'Select schedule'} labelRef={labelRef}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label="Switch schedule"
            className={cn(
              'flex h-7 max-w-[260px] min-w-14 items-center gap-1.5 rounded-md bg-secondary/80 px-2.5 text-sm font-medium hover:bg-accent',
              FOCUS_OUTLINE_CLASSES,
            )}
          >
            <span
              ref={labelRef}
              className={cn(
                'truncate max-sm:max-w-[100px]',
                activeSchedule === null && 'text-muted-foreground',
              )}
            >
              {activeSchedule?.name ?? 'Select schedule'}
            </span>
            <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          </button>
        </PopoverTrigger>
      </NameTooltip>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          side="bottom"
          align="start"
          sideOffset={6}
          aria-label="Switch schedule"
          className={cn(
            POPOVER_SHELL_CLASSES,
            'w-[340px] origin-(--radix-popover-content-transform-origin)',
          )}
        >
          <Command label="Search schedules" shouldFilter={false} defaultValue={activeSchedule?.id}>
            <CommandInput
              placeholder="Search schedules…"
              value={search}
              onValueChange={setSearch}
            />
            <CommandList className="max-h-80 pt-1">
              {visible.map((item) => {
                const modeLabel =
                  item.calculationMode === 'as_imported' ? 'As imported' : 'Calculated';
                const lockLabel =
                  item.lock === null ? null : `Being edited by ${item.lock.userName}`;
                return (
                  <CommandItem
                    key={item.id}
                    value={item.id}
                    aria-current={item.id === activeSchedule?.id ? 'true' : undefined}
                    onSelect={() => selectSchedule(item.id)}
                    className={cn(
                      OPTION_CLASSES,
                      item.id === activeSchedule?.id && 'bg-accent text-accent-foreground',
                    )}
                  >
                    <span
                      title={modeLabel}
                      aria-label={modeLabel}
                      className={cn(
                        'size-2 shrink-0 rounded-full',
                        item.calculationMode === 'as_imported'
                          ? 'bg-warning-foreground'
                          : 'bg-success',
                      )}
                    />
                    <span className="min-w-0 flex-1 truncate" title={item.name}>
                      {item.name}
                    </span>
                    {item.code !== null && item.code.trim() !== '' && (
                      <span className="shrink-0 rounded-sm bg-muted px-1.5 py-px font-mono text-2xs text-muted-foreground">
                        {item.code}
                      </span>
                    )}
                    <TagBadges schedule={item} />
                    {lockLabel !== null && (
                      <span
                        role="img"
                        title={lockLabel}
                        aria-label={lockLabel}
                        className="inline-flex shrink-0 items-center text-warning-foreground"
                      >
                        <Lock className="size-3.5" aria-hidden="true" />
                      </span>
                    )}
                    <Check
                      aria-hidden="true"
                      className={cn(
                        'size-3.5 shrink-0 text-link',
                        item.id !== activeSchedule?.id && 'invisible',
                      )}
                    />
                  </CommandItem>
                );
              })}
              {visible.length === 0 && (
                <div className="py-6 text-center text-sm text-muted-foreground">
                  No schedules found
                </div>
              )}
            </CommandList>
          </Command>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </Popover>
  );
}
