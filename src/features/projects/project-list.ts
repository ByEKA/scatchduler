// The Projects page's list rules (P3 core spec §6.2): the view in the URL, the filter chips, search,
// filters and sort. Pure functions, so a removed rule fails a unit test (spec §6.1, P2 D22).
import type { FilterChipItem } from '@/components/common/FilterChips';
import { compareIds, compareText, newestFirst } from '@/data/sort';
import type { ISODate, ProjectStage, ProjectStatus, ProjectSummary } from '@/data/types';
import {
  isOptionValue,
  optionLabel,
  STAGE_OPTIONS,
  STATUS_OPTIONS,
  type Option,
} from '@/lib/project-options';
import { matchesSearch } from '@/lib/search';

export type ProjectSort = 'updated' | 'name' | 'status-date';

/** What the URL asks the Projects page to show (spec D21). */
export interface ProjectsView {
  q: string;
  status: ProjectStatus | null;
  stage: ProjectStage | null;
  sort: ProjectSort;
}

export type ProjectsParam = 'q' | 'status' | 'stage' | 'sort';

/** The "Sort by" options in order; "Last updated" is the default (spec D24). */
export const PROJECT_SORT_OPTIONS: ReadonlyArray<Option<ProjectSort>> = [
  { value: 'updated', label: 'Last updated' },
  { value: 'name', label: 'Name' },
  { value: 'status-date', label: 'Status date' },
];

const DEFAULT_SORT: ProjectSort = 'updated';

/** The view the URL asks for; an unknown or malformed value reads as its default (our call). */
export function readProjectsView(params: URLSearchParams): ProjectsView {
  const status = params.get('status');
  const stage = params.get('stage');
  const sort = params.get('sort');
  return {
    q: params.get('q') ?? '',
    status: isOptionValue(STATUS_OPTIONS, status) ? status : null,
    stage: isOptionValue(STAGE_OPTIONS, stage) ? stage : null,
    sort: isOptionValue(PROJECT_SORT_OPTIONS, sort) ? sort : DEFAULT_SORT,
  };
}

/**
 * A copy of `params` with `key` set to `value`. An empty value, `null` and the default sort remove
 * the parameter, so the URL holds only what differs from the defaults.
 */
export function withViewParam(
  params: URLSearchParams,
  key: ProjectsParam,
  value: string | null,
): URLSearchParams {
  const next = new URLSearchParams(params);
  if (value === null || value === '' || (key === 'sort' && value === DEFAULT_SORT)) {
    next.delete(key);
  } else {
    next.set(key, value);
  }
  return next;
}

/** A copy of `params` without the search and the filters; the sort stays. */
export function withoutFilters(params: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams(params);
  for (const key of ['q', 'status', 'stage'] as const) next.delete(key);
  return next;
}

/** The number the "Filters · {n}" button shows: the status and stage filters in use. */
export function activeFilterCount(view: ProjectsView): number {
  return (view.status !== null ? 1 : 0) + (view.stage !== null ? 1 : 0);
}

/** One chip per filter in use, "{filter}: {value}" (spec §6.1). The search has no chip. */
export function filterChips(view: ProjectsView): FilterChipItem[] {
  const chips: FilterChipItem[] = [];
  if (view.status !== null) {
    chips.push({ id: 'status', label: 'Status', value: optionLabel(STATUS_OPTIONS, view.status) });
  }
  if (view.stage !== null) {
    chips.push({ id: 'stage', label: 'Stage', value: optionLabel(STAGE_OPTIONS, view.stage) });
  }
  return chips;
}

/**
 * The projects the view keeps, in their order: the search matches the name or the code with
 * Turkish folding (spec §5.4), and every filter in use must hold (AND).
 */
export function filterProjects<T extends ProjectSummary>(
  projects: readonly T[],
  view: ProjectsView,
): T[] {
  return projects.filter(
    (project) =>
      (matchesSearch(project.name, view.q) || matchesSearch(project.code, view.q)) &&
      (view.status === null || project.attributes.status === view.status) &&
      (view.stage === null || project.attributes.stage === view.stage),
  );
}

/**
 * Latest status date first, projects without one last. Date-only ISO strings compare as text in
 * calendar order, so they are never parsed.
 */
function latestDateFirst(a: ISODate | null, b: ISODate | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a < b ? 1 : -1;
}

const byUpdated = newestFirst<ProjectSummary>((project) => project.updatedAt);

// Each order ends with the id, so equal projects keep one order whatever order they came in.
const COMPARATORS: Record<ProjectSort, (a: ProjectSummary, b: ProjectSummary) => number> = {
  updated: byUpdated,
  name: (a, b) =>
    compareText(a.name, b.name) || compareText(a.code, b.code) || compareIds(a.id, b.id),
  'status-date': (a, b) =>
    latestDateFirst(a.statusDate, b.statusDate) ||
    compareText(a.name, b.name) ||
    compareIds(a.id, b.id),
};

/** A sorted copy (spec §6.2 sort rules). */
export function sortProjects<T extends ProjectSummary>(
  projects: readonly T[],
  sort: ProjectSort,
): T[] {
  return [...projects].sort(COMPARATORS[sort]);
}
