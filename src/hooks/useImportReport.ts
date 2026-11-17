import {
  skipToken,
  useMutation,
  useQuery,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import { toast } from 'sonner';
import { useRepository } from '@/data/DataLayerProvider';
import type { ID, ImportReport } from '@/data/types';
import { queryKeys } from '@/hooks/query-keys';
import { saveFile } from '@/lib/download';
import { errorMessage } from '@/lib/format';

// The stored import report and the two downloads (P3 core spec §4.4, §5.9, D28).

const REPORT_DOWNLOAD_FAILED = "The report couldn't be downloaded. Try again.";

/**
 * The schedule's stored import report, `null` for blank schedules and imports without one; idle
 * until `scheduleId` is set. A stored report never changes in the core, so it is read once.
 */
export function useImportReport(scheduleId: ID | undefined): UseQueryResult<ImportReport | null> {
  const repository = useRepository();
  return useQuery({
    queryKey: queryKeys.importReport(scheduleId),
    queryFn: scheduleId === undefined ? skipToken : () => repository.getImportReport(scheduleId),
    staleTime: Infinity,
  });
}

/** Saves the schedule's original file under its original name; a failure toasts why. */
export function useDownloadSourceFile(): UseMutationResult<void, Error, ID> {
  const repository = useRepository();
  return useMutation({
    mutationFn: async (scheduleId: ID) => {
      const file = await repository.getScheduleSourceFile(scheduleId);
      saveFile(file, file.name);
    },
    onError: (error) => {
      toast.error(errorMessage(error));
    },
  });
}

export interface DownloadImportReportInput {
  report: ImportReport;
  scheduleName: string;
  format: 'csv' | 'json';
}

/**
 * Saves a report as "{schedule name} - import report.csv" (one row per issue) or ".json" (the
 * report object). The CSV builder loads with `import()`, so it stays out of the main chunk (§3).
 */
export function useDownloadImportReport(): UseMutationResult<
  void,
  Error,
  DownloadImportReportInput
> {
  return useMutation({
    mutationFn: async ({ report, scheduleName, format }: DownloadImportReportInput) => {
      const { reportFileName, reportToCsv } = await import('@/import/csv-export');
      const blob =
        format === 'csv'
          ? new Blob([reportToCsv(report)], { type: 'text/csv;charset=utf-8' })
          : new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
      saveFile(blob, reportFileName(scheduleName, format));
    },
    onError: () => {
      toast.error(REPORT_DOWNLOAD_FAILED);
    },
  });
}
