import { screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { WorkspaceSwitcher } from '@/components/layout/WorkspaceSwitcher';
import { createTestDataLayer } from '@/test/fakes';
import { renderWithProviders } from '@/test/render';

it('links the current workspace and switches with the keyboard', async () => {
  const dl = createTestDataLayer();
  const [personal, team] = dl.store.read().workspaces;
  const { user } = renderWithProviders(<WorkspaceSwitcher />, {
    route: '/home',
    path: '/home',
    dataLayer: dl,
  });
  expect(await screen.findByRole('link', { name: 'My workspace' })).toHaveAttribute(
    'href',
    `/w/${personal!.id}/projects`,
  );
  await user.click(screen.getByRole('button', { name: 'Switch workspace' }));
  await user.keyboard('site');
  expect(screen.queryByRole('option', { name: /My workspace/ })).not.toBeInTheDocument();
  await user.keyboard('{Enter}');
  expect(screen.getByTestId('location')).toHaveTextContent(`/w/${team!.id}/projects`);
});

it('shows a disabled Unavailable button when the workspaces fail to load', async () => {
  renderWithProviders(<WorkspaceSwitcher />, { dataLayer: createTestDataLayer({ failRate: 1 }) });
  expect(await screen.findByRole('button', { name: 'Unavailable' })).toBeDisabled();
  expect(screen.queryByRole('button', { name: 'Switch workspace' })).not.toBeInTheDocument();
});
