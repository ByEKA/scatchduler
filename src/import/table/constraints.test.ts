import { describe, expect, it } from 'vitest';
import { parseConstraint } from '@/import/table/constraints';

describe('parseConstraint', () => {
  it('reads app map, P6 and Microsoft Project names and abbreviations', () => {
    expect(
      [
        'Start on or after',
        'START NO EARLIER THAN',
        'SNET',
        'Must start on',
        'MFO',
        'Finish no later than',
        'ALAP',
        'Mandatory finish',
        'Finish on',
      ].map(parseConstraint),
    ).toEqual([
      'start_on_or_after',
      'start_on_or_after',
      'start_on_or_after',
      'mandatory_start',
      'mandatory_finish',
      'finish_on_or_before',
      'as_late_as_possible',
      'mandatory_finish',
      'finish_on',
    ]);
    expect(parseConstraint('As soon as possible')).toBe('none');
    expect(parseConstraint('ASAP')).toBe('none');
    expect(parseConstraint('')).toBe('none');
    expect(parseConstraint('Must finish by')).toBeNull();
  });
});
