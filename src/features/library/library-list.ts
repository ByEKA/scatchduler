import type { FilterChipItem } from '@/components/common/FilterChips';
import type {
  ID,
  LibraryData,
  ProjectSummary,
  Schedule,
  SharedScheduleRow,
  WorkspaceSummary,
} from '@/data/types';
import { fullName } from '@/lib/format';
import { matchesSearch } from '@/lib/search';

export type LibraryTagFilter = 'all' | 'current' | 'baseline' | 'primary' | 'update';
export type LibrarySourceFilter = 'all' | 'blank' | 'import';

export interface LibraryView {
  q: string;
  workspace: ID | null;
  tag: LibraryTagFilter;
  source: LibrarySourceFilter;
  archived: boolean;
  nonEmpty: boolean;
}

export const LIBRARY_TAG_OPTIONS: ReadonlyArray<{ value: LibraryTagFilter; label: string }> = [
  { value: 'all', label: 'Any' },
  { value: 'current', label: 'Current' },
  { value: 'baseline', label: 'Baseline' },
  { value: 'primary', label: 'Primary baseline' },
  { value: 'update', label: 'Update' },
];

export const LIBRARY_SOURCE_OPTIONS: ReadonlyArray<{ value: LibrarySourceFilter; label: string }> =
  [
    { value: 'all', label: 'Any' },
    { value: 'blank', label: 'Blank' },
    { value: 'import', label: 'Imported' },
  ];

const TAG_VALUES = new Set<string>(LIBRARY_TAG_OPTIONS.map((o) => o.value));
const SOURCE_VALUES = new Set<string>(LIBRARY_SOURCE_OPTIONS.map((o) => o.value));

export function readLibraryView(params: URLSearchParams): LibraryView {
  const workspaceRaw = params.get('workspace')?.trim() ?? '';
  const tagRaw = params.get('tag') ?? 'all';
  const sourceRaw = params.get('source') ?? 'all';

  return {
    q: params.get('q') ?? '',
    workspace: workspaceRaw === '' ? null : workspaceRaw,
    tag: TAG_VALUES.has(tagRaw) ? (tagRaw as LibraryTagFilter) : 'all',
    source: SOURCE_VALUES.has(sourceRaw) ? (sourceRaw as LibrarySourceFilter) : 'all',
    archived: params.get('archived') === '1',
    nonEmpty: params.get('nonEmpty') === '1',
  };
}

export function withLibraryViewParams(
  params: URLSearchParams,
  patch: Partial<LibraryView>,
): URLSearchParams {
  const nextView: LibraryView = { ...readLibraryView(params), ...patch };
  const next = new URLSearchParams(params);

  if (nextView.q.trim() === '') next.delete('q');
  else next.set('q', nextView.q);

  if (nextView.workspace === null || nextView.workspace === '') next.delete('workspace');
  else next.set('workspace', nextView.workspace);

  if (nextView.tag === 'all') next.delete('tag');
  else next.set('tag', nextView.tag);

  if (nextView.source === 'all') next.delete('source');
  else next.set('source', nextView.source);

  if (nextView.archived) next.set('archived', '1');
  else next.delete('archived');

  if (nextView.nonEmpty) next.set('nonEmpty', '1');
  else next.delete('nonEmpty');

  return next;
}

export function clearLibraryFilters(params: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams(params);
  for (const key of ['q', 'workspace', 'tag', 'source', 'archived', 'nonEmpty'] as const) {
    next.delete(key);
  }
  return next;
}

export function activeLibraryFilterCount(view: LibraryView): number {
  return (
    (view.workspace !== null ? 1 : 0) +
    (view.tag !== 'all' ? 1 : 0) +
    (view.source !== 'all' ? 1 : 0)
  );
}

export function hasAnyLibraryFilters(view: LibraryView): boolean {
  return (
    view.q.trim() !== '' || activeLibraryFilterCount(view) > 0 || view.archived || view.nonEmpty
  );
}

export function libraryFilterChips(
  view: LibraryView,
  workspaces: readonly WorkspaceSummary[],
): FilterChipItem[] {
  const chips: FilterChipItem[] = [];
  if (view.workspace !== null) {
    const ws = workspaces.find((w) => w.id === view.workspace);
    chips.push({
      id: 'workspace',
      label: 'Workspace',
      value: ws?.name ?? view.workspace,
    });
  }
  if (view.tag !== 'all') {
    const label = LIBRARY_TAG_OPTIONS.find((o) => o.value === view.tag)?.label ?? view.tag;
    chips.push({ id: 'tag', label: 'Tag', value: label });
  }
  if (view.source !== 'all') {
    const label = LIBRARY_SOURCE_OPTIONS.find((o) => o.value === view.source)?.label ?? view.source;
    chips.push({ id: 'source', label: 'Source', value: label });
  }
  return chips;
}

