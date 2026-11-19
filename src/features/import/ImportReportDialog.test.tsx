import { screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { saveFile } from '@/lib/download';
import { createTestDataLayer, makeImportScheduleInput } from '@/test/fakes';
import { OpenDialog, renderWithProviders } from '@/test/render';

vi.mock('@/lib/download', () => ({ saveFile: vi.fn() }));

async function openReport(patchIssues?: (count: number) => void) {
  const dataLayer = createTestDataLayer();
  const metro = dataLayer.store.read().projects.find((p) => p.code === '002')!;
  const schedule = await dataLayer.repository.importSchedule(
    await makeImportScheduleInput(metro.id),
  );
  patchIssues?.(0);
  const utils = renderWithProviders(
    <OpenDialog kind="importReport" options={{ projectId: metro.id, scheduleId: schedule.id }} />,
    { dataLayer },
  );
  return { ...utils, dataLayer, schedule };
}

describe('ImportReportDialog', () => {
  it('shows the stored report read-only with the import time', async () => {
    await openReport();
    const dialog = await screen.findByRole('dialog', { name: 'Import report' });
    expect(dialog).toHaveAccessibleDescription(/^two-projects\.xer · imported /);
    expect(within(dialog).queryByRole('combobox')).not.toBeInTheDocument();
    expect(within(dialog).queryByText('First activities')).not.toBeInTheDocument();
    expect(within(dialog).getByRole('table', { name: 'Counts' })).toBeInTheDocument();
  });

  it('says when the stored list is shorter than the totals', async () => {
    const dataLayer = createTestDataLayer();
    const metro = dataLayer.store.read().projects.find((p) => p.code === '002')!;
    const input = await makeImportScheduleInput(metro.id);
    const report = { ...input.report, issueTotals: { ...input.report.issueTotals, warning: 900 } };
    const schedule = await dataLayer.repository.importSchedule({ ...input, report });
    renderWithProviders(
      <OpenDialog kind="importReport" options={{ projectId: metro.id, scheduleId: schedule.id }} />,
      { dataLayer },
    );
    expect(
      await screen.findByText(
        `Showing ${report.issues.length} of ${900 + report.issueTotals.info} issues. The totals count every issue.`,
      ),
    ).toBeInTheDocument();
  });

  it('downloads the report as CSV and as JSON', async () => {
    const { user } = await openReport();
    await user.click(await screen.findByRole('button', { name: 'Download CSV' }));
    await user.click(screen.getByRole('button', { name: 'Download JSON' }));
    await vi.waitFor(() =>
      expect(vi.mocked(saveFile).mock.calls.map(([, name]) => name)).toEqual([
        'North Plant - import report.csv',
        'North Plant - import report.json',
      ]),
    );
  });
});
