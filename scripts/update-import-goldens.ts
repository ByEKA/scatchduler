// Writes the parser's goldens (P3 core spec S4, §5.8): for every case in
// src/import/__fixtures__/cases.ts, <name>.report.json (the report without durationMs and
// parserVersion) and <name>.model.json, formatted with the repository's Prettier settings so
// `npm run format` leaves them as they are. Run with `npm run goldens`, then read every change:
// a golden is a pinned decision, not a recording, and a changed model raises PARSER_VERSION.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { format, resolveConfig } from 'prettier';
import { GOLDEN_CASES } from '../src/import/__fixtures__/cases';
import { analyze } from '../src/import/index';

const FIXTURES = new URL('../src/import/__fixtures__/', import.meta.url);

async function writeJson(fileName: string, value: unknown): Promise<void> {
  const url = new URL(fileName, FIXTURES);
  const path = fileURLToPath(url);
  const options = (await resolveConfig(path)) ?? {};
  writeFileSync(url, await format(JSON.stringify(value), { ...options, filepath: path }));
}

for (const golden of GOLDEN_CASES) {
  const bytes = new Uint8Array(readFileSync(new URL(golden.file, FIXTURES)));
  const outcome = await analyze(bytes, golden.file, golden.mapping);
  if (outcome.kind !== 'analyzed') throw new Error(`${golden.name}: ${outcome.message}`);
  const report: Partial<typeof outcome.report> = { ...outcome.report };
  delete report.durationMs;
  delete report.parserVersion;
  await writeJson(`${golden.name}.report.json`, report);
  await writeJson(`${golden.name}.model.json`, outcome.model);
  const errors = outcome.report.issueTotals.error;
  console.log(`${golden.name}: ${errors === 0 ? 'no errors' : `${errors} errors`}`);
}
