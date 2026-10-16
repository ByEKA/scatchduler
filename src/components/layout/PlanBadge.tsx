import type { ReactElement } from 'react';
import { Link } from 'react-router';
import { FOCUS_OUTLINE_CLASSES } from '@/components/layout/top-bar-parts';
import { useNow } from '@/hooks/useNow';
import { useSubscription } from '@/hooks/useSubscription';
import { trialStatus } from '@/lib/trial';
import { cn } from '@/lib/utils';

/**
 * Trial countdown pill linking to billing (spec §6.4, §6.10). Hidden on paid plans and while the
 * subscription is loading or failed to load.
 */
export function PlanBadge(): ReactElement | null {
  const { data: subscription } = useSubscription();
  const now = useNow();

  if (subscription?.plan !== 'trial' || subscription.trialEndsAt === null) return null;

  const trial = trialStatus(subscription.trialEndsAt, now);
  const label = trial.ended ? 'Trial ended. Upgrade now.' : `Trial: ${trial.label}. Upgrade now.`;

  return (
    <Link
      to="/settings/billing"
      aria-label={label}
      className={cn(
        'inline-flex h-[26px] shrink-0 items-center gap-2 rounded-full border px-3 py-1',
        trial.ended
          ? 'border-destructive/40 text-destructive'
          : 'border-warning-border bg-warning-bg text-warning-foreground',
        FOCUS_OUTLINE_CLASSES,
      )}
    >
      {/* The ended badge reads "Trial ended" alone (spec §6.8, §6.10). */}
      {!trial.ended && (
        <>
          <span className="text-2xs font-semibold tracking-[0.06em] uppercase max-sm:hidden dark:opacity-70">
            Trial
          </span>
          <span
            className="size-1 rounded-full bg-current opacity-50 max-sm:hidden"
            aria-hidden="true"
          />
        </>
      )}
      <span className="text-xs font-semibold whitespace-nowrap">
        <span className="hidden sm:inline">{trial.label}</span>
        <span className="sm:hidden">{trial.compactLabel}</span>
      </span>
    </Link>
  );
}
