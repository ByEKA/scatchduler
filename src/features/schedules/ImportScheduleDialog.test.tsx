import { act, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RepositoryError } from '@/data/errors';
import type { Schedule } from '@/data/types';
import { createTestDataLayer } from '@/test/fakes';
import { OpenDialog, renderWithProviders } from '@/test/render';

describe('ImportScheduleDialog', () => {
  it('imports a schedule file with a mixed-case extension', async () => {
    const dataLayer = createTestDataLayer();
    const { user } = renderWithProviders(<OpenDialog kind="importSchedule" />, {
      route: '/home',
      path: '/home',
      dataLayer,
    });
    await user.upload(
      await screen.findByLabelText('Schedule file', { selector: 'input' }),
      new File(['x'], 'Rev7.XER'),
    );
    expect(screen.getByLabelText('Name')).toHaveValue('Rev7');
    await waitFor(() =>
      expect(screen.getByLabelText('Project')).toHaveTextContent('Riverside Office Tower'),
    );
    await user.click(screen.getByRole('button', { name: 'Import' }));
    expect(await screen.findByText('Schedule imported')).toBeInTheDocument();
    expect(dataLayer.store.read().schedules.find((s) => s.name === 'Rev7')).toMatchObject({
      source: 'import',
      sourceFileName: 'Rev7.XER',
    });
  });

  it('rejects unsupported files', async () => {
    const { user } = renderWithProviders(<OpenDialog kind="importSchedule" />, {
      route: '/home',
      path: '/home',
    });
    await user.upload(
      await screen.findByLabelText('Schedule file', { selector: 'input' }),
      new File(['x'], 'plan.pdf'),
    );
    await user.click(screen.getByRole('button', { name: 'Import' }));
    expect(await screen.findByText('Use a .xer, .xml or .csv file')).toBeInTheDocument();
  });

  it('focuses the file field first when the file and the name are missing', async () => {
    const { user } = renderWithProviders(<OpenDialog kind="importSchedule" />, {
      route: '/home',
      path: '/home',
    });
    await waitFor(() =>
      expect(screen.getByLabelText('Project')).toHaveTextContent('Riverside Office Tower'),
    );
    await user.click(screen.getByRole('button', { name: 'Import' }));
    expect(await screen.findByText('Enter a schedule name')).toBeInTheDocument();
    const dropzone = screen.getByRole('button', { name: 'Schedule file' });
    expect(dropzone).toHaveAccessibleDescription(/Choose a file to import$/);
    await waitFor(() => expect(dropzone).toHaveFocus());
  });

  it('asks before a chosen file is dropped for the new project dialog', async () => {
    const { user } = renderWithProviders(<OpenDialog kind="importSchedule" />, {
      route: '/home',
      path: '/home',
    });
    await user.upload(
      await screen.findByLabelText('Schedule file', { selector: 'input' }),
      new File(['x'], 'Rev7.xer'),
    );
    await user.click(screen.getByRole('button', { name: 'Create a new project' }));
    expect(
      await screen.findByRole('alertdialog', { name: 'Discard changes?' }),
    ).toBeInTheDocument();
    expect(screen.getByTestId('dialog')).toHaveTextContent('importSchedule');
  });

  it('locks the file, the name and the project while importing', async () => {
    let fail: () => void = () => {};
    const dataLayer = createTestDataLayer({
      overrides: {
        importSchedule: () =>
          new Promise<Schedule>((_resolve, reject) => {
            fail = () => reject(new RepositoryError('network', 'offline'));
          }),
      },
    });
    const { user } = renderWithProviders(<OpenDialog kind="importSchedule" />, {
      route: '/home',
      path: '/home',
      dataLayer,
    });
    await user.upload(
      await screen.findByLabelText('Schedule file', { selector: 'input' }),
      new File(['x'], 'Rev7.xer'),
    );
    await waitFor(() =>
      expect(screen.getByLabelText('Project')).toHaveTextContent('Riverside Office Tower'),
    );
    await user.click(screen.getByRole('button', { name: 'Import' }));
    expect(await screen.findByRole('button', { name: 'Importing…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Schedule file' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Remove file' })).toBeDisabled();
    expect(screen.getByLabelText('Name')).toHaveAttribute('readonly');
    expect(screen.getByLabelText('Project')).toBeDisabled();
    await act(async () => fail());
    expect(
      await screen.findByText("Can't reach the server. Check your connection and try again."),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Schedule file' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Remove file' })).toBeEnabled();
    expect(screen.getByLabelText('Name')).not.toHaveAttribute('readonly');
  });
});
