import { screen, waitFor, within } from '@testing-library/react';
import { addDays, format, subDays } from 'date-fns';
import { describe, expect, it, vi } from 'vitest';
import { RepositoryError } from '@/data/errors';
import type { Task } from '@/data/types';
import { TodoPanel } from '@/features/home/TodoPanel';
import { dueLabel } from '@/lib/format';
import { createTestDataLayer } from '@/test/fakes';
import { renderWithProviders } from '@/test/render';

describe('TodoPanel', () => {
  it('lists pending tasks with their due labels', async () => {
    renderWithProviders(<TodoPanel />);
    const region = await screen.findByRole('region', { name: 'To do' });
    expect(await within(region).findAllByRole('checkbox')).toHaveLength(3);
    expect(within(region).getByText('Due today')).toBeInTheDocument();
    const inThreeDays = dueLabel(format(addDays(new Date(), 3), 'yyyy-MM-dd'), new Date())!.text;
    expect(within(region).getByText(inThreeDays)).toBeInTheDocument();
  });

  it('completes a task and can undo it', async () => {
    const title = 'Update status date for Riverside Office Tower';
    const { user } = renderWithProviders(<TodoPanel />);
    await user.click(await screen.findByRole('checkbox', { name: `Mark '${title}' as done` }));
    await waitFor(() => expect(screen.queryByText(title)).not.toBeInTheDocument());
    expect(await screen.findByText('Task completed')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(await screen.findByText(title)).toBeInTheDocument();
  });

  it('shows the caught-up state', async () => {
    renderWithProviders(<TodoPanel />, { dataLayer: createTestDataLayer({ scenario: 'empty' }) });
    expect(await screen.findByText("You're all caught up")).toBeInTheDocument();
    expect(screen.getByText('Tasks assigned to you will show up here.')).toBeInTheDocument();
  });

  // Seed order: due today, due in three days, no due date.
  const UPDATE = 'Update status date for Riverside Office Tower';
  const IMPORT = 'Import revised baseline from contractor';
  const REVIEW = 'Review look-ahead schedule';
  const checkbox = (title: string): HTMLElement =>
    screen.getByRole('checkbox', { name: `Mark '${title}' as done` });

  it('labels overdue, tomorrow and undated tasks', async () => {
    const seededAt = subDays(new Date(), 2);
    renderWithProviders(<TodoPanel />, { dataLayer: createTestDataLayer({ now: seededAt }) });
    // The word carries the state, the color repeats it.
    expect(await screen.findByText(`Overdue · ${format(seededAt, 'MMM d')}`)).toHaveClass(
      'text-destructive',
    );
    expect(screen.getByText('Due tomorrow')).not.toHaveClass('text-destructive');
    expect(screen.getAllByRole('listitem')[2]).toHaveTextContent(new RegExp(`^${REVIEW}$`));
  });

  it('moves focus to the next task, else the previous one, else the heading', async () => {
    const { user } = renderWithProviders(<TodoPanel />);
    await screen.findAllByRole('checkbox');
    await user.tab();
    await user.tab();
    expect(checkbox(IMPORT)).toHaveFocus();
    await user.keyboard(' ');
    await waitFor(() => expect(screen.queryByText(IMPORT)).not.toBeInTheDocument());
    expect(checkbox(REVIEW)).toHaveFocus();
    await user.keyboard(' ');
    await waitFor(() => expect(screen.queryByText(REVIEW)).not.toBeInTheDocument());
    expect(checkbox(UPDATE)).toHaveFocus();
    await user.keyboard(' ');
    expect(await screen.findByText("You're all caught up")).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'To do' })).toHaveFocus();
  });

  it('focuses the task again when Undo brings it back', async () => {
    const { user } = renderWithProviders(<TodoPanel />);
    await user.click(await screen.findByRole('checkbox', { name: `Mark '${UPDATE}' as done` }));
    await user.click(await screen.findByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(checkbox(UPDATE)).toHaveFocus());
  });

  it('puts the task back and shows the error when the write fails', async () => {
    const dataLayer = createTestDataLayer({
      overrides: { setTaskDone: () => Promise.reject(new RepositoryError('network', 'offline')) },
    });
    const { user } = renderWithProviders(<TodoPanel />, { dataLayer });
    await user.click(await screen.findByRole('checkbox', { name: `Mark '${UPDATE}' as done` }));
    expect(
      await screen.findByText("Can't reach the server. Check your connection and try again."),
    ).toBeInTheDocument();
    expect(checkbox(UPDATE)).toBeInTheDocument();
    // The toast shown at the click goes away with the failed write.
    await waitFor(() => expect(screen.queryByText('Task completed')).not.toBeInTheDocument());
    expect(checkbox(IMPORT)).toHaveFocus();
  });

  it('shows "Task completed" at the click, before the write finishes (D15)', async () => {
    const dataLayer = createTestDataLayer({
      overrides: { setTaskDone: () => new Promise<Task>(() => {}) },
    });
    const { user } = renderWithProviders(<TodoPanel />, { dataLayer });
    await user.click(await screen.findByRole('checkbox', { name: `Mark '${UPDATE}' as done` }));
    expect(await screen.findByText('Task completed')).toBeInTheDocument();
    expect(screen.queryByText(UPDATE)).not.toBeInTheDocument();
  });

  it('shows the error and keeps focus in the panel when Undo fails', async () => {
    const dataLayer = createTestDataLayer();
    const setTaskDone = dataLayer.repository.setTaskDone.bind(dataLayer.repository);
    vi.spyOn(dataLayer.repository, 'setTaskDone').mockImplementation((taskId, done) =>
      done ? setTaskDone(taskId, done) : Promise.reject(new RepositoryError('network', 'offline')),
    );
    const { user } = renderWithProviders(<TodoPanel />, { dataLayer });
    await user.click(await screen.findByRole('checkbox', { name: `Mark '${UPDATE}' as done` }));
    await user.click(await screen.findByRole('button', { name: 'Undo' }));
    expect(
      await screen.findByText("Can't reach the server. Check your connection and try again."),
    ).toBeInTheDocument();
    expect(document.activeElement).not.toBe(document.body);
    expect(screen.getByRole('region', { name: 'To do' })).toContainElement(
      document.activeElement as HTMLElement,
    );
  });

  it('reads the due label as the checkbox description', async () => {
    renderWithProviders(<TodoPanel />);
    expect(
      await screen.findByRole('checkbox', { name: `Mark '${UPDATE}' as done` }),
    ).toHaveAccessibleDescription('Due today');
  });

  it('shows three skeleton rows while the tasks load', async () => {
    const dataLayer = createTestDataLayer({
      overrides: { listPendingTasks: () => new Promise(() => {}) },
    });
    renderWithProviders(<TodoPanel />, { dataLayer });
    expect(await screen.findAllByTestId('task-row-skeleton')).toHaveLength(3);
    expect(screen.getByRole('heading', { name: 'To do' })).toBeInTheDocument();
  });

  it('shows an error whose Retry loads the tasks', async () => {
    const dataLayer = createTestDataLayer();
    vi.spyOn(dataLayer.repository, 'listPendingTasks').mockRejectedValueOnce(
      new RepositoryError('network', 'offline'),
    );
    const { user } = renderWithProviders(<TodoPanel />, { dataLayer });
    const region = await screen.findByRole('region', { name: 'To do' });
    expect(await within(region).findByRole('alert')).toHaveTextContent(
      "Can't reach the server. Check your connection and try again.",
    );
    await user.click(within(region).getByRole('button', { name: 'Retry' }));
    expect(await within(region).findAllByRole('checkbox')).toHaveLength(3);
    expect(within(region).queryByRole('alert')).not.toBeInTheDocument();
  });

  it('keeps the panel at least 240 px tall, 420 px from 1024 px up', async () => {
    renderWithProviders(<TodoPanel />);
    const list = await screen.findByRole('list');
    expect(list.parentElement).toHaveClass('min-h-[240px]', 'lg:min-h-[420px]');
  });
});
