import { describe, expect, it } from 'vitest';
import {
  isCodeTaken,
  suggestCodeFor,
  suggestImportCode,
  suggestNewScheduleCode,
  suggestUpdateNumber,
} from '@/features/files/codes';

describe('schedule code suggestions', () => {
  it('suggests the first free S code, ignoring case', () => {
    expect(suggestNewScheduleCode([])).toBe('S01');
    expect(suggestNewScheduleCode(['s01', 'S02', 'MS-01'])).toBe('S03');
    expect(
      suggestNewScheduleCode(
        Array.from({ length: 99 }, (_, i) => `S${String(i + 1).padStart(2, '0')}`),
      ),
    ).toBe('S100');
  });

  it('suggests an import code from the project short name or the file name', () => {
    expect(suggestImportCode([], { sourceProjectCode: 'NTH-A', fileName: 'north.xer' })).toBe(
      'NTH-A',
    );
    expect(suggestImportCode([], { fileName: 'Güncelleme 3 (rev).xml' })).toBe(
      'G-ncelleme-3--rev-',
    );
    expect(suggestImportCode([], { fileName: `${'x'.repeat(30)}.csv` })).toBe('x'.repeat(24));
    expect(
      suggestImportCode(['nth-a'], { sourceProjectCode: 'NTH-A', fileName: 'north.xer' }),
    ).toBe('S01');
  });

  it('suggests the import rule for a P2-era import and the S rule otherwise', () => {
    expect(suggestCodeFor(['S01'], { source: 'import', sourceFileName: 'Rev7.XER' })).toBe('Rev7');
    expect(suggestCodeFor(['S01'], { source: 'blank', sourceFileName: null })).toBe('S02');
    expect(isCodeTaken(['MS-01'], ' ms-01 ')).toBe(true);
  });

  it('suggests an update number in status-date order', () => {
    const s = (id: string, statusDate: string | null, updateNumber: number | null) => ({
      id,
      statusDate,
      updateNumber,
    });
    const list = [
      s('a', '2026-01-10', 1),
      s('b', '2026-02-10', 2),
      s('c', '2026-02-20', null),
      s('d', null, null),
    ];
    expect(suggestUpdateNumber(list, 'c', '2026-02-20')).toBe(3);
    expect(suggestUpdateNumber(list, 'd', null)).toBe(3);
    expect(
      suggestUpdateNumber(
        [s('a', '2026-01-10', 1), s('b', '2026-03-10', 2), s('c', '2026-02-20', null)],
        'c',
        '2026-02-20',
      ),
    ).toBe(3);
  });
});
