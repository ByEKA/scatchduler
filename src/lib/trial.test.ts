import { expect, it } from 'vitest';
import { trialStatus } from '@/lib/trial';

const now = new Date('2026-10-14T10:00:00.000Z');

it('counts whole days left, rounding partial days up', () => {
  expect(trialStatus('2026-10-23T10:00:00.000Z', now)).toEqual({
    daysLeft: 9,
    ended: false,
    label: '9 days left',
    compactLabel: '9d',
  });
  expect(trialStatus('2026-10-14T22:00:00.000Z', now)).toMatchObject({
    daysLeft: 1,
    ended: false,
    label: '1 day left',
  });
});

it('ends exactly at the end time and counts any part of a day as a day', () => {
  expect(trialStatus('2026-10-14T10:00:00.000Z', now)).toMatchObject({
    ended: true,
    label: 'Trial ended',
  });
  expect(trialStatus('2026-10-14T13:00:00.000Z', now)).toEqual({
    daysLeft: 1,
    ended: false,
    label: '1 day left',
    compactLabel: '1d',
  });
});

it('reports an ended trial', () => {
  expect(trialStatus('2026-10-14T09:00:00.000Z', now)).toEqual({
    daysLeft: 0,
    ended: true,
    label: 'Trial ended',
    compactLabel: 'Ended',
  });
});
