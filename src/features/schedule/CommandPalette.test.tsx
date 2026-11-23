import { fireEvent, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDataLayer } from '@/test/fakes';
import { renderApp } from '@/test/render';

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    setTransform: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    rect: vi.fn(),
    clip: vi.fn(),
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    closePath: vi.fn(),
    stroke: vi.fn(),
    fill: vi.fn(),
    setLineDash: vi.fn(),
    fillText: vi.fn(),
    measureText: vi.fn(() => ({ width: 20 })),
  } as unknown as CanvasRenderingContext2D);
});

describe('CommandPalette (Ctrl+K)', () => {
  it('opens via Ctrl+K or TopBar button, jumps to an activity on SchedulePage, and runs navigation commands', async () => {
    const dataLayer = createTestDataLayer();
    const db = dataLayer.store.read();
    const personalId = db.workspaces.find((w) => w.kind === 'personal')!.id;
    const harborId = db.projects.find((p) => p.code === '003')!.id;

    const { user, router } = renderApp(`/w/${personalId}/p/${harborId}/schedule`, { dataLayer });

    // Wait for schedule editor to load UP-02
    expect(await screen.findByText('Site mobilization')).toBeInTheDocument();

    // Open Command Palette via TopBar button
    await user.click(screen.getByRole('button', { name: 'Command palette' }));
    const dialog = await screen.findByRole('dialog', { name: 'Command palette' });

    // Search for an activity and select it
    const input = within(dialog).getByPlaceholderText('Search activities, WBS or commands…');
    await user.type(input, 'Foundation concrete');
    const actItem = await within(dialog).findByRole('option', {
      name: /A1040\s*Foundation concrete pour/i,
    });
    await user.click(actItem);

    // Palette closes and row A1040 is selected in the grid
    const row = screen.getByRole('row', { name: /A1040.*Foundation concrete pour/i });
    expect(row).toHaveAttribute('aria-selected', 'true');

    // Open via Ctrl+K and run an editor command ("Show details panel")
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    const dialog2 = await screen.findByRole('dialog', { name: 'Command palette' });
    await user.click(within(dialog2).getByRole('option', { name: /Show details panel/i }));
    expect(await screen.findByRole('button', { name: 'Close details panel' })).toBeInTheDocument();

    // Open via Ctrl+K and navigate to Home
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    const dialog3 = await screen.findByRole('dialog', { name: 'Command palette' });
    await user.click(within(dialog3).getByRole('option', { name: /Go to Home/i }));
    expect(router.state.location.pathname).toBe('/home');
  });
});
