import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { makeDocument } from '@/engine/testing';
import { applyCommand, type ScheduleCommand } from '@/features/schedule/commands';
import { ScheduleSettingsPopover } from '@/features/schedule/ScheduleSettingsPopover';

describe('ScheduleSettingsPopover', () => {
  it('displays current settings disabled in view mode, and dispatches changes in edit mode', async () => {
    const user = userEvent.setup();
    let doc = makeDocument({
      settings: {
        ...makeDocument().settings,
        profile: 'p6',
        progressMode: 'retained_logic',
        displayMode: 'as_imported',
        lagCalendar: 'predecessor',
        criticalDefinition: 'total_float',
        criticalThresholdMinutes: 0,
        nearCriticalThresholdMinutes: 2400,
        statusDate: '2026-01-12T08:00',
        mustFinishBy: null,
        autoCalculate: false,
      },
    });

    const staleFlags: boolean[] = [];
    const onDispatch = vi.fn((cmd: ScheduleCommand) => {
      const res = applyCommand(doc, cmd);
      if (res.ok) {
        doc = res.document;
        staleFlags.push(res.stale);
      }
      return res;
    });

    // View mode: inputs are disabled
    const view = render(
      <ScheduleSettingsPopover document={doc} mode="view" onDispatch={onDispatch} />,
    );
    await user.click(screen.getByRole('button', { name: 'Settings' }));
    expect(screen.getByLabelText('Profile')).toBeDisabled();
    expect(screen.getByLabelText('Status date')).toBeDisabled();
    view.unmount();

    // Edit mode: switching Profile marks stale, Auto-calculate does not mark stale, Status date updates
    const { rerender } = render(
      <ScheduleSettingsPopover document={doc} mode="edit" onDispatch={onDispatch} />,
    );
    await user.click(screen.getByRole('button', { name: 'Settings' }));

    await user.selectOptions(screen.getByLabelText('Profile'), 'msp');
    expect(doc.settings.profile).toBe('msp');
    expect(staleFlags[staleFlags.length - 1]).toBe(true);
    rerender(<ScheduleSettingsPopover document={doc} mode="edit" onDispatch={onDispatch} />);

    await user.click(screen.getByRole('checkbox', { name: 'Auto-calculate after edits' }));
    expect(doc.settings.autoCalculate).toBe(true);
    expect(staleFlags[staleFlags.length - 1]).toBe(false);
    rerender(<ScheduleSettingsPopover document={doc} mode="edit" onDispatch={onDispatch} />);

    fireEvent.change(screen.getByLabelText('Status date'), { target: { value: '2026-02-01' } });
    expect(doc.settings.statusDate).toBe('2026-02-01T08:00');
    expect(staleFlags[staleFlags.length - 1]).toBe(true);
  });

  it('lists the file options calculated differently under From the file (D14)', async () => {
    const user = userEvent.setup();
    const onDispatch = vi.fn();
    const noted = makeDocument({
      settings: {
        ...makeDocument().settings,
        sourceNotes: ['p6_actual_dates', 'p6_open_ends_critical'],
      },
    });
    const view = render(
      <ScheduleSettingsPopover document={noted} mode="view" onDispatch={onDispatch} />,
    );
    await user.click(screen.getByRole('button', { name: 'Settings' }));
    expect(
      within(screen.getByRole('list', { name: 'From the file' }))
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual([
      "The file uses the Actual dates progress mode, which isn't available. Retained logic is used.",
      "The file makes open-ended activities critical, which isn't available.",
    ]);
    view.unmount();

    render(
      <ScheduleSettingsPopover document={makeDocument()} mode="view" onDispatch={onDispatch} />,
    );
    await user.click(screen.getByRole('button', { name: 'Settings' }));
    expect(screen.queryByRole('list', { name: 'From the file' })).toBeNull();
  });
});
