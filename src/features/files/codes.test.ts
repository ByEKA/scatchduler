import { describe, expect, it } from 'vitest';
import {
  isCodeTaken,
  suggestCodeFor,
  suggestImportCode,
  suggestNewScheduleCode,
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
});
