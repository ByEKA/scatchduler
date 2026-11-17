import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { RepositoryError } from '@/data/errors';
import {
  useDownloadImportReport,
  useDownloadSourceFile,
  useImportReport,
} from '@/hooks/useImportReport';
import { saveFile } from '@/lib/download';
import { createTestDataLayer, makeImportScheduleInput } from '@/test/fakes';
import { createQueryWrapper } from '@/test/render';

vi.mock('@/lib/download', () => ({ saveFile: vi.fn() }));
const toastError = vi.hoisted(() => vi.fn());
vi.mock('sonner', async (original) => ({
  ...(await original<typeof import('sonner')>()),
  toast: { error: toastError, success: vi.fn() },
}));

async function imported() {
  const dl = createTestDataLayer();
  const metro = dl.store.read().projects.find((p) => p.code === '002')!;
  const schedule = await dl.repository.importSchedule(await makeImportScheduleInput(metro.id));
  return { dl, schedule };
}

describe('import report hooks', () => {
  it('reads a stored report once', async () => {
    const { dl, schedule } = await imported();
    const read = vi.spyOn(dl.repository, 'getImportReport');
    const wrapper = createQueryWrapper(dl);
    const first = renderHook(() => useImportReport(schedule.id), { wrapper });
    await waitFor(() => expect(first.result.current.data?.format).toBe('xer'));
    const second = renderHook(() => useImportReport(schedule.id), { wrapper });
    expect(second.result.current.data?.format).toBe('xer');
    expect(read).toHaveBeenCalledOnce();
  });

  it('saves the report as CSV and JSON under its file name, and toasts a failure', async () => {
    const { dl, schedule } = await imported();
    const report = (await dl.repository.getImportReport(schedule.id))!;
    const { result } = renderHook(() => useDownloadImportReport(), {
      wrapper: createQueryWrapper(dl),
    });
    await act(() =>
      result.current.mutateAsync({ report, scheduleName: 'North Plant', format: 'csv' }),
    );
    await act(() =>
      result.current.mutateAsync({ report, scheduleName: 'North Plant', format: 'json' }),
    );
    expect(vi.mocked(saveFile).mock.calls.map(([blob, name]) => [blob.type, name])).toEqual([
      ['text/csv;charset=utf-8', 'North Plant - import report.csv'],
      ['application/json', 'North Plant - import report.json'],
    ]);
    vi.mocked(saveFile).mockImplementationOnce(() => {
      throw new Error('blocked');
    });
    await act(() =>
      result.current
        .mutateAsync({ report, scheduleName: 'North Plant', format: 'csv' })
        .catch(() => undefined),
    );
    expect(toastError).toHaveBeenCalledWith("The report couldn't be downloaded. Try again.");
  });

  it('saves the original under its name, and toasts why it cannot', async () => {
    const { dl, schedule } = await imported();
    const { result } = renderHook(() => useDownloadSourceFile(), {
      wrapper: createQueryWrapper(dl),
    });
    await act(() => result.current.mutateAsync(schedule.id));
    expect(vi.mocked(saveFile).mock.calls.at(-1)![1]).toBe('two-projects.xer');
    dl.repository.getScheduleSourceFile = () =>
      Promise.reject(new RepositoryError('validation', 'This schedule has no original file.'));
    await act(() => result.current.mutateAsync(schedule.id).catch(() => undefined));
    expect(toastError).toHaveBeenCalledWith('This schedule has no original file.');
  });
});
