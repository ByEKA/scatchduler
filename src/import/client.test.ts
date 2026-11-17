import { afterEach, describe, expect, it, vi } from 'vitest';
import xer from '@/import/__fixtures__/two-projects.xer?bytes';
import { createImportClient, TOO_SLOW, type WorkerLike } from '@/import/client';

function fakeWorker(answer: (request: { id: number; type: string }) => unknown | undefined) {
  const posted: Array<{ id: number; type: string }> = [];
  const worker: WorkerLike & { terminated: boolean } = {
    terminated: false,
    onmessage: null,
    postMessage(message) {
      const request = message as { id: number; type: string };
      posted.push(request);
      const result = answer(request);
      if (result !== undefined)
        queueMicrotask(() => worker.onmessage?.({ data: { id: request.id, ok: true, result } }));
    },
    terminate() {
      worker.terminated = true;
    },
  };
  return { worker, posted };
}
const file = new File([xer], 'north.xer');

describe('import client', () => {
  afterEach(() => vi.useRealTimers());

  it('matches answers to requests by id', async () => {
    const { worker, posted } = fakeWorker((r) => ({
      kind: 'refused',
      message: `answer ${r.id}`,
      fileName: 'x',
      size: 1,
    }));
    const client = createImportClient({ createWorker: () => worker });
    const [a, b] = await Promise.all([client.inspect(file), client.inspect(file)]);
    expect([a, b].map((o) => (o.kind === 'refused' ? o.message : ''))).toEqual(
      posted.map((r) => `answer ${r.id}`),
    );
    expect(new Set(posted.map((r) => r.id)).size).toBe(2);
  });

  it('terminates the worker and reports a request that runs past the watchdog', async () => {
    vi.useFakeTimers();
    const { worker } = fakeWorker(() => undefined);
    const client = createImportClient({ createWorker: () => worker, timeoutMs: 1000 });
    const pending = client.inspect(file);
    const check = expect(pending).rejects.toMatchObject({ code: 'timeout', message: TOO_SLOW });
    await vi.advanceTimersByTimeAsync(1001);
    await check;
    expect(worker.terminated).toBe(true);
    await expect(
      client.analyze({
        schemaVersion: 1,
        format: 'xer',
        encoding: 'utf-8',
        sourceProjectId: '101',
        activityCodeField: null,
        table: null,
      }),
    ).rejects.toMatchObject({ code: 'no_file' });
  });

  it('cancels pending requests and terminates the worker', async () => {
    const { worker } = fakeWorker(() => undefined);
    const client = createImportClient({ createWorker: () => worker });
    const pending = client.inspect(file);
    client.cancel();
    await expect(pending).rejects.toMatchObject({ code: 'cancelled' });
    expect(worker.terminated).toBe(true);
  });

  it('runs in the calling thread where Worker is missing', async () => {
    const client = createImportClient({ createWorker: () => null });
    const inspected = await client.inspect(file);
    expect(inspected).toMatchObject({ kind: 'schedule', format: 'xer' });
    if (inspected.kind !== 'schedule') return;
    const outcome = await client.analyze(inspected.mapping);
    expect(outcome.kind).toBe('analyzed');
    if (outcome.kind !== 'analyzed') return;
    const packed = await client.pack(outcome.report);
    expect(packed.stored.type).toBe('application/gzip');
  });
});
