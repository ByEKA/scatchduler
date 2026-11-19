import type { ColumnDef } from '@tanstack/react-table';
import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DataTable, type DataTableProps } from '@/components/common/DataTable';
import { renderWithProviders } from '@/test/render';

interface Row {
  id: string;
  name: string;
  city: string | null;
}
const rows: Row[] = [
  { id: 'a', name: 'Pier 9', city: 'Izmir' },
  { id: 'b', name: 'Dock', city: null },
];
const columns: ColumnDef<Row, unknown>[] = [
  { id: 'name', header: 'Name', meta: { link: true }, cell: () => null },
  {
    id: 'city',
    header: 'City',
    meta: { className: 'hidden md:table-cell' },
    cell: ({ row }) => row.original.city ?? '—',
  },
];
function renderTable(props: Partial<DataTableProps<Row>> = {}) {
  return renderWithProviders(
    <DataTable
      columns={columns}
      data={rows}
      getRowId={(row) => row.id}
      caption="Test rows"
      state="ready"
      empty={<p>Nothing here</p>}
      rowLink={(row) => ({
        to: `/rows/${row.id}`,
        label: row.name,
        title: `${row.name}\n${row.city ?? ''}`,
      })}
      {...props}
    />,
  );
}

describe('DataTable', () => {
  it('renders the caption, headers, cells and a row link with its title', () => {
    renderTable();
    expect(screen.getByRole('table', { name: 'Test rows' })).toBeInTheDocument();
    expect(screen.getAllByRole('columnheader').map((cell) => cell.textContent)).toEqual([
      'Name',
      'City',
    ]);
    expect(screen.getByRole('columnheader', { name: 'City' })).toHaveClass(
      'hidden',
      'md:table-cell',
    );
    const link = screen.getByRole('link', { name: 'Pier 9' });
    expect(link).toHaveAttribute('href', '/rows/a');
    expect(link).toHaveAttribute('title', 'Pier 9\nIzmir');
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('shows five skeleton rows while loading', () => {
    renderTable({ state: 'loading' });
    expect(screen.getAllByTestId('data-table-skeleton-row')).toHaveLength(5);
  });

  it('shows the empty node, and the error with Retry, in one full-width row', async () => {
    const { unmount } = renderTable({ data: [] });
    expect(screen.getByText('Nothing here').closest('td')).toHaveAttribute('colspan', '2');
    unmount();
    const onRetry = vi.fn();
    const { user } = renderTable({ state: 'error', error: new Error('offline'), onRetry });
    expect(screen.getByRole('alert').closest('td')).toHaveAttribute('colspan', '2');
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('leaves Retry out of the error row without onRetry', () => {
    renderTable({ state: 'error', error: new Error('offline') });
    expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong. Please try again.');
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
  });
});
