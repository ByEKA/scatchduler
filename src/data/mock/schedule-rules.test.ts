import { describe, expect, it } from 'vitest';
import { compareSchedules } from '@/data/mock/schedule-rules';
import type { Schedule } from '@/data/types';

const schedule = (id: string, statusDate: string | null, createdAt: string): Schedule => ({
  id,
  projectId: 'p',
  name: id,
  code: id,
  notes: null,
  statusDate,
  source: 'blank',
  sourceFileName: null,
  isCurrent: false,
  baseline: 'none',
  updateNumber: null,
  archivedAt: null,
  activityCount: 0,
  sourceFormat: null,
  hasImportReport: false,
  hasImportMapping: false,
  createdAt,
  updatedAt: createdAt,
});

describe('schedule rules', () => {
  it('orders schedules by status date (nulls last), then newest created, then id, whatever the stored order', () => {
    const list = [
      schedule('d', null, '2026-01-02T00:00:00.000Z'),
      schedule('c', '2026-05-01', '2026-01-01T00:00:00.000Z'),
      schedule('b', '2026-05-01', '2026-01-03T00:00:00.000Z'),
      schedule('z', '2026-06-01', '2026-01-01T00:00:00.000Z'),
      schedule('a', '2026-06-01', '2026-01-01T00:00:00.000Z'),
    ];
    expect([...list].sort(compareSchedules).map((s) => s.id)).toEqual(['a', 'z', 'b', 'c', 'd']);
    expect(
      [...list]
        .reverse()
        .sort(compareSchedules)
        .map((s) => s.id),
    ).toEqual(['a', 'z', 'b', 'c', 'd']);
  });
});
