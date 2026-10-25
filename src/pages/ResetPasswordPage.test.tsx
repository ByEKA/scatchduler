import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { RepositoryError } from '@/data/errors';
import { ResetPasswordPage } from '@/pages/ResetPasswordPage';
import { createTestDataLayer } from '@/test/fakes';
import { renderWithProviders } from '@/test/render';

async function open(query: string) {
  const dataLayer = createTestDataLayer();
  await dataLayer.auth.signOut();
  const verify = vi.spyOn(dataLayer.auth, 'verifyEmailLink');
  const utils = renderWithProviders(<ResetPasswordPage />, {
    route: `/reset-password${query}`,
    path: '/reset-password',
    dataLayer,
  });
  return { ...utils, dataLayer, verify };
}
async function submit(
  user: Awaited<ReturnType<typeof open>>['user'],
  password = 'letters12345',
  confirm = password,
) {
  await user.type(await screen.findByLabelText('New password'), password);
  await user.type(screen.getByLabelText('Confirm password'), confirm);
  await user.click(screen.getByRole('button', { name: 'Save password' }));
}

describe('ResetPasswordPage', () => {
  it('shows the expired card without a token', async () => {
    await open('');
    expect(
      await screen.findByText('This link has expired or was already used.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Request a new link' })).toHaveAttribute(
      'href',
      '/forgot-password',
    );
  });

  it('uses the token only when the form is submitted', async () => {
    const { user, verify } = await open('?token_hash=abc&type=recovery');
    await screen.findByLabelText('New password');
    expect(verify).not.toHaveBeenCalled();
    await submit(user);
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/home'));
    expect(verify).toHaveBeenCalledWith('abc', 'recovery');
    expect(await screen.findByText('Password updated')).toBeInTheDocument();
  });

  it('validates the new password', async () => {
    const { user } = await open('?token_hash=abc');
    await submit(user, 'short12', 'short13');
    expect(
      await screen.findByText('Use at least 10 characters with letters and numbers'),
    ).toBeInTheDocument();
    expect(screen.getByText("Passwords don't match")).toBeInTheDocument();
  });

  it('shows the expired card when the link was already used', async () => {
    const { user } = await open('?token_hash=expired');
    await submit(user);
    expect(
      await screen.findByText('This link has expired or was already used.'),
    ).toBeInTheDocument();
  });

  it('retries after a failure without verifying twice', async () => {
    const { user, dataLayer, verify } = await open('?token_hash=abc');
    vi.spyOn(dataLayer.auth, 'updatePassword').mockRejectedValueOnce(
      new RepositoryError('network', 'offline'),
    );
    await submit(user);
    expect(
      await screen.findByText("Can't reach the server. Check your connection and try again."),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save password' }));
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/home'));
    expect(verify).toHaveBeenCalledTimes(1);
  });
});
