import type {
  ImportMapping,
  ImportReport,
  ISODate,
  TableMapping,
  TextEncodingName,
} from '@/data/types';
import type { AnalyzeOutcome, InspectOutcome, PackResult, TablePreview } from './index';

// The messages between the import client and its module worker (P3 core spec §5.3). Each request
// carries an id that its response repeats. Results are plain JSON, except `pack`'s bytes, which
// the worker transfers; `inspect`'s bytes are transferred to the worker. This module holds types
// and constants only, so client.ts can import it without loading the parser.

export type WorkerRequest =
  | { id: number; type: 'inspect'; fileName: string; bytes: ArrayBuffer }
  | { id: number; type: 'preview'; table: TableMapping; encoding: TextEncodingName | null }
  | { id: number; type: 'analyze'; mapping: ImportMapping; statusDate: ISODate | null }
  | { id: number; type: 'pack'; report: ImportReport }
  | { id: number; type: 'cancel' };

export type WorkerResponse =
  { id: number; ok: true; result: unknown } | { id: number; ok: false; issue: { message: string } };

export type { InspectOutcome, AnalyzeOutcome, PackResult, TablePreview } from './index';

/** The parser's entry points around one file, whose bytes it holds between requests. */
export interface ParserSession {
  inspect(fileName: string, bytes: Uint8Array): Promise<InspectOutcome>;
  preview(table: TableMapping, encoding: TextEncodingName | null): Promise<TablePreview>;
  analyze(mapping: ImportMapping, statusDate: ISODate | null): Promise<AnalyzeOutcome>;
  pack(report: ImportReport): Promise<PackResult>;
}

/** The message a session rejects with when a request comes before any `inspect`. */
export const NO_FILE = 'no_file';
