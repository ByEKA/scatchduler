import { AlertTriangle } from 'lucide-react';
import { useState } from 'react';
import type { ReactElement } from 'react';
import { POPOVER_SHELL_CLASSES } from '@/components/common/popover-classes';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { SolverWarning } from '@/data/schedule-types';
import { cn } from '@/lib/utils';

export interface WarningsPopoverProps {
  warnings: readonly SolverWarning[];
  onJumpToActivity(activityId: string): void;
}

/**
 * Toolbar popover listing CPM `SolverWarning` items with click-to-jump navigation (spec §5.5, §7.2).
 */
export function WarningsPopover({
  warnings,
  onJumpToActivity,
}: WarningsPopoverProps): ReactElement {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="xs"
          className="gap-1.5 border-input bg-card dark:bg-card"
        >
          <AlertTriangle
            className={cn(
              'size-3.5',
              warnings.length > 0 ? 'text-warning-foreground' : 'text-muted-foreground',
            )}
            aria-hidden="true"
          />
          <span>Warnings</span>
          <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-sm bg-muted px-1 text-2xs font-medium text-foreground tabular-nums">
            {warnings.length}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={6}
        className={cn(POPOVER_SHELL_CLASSES, 'w-96 p-2 text-xs')}
      >
        <div className="px-2 py-1 font-semibold text-foreground">
          Calculation warnings ({warnings.length})
        </div>
        {warnings.length === 0 ? (
          <p className="px-2 py-4 text-center text-muted-foreground">No calculation warnings.</p>
        ) : (
          <ul className="max-h-72 overflow-y-auto py-1">
            {warnings.map((warning, idx) => (
              <li key={`${warning.code}-${warning.activityId ?? 'p'}-${idx}`}>
                {warning.activityId !== null ? (
                  <button
                    type="button"
                    onClick={() => {
                      onJumpToActivity(warning.activityId!);
                      setOpen(false);
                    }}
                    className="flex w-full items-start gap-2 rounded-sm px-2 py-1.5 text-left hover:bg-accent"
                  >
                    <AlertTriangle
                      className="mt-0.5 size-3.5 shrink-0 text-warning-foreground"
                      aria-hidden="true"
                    />
                    <span className="min-w-0 flex-1">{warning.message}</span>
                  </button>
                ) : (
                  <div className="flex items-start gap-2 px-2 py-1.5 text-muted-foreground">
                    <AlertTriangle
                      className="mt-0.5 size-3.5 shrink-0 text-warning-foreground"
                      aria-hidden="true"
                    />
                    <span className="min-w-0 flex-1">{warning.message}</span>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}
