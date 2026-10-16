import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SidebarNav } from '@/components/layout/SidebarNav';
import { createTestDataLayer } from '@/test/fakes';
import { renderWithProviders } from '@/test/render';

describe('SidebarNav', () => {
  it('marks Home as current and links project items to the current project', async () => {
    const dl = createTestDataLayer();
    const db = dl.store.read();
    const personal = db.workspaces[0]!;
    const riverside = db.projects.find((p) => p.code === '001')!;
    renderWithProviders(<SidebarNav />, { route: '/home', path: '/home', dataLayer: dl });
    expect(await screen.findByRole('link', { name: 'Home' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(await screen.findByRole('link', { name: 'Projects' })).toHaveAttribute(
      'href',
      `/w/${personal.id}/projects`,
    );
    expect(await screen.findByRole('link', { name: 'Files' })).toHaveAttribute(
      'href',
      `/w/${personal.id}/p/${riverside.id}/files`,
    );
    expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveAttribute(
      'href',
      `/w/${personal.id}/p/${riverside.id}/dashboard`,
    );
    expect(screen.getByRole('link', { name: 'Schedule' })).toHaveAttribute(
      'href',
      `/w/${personal.id}/p/${riverside.id}/schedule`,
    );
    expect(screen.getByText('Workspace')).toBeInTheDocument();
    expect(screen.getByText('Project')).toBeInTheDocument();
  });

  it('disables project items when the workspace has no projects', async () => {
    renderWithProviders(<SidebarNav />, {
      route: '/home',
      path: '/home',
      dataLayer: createTestDataLayer({ scenario: 'empty' }),
    });
    await screen.findByRole('link', { name: 'Projects' });
    expect(screen.queryByRole('link', { name: 'Files' })).not.toBeInTheDocument();
    expect(screen.getByText('Files').closest('[aria-disabled="true"]')).not.toBeNull();
  });

  it('lets the keyboard reach a disabled item and explains it in a tooltip', async () => {
    const { user } = renderWithProviders(<SidebarNav />, {
      route: '/home',
      path: '/home',
      dataLayer: createTestDataLayer({ scenario: 'empty' }),
    });
    await screen.findByRole('link', { name: 'Projects' });
    const files = screen.getByText('Files').closest<HTMLElement>('[aria-disabled="true"]')!;
    expect(files).toHaveAttribute('tabindex', '0');
    // Home, Library, Assets and Projects come first.
    for (let i = 0; i < 5; i++) await user.tab();
    expect(files).toHaveFocus();
    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      'Create or select a project first',
    );
  });
});
