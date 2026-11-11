import { describe, expect, it } from 'vitest';
import { parsePredecessors } from '@/import/table/predecessors';

const options = { decimal: '.', hoursPerDay: 8, unit: 'days' } as const;

describe('parsePredecessors', () => {
  it('reads refs with types and spaced, word and percentage lags, and marks unreadable tokens', () => {
    expect(parsePredecessors('A100FS+2d; A120SS', options)).toEqual([
      { ref: 'A100', type: 'FS', lag: { minutes: 960, elapsed: false } },
      { ref: 'A120', type: 'SS', lag: { minutes: 0, elapsed: false } },
    ]);
    expect(parsePredecessors('3FS+2 days, 12SS-1 hafta', options)).toEqual([
      { ref: '3', type: 'FS', lag: { minutes: 960, elapsed: false } },
      { ref: '12', type: 'SS', lag: { minutes: -2400, elapsed: false } },
    ]);
    expect(parsePredecessors('7FS-25%', options)).toEqual([
      { ref: '7', type: 'FS', lag: { percent: -25 } },
    ]);
    expect(parsePredecessors('T110SS+1 g', { ...options, decimal: ',' })).toEqual([
      { ref: 'T110', type: 'SS', lag: { minutes: 480, elapsed: false } },
    ]);
    expect(parsePredecessors('A1 XX+?', options)).toEqual([{ invalid: 'A1 XX+?' }]);
    expect(parsePredecessors('', options)).toEqual([]);
  });

  it('reads refs with dashes or a type at the end as the activities the file names', () => {
    const plain = { minutes: 0, elapsed: false };
    // Without names, the shortest ref that reads wins; a lag that can't be read is no reading.
    expect(parsePredecessors('ACCESS; A-1; EX-110SS', options)).toEqual([
      { ref: 'ACCE', type: 'SS', lag: plain },
      { ref: 'A', type: 'FS', lag: { minutes: -480, elapsed: false } },
      { ref: 'EX-110', type: 'SS', lag: plain },
    ]);
    // With names, the longest ref the file names wins.
    const names = new Set(['ACCESS', 'STA', 'STAFF', 'A', 'A-1', 'CON-1000']);
    const named = (ref: string) => names.has(ref);
    expect(parsePredecessors('ACCESS; STAFF; A-1; A-1FS+2d; CON-1000-2d', options, named)).toEqual([
      { ref: 'ACCESS', type: 'FS', lag: plain },
      { ref: 'STAFF', type: 'FS', lag: plain },
      { ref: 'A-1', type: 'FS', lag: plain },
      { ref: 'A-1', type: 'FS', lag: { minutes: 960, elapsed: false } },
      { ref: 'CON-1000', type: 'FS', lag: { minutes: -960, elapsed: false } },
    ]);
    // A ref the file doesn't name keeps the shortest reading.
    expect(parsePredecessors('B-2', options, named)).toEqual([
      { ref: 'B', type: 'FS', lag: { minutes: -960, elapsed: false } },
    ]);
  });
});
