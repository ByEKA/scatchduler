import { createEngineSession } from './in-thread';
import type { EngineRequest, EngineResponse } from './protocol';

interface WorkerScope {
  onmessage: ((event: MessageEvent<EngineRequest>) => void) | null;
  postMessage(message: EngineResponse): void;
}

const scope = self as unknown as WorkerScope;
const session = createEngineSession();

function messageOf(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const { message } = error;
    if (typeof message === 'string' && message !== '') return message;
  }
  return 'failed';
}

async function handle(request: EngineRequest): Promise<void> {
  const { id } = request;
  try {
    switch (request.op) {
      case 'solve': {
        const result = await session.solve(request.document, request.calculatedAt);
        scope.postMessage({ id, ok: true, op: 'solve', result });
        return;
      }
      case 'rollup': {
        const rollups = await session.rollup(request.document, request.summary);
        scope.postMessage({ id, ok: true, op: 'rollup', rollups });
        return;
      }
      case 'traceDrivingPath': {
        const path = await session.traceDrivingPath(request.activityId);
        scope.postMessage({ id, ok: true, op: 'traceDrivingPath', path });
        return;
      }
    }
  } catch (error) {
    scope.postMessage({ id, ok: false, message: messageOf(error) });
  }
}

scope.onmessage = (event) => {
  void handle(event.data);
};
