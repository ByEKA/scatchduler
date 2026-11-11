import { describe, expect, it } from 'vitest';
import { autoMap } from '@/import/table/auto-map';

describe('autoMap', () => {
  it('maps Turkish and English headers with folding, each column once', () => {
    expect(
      autoMap([
        'Aktivite Kodu',
        'AKTİVİTE ADI',
        'Süre',
        'Başlangıç',
        'Bitiş',
        'Öncüller',
        '% Tamamlanma',
        'Takvim',
      ]),
    ).toEqual({
      code: { index: 0, header: 'Aktivite Kodu' },
      name: { index: 1, header: 'AKTİVİTE ADI' },
      duration: { index: 2, header: 'Süre' },
      start: { index: 3, header: 'Başlangıç' },
      finish: { index: 4, header: 'Bitiş' },
      predecessors: { index: 5, header: 'Öncüller' },
      percentComplete: { index: 6, header: '% Tamamlanma' },
      calendar: { index: 7, header: 'Takvim' },
    });
    expect(autoMap(['ID', 'Unique ID', 'Task Name', 'Duration'])).toEqual({
      taskId: { index: 0, header: 'ID' },
      code: { index: 1, header: 'Unique ID' },
      name: { index: 2, header: 'Task Name' },
      duration: { index: 3, header: 'Duration' },
    });
    expect(autoMap(['Code', 'Code', ''])).toEqual({ code: { index: 0, header: 'Code' } });
  });
});
