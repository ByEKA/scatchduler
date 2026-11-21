import { describe, expect, it } from 'vitest';
import { makeActivity, makeRelationship } from '@/engine/testing';
import {
  formatPredecessorCell,
  parseDurationInput,
  parsePredecessorCell,
} from '@/features/schedule/predecessor-text';

describe('predecessor-text', () => {
  it('parses standard FS, SS, FF, SF, working lags, elapsed lags, and empty strings', () => {
    expect(parsePredecessorCell('', { hoursPerDay: 8 })).toEqual({ ok: true, items: [] });
    expect(parsePredecessorCell('   ', { hoursPerDay: 8 })).toEqual({ ok: true, items: [] });

    expect(
      parsePredecessorCell('A1000, A1010 SS+2d; A1020 FF-4h, A1030 FS+2ed', { hoursPerDay: 8 }),
    ).toEqual({
      ok: true,
      items: [
        { code: 'A1000', type: 'FS', lagMinutes: 0, lagElapsed: false },
        { code: 'A1010', type: 'SS', lagMinutes: 960, lagElapsed: false },
        { code: 'A1020', type: 'FF', lagMinutes: -240, lagElapsed: false },
        { code: 'A1030', type: 'FS', lagMinutes: 2880, lagElapsed: true },
      ],
    });
  });

  it('rejects malformed tokens with a clear error', () => {
    const res = parsePredecessorCell('A1000, A1010 XX+2d', { hoursPerDay: 8 });
    expect(res.ok).toBe(false);
  });

  it('round-trips formatted predecessor strings', () => {
    const activities = [
      makeActivity({ id: 'a1', code: 'A1000' }),
      makeActivity({ id: 'a2', code: 'A1010' }),
      makeActivity({ id: 'a3', code: 'A1020' }),
      makeActivity({ id: 'a4', code: 'A1030' }),
      makeActivity({ id: 'a5', code: 'A1040' }),
    ];
    const byId = new Map(activities.map((a) => [a.id, a]));
    const rels = [
      makeRelationship({ id: 'r1', predecessorId: 'a1', successorId: 'a5', type: 'FS', lagMinutes: 0 }),
      makeRelationship({ id: 'r2', predecessorId: 'a2', successorId: 'a5', type: 'SS', lagMinutes: 960 }),
      makeRelationship({ id: 'r3', predecessorId: 'a3', successorId: 'a5', type: 'FF', lagMinutes: -240 }),
      makeRelationship({ id: 'r4', predecessorId: 'a4', successorId: 'a5', type: 'FS', lagMinutes: 2880, lagElapsed: true }),
    ];
    const formatted = formatPredecessorCell(rels, 'a5', byId, 8);
    expect(formatted).toBe('A1000, A1010 SS+2d, A1020 FF-4h, A1030 FS+2ed');
    expect(parsePredecessorCell(formatted, { hoursPerDay: 8 })).toEqual({
      ok: true,
      items: [
        { code: 'A1000', type: 'FS', lagMinutes: 0, lagElapsed: false },
        { code: 'A1010', type: 'SS', lagMinutes: 960, lagElapsed: false },
        { code: 'A1020', type: 'FF', lagMinutes: -240, lagElapsed: false },
        { code: 'A1030', type: 'FS', lagMinutes: 2880, lagElapsed: true },
      ],
    });
  });

  it('parses duration inputs in days or hours and rejects negative values', () => {
    expect(parseDurationInput('5', 8)).toEqual({ ok: true, minutes: 2400 });
    expect(parseDurationInput('2.5 d', 8)).toEqual({ ok: true, minutes: 1200 });
    expect(parseDurationInput('16h', 8)).toEqual({ ok: true, minutes: 960 });
    expect(parseDurationInput('-2d', 8)).toEqual({ ok: false, error: "Duration can't be negative." });
  });
});
