import { act, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { RepositoryError } from '@/data/errors';
import turkish from '@/import/__fixtures__/turkish-1254.csv?bytes';
import xer from '@/import/__fixtures__/two-projects.xer?bytes';
import { createImportClient } from '@/import/client';
import { ImportScheduleDialog } from '@/features/import/ImportScheduleDialog';
import {
  ImportClientFactoryContext,
  type ImportClient,
  type InspectOutcome,
} from '@/hooks/useImportParser';
import { createTestDataLayer } from '@/test/fakes';
import { renderWithProviders } from '@/test/render';

const realClient = () => createImportClient({ createWorker: () => null });

function renderImport(options: { projectCode?: string; client?: () => ImportClient } = {}) {
  const dataLayer = createTestDataLayer();
  const project = options.projectCode
    ? dataLayer.store.read().projects.find((p) => p.code === options.projectCode)!
    : undefined;
  const utils = renderWithProviders(
    <ImportClientFactoryContext value={options.client ?? realClient}>
      <ImportScheduleDialog projectId={project?.id} />
    </ImportClientFactoryContext>,
    { route: '/home', path: '/home', dataLayer },
  );
  return { ...utils, project, dataLayer };
}

const dropzone = () => screen.getByLabelText('Schedule file', { selector: 'input' });

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe('ImportScheduleDialog — File and Columns', () => {
  it('asks for the project first from Home and shows where the import goes', async () => {
    renderImport();
    const dialog = await screen.findByRole('dialog', { name: 'Import schedule' });
    expect(dialog).toHaveAccessibleDescription(
      'Upload a schedule exported from your planning tool.',
    );
    await waitFor(() =>
      expect(within(dialog).getByLabelText('Project')).toHaveTextContent('Riverside Office Tower'),
    );
    expect(
      within(dialog).getByText('Into My workspace › 001 Riverside Office Tower'),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText(
        'Primavera P6 (.xer), MS Project XML (.xml), Excel (.xlsx) or CSV · up to 50 MB',
      ),
    ).toBeInTheDocument();
  });

  it('reads an XER and shows its format', async () => {
    const { user } = renderImport({ projectCode: '003' });
    await user.upload(dropzone(), new File([xer], 'north.xer'));
    expect(await screen.findByText('Primavera P6 XER 20.12')).toBeInTheDocument();
    expect(screen.queryByText('Columns')).not.toBeInTheDocument();
  });

  it('refuses a file by its name, its size or its content, and copies the details', async () => {
    const refused: InspectOutcome = {
      kind: 'refused',
      message:
        'This is a database file, not a schedule export. Export the project as XER from P6 or as XML from Microsoft Project.',
      fileName: 'db.xer',
      size: 16,
      parserVersion: '1.0.0',
    };
    const client = {
      inspect: vi.fn(async () => refused),
      dispose: vi.fn(),
    } as unknown as ImportClient;
    const { user } = renderImport({ projectCode: '003', client: () => client });
    await user.upload(dropzone(), new File(['x'], 'plan.mpp'));
    expect(
      await screen.findByText(
        "MPP files can't be imported. In Microsoft Project, save the file as XML and import that.",
      ),
    ).toBeInTheDocument();
    await user.upload(dropzone(), new File(['SQLite format 3'], 'db.xer'));
    expect(await screen.findByText(refused.message)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Copy details' }));
    expect(await navigator.clipboard.readText()).toContain('Message: This is a database file');
    expect(await screen.findByText('Details copied')).toBeInTheDocument();
  });

  it('drops a stale answer when another file is chosen, and disposes the parser on close', async () => {
    const first = deferred<InspectOutcome>();
    const client = {
      inspect: vi.fn().mockReturnValueOnce(first.promise).mockResolvedValueOnce({
        kind: 'refused',
        message: 'Second answer',
        fileName: 'b.xer',
        size: 1,
        parserVersion: '1.0.0',
      }),
      dispose: vi.fn(),
    } as unknown as ImportClient;
    const { user, unmount } = renderImport({ projectCode: '003', client: () => client });
    await user.upload(dropzone(), new File(['a'], 'a.xer'));
    await user.upload(dropzone(), new File(['b'], 'b.xer'));
    expect(await screen.findByText('Second answer')).toBeInTheDocument();
    await act(async () =>
      first.resolve({
        kind: 'refused',
        message: 'First answer',
        fileName: 'a.xer',
        size: 1,
        parserVersion: '1.0.0',
      }),
    );
    expect(screen.queryByText('First answer')).not.toBeInTheDocument();
    unmount();
    expect(client.dispose).toHaveBeenCalledOnce();
  });

  it('goes to Columns for a CSV with its detected options, mapping and preview', async () => {
    const { user } = renderImport({ projectCode: '003' });
    await user.upload(dropzone(), new File([turkish], 'liste.csv'));
    expect(await screen.findByText('CSV file')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByText('Columns · liste.csv')).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Import schedule' })).toHaveAccessibleDescription(
      "Match the file's columns to schedule fields.",
    );
    expect(screen.getByText('Detected: Turkish (Windows-1254)')).toBeInTheDocument();
    expect(screen.getByLabelText('Delimiter')).toHaveTextContent('Semicolon');
    expect(screen.getByLabelText('Decimal separator')).toHaveTextContent('Comma (2,5)');
    expect(screen.getByLabelText('Activity code')).toHaveTextContent('A · Aktivite Kodu');
    expect(screen.getByLabelText('Task ID')).toHaveTextContent('Not used');
    const preview = screen.getByRole('table', { name: 'First 10 rows' });
    expect(within(preview).getByText('Şantiye kurulumu')).toBeInTheDocument();
  });

  it('checks the Columns step before moving on', async () => {
    const { user } = renderImport({ projectCode: '003' });
    await user.upload(dropzone(), new File([turkish], 'liste.csv'));
    await user.click(await screen.findByRole('button', { name: 'Next' }));
    await screen.findByText('Columns · liste.csv');
    await user.click(screen.getByLabelText('Activity code'));
    await user.click(await screen.findByRole('option', { name: 'Not used' }));
    await user.click(screen.getByLabelText('Notes'));
    await user.click(await screen.findByRole('option', { name: 'B · Aktivite Adı' }));
    const header = screen.getByLabelText('Header row');
    await user.clear(header);
    await user.type(header, '0');
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByText('Map a column to Activity code')).toBeInTheDocument();
    expect(screen.getAllByText('Each column can be used once').length).toBeGreaterThan(0);
    expect(screen.getByText('Enter a row number from 1 to 50')).toBeInTheDocument();
  });

  it('reads the preview again when an option changes', async () => {
    const { user } = renderImport({ projectCode: '003' });
    await user.upload(dropzone(), new File([turkish], 'liste.csv'));
    await user.click(await screen.findByRole('button', { name: 'Next' }));
    await screen.findByText('Columns · liste.csv');
    await user.click(screen.getByLabelText('Text encoding'));
    await user.click(
      await screen.findByRole('option', { name: 'Western European (Windows-1252)' }),
    );
    const preview = screen.getByRole('table', { name: 'First 10 rows' });
    expect(await within(preview).findByText('Kazý iþleri')).toBeInTheDocument();
  });
});

