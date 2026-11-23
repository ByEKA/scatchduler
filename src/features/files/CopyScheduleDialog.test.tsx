import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CopyScheduleDialog } from '@/features/files/CopyScheduleDialog';
import { createTestDataLayer } from '@/test/fakes';
import { renderWithProviders } from '@/test/render';

describe('CopyScheduleDialog', () => {
  it('pre-fills "{name} (copy)", suggested copy code and folder, and duplicates the schedule with its snapshot data', async () => {
    const dataLayer = createTestDataLayer();
    const db = dataLayer.store.read();
    const harbor = db.projects.find((p) => p.code === '003')!;
    const update2 = db.schedules.find((s) => s.projectId === harbor.id && s.code === 'UP-02')!;
    const baselinesFolder = db.folders.find(
      (f) => f.projectId === harbor.id && f.name === 'Baselines',
    )!;

    const { user } = renderWithProviders(
      <CopyScheduleDialog projectId={harbor.id} scheduleId={update2.id} />,
      { dataLayer },
    );

    const nameInput = await screen.findByLabelText('Name');
    const codeInput = screen.getByLabelText('Code');
    const folderSelect = screen.getByLabelText('Folder');

    expect(nameInput).toHaveValue('Update 2 (copy)');
    expect(codeInput).toHaveValue('UP-02-COPY');

    // Select "Baselines" folder and submit
    await waitFor(() => {
      expect(screen.getByRole('option', { name: 'Baselines' })).toBeInTheDocument();
    });
    await user.selectOptions(folderSelect, baselinesFolder.id);
    await user.click(screen.getByRole('button', { name: 'Duplicate schedule' }));

    expect(await screen.findByText('Schedule duplicated')).toBeInTheDocument();

    const schedules = await dataLayer.repository.listSchedules(harbor.id);
    const copied = schedules.find((s) => s.code === 'UP-02-COPY');
    expect(copied).toBeDefined();
    expect(copied?.name).toBe('Update 2 (copy)');
    expect(copied?.folderId).toBe(baselinesFolder.id);
    expect(copied?.copiedFromId).toBe(update2.id);
    expect(copied?.isCurrent).toBe(false);

    // Snapshot data from Update 2 was duplicated too
    const snapshot = await dataLayer.repository.getScheduleDocument(copied!.id);
    expect(snapshot.document?.activities.length).toBeGreaterThan(0);
  });
});
