import type { ID, Schedule } from '@/data/types';
import { compareNamed } from '@/data/sort';
import { matchesSearch } from '@/lib/search';

export type FilesFolderFilter = 'all' | 'unfiled' | ID;
export type FilesTagFilter = 'all' | 'current' | 'baseline' | 'primary' | 'update';
export type FilesSortKey = 'default' | 'statusDate' | 'name' | 'updatedAt' | 'activityCount';

export interface FilesView {
  folder: FilesFolderFilter;
  q: string;
  tag: FilesTagFilter;
  sort: FilesSortKey;
  archived: boolean;
}

export const FILES_TAG_OPTIONS: ReadonlyArray<{ value: FilesTagFilter; label: string }> = [
  { value: 'all', label: 'All tags' },
  { value: 'current', label: 'Current' },
  { value: 'baseline', label: 'Baseline' },
  { value: 'primary', label: 'Primary baseline' },
  { value: 'update', label: 'Updates' },
];

export const FILES_SORT_OPTIONS: ReadonlyArray<{ value: FilesSortKey; label: string }> = [
  { value: 'default', label: 'Default order' },
  { value: 'statusDate', label: 'Status date' },
  { value: 'name', label: 'Name' },
  { value: 'updatedAt', label: 'Last modified' },
  { value: 'activityCount', label: 'Activities' },
];

const TAG_VALUES = new Set<string>(FILES_TAG_OPTIONS.map((o) => o.value));
const SORT_VALUES = new Set<string>(FILES_SORT_OPTIONS.map((o) => o.value));

export function readFilesView(searchParams: URLSearchParams): FilesView {
  const folderRaw = searchParams.get('folder')?.trim() ?? '';
  const folder: FilesFolderFilter =
    folderRaw === '' || folderRaw === 'all'
      ? 'all'
      : folderRaw === 'unfiled'
        ? 'unfiled'
        : folderRaw;

  const q = searchParams.get('q') ?? '';

  const tagRaw = searchParams.get('tag') ?? 'all';
  const tag: FilesTagFilter = TAG_VALUES.has(tagRaw) ? (tagRaw as FilesTagFilter) : 'all';

  const sortRaw = searchParams.get('sort') ?? 'default';
  const sort: FilesSortKey = SORT_VALUES.has(sortRaw) ? (sortRaw as FilesSortKey) : 'default';

  const archived = searchParams.get('archived') === '1';

  return { folder, q, tag, sort, archived };
}

export function withFilesViewParams(
  searchParams: URLSearchParams,
  patch: Partial<FilesView>,
): URLSearchParams {
  const current = readFilesView(searchParams);
  const nextView: FilesView = { ...current, ...patch };
  const next = new URLSearchParams(searchParams);

  if (nextView.folder === 'all') next.delete('folder');
  else next.set('folder', nextView.folder);

  if (nextView.q.trim() === '') next.delete('q');
  else next.set('q', nextView.q);

  if (nextView.tag === 'all') next.delete('tag');
  else next.set('tag', nextView.tag);

  if (nextView.sort === 'default') next.delete('sort');
  else next.set('sort', nextView.sort);

  if (nextView.archived) next.set('archived', '1');
  else next.delete('archived');

  return next;
}

export function hasActiveFilesFilters(view: FilesView): boolean {
  return view.folder !== 'all' || view.q.trim() !== '' || view.tag !== 'all';
}

function matchesTag(schedule: Schedule, tag: FilesTagFilter): boolean {
  switch (tag) {
    case 'all':
      return true;
    case 'current':
      return schedule.isCurrent;
    case 'baseline':
      return schedule.baseline !== 'none';
    case 'primary':
      return schedule.baseline === 'primary';
    case 'update':
      return schedule.updateNumber !== null;
  }
}

function compareDescNullable(a: string | null, b: string | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return b.localeCompare(a);
}

/**
 * Pure filter and sort pipeline for the Project Files table (spec §7.2.2).
 */
export function filterAndSortSchedules(
  schedules: readonly Schedule[],
  view: FilesView,
): Schedule[] {
  const filtered = schedules.filter((schedule) => {
    if (!view.archived && schedule.archivedAt !== null) return false;
    if (view.folder === 'unfiled' && schedule.folderId !== null) return false;
    if (view.folder !== 'all' && view.folder !== 'unfiled' && schedule.folderId !== view.folder) {
      return false;
    }
    if (!matchesTag(schedule, view.tag)) return false;
    if (
      view.q.trim() !== '' &&
      ![schedule.name, schedule.code, schedule.notes, schedule.sourceFileName].some((field) =>
        matchesSearch(field, view.q),
      )
    ) {
      return false;
    }
    return true;
  });

  if (view.sort === 'default') return filtered;

  return [...filtered].sort((a, b) => {
    switch (view.sort) {
      case 'name':
        return compareNamed(a, b);
      case 'statusDate':
        return compareDescNullable(a.statusDate, b.statusDate) || compareNamed(a, b);
      case 'updatedAt':
        return b.updatedAt.localeCompare(a.updatedAt) || compareNamed(a, b);
      case 'activityCount':
        return b.activityCount - a.activityCount || compareNamed(a, b);
      default:
        return 0;
    }
  });
}
