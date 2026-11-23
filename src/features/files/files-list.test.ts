import { describe, expect, it } from 'vitest';
import type { Schedule } from '@/data/types';
import {
  filterAndSortSchedules,
  hasActiveFilesFilters,
  readFilesView,
  withFilesViewParams,
  type FilesView,
} from '@/features/files/files-list';

function makeSchedule(overrides: Partial<Schedule> & { id: string; name: string }): Schedule {
  return {
    projectId: 'p1',
    folderId: null,
    copiedFromId: null,
    code: null,
    notes: null,
    statusDate: null,
    source: 'blank',
    sourceFileName: null,
    sourceFormat: null,
    hasImportReport: false,
    hasImportMapping: false,
    activityCount: 0,
    isCurrent: false,
    baseline: 'none',
    updateNumber: null,
    calculationMode: 'calculated',
    dataRevision: 1,
    hasScheduleData: true,
    lock: null,
    archivedAt: null,
    createdAt: '2026-10-01T00:00:00Z',
    updatedAt: '2026-10-01T00:00:00Z',
    ...overrides,
  };
}

const DEFAULT_VIEW: FilesView = {
  folder: 'all',
  q: '',
  tag: 'all',
  sort: 'default',
  archived: false,
};

describe('files-list', () => {
  it('parses and updates URL search parameters cleanly', () => {
    const empty = readFilesView(new URLSearchParams());
    expect(empty).toEqual(DEFAULT_VIEW);
    expect(hasActiveFilesFilters(empty)).toBe(false);

    const updated = withFilesViewParams(new URLSearchParams(), {
      folder: 'f1',
      q: 'crane',
      tag: 'primary',
      sort: 'name',
      archived: true,
    });
    expect(updated.toString()).toBe('folder=f1&q=crane&tag=primary&sort=name&archived=1');
    const parsed = readFilesView(updated);
    expect(parsed).toEqual({
      folder: 'f1',
      q: 'crane',
      tag: 'primary',
      sort: 'name',
      archived: true,
    });
    expect(hasActiveFilesFilters(parsed)).toBe(true);

    const invalid = readFilesView(new URLSearchParams('tag=bogus&sort=nope'));
    expect(invalid.tag).toBe('all');
    expect(invalid.sort).toBe('default');
  });

  it('filters by archived, folder, tag, and search text', () => {
    const schedules: Schedule[] = [
      makeSchedule({
        id: 's1',
        name: 'Baseline',
        code: 'BL-01',
        folderId: 'f-base',
        baseline: 'primary',
        statusDate: '2026-09-01',
        activityCount: 120,
        updatedAt: '2026-09-02T00:00:00Z',
      }),
      makeSchedule({
        id: 's2',
        name: 'Update 1',
        code: 'UP-01',
        folderId: 'f-upd',
        updateNumber: 1,
        statusDate: '2026-10-01',
        activityCount: 140,
        updatedAt: '2026-10-02T00:00:00Z',
      }),
      makeSchedule({
        id: 's3',
        name: 'Update 2',
        code: 'UP-02',
        folderId: null,
        isCurrent: true,
        updateNumber: 2,
        notes: 'Revised crane plan',
        statusDate: '2026-11-01',
        activityCount: 160,
        updatedAt: '2026-11-02T00:00:00Z',
      }),
      makeSchedule({
        id: 's4',
        name: 'Old Draft',
        code: 'DR-01',
        folderId: null,
        archivedAt: '2026-08-01T00:00:00Z',
        activityCount: 10,
      }),
    ];

    expect(filterAndSortSchedules(schedules, DEFAULT_VIEW).map((s) => s.id)).toEqual([
      's1',
      's2',
      's3',
    ]);
    expect(
      filterAndSortSchedules(schedules, { ...DEFAULT_VIEW, archived: true }).map((s) => s.id),
    ).toEqual(['s1', 's2', 's3', 's4']);
    expect(
      filterAndSortSchedules(schedules, { ...DEFAULT_VIEW, folder: 'unfiled' }).map((s) => s.id),
    ).toEqual(['s3']);
    expect(
      filterAndSortSchedules(schedules, { ...DEFAULT_VIEW, folder: 'f-base' }).map((s) => s.id),
    ).toEqual(['s1']);
    expect(
      filterAndSortSchedules(schedules, { ...DEFAULT_VIEW, tag: 'current' }).map((s) => s.id),
    ).toEqual(['s3']);
    expect(
      filterAndSortSchedules(schedules, { ...DEFAULT_VIEW, tag: 'primary' }).map((s) => s.id),
    ).toEqual(['s1']);
    expect(
      filterAndSortSchedules(schedules, { ...DEFAULT_VIEW, tag: 'update' }).map((s) => s.id),
    ).toEqual(['s2', 's3']);
    expect(
      filterAndSortSchedules(schedules, { ...DEFAULT_VIEW, q: 'crane' }).map((s) => s.id),
    ).toEqual(['s3']);

    // Sorting modes
    expect(
      filterAndSortSchedules(schedules, { ...DEFAULT_VIEW, sort: 'name' }).map((s) => s.id),
    ).toEqual(['s1', 's2', 's3']);
    expect(
      filterAndSortSchedules(schedules, { ...DEFAULT_VIEW, sort: 'statusDate' }).map((s) => s.id),
    ).toEqual(['s3', 's2', 's1']);
    expect(
      filterAndSortSchedules(schedules, { ...DEFAULT_VIEW, sort: 'updatedAt' }).map((s) => s.id),
    ).toEqual(['s3', 's2', 's1']);
    expect(
      filterAndSortSchedules(schedules, { ...DEFAULT_VIEW, sort: 'activityCount' }).map((s) => s.id),
    ).toEqual(['s3', 's2', 's1']);
  });
});
