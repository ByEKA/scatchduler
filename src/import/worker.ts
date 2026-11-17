import { createParserSession } from './in-thread';
import type { WorkerRequest, WorkerResponse } from './protocol';

// The module worker (P3 core spec §5.3): routes each request to one parser session and answers
// with its id. `pack`'s bytes are transferred, not copied. `cancel` forgets the file, so later
// requests answer `no_file` until the next `inspect`; the client itself cancels by terminating
// the worker.

interface WorkerScope {
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null;
  postMessage(message: WorkerResponse, transfer?: Transferable[]): void;
}

const scope = self as unknown as WorkerScope;
let session = createParserSession();

function messageOf(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const { message } = error;
    if (typeof message === 'string' && message !== '') return message;
  }
  return 'failed';
}

async function answer(request: WorkerRequest): Promise<void> {
  const { id } = request;
  try {
    switch (request.type) {
      case 'inspect': {
        const result = await session.inspect(request.fileName, new Uint8Array(request.bytes));
        scope.postMessage({ id, ok: true, result });
        return;
      }
      case 'preview': {
        const result = await session.preview(request.table, request.encoding);
        scope.postMessage({ id, ok: true, result });
        return;
      }
      case 'analyze': {
        const result = await session.analyze(request.mapping, request.statusDate);
        scope.postMessage({ id, ok: true, result });
        return;
      }
      case 'pack': {
        const result = await session.pack(request.report);
        scope.postMessage({ id, ok: true, result }, [result.stored.buffer as ArrayBuffer]);
        return;
      }
      case 'cancel':
        session = createParserSession();
        scope.postMessage({ id, ok: true, result: null });
        return;
    }
  } catch (error) {
    scope.postMessage({ id, ok: false, issue: { message: messageOf(error) } });
  }
}

scope.onmessage = (event) => {
  void answer(event.data);
};
