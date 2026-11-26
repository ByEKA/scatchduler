import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ScheduleDocument } from '@/data/schedule-types';
import { solve } from '@/engine';
import { makeActivity, makeDocument, makeRelationship } from '@/engine/testing';
import { applyCommand, type ScheduleCommand } from '@/features/schedule/commands';
import { buildVisibleRows } from '@/features/schedule/rows';
import { ScheduleGrid } from '@/features/schedule/ScheduleGrid';

beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    bottom: 320,
    right: 800,
    width: 800,
    height: 320,
    toJSON: () => ({}),
  });
});

describe('InlineCellEditor in ScheduleGrid', () => {
  it('does nothing on double-click in view mode, and edits Name, Duration, % complete, Predecessors and Escape in edit mode', async () => {
    const user = userEvent.setup();
    let doc = makeDocument({
      activities: [
        makeActivity({
          id: 'a1',
          code: 'A1010',
          name: 'Excavation',
          originalDuration: 2400,
          remainingDuration: 2400,
        }),
        makeActivity({
          id: 'a2',
          code: 'A1020',
          name: 'Concrete',
          originalDuration: 2400,
          remainingDuration: 2400,
        }),
      ],
      relationships: [],
    });

    const dispatched: ScheduleCommand[] = [];
    const onDispatch = vi.fn((cmd: ScheduleCommand) => {
      dispatched.push(cmd);
      const res = applyCommand(doc, cmd);
      if (res.ok) doc = res.document;
      return res;
    });

    const viewRows = buildVisibleRows(doc, null, {}, new Set());
    const { rerender } = render(
      <ScheduleGrid
        rows={viewRows}
        selectedKey="act:a1"
        mode="view"
        document={doc}
        onDispatch={onDispatch}
        onSelectKey={vi.fn()}
        onToggleWbs={vi.fn()}
      />,
    );

    // Double-click in view mode does NOT open an input
    await user.dblClick(screen.getByText('Excavation'));
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();

    // Switch to edit mode
    const renderEdit = () =>
      rerender(
        <ScheduleGrid
          rows={buildVisibleRows(doc, null, {}, new Set())}
          selectedKey="act:a1"
          mode="edit"
          document={doc}
          onDispatch={onDispatch}
          onSelectKey={vi.fn()}
          onToggleWbs={vi.fn()}
        />,
      );
    renderEdit();

    // Edit Name and commit with Enter
    await user.dblClick(screen.getByText('Excavation'));
    const nameInput = screen.getByRole('textbox', { name: 'Edit name for A1010' });
    await user.clear(nameInput);
    await user.type(nameInput, 'Deep excavation{Enter}');
    expect(doc.activities[0]?.name).toBe('Deep excavation');
    renderEdit();

    // Escape cancels without dispatching
    const countBefore = onDispatch.mock.calls.length;
    await user.dblClick(screen.getByText('Deep excavation'));
    const escInput = screen.getByRole('textbox', { name: 'Edit name for A1010' });
    await user.clear(escInput);
    await user.type(escInput, 'Cancelled{Escape}');
    expect(onDispatch.mock.calls.length).toBe(countBefore);
    expect(doc.activities[0]?.name).toBe('Deep excavation');

    // Edit Duration on A1010 ("5 d" -> "8 d")
    await user.dblClick(screen.getAllByText('5 d')[0]!);
    const durInput = screen.getByRole('textbox', { name: 'Edit duration for A1010' });
    await user.clear(durInput);
    await user.type(durInput, '8d{Enter}');
    expect(doc.activities[0]?.originalDuration).toBe(3840);
    renderEdit();

    // Edit % complete on A1010 -> "50"
    const a1Row = screen.getByText('Deep excavation').closest('[role="row"]')!;
    const pctCell = a1Row.querySelectorAll('[role="gridcell"]')[7]!;
    await user.dblClick(pctCell);
    const pctInput = screen.getByRole('textbox', { name: 'Edit percent for A1010' });
    await user.clear(pctInput);
    await user.type(pctInput, '50{Enter}');
    expect(doc.activities[0]?.percent.duration).toBe(50);
    renderEdit();

    // Edit Predecessors on A1020 ("—" -> "A1010 SS+2d")
    const a2Row = screen.getByText('Concrete').closest('[role="row"]')!;
    const predCell = a2Row.querySelectorAll('[role="gridcell"]')[8]!;
    await user.dblClick(predCell);
    const predInput = screen.getByRole('textbox', { name: 'Edit predecessors for A1020' });
    await user.clear(predInput);
    await user.type(predInput, 'A1010 SS+2d{Enter}');
    expect(doc.relationships).toHaveLength(1);
    expect(doc.relationships[0]).toMatchObject({
      predecessorId: 'a1',
      successorId: 'a2',
      type: 'SS',
      lagMinutes: 960,
    });
  });

  it('fills status and actual dates from the calculated dates when % complete is typed (D13)', async () => {
    const user = userEvent.setup();
    const base = makeDocument({
      activities: [
        makeActivity({ id: 'a1', code: 'A1010', name: 'Excavation', originalDuration: 2400 }),
        makeActivity({ id: 'a2', code: 'A1020', name: 'Concrete', originalDuration: 2400 }),
      ],
      relationships: [makeRelationship({ id: 'r1', predecessorId: 'a1', successorId: 'a2' })],
    });
    const solved = solve(
      { ...base, settings: { ...base.settings, statusDate: null } },
      { calculatedAt: '2026-01-01T00:00:00.000Z' },
    );
    if (!solved.ok) throw new Error(solved.error.message);
    // Calculated A1010 05.01–09.01 and A1020 12.01–16.01; status date then moved to 14.01.2026
    let doc: ScheduleDocument = {
      ...base,
      settings: { ...base.settings, statusDate: '2026-01-14T08:00' },
      computed: solved.summary,
    };
    const dispatched: ScheduleCommand[] = [];
    const onDispatch = vi.fn((cmd: ScheduleCommand) => {
      dispatched.push(cmd);
      const res = applyCommand(doc, cmd);
      if (res.ok) doc = res.document;
      return res;
    });
    const grid = () => (
      <ScheduleGrid
        rows={buildVisibleRows(doc, doc.computed, {}, new Set())}
        selectedKey="act:a1"
        mode="edit"
        document={doc}
        onDispatch={onDispatch}
        onSelectKey={vi.fn()}
        onToggleWbs={vi.fn()}
      />
    );
    const { rerender } = render(grid());
    const typePercent = async (name: string, code: string, value: string) => {
      const row = screen.getByText(name).closest('[role="row"]')!;
      await user.dblClick(row.querySelectorAll('[role="gridcell"]')[7]!);
      const input = screen.getByRole('textbox', { name: `Edit percent for ${code}` });
      await user.clear(input);
      await user.type(input, `${value}{Enter}`);
      rerender(grid());
    };

    await typePercent('Excavation', 'A1010', '50');
    expect(dispatched.at(-1)).toEqual({
      type: 'setPercentComplete',
      activityId: 'a1',
      percentComplete: 50,
    });
    expect(doc.activities[0]).toMatchObject({
      status: 'in_progress',
      actualStart: '2026-01-05T08:00',
      actualFinish: null,
      remainingDuration: 1200,
    });

    await typePercent('Concrete', 'A1020', '100');
    expect(doc.activities[1]).toMatchObject({
      status: 'completed',
      actualStart: '2026-01-12T08:00',
      actualFinish: '2026-01-14T08:00',
      remainingDuration: 0,
      percent: { duration: 100, physical: 100, type: 'duration' },
    });

    await typePercent('Concrete', 'A1020', '0');
    expect(doc.activities[1]).toMatchObject({
      status: 'not_started',
      actualStart: null,
      actualFinish: null,
      remainingDuration: 2400,
    });
  });
});
