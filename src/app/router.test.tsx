import { act, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createTestDataLayer } from '@/test/fakes';
import { renderApp } from '@/test/render';
import { mockViewport } from '@/test/viewport';

describe('routes', () => {
  it('redirects / to /home', async () => {
    const { router } = renderApp('/');
    await waitFor(() => expect(router.state.location.pathname).toBe('/home'));
  });

  it('sends signed-out visitors to /sign-in', async () => {
    const dataLayer = createTestDataLayer();
    await dataLayer.auth.signOut();
    const { router } = renderApp('/home', { dataLayer });
    await waitFor(() => expect(router.state.location.pathname).toBe('/sign-in'));
  });

  it('renders placeholder pages inside the shell', async () => {
    mockViewport(1440);
    renderApp('/library');
    expect(await screen.findByRole('heading', { level: 1, name: 'Library' })).toBeInTheDocument();
    expect(screen.getByText('This area is part of a later phase.')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Primary' })).toBeInTheDocument();
  });

  it('names the project on project pages', async () => {
    const dataLayer = createTestDataLayer();
    const db = dataLayer.store.read();
    const personal = db.workspaces[0]!;
    const riverside = db.projects.find((p) => p.code === '001')!;
    renderApp(`/w/${personal.id}/p/${riverside.id}/files`, { dataLayer });
    const heading = await screen.findByRole('heading', {
      level: 1,
      name: 'Riverside Office Tower · Files',
    });
    expect(within(screen.getByRole('main')).getByText('001')).toBeInTheDocument();
    expect(heading).toBeInTheDocument();
  });

  it('shows Not found for unknown routes and unknown projects', async () => {
    const { router } = renderApp('/nope');
    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to Home' })).toHaveAttribute('href', '/home');
    await act(() => router.navigate('/w/unknown/p/unknown/files'));
    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
  });

  it.each([
    ['/library', 'Library'],
    ['/assets', 'Assets'],
    ['/settings/profile', 'Profile'],
    ['/settings/billing', 'Billing'],
    ['/help/sharing', 'Sharing'],
  ])('renders %s as the %s placeholder', async (path, title) => {
    renderApp(path);
    expect(await screen.findByRole('heading', { level: 1, name: title })).toBeInTheDocument();
  });

  it('renders the workspace projects page and every project section', async () => {
    const dataLayer = createTestDataLayer();
    const db = dataLayer.store.read();
    const personal = db.workspaces[0]!;
    const riverside = db.projects.find((p) => p.code === '001')!;
    const { router } = renderApp(`/w/${personal.id}/projects`, { dataLayer });
    expect(await screen.findByRole('heading', { level: 1, name: 'Projects' })).toBeInTheDocument();
    await act(() => router.navigate(`/w/${personal.id}/p/${riverside.id}/dashboard`));
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Riverside Office Tower · Dashboard' }),
    ).toBeInTheDocument();
    await act(() =>
      router.navigate(`/w/${personal.id}/p/${riverside.id}/schedule?scheduleId=anything`),
    );
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Riverside Office Tower · Schedule' }),
    ).toBeInTheDocument();
  });
});
