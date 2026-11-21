import { AlertCircle } from 'lucide-react';
import { Fragment } from 'react';
import type { ReactElement } from 'react';
import type { SolverError } from '@/data/schedule-types';

export interface CycleErrorBannerProps {
  error: SolverError;
  onJumpToCycleActivity(activityId: string): void;
}

/**
 * Inline `role="alert"` banner rendered above the split pane when CPM encounters a circular
 * relationship loop or a zero-working-time calendar (spec §5.5, §7.2).
 */
export function CycleErrorBanner({
  error,
  onJumpToCycleActivity,
}: CycleErrorBannerProps): ReactElement {
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center gap-1.5 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive"
    >
      <AlertCircle className="size-4 shrink-0" aria-hidden="true" />
      {error.code === 'SCHEDULE_CYCLE' ? (
        <span className="flex flex-wrap items-center gap-1">
          <span className="font-medium">Circular logic found:</span>
          {error.cycleCodes.map((code, index) => {
            const targetId = error.cycleIds[index % error.cycleIds.length];
            return (
              <Fragment key={`${code}-${index}`}>
                {index > 0 && <span aria-hidden="true">→</span>}
                {targetId !== undefined ? (
                  <button
                    type="button"
                    onClick={() => onJumpToCycleActivity(targetId)}
                    className="rounded-xs bg-destructive/15 px-1 py-px font-mono font-medium underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-ring"
                  >
                    {code}
                  </button>
                ) : (
                  <span className="font-mono font-medium">{code}</span>
                )}
              </Fragment>
            );
          })}
          <span>. Break the loop to calculate.</span>
        </span>
      ) : (
        <span>{error.message}</span>
      )}
    </div>
  );
}
