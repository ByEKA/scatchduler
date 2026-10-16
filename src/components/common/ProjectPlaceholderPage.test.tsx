import { screen, within } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { RepositoryError } from '@/data/errors';
import type { ProjectSummary } from '@/data/types';
import { createTestDataLayer } from '@/test/fakes';
import { renderApp } from '@/test/render';

it('shows a skeleton while loading and Retry, not Page not found, when the read fails', async () => {
  const dataLayer = createTestDataLayer();
  const db = dataLayer.store.read();
  const personal = db.workspaces[0]!;
  const riverside = db.projects.find((p) => p.code === '001')!;
  const listProjects = dataLayer.repository.listProjects.bind(dataLayer.repository);
  const networkError = new RepositoryError('network', 'Simulated network error');
  let failFirstRead!: () => void;
  const spy = vi
    .spyOn(dataLayer.repository, 'listProjects')
    .mockRejectedValue(networkError)
    .mockImplementationOnce(
      () =>
        new Promise<ProjectSummary[]>((_resolve, reject) => {
          failFirstRead = () => reject(networkError);
        }),
    );

  const { user } = renderApp(`/w/${personal.id}/p/${riverside.id}/files`, { dataLayer });
  expect(await screen.findByTestId('project-heading-skeleton')).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Page not found' })).not.toBeInTheDocument();

  failFirstRead();
  const alert = await within(screen.getByRole('main')).findByRole('alert');
  expect(alert).toHaveTextContent("Can't reach the server. Check your connection and try again.");
  expect(screen.queryByRole('heading', { name: 'Page not found' })).not.toBeInTheDocument();

  spy.mockImplementation(listProjects);
  await user.click(within(alert).getByRole('button', { name: 'Retry' }));
  expect(
    await screen.findByRole('heading', { level: 1, name: 'Riverside Office Tower · Files' }),
  ).toBeInTheDocument();
});

it('shows Page not found when the repository says the workspace is gone', async () => {
  const dataLayer = createTestDataLayer();
  const db = dataLayer.store.read();
  const personal = db.workspaces[0]!;
  const riverside = db.projects.find((p) => p.code === '001')!;
  vi.spyOn(dataLayer.repository, 'listProjects').mockRejectedValue(
    new RepositoryError('not_found', 'Workspace not found'),
  );
  renderApp(`/w/${personal.id}/p/${riverside.id}/files`, { dataLayer });
  expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
  expect(within(screen.getByRole('main')).queryByRole('alert')).not.toBeInTheDocument();
});
