import { screen, waitFor } from '@testing-library/react';
import type { ReactElement } from 'react';
import { describe, expect, it } from 'vitest';
import type { Role } from '@/data/types';
import { ProjectSwitcher } from '@/components/layout/ProjectSwitcher';
import { RecentProjects } from '@/features/home/RecentProjects';
import { WelcomeBanner } from '@/features/home/WelcomeBanner';
import { createTestDataLayer } from '@/test/fakes';
import { renderWithProviders } from '@/test/render';

function inTeam(ui: ReactElement, teamRole: Role, options: { noProjects?: boolean } = {}) {
  const dataLayer = createTestDataLayer({ teamRole });
  const team = dataLayer.store.read().workspaces.find((w) => w.kind === 'team')!;
  if (options.noProjects)
    dataLayer.store.write((db) => {
      db.projects = db.projects.filter((p) => p.workspaceId !== team.id);
    });
  return renderWithProviders(ui, {
    route: `/w/${team.id}/projects`,
    path: '/w/:workspaceId/projects',
    dataLayer,
  });
}

describe('viewer restrictions', () => {
  it('disables the banner actions for viewers and says why', async () => {
    const { user } = inTeam(<WelcomeBanner />, 'viewer');
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'New project' })).toHaveAttribute(
        'aria-disabled',
        'true',
      ),
    );
    for (const name of ['New schedule', 'Import schedule'])
      expect(screen.getByRole('button', { name })).toHaveAttribute('aria-disabled', 'true');
    const newProject = screen.getByRole('button', { name: 'New project' }); // query again: the role arrives after the first render
    await user.hover(newProject); // hover before clicking: a click closes Radix tooltips
    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      "Viewers can't make changes in this workspace",
    );
    await user.click(newProject);
    expect(screen.getByTestId('dialog')).toHaveTextContent('none');
  });

  it('keeps the banner actions for editors', async () => {
    inTeam(<WelcomeBanner />, 'editor');
    const newProject = await screen.findByRole('button', { name: 'New project' });
    await screen.findByText(/Hello/);
    expect(newProject).not.toHaveAttribute('aria-disabled');
  });

  it('hides project creation from viewers in Recent projects', async () => {
    inTeam(<RecentProjects />, 'viewer', { noProjects: true });
    expect(await screen.findByText('No projects yet')).toBeInTheDocument();
    expect(screen.getByText('Projects in this workspace will appear here.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Create new project' })).not.toBeInTheDocument();
  });

  it('hides "Create new project" in the project switcher for viewers', async () => {
    const { user } = inTeam(<ProjectSwitcher />, 'viewer');
    await user.click(await screen.findByRole('button', { name: 'Switch project' }));
    await screen.findByPlaceholderText('Search projects…');
    expect(screen.queryByRole('option', { name: /Create new project/ })).not.toBeInTheDocument();
  });
});
