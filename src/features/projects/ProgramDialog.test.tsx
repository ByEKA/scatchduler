import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ProgramDialog } from '@/features/projects/ProgramDialog';
import { createTestDataLayer } from '@/test/fakes';
import { renderWithProviders } from '@/test/render';

describe('ProgramDialog', () => {
  it('creates a program, surfaces duplicate-name conflicts, and renames an existing program', async () => {
    const dataLayer = createTestDataLayer();
    const personal = dataLayer.store.read().workspaces.find((w) => w.kind === 'personal')!;
    const onClose = vi.fn();

    const { user, unmount } = renderWithProviders(
      <ProgramDialog target={{ mode: 'create', workspaceId: personal.id }} onClose={onClose} />,
      { dataLayer },
    );

    const input = await screen.findByLabelText('Program name');
    // Duplicate existing seeded program name triggers inline conflict
    await user.type(input, 'Port & Industrial Program');
    await user.click(screen.getByRole('button', { name: 'Create program' }));
    expect(await screen.findByText('A program with this name already exists.')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();

    // Valid name succeeds
    await user.clear(input);
    await user.type(input, 'Transit Expansion');
    await user.click(screen.getByRole('button', { name: 'Create program' }));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));

    const programs = await dataLayer.repository.listPrograms(personal.id);
    const created = programs.find((p) => p.name === 'Transit Expansion')!;
    expect(created).toBeDefined();

    unmount();

    // Rename mode
    const onRenameClose = vi.fn();
    const rename = renderWithProviders(
      <ProgramDialog target={{ mode: 'rename', program: created }} onClose={onRenameClose} />,
      { dataLayer },
    );
    const renameInput = await screen.findByLabelText('Program name');
    expect(renameInput).toHaveValue('Transit Expansion');
    await rename.user.clear(renameInput);
    await rename.user.type(renameInput, 'Metro & Rail Program');
    await rename.user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onRenameClose).toHaveBeenCalledTimes(1));

    const updated = await dataLayer.repository.listPrograms(personal.id);
    expect(updated.some((p) => p.name === 'Metro & Rail Program')).toBe(true);
  });
});
