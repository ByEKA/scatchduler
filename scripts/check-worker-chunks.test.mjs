// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { inspectWorkerChunks } from './check-worker-chunks.mjs';

describe('check-worker-chunks (V2)', () => {
  it('passes when an engine worker chunk has no parser libraries and ignores the main UI index chunk', () => {
    const chunks = [
      { name: 'index-main.js', code: 'SCHEDULE_CYCLE .xlsx' },
      { name: 'engine-worker-abc.js', code: 'self.onmessage=()=>{};' },
      { name: 'import-worker-def.js', code: '/* papaparse */' },
    ];
    expect(inspectWorkerChunks(chunks, { requireEngine: true })).toEqual({
      ok: true,
      engineChunks: ['engine-worker-abc.js'],
    });
  });

  it('fails when an engine worker chunk bundles a parser library', () => {
    const chunks = [{ name: 'worker-xyz.js', code: 'SCHEDULE_CYCLE fast-xml-parser' }];
    const result = inspectWorkerChunks(chunks, { requireEngine: true });
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('fast-xml-parser');
  });

  it('fails when requireEngine is true and no engine chunk exists', () => {
    expect(inspectWorkerChunks([], { requireEngine: true }).ok).toBe(false);
    expect(inspectWorkerChunks([], { requireEngine: false }).ok).toBe(true);
  });
});
