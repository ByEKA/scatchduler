import type {
  ImportMapping,
  ImportReport,
  ISODate,
  TableMapping,
  TextEncodingName,
} from '@/data/types';
import {
  NO_FILE,
  type AnalyzeOutcome,
  type InspectOutcome,
  type PackResult,
  type ParserSession,
  type TablePreview,
  type WorkerRequest,
} from './protocol';

// The import parser's client (P3 core spec §5.3): the File, Columns and Review steps call it
// through `useImportParser`. It runs the parser in a module worker that keeps the file between
// requests, terminates that worker when a request stays open past the watchdog or on `cancel`,
// and runs the same session in the calling thread where `Worker` is missing (jsdom). Only
// `./protocol` is imported statically, so the parser loads with the worker or with `import()`.

export type { AnalyzeOutcome, InspectOutcome, TablePreview } from './protocol';

export const WATCHDOG_MS = 30_000;
export const TOO_SLOW = 'This file took too long to read. Try a smaller export.';

export type ImportClientErrorCode = 'timeout' | 'cancelled' | 'no_file' | 'failed';

export class ImportClientError extends Error {
  readonly code: ImportClientErrorCode;
  constructor(code: ImportClientErrorCode, message: string = code) {
    super(message);
    this.name = 'ImportClientError';
    this.code = code;
  }
}

export interface WorkerLike {
  postMessage(message: unknown, transfer?: Transferable[]): void;
  terminate(): void;
  onmessage: ((event: { data: unknown }) => void) | null;
}

export interface ImportClient {
  inspect(file: File): Promise<InspectOutcome>;
  preview(table: TableMapping, encoding: TextEncodingName | null): Promise<TablePreview>;
  analyze(
    mapping: ImportMapping,
    options?: { statusDate?: ISODate | null },
  ): Promise<AnalyzeOutcome>;
  pack(report: ImportReport): Promise<{ stored: Blob; report: ImportReport }>;
  /** Rejects every pending request with `cancelled` and terminates the worker. */
  cancel(): void;
  /** Cancels, and refuses further requests. */
  dispose(): void;
}

const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function createModuleWorker(): WorkerLike | null {
  if (typeof Worker === 'undefined') return null;
  const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  // A Worker's `onmessage` takes a MessageEvent, which carries the `data` the client reads.
  return worker as unknown as WorkerLike;
}

/** A request without its id, which the client assigns. */
type WithoutId<T> = T extends unknown ? Omit<T, 'id'> : never;
type Outgoing = WithoutId<WorkerRequest>;

/** Where requests run: a worker, or a session in this thread; `null` before any `inspect`. */
type Transport =
  { kind: 'worker'; worker: WorkerLike } | { kind: 'thread'; session: Promise<ParserSession> };

interface Pending {
  resolve(result: unknown): void;
  reject(error: ImportClientError): void;
}

function messageOf(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const { message } = error;
    if (typeof message === 'string' && message !== '') return message;
  }
  return 'failed';
}

function failure(message: string): ImportClientError {
  return message === NO_FILE
    ? new ImportClientError('no_file')
    : new ImportClientError('failed', message);
}

function threadRun(session: ParserSession, request: Outgoing): Promise<unknown> {
  switch (request.type) {
    case 'inspect':
      return session.inspect(request.fileName, new Uint8Array(request.bytes));
    case 'preview':
      return session.preview(request.table, request.encoding);
    case 'analyze':
      return session.analyze(request.mapping, request.statusDate);
    case 'pack':
      return session.pack(request.report);
    case 'cancel':
      return Promise.resolve(null);
  }
}

function asBlobPart(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  return bytes.buffer instanceof ArrayBuffer ? (bytes as Uint8Array<ArrayBuffer>) : bytes.slice();
}

