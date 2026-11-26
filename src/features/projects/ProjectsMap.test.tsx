import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ProjectsMap } from '@/features/projects/ProjectsMap';
import { createTestDataLayer } from '@/test/fakes';
import { renderWithProviders } from '@/test/render';

describe('ProjectsMap', () => {
  it('renders pins for mapped projects, opens detail card on click, supports zoom controls, and lists unmapped projects in Not on the map', async () => {
    const dataLayer = createTestDataLayer();
    const personal = (await dataLayer.repository.listWorkspaces()).find(
      (w) => w.kind === 'personal',
    )!;
    const projects = await dataLayer.repository.listProjects(personal.id);

    const { user, unmount } = renderWithProviders(
      <ProjectsMap projects={projects} workspace={personal} />,
      { dataLayer },
    );

    // 4 seeded personal projects have coordinates (001, 002, 003, 005); 2 do not (004, 006)
    const harborPin = screen.getByRole('button', { name: 'Harbor Logistics Hub (003)' });
    expect(harborPin).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Riverside Office Tower (001)' }),
    ).toBeInTheDocument();

    // Clicking pin opens detail popover card with city, coordinates and Open project link
    await user.click(harborPin);
    const card = screen.getByRole('region', { name: 'Harbor Logistics Hub' });
    expect(within(card).getByText('Aegean Ports · Izmir')).toBeInTheDocument();
    expect(within(card).getByText('38.4192, 27.1287')).toBeInTheDocument();
    expect(within(card).getByRole('link', { name: 'Open project' })).toHaveAttribute(
      'href',
      expect.stringMatching(/\/w\/.*\/p\/.*\/files$/),
    );

    // Zoom controls update zoom level and Fit to projects restores it
    const initialZoom = screen.getByTestId('map-zoom-level').textContent;
    await user.click(screen.getByRole('button', { name: 'Zoom in' }));
    expect(screen.getByTestId('map-zoom-level').textContent).not.toBe(initialZoom);
    await user.click(screen.getByRole('button', { name: 'Fit to projects' }));
    expect(screen.getByTestId('map-zoom-level').textContent).toBe(initialZoom);

    // "Not on the map (2)" lists Campus Library Retrofit and Old Mill Housing with Edit location
    const sidePanel = screen.getByRole('complementary', { name: 'Not on the map' });
    expect(
      within(sidePanel).getByRole('heading', { name: 'Not on the map (2)' }),
    ).toBeInTheDocument();
    expect(within(sidePanel).getByText('Campus Library Retrofit')).toBeInTheDocument();
    expect(within(sidePanel).getByText('Old Mill Housing')).toBeInTheDocument();

    const editBtns = within(sidePanel).getAllByRole('button', { name: 'Edit location' });
    expect(editBtns).toHaveLength(2);
    await user.click(editBtns[0]!);
    expect(screen.getByTestId('dialog')).toHaveTextContent('editProject');

    unmount();

    // Viewer sees "Project details" instead of "Edit location"
    renderWithProviders(
      <ProjectsMap projects={projects} workspace={{ ...personal, myRole: 'viewer' }} />,
      { dataLayer },
    );
    const viewerSide = screen.getByRole('complementary', { name: 'Not on the map' });
    expect(within(viewerSide).getAllByRole('button', { name: 'Project details' })).toHaveLength(2);
  });
});
