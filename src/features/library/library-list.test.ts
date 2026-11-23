import { describe, expect, it } from 'vitest';
import {
  activeLibraryFilterCount,
  buildLibraryGroups,
  clearLibraryFilters,
  libraryFilterChips,
  readLibraryView,
  withLibraryViewParams,
} from '@/features/library/library-list';
import { createTestDataLayer } from '@/test/fakes';

describe('library-list', () => {
  it('reads, updates and clears URL parameters', () => {
    const initial = readLibraryView(new URLSearchParams());
    expect(initial).toEqual({
      q: '',
      workspace: null,
      tag: 'all',
      source: 'all',
      archived: false,
      nonEmpty: false,
    });

    const updated = withLibraryViewParams(new URLSearchParams(), {
      q: 'harbor',
      workspace: 'ws-1',
      tag: 'primary',
      source: 'blank',
      archived: true,
      nonEmpty: true,
    });
    expect(updated.toString()).toBe(
      'q=harbor&workspace=ws-1&tag=primary&source=blank&archived=1&nonEmpty=1',
    );
    const parsed = readLibraryView(updated);
    expect(parsed.tag).toBe('primary');
    expect(parsed.nonEmpty).toBe(true);
    expect(activeLibraryFilterCount(parsed)).toBe(3);

    expect(clearLibraryFilters(updated).toString()).toBe('');
  });

  it('groups schedules by workspace and project, resolves folder names, and filters across workspaces and shares', async () => {
    const dataLayer = createTestDataLayer();
    const data = await dataLayer.repository.getLibraryData();
    const defaultView = readLibraryView(new URLSearchParams());

    const all = buildLibraryGroups(data, defaultView);
    expect(all.workspaceGroups.map((g) => g.workspace.name)).toEqual([
      'My workspace',
      'Site Operations',
    ]);
    expect(all.sharedSchedules.length).toBeGreaterThan(0);

    const personalGroup = all.workspaceGroups[0]!;
    const harborGroup = personalGroup.projects.find((p) => p.project.code === '003')!;
    expect(harborGroup.schedules.find((e) => e.schedule.code === 'BL-01')?.folderName).toBe(
      'Baselines',
    );
    expect(harborGroup.schedules.find((e) => e.schedule.code === 'UP-02')?.folderName).toBe(
      'Monthly Updates',
    );

    // Archived schedules are hidden by default and included when archived=true
    const campusDefault = personalGroup.projects.find((p) => p.project.code === '004')!;
    expect(campusDefault.schedules.some((e) => e.schedule.code === 'RP-00')).toBe(false);
    const withArchived = buildLibraryGroups(data, { ...defaultView, archived: true });
    const campusArchived = withArchived.workspaceGroups[0]!.projects.find(
      (p) => p.project.code === '004',
    )!;
    expect(campusArchived.schedules.some((e) => e.schedule.code === 'RP-00')).toBe(true);

    // Hide empty keeps only schedules with activityCount > 0
    const nonEmpty = buildLibraryGroups(data, { ...defaultView, nonEmpty: true });
    expect(
      nonEmpty.workspaceGroups
        .flatMap((w) => w.projects)
        .flatMap((p) => p.schedules)
        .every((e) => e.schedule.activityCount > 0),
    ).toBe(true);
    expect(nonEmpty.sharedSchedules).toHaveLength(0);

    // Workspace filter + chips
    const team = data.workspaces.find((w) => w.kind === 'team')!;
    const teamView = { ...defaultView, workspace: team.id, tag: 'current' as const };
    const teamResult = buildLibraryGroups(data, teamView);
    expect(teamResult.workspaceGroups).toHaveLength(1);
    expect(teamResult.workspaceGroups[0]!.workspace.id).toBe(team.id);
    expect(teamResult.workspaceGroups[0]!.projects[0]!.schedules).toHaveLength(1);

    const chips = libraryFilterChips(teamView, data.workspaces);
    expect(chips).toEqual([
      { id: 'workspace', label: 'Workspace', value: 'Site Operations' },
      { id: 'tag', label: 'Tag', value: 'Current' },
    ]);
  });
});
