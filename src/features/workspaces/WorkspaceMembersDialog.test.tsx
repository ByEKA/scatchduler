import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { RepositoryError } from '@/data/errors';
import type { Role } from '@/data/types';
import { createTestDataLayer } from '@/test/fakes';
import { OpenDialog, renderWithProviders } from '@/test/render';

async function openMembers(options: { teamRole?: Role } = {}) {
  const dataLayer = createTestDataLayer(options);
  const team = dataLayer.store.read().workspaces.find((w) => w.kind === 'team')!;
  const utils = renderWithProviders(
    <OpenDialog kind="workspaceMembers" options={{ workspaceId: team.id }} />,
    { route: '/home', path: '/home', dataLayer },
  );
  const dialog = await screen.findByRole('dialog', { name: 'Members of Site Operations' });
  await within(dialog).findByText('Elif Arslan');
  return { ...utils, dialog, dataLayer };
}

describe('WorkspaceMembersDialog', () => {
  it('shows members, roles and pending invitations to owners', async () => {
    const { dialog } = await openMembers();
    expect(
      within(dialog).getByText('Invite people and choose what they can do.'),
    ).toBeInTheDocument();
    const rows = within(within(dialog).getByRole('list', { name: 'Members' })).getAllByRole(
      'listitem',
    );
    expect(rows.map((r) => r.textContent)).toEqual([
      expect.stringContaining('Deniz Kaya'),
      expect.stringContaining('Mert Demir'),
      expect.stringContaining('Elif Arslan'),
    ]);
    expect(
      within(dialog).queryByRole('button', { name: 'Remove Deniz Kaya' }),
    ).not.toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Remove Elif Arslan' })).toBeInTheDocument();
    const pending = within(dialog).getByRole('list', { name: 'Pending invitations' });
    expect(pending).toHaveTextContent('site.planner@example.com');
    expect(pending).toHaveTextContent('Invited 2 days ago');
  });

  it('invites by email and lists the pending invitation', async () => {
    const { dialog, user } = await openMembers();
    await user.type(within(dialog).getByLabelText('Email'), ' New.Person@Example.com ');
    await user.click(within(dialog).getByRole('button', { name: 'Send invite' }));
    expect(
      await screen.findByText('Invitation sent to new.person@example.com'),
    ).toBeInTheDocument();
    expect(
      await within(dialog).findByRole('button', {
        name: 'Revoke invitation to new.person@example.com',
      }),
    ).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Email')).toHaveValue('');
  });

  it('reports someone who is already a member', async () => {
    const { dialog, user } = await openMembers();
    await user.type(within(dialog).getByLabelText('Email'), 'elif.arslan@example.com');
    await user.click(within(dialog).getByRole('button', { name: 'Send invite' }));
    expect(
      await screen.findByText('elif.arslan@example.com is already a member.'),
    ).toBeInTheDocument();
  });

  it('changes a role', async () => {
    const { dialog, user } = await openMembers();
    await user.click(within(dialog).getByRole('combobox', { name: 'Role for Elif Arslan' }));
    await user.click(await screen.findByRole('option', { name: /^Editor/ }));
    expect(await screen.findByText('Role updated')).toBeInTheDocument();
  });

  it('removes a member after confirmation', async () => {
    const { dialog, user } = await openMembers();
    await user.click(within(dialog).getByRole('button', { name: 'Remove Elif Arslan' }));
    const confirm = await screen.findByRole('alertdialog', {
      name: 'Remove Elif Arslan from Site Operations?',
    });
    expect(
      within(confirm).getByText('They lose access to its projects and schedules.'),
    ).toBeInTheDocument();
    await user.click(within(confirm).getByRole('button', { name: 'Remove' }));
    expect(await screen.findByText('Elif Arslan was removed')).toBeInTheDocument();
    await waitFor(() => expect(within(dialog).queryByText('Elif Arslan')).not.toBeInTheDocument());
  });

  it('resends and revokes invitations', async () => {
    const { dialog, user } = await openMembers();
    await user.click(
      within(dialog).getByRole('button', { name: 'Resend invitation to site.planner@example.com' }),
    );
    expect(
      await screen.findByText('Invitation sent to site.planner@example.com'),
    ).toBeInTheDocument();
    await user.click(
      within(dialog).getByRole('button', { name: 'Revoke invitation to site.planner@example.com' }),
    );
    expect(await screen.findByText('Invitation revoked')).toBeInTheDocument();
    await waitFor(() =>
      expect(
        within(dialog).queryByRole('list', { name: 'Pending invitations' }),
      ).not.toBeInTheDocument(),
    );
  });

  it('shows the server message when the last owner would be lost', async () => {
    const { dialog, user, dataLayer } = await openMembers();
    vi.spyOn(dataLayer.repository, 'updateMemberRole').mockRejectedValue(
      new RepositoryError('validation', 'A workspace needs at least one owner.'),
    );
    await user.click(within(dialog).getByRole('combobox', { name: 'Role for Mert Demir' }));
    await user.click(await screen.findByRole('option', { name: /^Viewer/ }));
    expect(await screen.findByText('A workspace needs at least one owner.')).toBeInTheDocument();
  });

  it('is read-only for people who are not owners', async () => {
    const { dialog } = await openMembers({ teamRole: 'viewer' });
    expect(within(dialog).getByText('People who can open this workspace.')).toBeInTheDocument();
    expect(within(dialog).queryByRole('form', { name: 'Invite people' })).not.toBeInTheDocument();
    expect(
      within(dialog).queryByRole('list', { name: 'Pending invitations' }),
    ).not.toBeInTheDocument();
    expect(within(dialog).queryAllByRole('combobox')).toHaveLength(0);
    expect(within(dialog).queryByRole('button', { name: /^Remove/ })).not.toBeInTheDocument();
  });
});
