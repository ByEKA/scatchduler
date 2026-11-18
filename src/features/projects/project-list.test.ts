import { describe, expect, it } from 'vitest';
import type { ProjectSummary } from '@/data/types';
import {
  activeFilterCount,
  filterChips,
  filterProjects,
  readProjectsView,
  sortProjects,
  withoutFilters,
  withViewParam,
} from '@/features/projects/project-list';
import { createTestDataLayer } from '@/test/fakes';

const params = (query: string) => new URLSearchParams(query);
const codes = (list: readonly ProjectSummary[]) => list.map((p) => p.code);
async function seeded() {
  const { repository, store } = createTestDataLayer();
  return repository.listProjects(store.read().workspaces[0]!.id);
}

describe('project list rules', () => {
  it('reads the view and ignores values it does not know', () => {
    expect(readProjectsView(params(''))).toEqual({
      q: '',
      status: null,
      stage: null,
      sort: 'updated',
    });
    expect(readProjectsView(params('q=pier&status=on_hold&stage=construction&sort=name'))).toEqual({
      q: 'pier',
      status: 'on_hold',
      stage: 'construction',
      sort: 'name',
    });
    expect(readProjectsView(params('status=paused&stage=x&sort=size&from=2026-02-30'))).toEqual({
      q: '',
      status: null,
      stage: null,
      sort: 'updated',
    });
  });

  it('writes params without defaults or empty values and clears the filters with the search', () => {
    const p = withViewParam(
      withViewParam(params('sort=name'), 'status', 'completed'),
      'sort',
      'updated',
    );
    expect(p.toString()).toBe('status=completed');
    expect(withViewParam(p, 'status', null).toString()).toBe('');
    expect(withViewParam(p, 'q', '').toString()).toBe('status=completed');
    expect(withoutFilters(params('sort=name&q=x&status=active&stage=pursuit')).toString()).toBe(
      'sort=name',
    );
  });

  it('counts the filters and names each for its chip', () => {
    const view = readProjectsView(params('q=x&status=on_hold&stage=closeout'));
    expect(activeFilterCount(view)).toBe(2);
    expect(filterChips(view)).toEqual([
      { id: 'status', label: 'Status', value: 'On hold' },
      { id: 'stage', label: 'Stage', value: 'Closeout' },
    ]);
  });

  it('searches name and code with Turkish folding', async () => {
    const projects = await seeded();
    const view = (q: string) => readProjectsView(params(`q=${encodeURIComponent(q)}`));
    expect(codes(filterProjects(projects, view('RİVERSİDE')))).toEqual(['001']);
    expect(codes(filterProjects(projects, view('harbor')))).toEqual(['003']);
    expect(codes(filterProjects(projects, view('00')))).toEqual([
      '001',
      '002',
      '003',
      '004',
      '005',
      '006',
    ]);
    expect(codes(filterProjects(projects, view('istanbul')))).toEqual([]);
  });

  it('combines status and stage with AND', async () => {
    const projects = await seeded();
    expect(
      codes(filterProjects(projects, readProjectsView(params('status=active&stage=construction')))),
    ).toEqual(['001', '003']);
    expect(codes(filterProjects(projects, readProjectsView(params('status=on_hold'))))).toEqual([
      '004',
    ]);
  });

  it('sorts by last updated, name and status date with their tie-breaks, nulls last', async () => {
    const projects = await seeded();
    expect(codes(sortProjects(projects, 'updated'))).toEqual([
      '001',
      '002',
      '003',
      '004',
      '005',
      '006',
    ]);
    expect(codes(sortProjects(projects, 'name'))).toEqual([
      '004',
      '003',
      '002',
      '005',
      '006',
      '001',
    ]);
    expect(codes(sortProjects(projects, 'status-date'))).toEqual([
      '001',
      '003',
      '004',
      '006',
      '002',
      '005',
    ]);
    const twins = projects.map((p) => ({
      ...p,
      name: 'Same',
      updatedAt: projects[0]!.updatedAt,
      statusDate: null,
    }));
    const byId = [...twins].sort((a, b) => (a.id < b.id ? -1 : 1)).map((p) => p.code);
    expect(codes(sortProjects([...twins].reverse(), 'updated'))).toEqual(byId);
    expect(codes(sortProjects([...twins].reverse(), 'name'))).toEqual([
      '001',
      '002',
      '003',
      '004',
      '005',
      '006',
    ]);
    expect(codes(sortProjects([...twins].reverse(), 'status-date'))).toEqual(byId);
  });
});