describe('ImportScheduleDialog — Review and import', () => {
  async function toReview(user: ReturnType<typeof renderImport>['user'], file: File) {
    await user.upload(dropzone(), file);
    await user.click(await screen.findByRole('button', { name: 'Next' }));
    if (file.name.endsWith('.csv'))
      await user.click(await screen.findByRole('button', { name: 'Next' }));
    return screen.findByText('Check what will be imported.');
  }

  it('lists the projects of a two-project XER and starts on the flagged one', async () => {
    const { user } = renderImport({ projectCode: '003' });
    await toReview(user, new File([xer], 'north.xer'));
    const table = await screen.findByRole('table', { name: 'Projects in this file' });
    expect(within(table).getByRole('radio', { name: 'Use NTH-A · North Plant' })).toBeChecked();
    expect(within(table).getByText('north.xer · NTH-B')).toBeInTheDocument();
    expect(screen.getByLabelText('Name')).toHaveValue('North Plant');
    expect(screen.getByLabelText('Code')).toHaveValue('NTH-A');
    await user.click(within(table).getByRole('radio', { name: 'Use NTH-B · North Annex' }));
    await waitFor(() => expect(screen.getByLabelText('Code')).toHaveValue('NTH-B'));
  });

  it('shows the report view of the chosen schedule', async () => {
    const { user } = renderImport({ projectCode: '003' });
    await toReview(user, new File([xer], 'north.xer'));
    const counts = await screen.findByRole('table', { name: 'Counts' });
    expect(
      within(counts)
        .getAllByRole('row')
        .map((r) => r.textContent),
    ).toEqual([
      'ReadAcceptedAdjustedSkipped',
      'Calendars3310',
      'WBS elements2200',
      'Activities6610',
      'Relationships6511',
    ]);
    expect(screen.getByText('Primavera P6 XER 20.12')).toBeInTheDocument();
    expect(
      screen.getByText('Links to other projects or files').nextElementSibling,
    ).toHaveTextContent('1 findings');
    expect(
      screen.getByText('Progress without an actual start').nextElementSibling,
    ).toHaveTextContent('No findings');
    expect(screen.getByText('0 errors · 4 warnings · 3 notes')).toBeInTheDocument();
    expect(screen.getByText('The original file is kept with the schedule.')).toBeInTheDocument();
    expect(screen.getByText('Mobilisation')).toBeInTheDocument();
  });

  it('runs the checks again with the status date it will store', async () => {
    const client = realClient();
    const analyze = vi.spyOn(client, 'analyze');
    const { user } = renderImport({ projectCode: '003', client: () => client });
    await toReview(user, new File([xer], 'north.xer'));
    const date = screen.getByLabelText('Status date');
    expect(date).toHaveValue('2026-10-15');
    expect(screen.getByText('From the file')).toBeInTheDocument();
    await user.clear(date);
    await user.type(date, '2026-09-01');
    await waitFor(() =>
      expect(analyze).toHaveBeenLastCalledWith(
        expect.objectContaining({ sourceProjectId: expect.any(String) }),
        { statusDate: '2026-09-01' },
      ),
    );
  });

  it('imports once, lands on the files page and offers the report', async () => {
    const { user, dataLayer, project } = renderImport({ projectCode: '003' });
    const importSchedule = vi.spyOn(dataLayer.repository, 'importSchedule');
    await toReview(user, new File([xer], 'north.xer'));
    const button = screen.getByRole('button', { name: 'Import' });
    act(() => {
      button.click();
      button.click();
    });
    expect(await screen.findByText('Schedule imported')).toBeInTheDocument();
    expect(importSchedule).toHaveBeenCalledTimes(1);
    expect(importSchedule.mock.calls[0]![0]).toMatchObject({
      name: 'North Plant',
      code: 'NTH-A',
      statusDate: '2026-10-15',
      activityCount: 6,
      sourceProjectCode: 'NTH-A',
      mapping: { sourceProjectId: '101' },
    });
    expect(screen.getByTestId('location')).toHaveTextContent(
      `/w/${project!.workspaceId}/p/${project!.id}/files`,
    );
    await user.click(screen.getByRole('button', { name: 'View report' }));
    expect(screen.getByTestId('dialog')).toHaveTextContent('importReport');
  });

  it('shows a taken code under Code', async () => {
    const { user, dataLayer } = renderImport({ projectCode: '003' });
    dataLayer.repository.importSchedule = () =>
      Promise.reject(new RepositoryError('conflict', 'This code is already used in this project.'));
    await toReview(user, new File([xer], 'north.xer'));
    await user.click(screen.getByRole('button', { name: 'Import' }));
    expect(
      await screen.findByText('This code is already used in this project.'),
    ).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText('Code')).toHaveFocus());
  });

  it('names what blocks Import when every schedule has errors', async () => {
    const broken = new TextEncoder().encode(
      'ERMHDR\t20.12\n%T\tPROJECT\n%F\tproj_id\tproj_short_name\n%R\t1\tP1\n%R\t2\tP2\n%E\n',
    );
    const { user } = renderImport({ projectCode: '003' });
    await toReview(user, new File([broken], 'empty.xer'));
    expect(
      screen.getAllByText(
        "Fix the errors before importing. This schedule can't be imported as it is.",
      ).length,
    ).toBe(2);
    await user.click(screen.getByRole('button', { name: 'Import' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Choose at least one schedule to import.',
    );
  });

  it('refuses to import a single schedule with errors', async () => {
    const duplicate = new TextEncoder().encode('Code,Name\nA1,One\nA1,Two\n');
    const { user } = renderImport({ projectCode: '003' });
    await toReview(user, new File([duplicate], 'dup.csv'));
    await user.click(screen.getByRole('button', { name: 'Import' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      "Fix the errors before importing. This schedule can't be imported as it is.",
    );
  });
});
