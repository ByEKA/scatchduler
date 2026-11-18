import type { ReactElement } from 'react';
import type { ProjectStatus } from '@/data/types';
import { optionLabel, STATUS_OPTIONS } from '@/lib/project-options';
import { cn } from '@/lib/utils';

// The label's tokens per status (P3 core spec §6.1). Active and Completed get a transparent border,
// so every badge has the same size.
const STATUS_CLASSES: Record<ProjectStatus, string> = {
  active: 'border-transparent text-foreground',
  on_hold: 'border-warning-border bg-warning-bg text-warning-foreground',
  completed: 'border-transparent bg-muted text-muted-foreground',
  cancelled: 'border-destructive text-destructive',
};

/**
 * A project's status on an opaque chip, so it reads on a cover photo too (spec §6.1). The outer
 * `bg-card` layer keeps the chip opaque under the translucent dark `--warning-bg` (D41); Active
 * puts a 6 px success dot before its text.
 */
export function StatusBadge({
  status,
  className,
}: {
  status: ProjectStatus;
  className?: string;
}): ReactElement {
  return (
    <span data-status={status} className={cn('inline-flex shrink-0 rounded-sm bg-card', className)}>
      <span
        className={cn(
          'inline-flex h-5 items-center gap-1.5 rounded-sm border px-1.5 text-xs font-medium whitespace-nowrap',
          STATUS_CLASSES[status],
        )}
      >
        {status === 'active' && (
          <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-success" />
        )}
        {optionLabel(STATUS_OPTIONS, status)}
      </span>
    </span>
  );
}
