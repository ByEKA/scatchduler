import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createTestDataLayer } from '@/test/fakes';
import { renderApp } from '@/test/render';

function withoutName() {
  const dataLayer = createTestDataLayer();
  dataLayer.store.write((db) => {
    const me = db.users.find((u) => u.id === db.currentUserId)!;
    me.firstName = '';
    me.lastName = '';
  });
  return dataLayer;
}

describe('CompleteProfileDialog', () => {
  it('asks for a missing name and saves it', async () => {
    const { user } = renderApp('/home', { dataLayer: withoutName() });
    const dialog = await screen.findByRole('dialog', { name: 'Add your name' });
    expect(
      screen.getByRole('heading', { level: 1, name: 'Hello', hidden: true }),
    ).toBeInTheDocument(); // the open dialog hides the page from role queries
    expect(
      within(dialog).getByText('Your name is shown to people in your workspaces.'),
    ).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText('First name'), 'Ada');
    await user.type(within(dialog).getByLabelText('Last name'), 'Lovelace');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Name saved')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Add your name' })).not.toBeInTheDocument(),
    );
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Hello, Ada' }),
    ).toBeInTheDocument();
  });

  it('closes on Cancel', async () => {
    const { user } = renderApp('/home', { dataLayer: withoutName() });
    const dialog = await screen.findByRole('dialog', { name: 'Add your name' });
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Add your name' })).not.toBeInTheDocument(),
    );
  });

  it('stays away when the name is known', async () => {
    renderApp('/home');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Hello, Deniz' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Add your name' })).not.toBeInTheDocument();
  });
});
