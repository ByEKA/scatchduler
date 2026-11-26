import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ComputedScheduleSummary } from '@/data/schedule-types';
import { makeActivity, makeDocument, makeRelationship } from '@/engine/testing';
import { applyCommand, type ScheduleCommand } from '@/features/schedule/commands';
import { ScheduleDetailsPanel } from '@/features/schedule/ScheduleDetailsPanel';

describe('ScheduleDetailsPanel', () => {
  const baseSummary: ComputedScheduleSummary = {
    calculatedAt: '2026-01-05T08:00:00Z',
    durationMs: 2,
    projectStart: '2026-01-05T08:00',
    projectFinish: '2026-01-16T17:00',
    activities: {
      a1: {
        earlyStart: '2026-01-05T08:00',
        earlyFinish: '2026-01-09T17:00',
        lateStart: '2026-01-05T08:00',
        lateFinish: '2026-01-09T17:00',
        totalFloat: 0,
        freeFloat: 0,
        isCritical: true,
        isNearCritical: false,
        isLongestPath: true,
        driver: { kind: 'project_start' },
      },
      a2: {
        earlyStart: '2026-01-12T08:00',
        earlyFinish: '2026-01-16T17:00',
        lateStart: '2026-01-14T08:00',
        lateFinish: '2026-01-20T17:00',
        totalFloat: 960,
        freeFloat: 480,
        isCritical: false,
        isNearCritical: true,
        isLongestPath: false,
        driver: { kind: 'predecessor', relationshipId: 'r1', predecessorId: 'a1' },
      },
    },
    relationships: { r1: { freeFloat: 0, isDriving: true } },
    wbsRollups: {},
    warnings: [],
  };

  it('shows empty prompt when nothing selected, displays DD.MM.YYYY · HH:mm metrics & clickable driver jump, and edits fields in Edit mode', async () => {
    const user = userEvent.setup();
    let doc = makeDocument({
      settings: { ...makeDocument().settings, displayMode: 'calculated' },
      activities: [
        makeActivity({
          id: 'a1',
          code: 'A1000',
          name: 'Site prep',
          originalDuration: 2400,
          remainingDuration: 2400,
        }),
        makeActivity({
          id: 'a2',
          code: 'A1010',
          name: 'Excavation',
          originalDuration: 2400,
          remainingDuration: 2400,
        }),
      ],
      relationships: [
        makeRelationship({ id: 'r1', predecessorId: 'a1', successorId: 'a2', type: 'FS' }),
      ],
    });
    const onJump = vi.fn();
    const onDispatch = vi.fn((cmd: ScheduleCommand) => {
      const res = applyCommand(doc, cmd);
      if (res.ok) doc = res.document;
      return res;
    });

    // Nothing selected
    const { rerender } = render(
      <ScheduleDetailsPanel
        document={doc}
        summary={baseSummary}
        rollups={{}}
        selectedKey={null}
        mode="view"
        activeTab="details"
        onTabChange={vi.fn()}
        onClose={vi.fn()}
        onJumpToActivity={onJump}
        onDispatch={onDispatch}
      />,
    );
    expect(screen.getByText('Select an activity to inspect its details.')).toBeInTheDocument();

    // Select a2 in view mode: formatted dates, floats, driver button, disabled inputs
    rerender(
      <ScheduleDetailsPanel
        document={doc}
        summary={baseSummary}
        rollups={{}}
        selectedKey="act:a2"
        mode="view"
        activeTab="details"
        onTabChange={vi.fn()}
        onClose={vi.fn()}
        onJumpToActivity={onJump}
        onDispatch={onDispatch}
      />,
    );
    expect(screen.getByText('12.01.2026 · 08:00')).toBeInTheDocument();
    expect(screen.getByText('16.01.2026 · 17:00')).toBeInTheDocument();
    expect(screen.getByText('+2 d')).toBeInTheDocument();
    expect(screen.getByLabelText('Status')).toBeDisabled();

    const driverBtn = screen.getByRole('button', { name: /A1000 · Site prep/ });
    await user.click(driverBtn);
    expect(onJump).toHaveBeenCalledWith('a1');

    // Switch to Edit mode and change status, original duration, primary constraint, and notes
    const rerenderEdit = () =>
      rerender(
        <ScheduleDetailsPanel
          document={doc}
          summary={baseSummary}
          rollups={{}}
          selectedKey="act:a2"
          mode="edit"
          activeTab="details"
          onTabChange={vi.fn()}
          onClose={vi.fn()}
          onJumpToActivity={onJump}
          onDispatch={onDispatch}
        />,
      );
    rerenderEdit();

    await user.selectOptions(screen.getByLabelText('Status'), 'in_progress');
    expect(doc.activities[1]?.status).toBe('in_progress');
    rerenderEdit();

    fireEvent.change(screen.getByLabelText('Original duration (days)'), { target: { value: '7' } });
    expect(doc.activities[1]?.originalDuration).toBe(3360);
    rerenderEdit();

    await user.selectOptions(screen.getByLabelText('Primary constraint'), 'start_on_or_after');
    expect(doc.activities[1]?.constraint?.type).toBe('start_on_or_after');
    rerenderEdit();

    fireEvent.change(screen.getByLabelText('Notes'), { target: { value: 'Check rebar' } });
    expect(doc.activities[1]?.notes).toBe('Check rebar');
  });
});
