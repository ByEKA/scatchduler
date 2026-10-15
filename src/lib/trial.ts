import { parseISO } from 'date-fns';
import type { ISODateTime } from '@/data/types';

const DAY_MS = 86_400_000;

export interface TrialStatus {
  daysLeft: number;
  ended: boolean;
  label: string;
  compactLabel: string;
}

/**
 * Days left until `endsAt`, counted in exact 24-hour spans and rounded up, so 12 hours left reads
 * "1 day left". Local calendar days and daylight-saving changes do not enter the count.
 */
export function trialStatus(endsAt: ISODateTime, now: Date): TrialStatus {
  const msLeft = parseISO(endsAt).getTime() - now.getTime();
  const daysLeft = Math.max(0, Math.ceil(msLeft / DAY_MS));
  const ended = msLeft <= 0;
  if (ended) return { daysLeft, ended, label: 'Trial ended', compactLabel: 'Ended' };
  return {
    daysLeft,
    ended,
    label: daysLeft === 1 ? '1 day left' : `${daysLeft} days left`,
    compactLabel: `${daysLeft}d`,
  };
}
