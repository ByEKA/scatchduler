import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createTestDataLayer } from '@/test/fakes';
import { renderApp } from '@/test/render';
import { mockViewport } from '@/test/viewport';

describe('HomePage', () => {
  it('renders every section in order', async () => {
    mockViewport(1440);
    renderApp('/home');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Hello, Deniz' }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual([
      'Recent projects',
      'Shared with me',
      'Workspaces',
      'To do',
    ]);
  });

  it('shows an error in each data section when reads fail', async () => {
    mockViewport(1440);
    renderApp('/home', { dataLayer: createTestDataLayer({ failRate: 1 }) });
    expect(await screen.findByRole('heading', { level: 1, name: 'Hello' })).toBeInTheDocument();
    await waitFor(() =>
      expect(within(screen.getByRole('main')).getAllByRole('alert')).toHaveLength(4),
    );
  });

  it("shows each section's empty state when there is no data", async () => {
    mockViewport(1440);
    renderApp('/home', { dataLayer: createTestDataLayer({ scenario: 'empty' }) });
    expect(await screen.findByText("You're all caught up")).toBeInTheDocument();
    expect(await screen.findByText('Nothing shared yet')).toBeInTheDocument();
    expect(await screen.findByText('No team workspaces yet')).toBeInTheDocument();
    const recent = screen.getByRole('region', { name: 'Recent projects' });
    expect(
      await within(recent).findByRole('button', { name: /Create new project/ }),
    ).toBeInTheDocument();
    expect(within(recent).queryByRole('article')).not.toBeInTheDocument();
    expect(within(screen.getByRole('main')).queryByRole('alert')).not.toBeInTheDocument();
  });
});
