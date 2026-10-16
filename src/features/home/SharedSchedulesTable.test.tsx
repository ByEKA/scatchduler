import { screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { RepositoryError } from '@/data/errors';
import { SharedSchedulesTable } from '@/features/home/SharedSchedulesTable';
import { createTestDataLayer } from '@/test/fakes';
import { renderWithProviders } from '@/test/render';

describe('SharedSchedulesTable', () => {
  it('lists shared schedules newest first with links', async () => {
    const dataLayer = createTestDataLayer();
    const db = dataLayer.store.read();
    const team = db.workspaces[1]!;
    const tunnel = db.projects.find((p) => p.code === 'T-01')!;
    const baseline = db.schedules.find((s) => s.name === 'Baseline rev. 3')!;
    renderWithProviders(<SharedSchedulesTable />, { dataLayer });
    await screen.findByText('Baseline rev. 3'); // wait past the skeleton rows
    const table = screen.getByRole('table');
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((h) => h.textContent),
    ).toEqual(['Schedule', 'Shared by', 'Shared', 'Status date']);
    const rows = within(table).getAllByRole('row');
    expect(rows).toHaveLength(3);
    for (const text of [
      'Baseline rev. 3',
      'Tunnel Ventilation Upgrade',
      'Mert Demir',
      '1 day ago',
    ]) {
      expect(rows[1]).toHaveTextContent(text);
    }
    expect(within(rows[1]!).getByRole('link', { name: 'Baseline rev. 3' })).toHaveAttribute(
      'href',
      `/w/${team.id}/p/${tunnel.id}/schedule?scheduleId=${baseline.id}`,
    );
  });

  it('explains the empty state', async () => {
    renderWithProviders(<SharedSchedulesTable />, {
      dataLayer: createTestDataLayer({ scenario: 'empty' }),
    });
    expect(await screen.findByText('Nothing shared yet')).toBeInTheDocument();
    expect(
      screen.getByText('Schedules that others share with you will appear here.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'How sharing works' })).toHaveAttribute(
      'href',
      '/help/sharing',
    );
    // One full-width row inside the table.
    const cell = within(screen.getByRole('table')).getByText('Nothing shared yet').closest('td');
    expect(cell).toHaveAttribute('colspan', '4');
  });

  it('truncates long schedule names', async () => {
    const dataLayer = createTestDataLayer();
    const [row] = await dataLayer.repository.listSharedWithMe();
    const long = 'Lookahead'.repeat(15);
    vi.spyOn(dataLayer.repository, 'listSharedWithMe').mockResolvedValue([
      { ...row!, scheduleName: long },
    ]);
    renderWithProviders(<SharedSchedulesTable />, { dataLayer });
    const link = await screen.findByRole('link', { name: long });
    expect(link).toHaveClass('truncate');
    expect(link).toHaveAttribute(
      'title',
      `${long}\n${row!.projectName}\nShared by ${row!.sharedBy.firstName} ${row!.sharedBy.lastName}`,
    );
    // The stretched link covers the row, so the cut-off cells carry no title of their own (D14).
    expect(screen.getByText(row!.projectName)).not.toHaveAttribute('title');
  });

  it('shows the header and three skeleton rows while loading', async () => {
    const dataLayer = createTestDataLayer({
      overrides: { listSharedWithMe: () => new Promise(() => {}) },
    });
    renderWithProviders(<SharedSchedulesTable />, { dataLayer });
    expect(await screen.findAllByTestId('shared-row-skeleton')).toHaveLength(3);
    expect(screen.getAllByRole('columnheader')).toHaveLength(4);
  });

  it('shows an error inside the table body that can be retried', async () => {
    const dataLayer = createTestDataLayer();
    vi.spyOn(dataLayer.repository, 'listSharedWithMe').mockRejectedValueOnce(
      new RepositoryError('network', 'offline'),
    );
    const { user } = renderWithProviders(<SharedSchedulesTable />, { dataLayer });
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent("Can't reach the server. Check your connection and try again.");
    expect(within(screen.getByRole('table')).getByRole('alert')).toBe(alert);
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('link', { name: 'Baseline rev. 3' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows the status date as stored, or a dash without one', async () => {
    const dataLayer = createTestDataLayer();
    const [first, second] = await dataLayer.repository.listSharedWithMe();
    vi.spyOn(dataLayer.repository, 'listSharedWithMe').mockResolvedValue([
      { ...first!, statusDate: '2026-10-12' },
      { ...second!, statusDate: null },
    ]);
    renderWithProviders(<SharedSchedulesTable />, { dataLayer });
    await screen.findByText('Baseline rev. 3');
    const rows = within(screen.getByRole('table')).getAllByRole('row');
    expect(within(rows[1]!).getAllByRole('cell').at(-1)).toHaveTextContent(/^Oct 12, 2026$/);
    expect(within(rows[2]!).getAllByRole('cell').at(-1)).toHaveTextContent(/^—$/);
  });

  it('hides Shared by below 768 px and Status date below 640 px with CSS only', async () => {
    renderWithProviders(<SharedSchedulesTable />);
    await screen.findByText('Baseline rev. 3');
    expect(screen.getByRole('columnheader', { name: 'Shared by' })).toHaveClass(
      'hidden',
      'md:table-cell',
    );
    expect(screen.getByRole('columnheader', { name: 'Status date' })).toHaveClass(
      'hidden',
      'sm:table-cell',
    );
  });
});
