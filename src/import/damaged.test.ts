import { describe, expect, it } from 'vitest';
import { GOLDEN_CASES } from '@/import/__fixtures__/cases';
import { analyze, inspect } from '@/import/index';

const files = import.meta.glob<Uint8Array>('./__fixtures__/*.{xer,xml,csv,xlsx}', {
  query: '?bytes',
  import: 'default',
  eager: true,
});
const WORKBOOK = "This file isn't a readable Excel workbook.";

/** Bytes that must stay intact so the copy is still detected as its format (P3 full §7). */
function protectedPrefix(bytes: Uint8Array, file: string): number {
  const text = new TextDecoder().decode(bytes.slice(0, 4096));
  if (file.endsWith('.xer')) return text.indexOf('\n') + 1;
  if (file.endsWith('.xml')) return text.indexOf('>', text.indexOf('<Project')) + 1;
  if (file.endsWith('.xlsx'))
    return 30 + new DataView(bytes.buffer, bytes.byteOffset).getUint16(26, true);
  return (bytes[0] === 0xef ? 3 : 0) + 16;
}
function* damaged(bytes: Uint8Array, start: number) {
  for (const share of [0.1, 0.25, 0.5, 0.75, 0.9])
    yield bytes.slice(0, Math.max(start, Math.floor(bytes.length * share)));
  let seed = 7;
  for (let i = 0; i < 20; i += 1) {
    seed = (seed * 1103515245 + 12345) % 2 ** 31;
    const copy = bytes.slice();
    const at = start + (seed % (bytes.length - start));
    copy[at] = copy[at]! ^ 0xff;
    yield copy;
  }
}

describe('damaged files (S4)', () => {
  it.each([...new Set(GOLDEN_CASES.map((c) => c.file))])(
    '%s gives a report or the workbook message for every damaged copy',
    async (file) => {
      const bytes = files[`./__fixtures__/${file}`]!;
      const mapping = GOLDEN_CASES.find((c) => c.file === file)!.mapping;
      for (const copy of damaged(bytes, protectedPrefix(bytes, file))) {
        const inspected = await inspect(copy, file);
        const outcome = await analyze(copy, file, mapping);
        if (outcome.kind === 'refused' || inspected.kind === 'refused') {
          expect(file.endsWith('.xlsx')).toBe(true);
          expect(outcome.kind === 'refused' ? outcome.message : WORKBOOK).toBe(WORKBOOK);
        } else {
          expect(outcome.report.counts).toHaveLength(4);
        }
      }
    },
  );

  it('always refuses an xlsx cut in half', async () => {
    for (const file of ['dates-1900.xlsx', 'dates-1904.xlsx']) {
      const bytes = files[`./__fixtures__/${file}`]!;
      const half = bytes.slice(0, bytes.length / 2);
      expect(await analyze(half, file, GOLDEN_CASES.find((c) => c.file === file)!.mapping)).toEqual(
        { kind: 'refused', message: WORKBOOK },
      );
    }
  });
});
