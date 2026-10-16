import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ProjectSummary } from '@/data/types';
import { ProjectCard } from '@/features/home/ProjectCard';
import { shortDate } from '@/lib/format';
import { createTestDataLayer } from '@/test/fakes';
import { renderWithProviders } from '@/test/render';

function summary(code: string, patch: Partial<ProjectSummary> = {}): ProjectSummary {
  const db = createTestDataLayer().store.read();
  const project = db.projects.find((p) => p.code === code)!;
  return {
    ...project,
    scheduleCount: db.schedules.filter((s) => s.projectId === project.id).length,
    ...patch,
  };
}

describe('ProjectCard', () => {
  it('links the card and the schedule count', () => {
    const project = summary('001');
    renderWithProviders(<ProjectCard project={project} />);
    expect(screen.getByRole('link', { name: 'Riverside Office Tower' })).toHaveAttribute(
      'href',
      `/w/${project.workspaceId}/p/${project.id}/files`,
    );
    expect(screen.getByRole('link', { name: /1 schedule/ })).toHaveAttribute(
      'href',
      `/w/${project.workspaceId}/p/${project.id}/schedule`,
    );
    expect(screen.getByText(`Status date ${shortDate(project.statusDate)}`)).toBeInTheDocument();
    expect(screen.getByText('001')).toBeInTheDocument();
  });

  it('shows a dash without a status date and a generated cover without a photo', () => {
    renderWithProviders(<ProjectCard project={summary('002')} />);
    expect(screen.getByText('Status date —')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /0 schedules/ })).toBeInTheDocument();
    expect(screen.getByTestId('project-cover')).toHaveAttribute('data-cover', 'generated');
  });

  it('truncates long names and keeps the full name in the title', () => {
    const long = 'Tunnel'.repeat(25);
    renderWithProviders(<ProjectCard project={summary('001', { name: long })} />);
    const link = screen.getByRole('link', { name: long });
    expect(link).toHaveClass('truncate');
    expect(link).toHaveAttribute('title', long);
  });
});
