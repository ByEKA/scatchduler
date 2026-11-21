import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeActivity, makeDocument } from '@/engine/testing';
import { buildVisibleRows } from '@/features/schedule/rows';
import { ScheduleGrid } from '@/features/schedule/ScheduleGrid';

beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    bottom: 320,
    right: 600,
    width: 600,
    height: 320,
    toJSON: () => ({}),
  });
});

describe('ScheduleGrid', () => {
  it('renders columns, ARIA treegrid row indices, WBS toggle, and arrow-key navigation', async () => {
    const user = userEvent.setup();
    const doc = makeDocument({
      wbs: [{ id: 'w1', parentId: null, code: '1', name: 'Phase 1', order: 0 }],
      activities: [
        makeActivity({ id: 'a1', code: 'A1010', name: 'Excavation', wbsId: 'w1', order: 0 }),
        makeActivity({ id: 'a2', code: 'A1020', name: 'Backfill', wbsId: 'w1', order: 1 }),
      ],
    });
    const rows = buildVisibleRows(doc, null, {}, new Set());
    const onSelectKey = vi.fn();
    const onToggleWbs = vi.fn();

    const { rerender } = render(
      <ScheduleGrid
        rows={rows}
        selectedKey="wbs:w1"
        onSelectKey={onSelectKey}
        onToggleWbs={onToggleWbs}
      />,
    );

    const grid = screen.getByRole('treegrid', { name: 'Schedule activities' });
    expect(grid).toHaveAttribute('aria-rowcount', '4');

    const headers = within(grid)
      .getAllByRole('columnheader')
      .map((el) => el.textContent);
    expect(headers).toEqual([
      '#',
      'Code',
      'Name',
      'Duration',
      'Start',
      'Finish',
      'Total float',
      '% complete',
      'Predecessors',
    ]);

    expect(screen.getByText('Phase 1')).toBeInTheDocument();
    expect(screen.getByText('A1010')).toBeInTheDocument();
    expect(screen.getByText('Excavation')).toBeInTheDocument();

    const dataRows = within(grid).getAllByRole('row').slice(1);
    expect(dataRows[0]).toHaveAttribute('aria-rowindex', '2');
    expect(dataRows[1]).toHaveAttribute('aria-rowindex', '3');

    // ArrowDown moves selection from wbs:w1 to act:a1
    fireEvent.keyDown(grid, { key: 'ArrowDown' });
    expect(onSelectKey).toHaveBeenCalledWith('act:a1');

    // ArrowLeft on expanded WBS collapses it
    fireEvent.keyDown(grid, { key: 'ArrowLeft' });
    expect(onToggleWbs).toHaveBeenCalledWith('w1');

    // Click WBS expand/collapse button
    await user.click(screen.getByRole('button', { name: 'Collapse Phase 1' }));
    expect(onToggleWbs).toHaveBeenCalledTimes(2);

    // ArrowRight on collapsed WBS expands it
    const collapsedRows = buildVisibleRows(doc, null, {}, new Set(['w1']));
    rerender(
      <ScheduleGrid
        rows={collapsedRows}
        selectedKey="wbs:w1"
        onSelectKey={onSelectKey}
        onToggleWbs={onToggleWbs}
      />,
    );
    fireEvent.keyDown(grid, { key: 'ArrowRight' });
    expect(onToggleWbs).toHaveBeenCalledTimes(3);
  });
});
