import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createTestDataLayer, type TestDataLayer } from '@/test/fakes';
import { OpenDialog, renderWithProviders } from '@/test/render';

async function openDetails(
  projectCode: string,
  scheduleCode: string | null,
  dataLayer: TestDataLayer = createTestDataLayer(),
  name?: string,
) {
  const db = dataLayer.store.read();
  const project = db.projects.find((p) => p.code === projectCode)!;
  const schedule = db.schedules.find(
    (s) => s.projectId === project.id && (name ? s.name === name : s.code === scheduleCode),
  )!;
  const utils = renderWithProviders(
    <OpenDialog
      kind="scheduleDetails"
      options={{ projectId: project.id, scheduleId: schedule.id }}
    />,
    { dataLayer },
  );
  await screen.findByRole('dialog', { name: 'Schedule details' });
  return { ...utils, schedule, dataLayer };
}

describe('ScheduleDetailsDialog', () => {
  it('saves the details of a schedule', async () => {
    const { user, schedule, dataLayer } = await openDetails('003', 'UP-01');
    expect(await screen.findByLabelText('Name')).toHaveValue('Update 1');
    expect(screen.getByText('Blank')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Notes'), 'Crane moved to the east gate.');
    expect(screen.getByText('29/2000')).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: 'Baseline' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Details saved')).toBeInTheDocument();
    expect(dataLayer.store.read().schedules.find((s) => s.id === schedule.id)).toMatchObject({
      notes: 'Crane moved to the east gate.',
      baseline: 'baseline',
    });
  });

  it('starts a schedule without a code on the suggestion', async () => {
    const dataLayer = createTestDataLayer();
    dataLayer.store.write((db) => {
      const s = db.schedules.find((x) => x.code === 'UP-01')!;
      Object.assign(s, {
        code: null,
        source: 'import',
        sourceFileName: 'Rev7.XER',
        sourceFormat: 'xer',
      });
    });
    await openDetails('003', null, dataLayer, 'Update 1');
    expect(await screen.findByLabelText('Code')).toHaveValue('Rev7');
    expect(screen.getByText('Imported from Rev7.XER')).toBeInTheDocument();
  });

  it('offers the next free update number and shows a taken one under the field', async () => {
    const { user } = await openDetails('003', 'BL-01');
    await user.click(await screen.findByRole('button', { name: 'Use 3' }));
    const number = screen.getByLabelText('Update number');
    expect(number).toHaveValue('3');
    await user.clear(number);
    await user.type(number, '1');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(
      await screen.findByText('This update number is already used in this project.'),
    ).toBeInTheDocument();
  });

  it('explains what a baseline change does', async () => {
    const first = await openDetails('003', 'UP-01');
    await first.user.click(screen.getByRole('radio', { name: 'Primary baseline' }));
    expect(
      screen.getByText(
        'Comparisons against the primary baseline will use this schedule instead of Baseline.',
      ),
    ).toBeInTheDocument();
    first.unmount();
    const second = await openDetails('003', 'BL-01');
    await second.user.click(screen.getByRole('radio', { name: 'Not a baseline' }));
    expect(
      screen.getByText('The project will have no primary baseline until you choose one.'),
    ).toBeInTheDocument();
  });

  it('checks the fields and keeps the form open', async () => {
    const { user } = await openDetails('003', 'UP-02');
    const code = screen.getByLabelText('Code');
    const updateNumber = screen.getByLabelText('Update number');
    expect(updateNumber).toHaveValue('2');
    await user.clear(code);
    await user.type(code, 'up-01');
    await user.clear(updateNumber);
    await user.type(updateNumber, '0');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(
      await screen.findByText('This code is already used in this project'),
    ).toBeInTheDocument();
    expect(screen.getByText('Enter a whole number from 1 to 999')).toBeInTheDocument();
    await waitFor(() => expect(code).toHaveFocus());

    await user.clear(updateNumber);
    await user.type(updateNumber, '1.5');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Enter a whole number from 1 to 999')).toBeInTheDocument();
  });
});
