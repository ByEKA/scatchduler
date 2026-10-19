import { describe, expect, it } from 'vitest';
import { compareText, compareWorkspaces, newestFirst } from '@/data/sort';

describe('sort', () => {
  it('compares text case-insensitively in Turkish alphabetical order', () => {
    expect(['Zeta', 'şantiye', 'alpha', 'Beta'].sort(compareText)).toEqual([
      'alpha',
      'Beta',
      'şantiye',
      'Zeta',
    ]);
    expect(['Zeynep', 'Ömer', 'Çağla', 'Czech', 'İlker', 'Ilgaz'].sort(compareText)).toEqual([
      'Czech',
      'Çağla',
      'Ilgaz',
      'İlker',
      'Ömer',
      'Zeynep',
    ]);
    expect(compareText('Crew', 'crew')).toBe(0);
  });

  it('puts the personal workspace first, then teams by name, age and id', () => {
    const w = (
      id: string,
      name: string,
      kind: 'personal' | 'team',
      createdAt = '2026-01-01T00:00:00.000Z',
    ) => ({ id, name, kind, createdAt });
    const list = [
      w('4', 'crew', 'team', '2026-02-01T00:00:00.000Z'),
      w('3', 'Crew', 'team'),
      w('2', 'Alpha', 'team'),
      w('1', 'My workspace', 'personal'),
    ];
    expect(list.sort(compareWorkspaces).map((x) => x.id)).toEqual(['1', '2', '3', '4']);
  });

  it('orders newest first and breaks ties by id', () => {
    const rows = [
      { id: 'b', at: '2026-01-01T00:00:00.000Z' },
      { id: 'a', at: '2026-01-01T00:00:00.000Z' },
      { id: 'c', at: '2026-02-01T00:00:00.000Z' },
    ];
    expect(rows.sort(newestFirst((r) => r.at)).map((r) => r.id)).toEqual(['c', 'a', 'b']);
  });
});
