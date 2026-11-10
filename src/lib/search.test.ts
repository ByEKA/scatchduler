import { describe, expect, it } from 'vitest';
import { foldForMatch, matchesSearch } from '@/lib/search';

describe('search', () => {
  it('folds case, the Turkish i letters and accents', () => {
    expect(foldForMatch('  İŞ KODU ')).toBe('is kodu');
    expect(foldForMatch('Activity ID')).toBe('activity id');
    expect(foldForMatch('Çağrı Öğün Şükrü Âdem')).toBe('cagri ogun sukru adem');
  });

  it('matches substrings of folded text', () => {
    expect(matchesSearch('İSTANBUL', 'istanbul')).toBe(true);
    expect(matchesSearch('ISTANBUL', 'istanbul')).toBe(true);
    expect(matchesSearch('İnşaat', 'insaat')).toBe(true);
    expect(matchesSearch('IT block', 'it')).toBe(true);
    expect(matchesSearch('Riverside', 'pier')).toBe(false);
    expect(matchesSearch(null, 'x')).toBe(false);
    expect(matchesSearch(null, '  ')).toBe(true);
  });
});
