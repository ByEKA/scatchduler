// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { makeActivity } from '@/engine/testing';
import { findMatchingActivityIds } from '@/features/schedule/search';

describe('findMatchingActivityIds', () => {
  const activities = [
    makeActivity({ id: 'a1', code: 'A1010', name: 'Site Mobilization' }),
    makeActivity({ id: 'a2', code: 'A1020', name: 'İskele Kurulumu' }),
    makeActivity({ id: 'a3', code: 'B2010', name: 'Çelik Montaj' }),
  ];

  it('matches by code and name with case and Turkish diacritic folding', () => {
    expect(findMatchingActivityIds(activities, '')).toEqual([]);
    expect(findMatchingActivityIds(activities, '   ')).toEqual([]);
    expect(findMatchingActivityIds(activities, 'a1010')).toEqual(['a1']);
    expect(findMatchingActivityIds(activities, 'iskele')).toEqual(['a2']);
    expect(findMatchingActivityIds(activities, 'CELIK')).toEqual(['a3']);
    expect(findMatchingActivityIds(activities, 'A10')).toEqual(['a1', 'a2']);
  });
});
