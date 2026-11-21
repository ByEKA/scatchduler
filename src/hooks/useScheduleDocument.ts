import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
} from '@tanstack/react-query';
import { useRepository } from '@/data/DataLayerProvider';
import type { DataRepository, SaveScheduleDocumentInput } from '@/data/repository';
import type { ScheduleDocument } from '@/data/schedule-types';
import type { Role, Schedule } from '@/data/types';
import { createBlankScheduleDocument, materializeImportModel } from '@/engine/client';
import { queryKeys } from '@/hooks/query-keys';
import { createImportClient } from '@/import/client';

export type ScheduleDocumentState =
  | { status: 'loading' }
  | { status: 'materializing' }
  | { status: 'ready'; document: ScheduleDocument; dataRevision: number; persisted: boolean }
  | { status: 'needs_editor' }
  | { status: 'legacy_import' }
  | { status: 'error'; error: unknown };

async function parseAndMaterializeImport(
  repository: DataRepository,
  schedule: Schedule,
): Promise<ScheduleDocument> {
  const [sourceFile, mapping] = await Promise.all([
    repository.getScheduleSourceFile(schedule.id),
    repository.getImportMapping(schedule.id),
  ]);
  if (mapping === null) {
    throw new Error('Import mapping is unavailable for this schedule.');
  }
  const client = createImportClient();
  try {
    const inspected = await client.inspect(sourceFile);
    if (inspected.kind === 'refused') {
      throw new Error(inspected.message);
    }
    const analyzed = await client.analyze(mapping, { statusDate: schedule.statusDate });
    if (analyzed.kind === 'refused') {
      throw new Error(analyzed.message);
    }
    return await materializeImportModel(analyzed.model, {
      scheduleStatusDate: schedule.statusDate,
    });
  } finally {
    client.dispose();
  }
}

/**
 * Loads or materializes a schedule's `ScheduleDocument` according to its state and caller role
 * (P4 spec §4.2, §7.2):
 * - Materialized schedule → fetches gzipped snapshot from `schedule-data`
 * - Unmaterialized blank schedule → builds in-memory blank document (rev 0)
 * - P2-era import without mapping → `'legacy_import'`
 * - P3-era import without snapshot: `'needs_editor'` for share recipients, in-memory parse for
 *   viewers (zero DB writes), auto-materialize + persist for editors/owners.
 */
export function useScheduleDocument(
  schedule: Schedule | undefined,
  role: Role | 'share',
): ScheduleDocumentState {
  const repository = useRepository();
  const queryClient = useQueryClient();

  const isMaterialized = schedule?.hasScheduleData === true;
  const isUnmaterializedBlank =
    schedule !== undefined && !schedule.hasScheduleData && schedule.source === 'blank';
  const isLegacyImport =
    schedule !== undefined &&
    !schedule.hasScheduleData &&
    schedule.source === 'import' &&
    !schedule.hasImportMapping;
  const isP3Import =
    schedule !== undefined &&
    !schedule.hasScheduleData &&
    schedule.source === 'import' &&
    schedule.hasImportMapping;
  const shouldPersistImport = isP3Import && (role === 'editor' || role === 'owner');
  const shouldPrepare =
    isUnmaterializedBlank || (isP3Import && role !== 'share');

  const persistedQuery = useQuery({
    queryKey: queryKeys.scheduleDocument(schedule?.id, schedule?.dataRevision),
    enabled: isMaterialized,
    queryFn: async () => {
      const result = await repository.getScheduleDocument(schedule!.id);
      if (result.document === null) {
        throw new Error('Schedule snapshot could not be loaded.');
      }
      return { document: result.document, dataRevision: result.dataRevision };
    },
  });

  const prepareQuery = useQuery({
    queryKey: [
      'schedule-document-prepare',
      schedule?.id,
      role,
      schedule?.source,
      schedule?.statusDate,
    ] as const,
    enabled: shouldPrepare,
    retry: false,
    staleTime: Infinity,
    queryFn: async (): Promise<{
      document: ScheduleDocument;
      dataRevision: number;
      persisted: boolean;
    }> => {
      const current = schedule!;
      if (current.source === 'blank') {
        const document = await createBlankScheduleDocument(current.statusDate);
        return { document, dataRevision: 0, persisted: false };
      }
      const document = await parseAndMaterializeImport(repository, current);
      if (role === 'editor' || role === 'owner') {
        const { dataRevision } = await repository.materializeScheduleDocument({
          scheduleId: current.id,
          document,
        });
        queryClient.setQueryData(queryKeys.scheduleDocument(current.id, dataRevision), {
          document,
          dataRevision,
        });
        void queryClient.invalidateQueries({ queryKey: queryKeys.schedules(current.projectId) });
        void queryClient.invalidateQueries({ queryKey: queryKeys.allProjects() });
        return { document, dataRevision, persisted: true };
      }
      return { document, dataRevision: 0, persisted: false };
    },
  });

  if (schedule === undefined) return { status: 'loading' };
  if (isLegacyImport) return { status: 'legacy_import' };
  if (isP3Import && role === 'share') return { status: 'needs_editor' };

  if (isMaterialized) {
    if (persistedQuery.isPending) return { status: 'loading' };
    if (persistedQuery.isError) return { status: 'error', error: persistedQuery.error };
    return {
      status: 'ready',
      document: persistedQuery.data.document,
      dataRevision: persistedQuery.data.dataRevision,
      persisted: true,
    };
  }

  if (prepareQuery.isPending) {
    return shouldPersistImport ? { status: 'materializing' } : { status: 'loading' };
  }
  if (prepareQuery.isError) {
    return { status: 'error', error: prepareQuery.error };
  }
  return {
    status: 'ready',
    document: prepareQuery.data.document,
    dataRevision: prepareQuery.data.dataRevision,
    persisted: prepareQuery.data.persisted,
  };
}

/** Saves an updated `ScheduleDocument` snapshot with lock and revision guards (R5–R9). */
export function useSaveScheduleDocument(): UseMutationResult<
  { schedule: Schedule; dataRevision: number },
  Error,
  SaveScheduleDocumentInput
> {
  const repository = useRepository();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: SaveScheduleDocumentInput) => repository.saveScheduleDocument(input),
    onSuccess: (result, input) => {
      queryClient.setQueryData(queryKeys.scheduleDocument(input.scheduleId, result.dataRevision), {
        document: input.document,
        dataRevision: result.dataRevision,
      });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.schedules(result.schedule.projectId),
      });
      void queryClient.invalidateQueries({ queryKey: queryKeys.allProjects() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.sharedWithMe() });
    },
    onError: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.allSchedules() });
    },
  });
}
