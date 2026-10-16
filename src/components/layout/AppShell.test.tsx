import { screen, waitFor, within } from '@testing-library/react';
import { expect, it } from 'vitest';
import { AppShell } from '@/components/layout/AppShell';
import { renderWithProviders } from '@/test/render';
import { mockViewport } from '@/test/viewport';

it('puts the skip link first and exposes the landmarks', async () => {
  mockViewport(1440);
  const { user } = renderWithProviders(<AppShell />, { route: '/home' });
  await user.tab();
  expect(screen.getByRole('link', { name: 'Skip to content' })).toHaveFocus();
  expect(screen.getByRole('banner')).toBeInTheDocument();
  expect(screen.getByRole('navigation', { name: 'Primary' })).toBeInTheDocument();
  expect(screen.getByRole('main')).toHaveAttribute('id', 'main');
  expect(screen.getByRole('link', { name: 'Skip to content' })).toHaveAttribute('href', '#main');
  expect(screen.getByRole('main')).toHaveAttribute('tabindex', '-1');
});

it('hides the closed inline sidebar from keyboard and screen reader users', async () => {
  mockViewport(1440);
  const { user } = renderWithProviders(<AppShell />, { route: '/home' });
  await user.click(screen.getByRole('button', { name: 'Hide sidebar' }));
  const sidebar = document.getElementById('app-sidebar')!;
  expect(sidebar).toHaveAttribute('data-state', 'closed');
  expect(sidebar).toHaveAttribute('aria-hidden', 'true');
  expect(sidebar).toHaveAttribute('inert');
});

it('focuses the current page in the drawer and returns focus to the toggle on Escape', async () => {
  mockViewport(800);
  const { user } = renderWithProviders(<AppShell />, { route: '/home' });
  await user.click(screen.getByRole('button', { name: 'Open navigation' }));
  const drawer = await screen.findByRole('dialog', { name: 'Navigation' });
  expect(within(drawer).getByRole('link', { name: 'Home' })).toHaveFocus();
  await user.keyboard('{Escape}');
  await waitFor(() =>
    expect(screen.queryByRole('dialog', { name: 'Navigation' })).not.toBeInTheDocument(),
  );
  expect(screen.getByRole('button', { name: 'Open navigation' })).toHaveFocus();
});
