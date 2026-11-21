import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ComputedScheduleSummary } from '@/data/schedule-types';
import { makeActivity, makeDocument, makeRelationship } from '@/engine/testing';
import { applyCommand, type ScheduleCommand } from '@/features/schedule/commands';
import { RelationshipsTab } from '@/features/schedule/RelationshipsTab';

describe('RelationshipsTab', () => {
  it('lists predecessors and successors with Driving badge, jumps on Code click, edits/deletes, and validates self-link & duplicate', async () => {
    const user = userEvent.setup();
    let doc = makeDocument({
      activities: [
        makeActivity({ id: 'a1', code: 'A1010', name: 'Site prep' }),
        makeActivity({ id: 'a2', code: 'A1020', name: 'Excavation' }),
        makeActivity({ id: 'a3', code: 'A1030', name: 'Concrete' }),
      ],
      relationships: [
        makeRelationship({ id: 'r1', predecessorId: 'a1', successorId: 'a2', type: 'FS', lagMinutes: 0 }),
        makeRelationship({ id: 'r2', predecessorId: 'a2', successorId: 'a3', type: 'SS', lagMinutes: 480 }),
      ],
    });
    const summary: ComputedScheduleSummary = {
      calculatedAt: '2026-01-05T08:00:00Z',
      durationMs: 1,
      projectStart: null,
      projectFinish: null,
      activities: {},
      relationships: {
        r1: { freeFloat: 0, isDriving: true },
        r2: { freeFloat: 960, isDriving: false },
      },
      wbsRollups: {},
      warnings: [],
    };
    const onJump = vi.fn();
    const onDispatch = vi.fn((cmd: ScheduleCommand) => {
      const res = applyCommand(doc, cmd, () => `r-${doc.relationships.length + 1}`);
      if (res.ok) doc = res.document;
      return res;
    });

    const renderTab = (mode: 'view' | 'edit') => (
      <RelationshipsTab
        document={doc}
        summary={summary}
        activity={doc.activities[1]!}
        mode={mode}
        onJumpToActivity={onJump}
        onDispatch={onDispatch}
      />
    );

    const { rerender } = render(renderTab('view'));

    const predSection = screen.getByRole('region', { name: 'Predecessors' });
    const predRow = within(predSection).getByRole('row', { name: /A1010/ });
    expect(within(predRow).getByText('Site prep')).toBeInTheDocument();
    expect(within(predRow).getByText('Driving')).toBeInTheDocument();

    const succSection = screen.getByRole('region', { name: 'Successors' });
    expect(within(succSection).getByText('Concrete')).toBeInTheDocument();
    expect(within(succSection).getByText('+1 d')).toBeInTheDocument();
    expect(within(succSection).getByText('+2 d')).toBeInTheDocument();

    // Clicking code jumps to linked activity
    await user.click(within(predSection).getByRole('button', { name: 'A1010' }));
    expect(onJump).toHaveBeenCalledWith('a1');

    // Switch to Edit mode
    rerender(renderTab('edit'));

    // Self-link displays inline validation error
    await user.selectOptions(within(predSection).getByLabelText('Predecessor activity'), 'a2');
    await user.click(within(predSection).getByRole('button', { name: 'Add predecessor' }));
    expect(within(predSection).getByRole('alert')).toHaveTextContent(
      "An activity can't link to itself.",
    );

    // Duplicate FS link with A1010 displays error
    await user.selectOptions(within(predSection).getByLabelText('Predecessor activity'), 'a1');
    await user.click(within(predSection).getByRole('button', { name: 'Add predecessor' }));
    expect(within(predSection).getByRole('alert')).toHaveTextContent(
      'This relationship already exists.',
    );

    // Add valid FF predecessor from A1030
    await user.selectOptions(within(predSection).getByLabelText('Predecessor activity'), 'a3');
    await user.selectOptions(within(predSection).getByLabelText('Predecessor link type'), 'FF');
    fireEvent.change(within(predSection).getByLabelText('Predecessor lag (days)'), {
      target: { value: '2' },
    });
    await user.click(within(predSection).getByRole('button', { name: 'Add predecessor' }));
    expect(doc.relationships).toHaveLength(3);
    rerender(renderTab('edit'));

    // Delete a relationship
    await user.click(within(predSection).getByRole('button', { name: 'Remove link with A1030' }));
    expect(doc.relationships).toHaveLength(2);
  });
});
