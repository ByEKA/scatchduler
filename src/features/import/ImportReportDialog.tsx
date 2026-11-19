import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { DialogShell } from '@/components/common/FormDialog';
import { SectionError } from '@/components/common/SectionError';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import type { ID } from '@/data/types';
import { useDialogs } from '@/features/dialogs/DialogsProvider';
import { ReportView } from '@/features/import/ReportView';
import { useImportReport } from '@/hooks/useImportReport';
import { useNow } from '@/hooks/useNow';
import { useProjectSchedules } from '@/hooks/useProjectSchedules';
import { relativeTime } from '@/lib/format';

const SKELETON_DELAY_MS = 300;

function LoadingShell({ onClose }: { onClose: () => void }): ReactElement | null {
  const [due, setDue] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setDue(true), SKELETON_DELAY_MS);
    return () => clearTimeout(timer);
  }, []);
  if (!due) return null;
  return (
    <DialogShell title="Import report" width="xl" onCloseRequest={onClose}>
      <div className="flex flex-col gap-4">
        <span className="sr-only">Loading import report…</span>
        <div aria-hidden="true" className="flex flex-col gap-4">
          <Skeleton className="h-24" />
          <Skeleton className="h-32" />
          <Skeleton className="h-24" />
        </div>
      </div>
    </DialogShell>
  );
}

/**
 * Stored "Import report" dialog (spec §6.4, D39): reads the schedule from `useProjectSchedules`
 * for its name and `createdAt`, and the stored report from `useImportReport`.
 */
export function ImportReportDialog({
  projectId,
  scheduleId,
}: {
  projectId: ID;
  scheduleId: ID;
}): ReactElement | null {
  const { closeDialog } = useDialogs();
  const now = useNow(60_000);
  const schedules = useProjectSchedules(projectId);
  const reportQuery = useImportReport(scheduleId);

  const schedule = schedules.data?.find((item) => item.id === scheduleId);
  const report = reportQuery.data;

  const ready = schedule !== undefined && report !== undefined && report !== null;
  const missing =
    (schedules.isSuccess && schedule === undefined) || (reportQuery.isSuccess && report === null);
  const failed = schedules.isError || reportQuery.isError || missing;

  function retry(): void {
    if (schedules.isError || schedule === undefined) void schedules.refetch();
    if (reportQuery.isError || report === null) void reportQuery.refetch();
  }

  if (!ready && !failed) {
    return <LoadingShell onClose={closeDialog} />;
  }

  return (
    <DialogShell
      title="Import report"
      description={
        ready
          ? `${report.file.name} · imported ${relativeTime(schedule.createdAt, now)}`
          : undefined
      }
      width="xl"
      onCloseRequest={closeDialog}
    >
      <div className="flex min-h-0 flex-1 flex-col gap-5">
        <div className="-mx-6 -my-1 flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 py-1">
          {ready ? (
            <ReportView report={report} scheduleName={schedule.name} mode="stored" />
          ) : (
            <SectionError
              error={reportQuery.error ?? schedules.error}
              onRetry={retry}
              className="py-6"
            />
          )}
        </div>
        <div className="flex shrink-0 justify-end">
          <Button type="button" variant="secondary" onClick={closeDialog}>
            Close
          </Button>
        </div>
      </div>
    </DialogShell>
  );
}
