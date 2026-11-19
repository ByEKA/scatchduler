import type { ReactElement } from 'react';
import type { Schedule } from '@/data/types';
import { cn } from '@/lib/utils';

const BASELINE_LABELS = { baseline: 'Baseline', primary: 'Primary baseline' } as const;

// A read-only chip on the muted fill; "Current" reads in full-strength text, the baselines muted.
const TAG_CLASSES =
  'inline-flex h-5 items-center rounded-sm bg-muted px-1.5 text-xs font-medium whitespace-nowrap';

/**
 * A schedule's tags, read-only (P3 core spec §6.1): "Current", then "Primary baseline" or
 * "Baseline". Renders nothing for a schedule with neither.
 */
export function TagBadges({
  schedule,
}: {
  schedule: Pick<Schedule, 'isCurrent' | 'baseline'>;
}): ReactElement | null {
  const { isCurrent, baseline } = schedule;
  if (!isCurrent && baseline === 'none') return null;
  return (
    <div className="flex flex-wrap items-center gap-1">
      {isCurrent && <span className={cn(TAG_CLASSES, 'text-foreground')}>Current</span>}
      {baseline !== 'none' && (
        <span className={cn(TAG_CLASSES, 'text-muted-foreground')}>
          {BASELINE_LABELS[baseline]}
        </span>
      )}
    </div>
  );
}
