import { describe, expect, it } from 'vitest';
import { GOLDEN_CASES } from '@/import/__fixtures__/cases';
import { analyze } from '@/import/index';
import type { ImportReport } from '@/data/types';

const files = import.meta.glob<Uint8Array>('./__fixtures__/*.{xer,xml,csv,xlsx}', {
  query: '?bytes',
  import: 'default',
  eager: true,
});
const goldens = import.meta.glob<unknown>('./__fixtures__/*.json', {
  import: 'default',
  eager: true,
});
const bytesOf = (file: string) => files[`./__fixtures__/${file}`]!;
/** The report without the two fields goldens leave out (S4). */
function stable(report: ImportReport): Partial<ImportReport> {
  const copy: Partial<ImportReport> = { ...report };
  delete copy.durationMs;
  delete copy.parserVersion;
  return copy;
}
async function run(name: string) {
  const c = GOLDEN_CASES.find((x) => x.name === name)!;
  const outcome = await analyze(bytesOf(c.file), c.file, c.mapping);
  if (outcome.kind !== 'analyzed') throw new Error(outcome.message);
  return outcome;
}

describe('golden fixtures (S4)', () => {
  it.each(GOLDEN_CASES.map((c) => c.name))(
    '%s matches its golden report and model',
    async (name) => {
      const { model, report } = await run(name);
      expect(stable(report)).toEqual(goldens[`./__fixtures__/${name}.report.json`]);
      expect(model).toEqual(goldens[`./__fixtures__/${name}.model.json`]);
    },
  );

  it('keeps the count rules for every case', async () => {
    for (const c of GOLDEN_CASES) {
      const { report } = await run(c.name);
      const changed = report.issues.filter((i) => i.severity !== 'error').length;
      for (const count of report.counts) {
        expect(count.read, `${c.name} ${count.entity}`).toBe(count.accepted + count.skipped);
        expect(count.adjusted).toBeLessThanOrEqual(count.accepted);
      }
      expect(report.counts.reduce((sum, n) => sum + n.adjusted + n.skipped, 0)).toBeLessThanOrEqual(
        changed,
      );
    }
  });

  it('has no error in any golden, so the compatibility rule has a baseline', async () => {
    for (const c of GOLDEN_CASES)
      expect((await run(c.name)).report.issueTotals.error, c.name).toBe(0);
  });

  it('is deterministic, and gives one model per chosen XER project', async () => {
    expect((await run('project')).model).toEqual((await run('project')).model);
    const [a, b] = [await run('two-projects.NTH-A'), await run('two-projects.NTH-B')];
    expect([a.model.project.code, b.model.project.code]).toEqual(['NTH-A', 'NTH-B']);
    expect((await run('dates-1900')).model).toEqual((await run('dates-1904')).model);
  });
});
