import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AcceptInvitePage } from '@/pages/AcceptInvitePage';
import { createTestDataLayer } from '@/test/fakes';
import { renderWithProviders } from '@/test/render';

describe('AcceptInvitePage', () => {
  it('shows the expired card without a token', async () => {
    renderWithProviders(<AcceptInvitePage />, { route: '/accept-invite', path: '/accept-invite' });
    expect(
      await screen.findByText('This link has expired or was already used.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Ask the person who invited you to send a new invitation.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to sign in' })).toHaveAttribute(
      'href',
      '/sign-in',
    );
  });

  it('sets the name and password, then opens Home', async () => {
    const dataLayer = createTestDataLayer();
    await dataLayer.auth.signOut();
    const verify = vi.spyOn(dataLayer.auth, 'verifyEmailLink');
    const { user } = renderWithProviders(<AcceptInvitePage />, {
      route: '/accept-invite?token_hash=inv&type=invite',
      path: '/accept-invite',
      dataLayer,
    });
    expect(await screen.findByRole('heading', { name: 'Welcome to AppName' })).toBeInTheDocument();
    expect(screen.getByText('Next time you can also continue with Google.')).toBeInTheDocument();
    expect(verify).not.toHaveBeenCalled();
    await user.type(screen.getByLabelText('First name'), ' Ada ');
    await user.type(screen.getByLabelText('Last name'), 'Lovelace');
    await user.type(screen.getByLabelText('Password'), 'letters12345');
    await user.type(screen.getByLabelText('Confirm password'), 'letters12345');
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/home'));
    expect(verify).toHaveBeenCalledWith('inv', 'invite');
    expect(await dataLayer.repository.getCurrentUser()).toMatchObject({
      firstName: 'Ada',
      lastName: 'Lovelace',
    });
  });

  it('asks for both names', async () => {
    const { user } = renderWithProviders(<AcceptInvitePage />, {
      route: '/accept-invite?token_hash=inv',
      path: '/accept-invite',
    });
    await user.click(await screen.findByRole('button', { name: 'Create account' }));
    expect(await screen.findByText('Enter your first name')).toBeInTheDocument();
    expect(screen.getByText('Enter your last name')).toBeInTheDocument();
  });
});
