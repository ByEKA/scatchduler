// @vitest-environment node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { fromImportModel, solve, type ImportModel } from '@/engine';
import { compareAgainstOracle } from '@/engine/oracle';

const ratchet = JSON.parse(
  readFileSync(join(process.cwd(), 'src/engine/__fixtures__/oracle-ratchet.json'), 'utf8'),
) as Record<string, Record<'es' | 'ef' | 'ls' | 'lf' | 'tf' | 'ff', number>>;

describe('CPM oracle fidelity ratchet (S5, V4)', () => {
  for (const [fixture, pinned] of Object.entries(ratchet)) {
    it(`meets the pinned mismatch ratchet for ${fixture}`, () => {
      const model = JSON.parse(
        readFileSync(
          join(process.cwd(), 'src/import/__fixtures__', `${fixture}.model.json`),
          'utf8',
        ),
      ) as ImportModel;
      const doc = fromImportModel(model, {
        scheduleStatusDate: model.project.statusDate?.slice(0, 10) ?? null,
      });
      const res = solve(doc, { calculatedAt: '2026-01-05T08:00:00.000Z' });
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      const report = compareAgainstOracle(doc, res.summary);
      for (const field of ['es', 'ef', 'ls', 'lf', 'tf', 'ff'] as const) {
        expect(
          report.fields[field].mismatches,
          `${fixture}.${field} regressed`,
        ).toBeLessThanOrEqual(pinned[field]);
        expect(
          report.fields[field].mismatches,
          `${fixture}.${field} improved — lower the ratchet pin in oracle-ratchet.json`,
        ).toBe(pinned[field]);
      }
    });
  }
});
