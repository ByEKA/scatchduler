import type {
  ComputedScheduleSummary,
  ComputedWbsRollup,
  DrivingPath,
  ScheduleDocument,
  SolveResult,
} from '@/data/schedule-types';
import type { ISODate, ISODateTime } from '@/data/types';
import type { ImportModel } from './materialize';
import type {
  EngineRequest,
  EngineResponse,
  EngineSession,
  MaterializeOptions,
} from './protocol';

export type { EngineRequest, EngineResponse, EngineSession, MaterializeOptions } from './protocol';

export const ENGINE_WATCHDOG_MS = 15_000;
const TIMEOUT_MESSAGE = 'Schedule calculation timed out. Try again.';

export type EngineClientErrorCode = 'timeout' | 'cancelled' | 'failed' | 'disposed';

export class EngineClientError extends Error {
  readonly code: EngineClientErrorCode;
  constructor(code: EngineClientErrorCode, message: string = code) {
    super(message);
    this.name = 'EngineClientError';
    this.code = code;
  }
}

export interface WorkerLike {
  postMessage(message: unknown): void;
  terminate(): void;
  onmessage: ((event: { data: unknown }) => void) | null;
  onerror?: ((event: unknown) => void) | null;
  onmessageerror?: ((event: unknown) => void) | null;
}

export interface EngineClient {
  solve(document: ScheduleDocument, options: { calculatedAt: ISODateTime }): Promise<SolveResult>;
  rollup(
    document: ScheduleDocument,
    summary: ComputedScheduleSummary | null,
  ): Promise<Record<string, ComputedWbsRollup>>;
  traceDrivingPath(activityId: string): Promise<DrivingPath>;
  cancel(): void;
  dispose(): void;
}

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

function createModuleWorker(): WorkerLike | null {
  if (typeof Worker === 'undefined') return null;
  const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  return worker as unknown as WorkerLike;
}

type WithoutId<T> = T extends unknown ? Omit<T, 'id'> : never;
type Outgoing = WithoutId<EngineRequest>;

type Transport =
  | { kind: 'worker'; worker: WorkerLike }
  | { kind: 'thread'; session: Promise<EngineSession> };

interface Pending {
  resolve(value: unknown): void;
  reject(error: EngineClientError): void;
}

function messageOf(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const { message } = error;
    if (typeof message === 'string' && message !== '') return message;
  }
  return 'failed';
}

function runInThread(session: EngineSession, request: Outgoing): Promise<unknown> {
  switch (request.op) {
    case 'solve':
      return session.solve(request.document, request.calculatedAt);
    case 'rollup':
      return session.rollup(request.document, request.summary);
    case 'traceDrivingPath':
      return session.traceDrivingPath(request.activityId);
  }
}

function extractWorkerResult(response: Extract<EngineResponse, { ok: true }>): unknown {
  switch (response.op) {
    case 'solve':
      return response.result;
    case 'rollup':
      return response.rollups;
    case 'traceDrivingPath':
      return response.path;
  }
}

export function createEngineClient(
  options: { createWorker?: () => WorkerLike | null; watchdogMs?: number } = {},
): EngineClient {
  const createWorker = options.createWorker ?? createModuleWorker;
  const watchdogMs = options.watchdogMs ?? ENGINE_WATCHDOG_MS;
  let transport: Transport | null = null;
  let disposed = false;
  let lastId = 0;
  const pending = new Map<number, Pending>();
  let watchdog: { id: number; timer: ReturnType<typeof setTimeout> } | null = null;

  function watch(): void {
    if (transport?.kind !== 'worker') return;
    const oldest = pending.keys().next();
    if (watchdog !== null && !oldest.done && watchdog.id === oldest.value) return;
    if (watchdog !== null) clearTimeout(watchdog.timer);
    watchdog = oldest.done
      ? null
      : { id: oldest.value, timer: setTimeout(() => close('timeout'), watchdogMs) };
  }

  function close(reason: 'timeout' | 'cancelled' | 'failed', message?: string): void {
    if (watchdog !== null) clearTimeout(watchdog.timer);
    watchdog = null;
    if (transport?.kind === 'worker') {
      transport.worker.onmessage = null;
      transport.worker.onerror = null;
      transport.worker.onmessageerror = null;
      transport.worker.terminate();
    }
    transport = null;
    const open = [...pending.values()];
    pending.clear();
    for (const req of open) {
      if (reason === 'timeout') {
        req.reject(new EngineClientError('timeout', TIMEOUT_MESSAGE));
      } else if (reason === 'failed') {
        req.reject(new EngineClientError('failed', message ?? 'failed'));
      } else {
        req.reject(new EngineClientError('cancelled'));
      }
    }
  }

  function settle(
    id: number,
    outcome: { ok: true; value: unknown } | { ok: false; message: string },
  ): void {
    const req = pending.get(id);
    if (req === undefined) return;
    pending.delete(id);
    watch();
    if (outcome.ok) req.resolve(outcome.value);
    else req.reject(new EngineClientError('failed', outcome.message));
  }

  function receive(data: unknown): void {
    if (typeof data !== 'object' || data === null || !('id' in data) || !('ok' in data)) return;
    const response = data as EngineResponse;
    if (typeof response.id !== 'number') return;
    if (response.ok) {
      settle(response.id, { ok: true, value: extractWorkerResult(response) });
    } else {
      settle(response.id, { ok: false, message: response.message || 'failed' });
    }
  }

  function ensureTransport(): Transport {
    if (transport !== null) return transport;
    let worker: WorkerLike | null;
    try {
      worker = createWorker();
    } catch (error) {
      throw new EngineClientError('failed', messageOf(error));
    }
    if (worker === null) {
      transport = {
        kind: 'thread',
        session: import('./in-thread').then((m) => m.createEngineSession()),
      };
      return transport;
    }
    worker.onmessage = (event) => receive(event.data);
    worker.onerror = (event) => close('failed', messageOf(event));
    worker.onmessageerror = () => close('failed');
    transport = { kind: 'worker', worker };
    return transport;
  }

  function send(request: Outgoing): Promise<unknown> {
    if (disposed) return Promise.reject(new EngineClientError('disposed'));
    let target: Transport;
    try {
      target = ensureTransport();
    } catch (error) {
      return Promise.reject(
        error instanceof EngineClientError
          ? error
          : new EngineClientError('failed', messageOf(error)),
      );
    }
    lastId += 1;
    const id = lastId;
    const promise = new Promise<unknown>((resolve, reject) => {
      pending.set(id, { resolve, reject });
    });
    watch();

    if (target.kind === 'worker') {
      target.worker.postMessage({ ...request, id });
      return promise;
    }
    void target.session
      .then((session) => runInThread(session, request))
      .then(
        (value) => settle(id, { ok: true, value }),
        (error: unknown) => settle(id, { ok: false, message: messageOf(error) }),
      );
    return promise;
  }

  return {
    async solve(document, solveOptions) {
      return (await send({
        op: 'solve',
        document,
        calculatedAt: solveOptions.calculatedAt,
      })) as SolveResult;
    },
    async rollup(document, summary) {
      return (await send({ op: 'rollup', document, summary })) as Record<
        string,
        ComputedWbsRollup
      >;
    },
    async traceDrivingPath(activityId) {
      return (await send({ op: 'traceDrivingPath', activityId })) as DrivingPath;
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
