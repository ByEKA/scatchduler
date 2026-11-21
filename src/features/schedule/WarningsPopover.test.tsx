import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { SolverWarning } from '@/data/schedule-types';
import { WarningsPopover } from '@/features/schedule/WarningsPopover';

describe('WarningsPopover', () => {
  it('shows empty state when zero warnings, and lists clickable warnings with count badge', async () => {
    const user = userEvent.setup();
    const onJump = vi.fn();

    const empty = render(<WarningsPopover warnings={[]} onJumpToActivity={onJump} />);
    await user.click(screen.getByRole('button', { name: /Warnings/ }));
    expect(screen.getByText('No calculation warnings.')).toBeInTheDocument();
    empty.unmount();

    const warnings: SolverWarning[] = [
      {
        code: 'OUT_OF_SEQUENCE',
        activityId: 'a2',
        relationshipId: 'r1',
        message: 'A1020 started out of sequence before A1010.',
      },
      {
        code: 'MISSED_MUST_FINISH_BY',
        activityId: null,
        relationshipId: null,
        message: 'Projected finish (20.02.2026) is after must finish by (15.02.2026).',
      },
    ];

    render(<WarningsPopover warnings={warnings} onJumpToActivity={onJump} />);
    const trigger = screen.getByRole('button', { name: /Warnings/ });
    expect(trigger).toHaveTextContent('2');
    await user.click(trigger);

    expect(
      screen.getByText('Projected finish (20.02.2026) is after must finish by (15.02.2026).'),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: 'A1020 started out of sequence before A1010.' }),
    );
    expect(onJump).toHaveBeenCalledWith('a2');
  });
});
