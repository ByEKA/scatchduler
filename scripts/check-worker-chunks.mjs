// Verifies the CPM engine builds as its own worker chunk without parser libraries (Phase 4 V2).
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isMainModule } from './is-main-module.mjs';

const FORBIDDEN_MARKERS = [
  { name: 'fast-xml-parser', pattern: /fast-xml-parser/i },
  { name: 'papaparse', pattern: /papaparse/i },
  { name: 'xlsx', pattern: /SheetJS|xlsx/i },
];

function isEngineChunk(chunk) {
  if (/engine.*worker/i.test(chunk.name)) return true;
  if (
    /(?:worker|in-thread)/i.test(chunk.name) &&
    /SCHEDULE_CYCLE/.test(chunk.code) &&
    !/ERMHDR/.test(chunk.code)
  ) {
    return true;
  }
  return false;
}

export function inspectWorkerChunks(chunks, { requireEngine = false } = {}) {
  const engineChunks = chunks.filter(isEngineChunk);
  if (requireEngine && engineChunks.length === 0) {
    return { ok: false, engineChunks: [], reason: 'No engine worker chunk found in build output.' };
  }
  for (const chunk of engineChunks) {
    for (const marker of FORBIDDEN_MARKERS) {
      if (marker.pattern.test(chunk.code)) {
        return {
          ok: false,
          engineChunks: engineChunks.map((c) => c.name),
          reason: `Engine chunk ${chunk.name} contains parser library marker ${marker.name}.`,
        };
      }
    }
  }
  return { ok: true, engineChunks: engineChunks.map((c) => c.name) };
}

if (isMainModule(import.meta.url)) {
  const args = process.argv.slice(2);
  const requireEngine = args.includes('--require-engine');
  const outDir = args.find((arg) => !arg.startsWith('--')) ?? 'dist';
  const assetsDir = join(process.cwd(), outDir, 'assets');
  const chunks = readdirSync(assetsDir)
    .filter((name) => name.endsWith('.js'))
    .map((name) => ({ name, code: readFileSync(join(assetsDir, name), 'utf8') }));
  const result = inspectWorkerChunks(chunks, { requireEngine });
  if (!result.ok) {
    console.error(`Worker chunk check failed: ${result.reason}`);
    process.exitCode = 1;
  } else {
    console.log(
      result.engineChunks.length > 0
        ? `Worker chunks OK: ${result.engineChunks.join(', ')}`
        : 'Worker chunks OK: no engine worker chunk yet',
    );
  }
}
