import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ProjectsToolbar } from '@/features/projects/ProjectsToolbar';
import { useProjectsLayout } from '@/hooks/useProjectsLayout';
import { renderWithProviders } from '@/test/render';

const location = () => screen.getByTestId('location').textContent ?? '';
function renderToolbar(search = '', onLayoutChange = vi.fn()) {
  const utils = renderWithProviders(
    <ProjectsToolbar layout="tiles" onLayoutChange={onLayoutChange} />,
    { route: `/w/ws/projects${search}`, path: '/w/:workspaceId/projects' },
  );
  return { ...utils, onLayoutChange };
}
function LayoutProbe() {
  const [layout, setLayout] = useProjectsLayout();
  return (
    <button type="button" onClick={() => setLayout('list')}>
      {layout}
    </button>
  );
}

describe('ProjectsToolbar', () => {
  it('writes the search, filters and sort into the URL and switches the layout', async () => {
    const { user, onLayoutChange } = renderToolbar();
    await user.type(screen.getByRole('searchbox', { name: 'Search projects' }), 'pier');
    expect(location()).toMatch(/\?q=pier$/);
    await user.click(screen.getByRole('button', { name: 'Filters' }));
    await user.click(screen.getByLabelText('Status'));
    expect((await screen.findAllByRole('option')).map((o) => o.textContent)).toEqual([
      'Any',
      'Active',
      'On hold',
      'Completed',
      'Cancelled',
    ]);
    await user.click(screen.getByRole('option', { name: 'On hold' }));
    await user.keyboard('{Escape}');
    await user.click(screen.getByLabelText('Sort by'));
    expect((await screen.findAllByRole('option')).map((o) => o.textContent)).toEqual([
      'Last updated',
      'Name',
      'Status date',
    ]);
    await user.click(screen.getByRole('option', { name: 'Status date' }));
    expect(location()).toContain('status=on_hold');
    expect(location()).toContain('sort=status-date');
    await user.click(screen.getByRole('radio', { name: 'List' }));
    expect(onLayoutChange).toHaveBeenCalledWith('list');
  });

  it('counts the active filters, shows their chips and clears them with the search', async () => {
    const { user } = renderToolbar('?q=x&status=on_hold&stage=construction&sort=name');
    expect(screen.getByRole('button', { name: 'Filters · 2' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Remove filter Status' }));
    expect(location()).not.toContain('status=');
    await user.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(location()).toMatch(/\?sort=name$/);
    expect(screen.getByRole('searchbox', { name: 'Search projects' })).toHaveValue('');
  });

  it('remembers the layout in ui.projectsLayout', async () => {
    const { user, unmount } = renderWithProviders(<LayoutProbe />);
    expect(screen.getByRole('button')).toHaveTextContent('tiles');
    await user.click(screen.getByRole('button'));
    expect(localStorage.getItem('ui.projectsLayout')).toBe('list');
    unmount();
    renderWithProviders(<LayoutProbe />);
    expect(screen.getByRole('button')).toHaveTextContent('list');
  });
});
