import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createTestDataLayer } from '@/test/fakes';
import { renderApp } from '@/test/render';

describe('SchedulePage', () => {
  it('shows Not found for an unknown scheduleId', async () => {
    const dataLayer = createTestDataLayer();
    const harbor = dataLayer.store.read().projects.find((p) => p.code === '003')!;
    renderApp(`/w/${harbor.workspaceId}/p/${harbor.id}/schedule?scheduleId=does-not-exist`, {
      dataLayer,
    });
    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
  });

  it('shows EmptyState when a project has zero schedules', async () => {
    const dataLayer = createTestDataLayer();
    const metro = dataLayer.store.read().projects.find((p) => p.code === '002')!;
    renderApp(`/w/${metro.workspaceId}/p/${metro.id}/schedule`, { dataLayer });
    expect(await screen.findByText('No schedules yet')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New schedule' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Import schedule' })).toBeInTheDocument();
  });

  it('shows the legacy P2 notice with a Download original file button', async () => {
    const dataLayer = createTestDataLayer();
    const harbor = dataLayer.store.read().projects.find((p) => p.code === '003')!;
    const legacyId = crypto.randomUUID();
    dataLayer.store.write((db) => {
      const base = db.schedules.find((s) => s.projectId === harbor.id)!;
      db.schedules.push({
        ...base,
        id: legacyId,
        name: 'Legacy P2 schedule',
        code: 'LEG-01',
        isCurrent: false,
        source: 'import',
        sourceFileName: 'legacy.xer',
        sourceFormat: 'xer',
        importMapping: null,
        dataFilePath: null,
        dataRevision: 0,
      });
    });

    renderApp(`/w/${harbor.workspaceId}/p/${harbor.id}/schedule?scheduleId=${legacyId}`, {
      dataLayer,
    });
    expect(
      await screen.findByText(
        'This schedule was imported before the schedule editor was added. Download the original file and import it again to open it.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Download original file' })).toBeInTheDocument();
  });

  it('opens a materialized schedule (003/UP-02) with the resizable split pane', async () => {
    const dataLayer = createTestDataLayer();
    const harbor = dataLayer.store.read().projects.find((p) => p.code === '003')!;
    renderApp(`/w/${harbor.workspaceId}/p/${harbor.id}/schedule`, { dataLayer });

    expect(
      await screen.findByRole('separator', { name: 'Resize grid and Gantt panes' }),
    ).toBeInTheDocument();
  });
});