function matchesTag(schedule: Schedule, tag: LibraryTagFilter): boolean {
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

export interface LibraryScheduleEntry {
  schedule: Schedule;
  folderName: string | null;
}

export interface LibraryProjectGroup {
  project: ProjectSummary;
  schedules: LibraryScheduleEntry[];
}

export interface LibraryWorkspaceGroup {
  workspace: WorkspaceSummary;
  projects: LibraryProjectGroup[];
  scheduleCount: number;
}

export interface LibraryGroupsResult {
  workspaceGroups: LibraryWorkspaceGroup[];
  sharedSchedules: SharedScheduleRow[];
  totalSchedules: number;
  totalProjects: number;
}

/**
 * Pure filtering and grouping pipeline for the cross-workspace Schedule Library page (spec §7.1).
 */
export function buildLibraryGroups(data: LibraryData, view: LibraryView): LibraryGroupsResult {
  const folderNameById = new Map<ID, string>(data.folders.map((f) => [f.id, f.name]));
  const projectsByWorkspace = new Map<ID, ProjectSummary[]>();
  for (const project of data.projects) {
    const list = projectsByWorkspace.get(project.workspaceId) ?? [];
    list.push(project);
    projectsByWorkspace.set(project.workspaceId, list);
  }

  const schedulesByProject = new Map<ID, Schedule[]>();
  for (const schedule of data.schedules) {
    const list = schedulesByProject.get(schedule.projectId) ?? [];
    list.push(schedule);
    schedulesByProject.set(schedule.projectId, list);
  }

  const query = view.q.trim();
  const workspaceGroups: LibraryWorkspaceGroup[] = [];
  let totalSchedules = 0;
  let totalProjects = 0;

  for (const workspace of data.workspaces) {
    if (view.workspace !== null && workspace.id !== view.workspace) continue;
    const wsProjects = projectsByWorkspace.get(workspace.id) ?? [];
    const projectGroups: LibraryProjectGroup[] = [];
    let wsScheduleCount = 0;

    for (const project of wsProjects) {
      const rawSchedules = schedulesByProject.get(project.id) ?? [];
      const matchingEntries: LibraryScheduleEntry[] = [];

      for (const schedule of rawSchedules) {
        if (!view.archived && schedule.archivedAt !== null) continue;
        if (view.nonEmpty && schedule.activityCount === 0) continue;
        if (!matchesTag(schedule, view.tag)) continue;
        if (view.source !== 'all' && schedule.source !== view.source) continue;

        const folderName =
          schedule.folderId !== null ? (folderNameById.get(schedule.folderId) ?? null) : null;

        if (
          query !== '' &&
          ![
            schedule.name,
            schedule.code,
            schedule.notes,
            schedule.sourceFileName,
            folderName,
            project.name,
            project.code,
            workspace.name,
          ].some((field) => matchesSearch(field, query))
        ) {
          continue;
        }

        matchingEntries.push({ schedule, folderName });
      }

      if (matchingEntries.length > 0) {
        projectGroups.push({ project, schedules: matchingEntries });
        wsScheduleCount += matchingEntries.length;
        totalProjects += 1;
      }
    }

    if (projectGroups.length > 0) {
      workspaceGroups.push({
        workspace,
        projects: projectGroups,
        scheduleCount: wsScheduleCount,
      });
      totalSchedules += wsScheduleCount;
    }
  }

  const sharedSchedules =
    view.tag !== 'all' || view.source !== 'all' || view.nonEmpty
      ? []
      : data.sharedWithMe.filter((row) => {
          if (view.workspace !== null && row.workspaceId !== view.workspace) return false;
          if (
            query !== '' &&
            ![row.scheduleName, row.projectName, fullName(row.sharedBy)].some((field) =>
              matchesSearch(field, query),
            )
          ) {
            return false;
          }
          return true;
        });

  totalSchedules += sharedSchedules.length;

  return {
    workspaceGroups,
    sharedSchedules,
    totalSchedules,
    totalProjects,
  };
}
