import type { ScheduleDocument } from '@/data/schedule-types';
import type { ISODate } from '@/data/types';
import type { ImportModel } from './materialize';
import type { MaterializeOptions } from './protocol';

export type { EngineRequest, EngineResponse, MaterializeOptions } from './protocol';

/**
 * Lazy-loads `./materialize` so `client.ts` stays lightweight and statically imports only
 * `./protocol` and types (spec §3, S7).
 */
export async function materializeImportModel(
  model: ImportModel,
  options: MaterializeOptions,
): Promise<ScheduleDocument> {
  const { fromImportModel } = await import('./materialize');
  return fromImportModel(model, options);
}

/** Lazy-loads `./materialize` to construct a blank calculated `ScheduleDocument`. */
export async function createBlankScheduleDocument(
  statusDate: ISODate | null,
): Promise<ScheduleDocument> {
  const { createBlankDocument } = await import('./materialize');
  return createBlankDocument(statusDate);
}
