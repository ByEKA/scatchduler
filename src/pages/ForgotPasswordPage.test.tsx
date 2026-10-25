import { screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { createTestDataLayer } from '@/test/fakes';
import { renderApp } from '@/test/render';

async function signedOutLayer() {
  const dataLayer = createTestDataLayer();
  await dataLayer.auth.signOut();
  return dataLayer;
}

it('confirms the request without revealing whether the account exists', async () => {
  const { user } = renderApp('/forgot-password', { dataLayer: await signedOutLayer() });
  expect(await screen.findByRole('heading', { name: 'Reset your password' })).toBeInTheDocument();
  await user.type(screen.getByLabelText('Email'), 'lab@example.com');
  await user.click(screen.getByRole('button', { name: 'Send reset link' }));
  expect(
    await screen.findByText(
      'If an account exists for lab@example.com, a reset link is on its way.',
    ),
  ).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Back to sign in' })).toHaveAttribute('href', '/sign-in');
});

it('validates the email', async () => {
  const { user } = renderApp('/forgot-password', { dataLayer: await signedOutLayer() });
  await user.type(await screen.findByLabelText('Email'), 'nope');
  await user.click(screen.getByRole('button', { name: 'Send reset link' }));
  expect(await screen.findByText('Enter a valid email address')).toBeInTheDocument();
});
