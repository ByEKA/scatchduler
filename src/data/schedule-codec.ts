import {
  SCHEDULE_DOCUMENT_SCHEMA_VERSION,
  type ScheduleDocument,
} from '@/data/schedule-types';
import type { ID } from '@/data/types';

export const SCHEDULE_DATA_BUCKET = 'schedule-data';
export const SCHEDULE_DATA_MIME = 'application/gzip';
export const MAX_SCHEDULE_DATA_BYTES = 20_971_520;

export type ScheduleCodecErrorCode = 'corrupt' | 'unsupported_version' | 'too_large';

export class ScheduleCodecError extends Error {
  readonly code: ScheduleCodecErrorCode;

  constructor(code: ScheduleCodecErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = 'ScheduleCodecError';
    this.code = code;
    if (cause !== undefined) this.cause = cause;
  }
}

/** Encodes a `ScheduleDocument` as UTF-8 JSON gzipped into a Blob (`application/gzip`). */
export async function encodeScheduleDocument(document: ScheduleDocument): Promise<Blob> {
  const { gzipSync } = await import('fflate');
  const utf8 = new TextEncoder().encode(JSON.stringify(document));
  const compressed = gzipSync(utf8);
  if (compressed.byteLength > MAX_SCHEDULE_DATA_BYTES) {
    throw new ScheduleCodecError('too_large', 'This schedule is too large to save.');
  }
  return new Blob([compressed.slice()], { type: SCHEDULE_DATA_MIME });
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Decodes a gzipped `ScheduleDocument` snapshot and validates its schemaVersion and top-level shape. */
export async function decodeScheduleDocument(data: Blob | Uint8Array): Promise<ScheduleDocument> {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(await data.arrayBuffer());
  let text: string;
  try {
    const { gunzipSync } = await import('fflate');
    const plain = gunzipSync(bytes);
    text = new TextDecoder('utf-8', { fatal: true }).decode(plain);
  } catch (error) {
    throw new ScheduleCodecError('corrupt', 'Could not read schedule data.', error);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new ScheduleCodecError('corrupt', 'Schedule data is not valid JSON.', error);
  }

  if (!isObject(parsed) || typeof parsed.schemaVersion !== 'number') {
    throw new ScheduleCodecError('corrupt', 'Schedule data has an unexpected format.');
  }
  if (parsed.schemaVersion !== SCHEDULE_DOCUMENT_SCHEMA_VERSION) {
    throw new ScheduleCodecError(
      'unsupported_version',
      `Unsupported schedule data version (${parsed.schemaVersion}).`,
    );
  }
  if (
    !isObject(parsed.settings) ||
    !Array.isArray(parsed.calendars) ||
    !Array.isArray(parsed.wbs) ||
    !Array.isArray(parsed.activities) ||
    !Array.isArray(parsed.relationships)
  ) {
    throw new ScheduleCodecError('corrupt', 'Schedule data is missing required sections.');
  }

  return parsed as unknown as ScheduleDocument;
}

/** Builds an R8-compliant `schedule-data` object path. */
export function scheduleDataPath(
  workspaceId: ID,
  projectId: ID,
  scheduleId: ID,
  uuid: string = crypto.randomUUID(),
): string {
  return `${workspaceId}/${projectId}/${scheduleId}/${uuid}.json.gz`;
}

/** Counts non-`wbs_summary` activities stored in a `ScheduleDocument` (spec §4.3 R6). */
export function countScheduleActivities(document: ScheduleDocument): number {
  let count = 0;
  for (const activity of document.activities) {
    if (activity.type !== 'wbs_summary') count++;
  }
  return count;
}