export function createImportClient(
  options: { createWorker?: () => WorkerLike | null; timeoutMs?: number } = {},
): ImportClient {
  const createWorker = options.createWorker ?? createModuleWorker;
  const timeoutMs = options.timeoutMs ?? WATCHDOG_MS;
  let transport: Transport | null = null;
  let disposed = false;
  let lastId = 0;
  // Open requests, oldest first (a Map keeps insertion order).
  const pending = new Map<number, Pending>();
  // Requests are posted in id order, each once its payload (a file's bytes) is ready.
  let outbox: Promise<void> = Promise.resolve();
  // The watchdog times the oldest open request, from when it became the oldest, so a request
  // waiting behind others in the worker isn't charged for their time.
  let watchdog: { id: number; timer: ReturnType<typeof setTimeout> } | null = null;

  function watch(): void {
    if (transport?.kind !== 'worker') return;
    const oldest = pending.keys().next();
    if (watchdog !== null && !oldest.done && watchdog.id === oldest.value) return;
    if (watchdog !== null) clearTimeout(watchdog.timer);
    watchdog = oldest.done
      ? null
      : { id: oldest.value, timer: setTimeout(() => close('timeout'), timeoutMs) };
  }

  /** Ends the transport: the worker is terminated and every open request rejected. */
  function close(reason: 'timeout' | 'cancelled'): void {
    if (watchdog !== null) clearTimeout(watchdog.timer);
    watchdog = null;
    if (transport?.kind === 'worker') {
      transport.worker.onmessage = null;
      transport.worker.terminate();
    }
    transport = null;
    const open = [...pending.values()];
    pending.clear();
    for (const request of open) {
      request.reject(
        reason === 'timeout'
          ? new ImportClientError('timeout', TOO_SLOW)
          : new ImportClientError('cancelled'),
      );
    }
  }

  function settle(
    id: number,
    outcome: { ok: true; result: unknown } | { ok: false; message: string },
  ) {
    const request = pending.get(id);
    if (request === undefined) return; // cancelled, timed out or never sent
    pending.delete(id);
    watch();
    if (outcome.ok) request.resolve(outcome.result);
    else request.reject(failure(outcome.message));
  }

  function receive(data: unknown): void {
    if (typeof data !== 'object' || data === null || !('id' in data) || !('ok' in data)) return;
    const { id } = data;
    if (typeof id !== 'number') return;
    if (data.ok === true) {
      settle(id, { ok: true, result: 'result' in data ? data.result : undefined });
    } else {
      const issue = 'issue' in data ? data.issue : undefined;
      settle(id, { ok: false, message: messageOf(issue) });
    }
  }

  function open(): Transport {
    const worker = createWorker();
    if (worker === null) {
      return {
        kind: 'thread',
        session: import('./in-thread').then((m) => m.createParserSession()),
      };
    }
    worker.onmessage = (event) => receive(event.data);
    return { kind: 'worker', worker };
  }

  /**
   * Sends a request: `inspect` opens a transport when none is open, any other request needs one.
   * `payload` resolves to the request and the buffers to transfer with it.
   */
  function send(
    type: Outgoing['type'],
    payload: () => Promise<{ request: Outgoing; transfer: Transferable[] }>,
  ): Promise<unknown> {
    if (disposed) return Promise.reject(new ImportClientError('cancelled'));
    if (transport === null) {
      if (type !== 'inspect') return Promise.reject(new ImportClientError('no_file'));
      transport = open();
    }
    const target = transport;
    lastId += 1;
    const id = lastId;
    const answered = new Promise<unknown>((resolve, reject) => {
      pending.set(id, { resolve, reject });
    });
    watch();
    const ready = payload();
    outbox = outbox.then(async () => {
      let message: { request: Outgoing; transfer: Transferable[] };
      try {
        message = await ready;
      } catch (error) {
        settle(id, { ok: false, message: messageOf(error) });
        return;
      }
      if (!pending.has(id) || transport !== target) return;
      if (target.kind === 'worker') {
        target.worker.postMessage({ ...message.request, id }, message.transfer);
        return;
      }
      void target.session
        .then((session) => threadRun(session, message.request))
        .then(
          (result) => settle(id, { ok: true, result }),
          (error: unknown) => settle(id, { ok: false, message: messageOf(error) }),
        );
    });
    return answered;
  }

  const immediate = (request: Outgoing) => () => Promise.resolve({ request, transfer: [] });

  return {
    async inspect(file) {
      const result = await send('inspect', async () => {
        const bytes = await file.arrayBuffer();
        return { request: { type: 'inspect', fileName: file.name, bytes }, transfer: [bytes] };
      });
      return result as InspectOutcome;
    },
    async preview(table, encoding) {
      return (await send(
        'preview',
        immediate({ type: 'preview', table, encoding }),
      )) as TablePreview;
    },
    async analyze(mapping, analyzeOptions = {}) {
      const statusDate = analyzeOptions.statusDate ?? null;
      return (await send(
        'analyze',
        immediate({ type: 'analyze', mapping, statusDate }),
      )) as AnalyzeOutcome;
    },
    async pack(report) {
      const packed = (await send('pack', immediate({ type: 'pack', report }))) as PackResult;
      const type = packed.report.format === 'xlsx' ? XLSX_TYPE : 'application/gzip';
      return { stored: new Blob([asBlobPart(packed.stored)], { type }), report: packed.report };
    },
    cancel() {
      close('cancelled');
    },
    dispose() {
      disposed = true;
      close('cancelled');
    },
  };
}
