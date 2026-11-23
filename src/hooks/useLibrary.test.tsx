import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useLibraryData } from '@/hooks/useLibrary';
import { useCreateSchedule } from '@/hooks/useSchedules';
import { createTestDataLayer } from '@/test/fakes';
import { createQueryWrapper } from '@/test/render';

describe('useLibraryData', () => {
  it('loads cross-workspace library data and refreshes when a schedule is created', async () => {
    const dataLayer = createTestDataLayer();
    const db = dataLayer.store.read();
    const riversideId = db.projects.find((p) => p.code === '001')!.id;
    const wrapper = createQueryWrapper(dataLayer);

    const libraryHook = renderHook(() => useLibraryData(), { wrapper });
    const createScheduleHook = renderHook(() => useCreateSchedule(), { wrapper });

    await waitFor(() => expect(libraryHook.result.current.data?.schedules).toHaveLength(10));
    expect(libraryHook.result.current.data?.workspaces).toHaveLength(2);
    expect(libraryHook.result.current.data?.projects).toHaveLength(7);
    expect(libraryHook.result.current.data?.sharedWithMe).toHaveLength(2);

    await createScheduleHook.result.current.mutateAsync({
      projectId: riversideId,
      name: 'Look-ahead W43',
      code: 'LA-43',
    });

    await waitFor(() => expect(libraryHook.result.current.data?.schedules).toHaveLength(11));
  });
});
