import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { CycleErrorBanner } from '@/features/schedule/CycleErrorBanner';

describe('CycleErrorBanner', () => {
  it('renders role="alert" with clickable loop activity codes and calendar error messages', async () => {
    const user = userEvent.setup();
    const onJump = vi.fn();

    const { rerender } = render(
      <CycleErrorBanner
        error={{
          code: 'SCHEDULE_CYCLE',
          cycleIds: ['a2', 'a3', 'a1'],
          cycleCodes: ['A1020', 'A1030', 'A1010', 'A1020'],
          message:
            'Circular logic found: A1020 → A1030 → A1010 → A1020. Break the loop to calculate.',
        }}
        onJumpToCycleActivity={onJump}
      />,
    );

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Circular logic found:');
    expect(alert).toHaveTextContent('Break the loop to calculate.');

    await user.click(screen.getByRole('button', { name: 'A1030' }));
    expect(onJump).toHaveBeenCalledWith('a3');

    rerender(
      <CycleErrorBanner
        error={{
          code: 'CALENDAR_NO_WORKING_TIME',
          calendarId: 'c1',
          message: "Calendar Empty has no working hours. Dates can't be calculated.",
        }}
        onJumpToCycleActivity={onJump}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      "Calendar Empty has no working hours. Dates can't be calculated.",
    );
  });
});
