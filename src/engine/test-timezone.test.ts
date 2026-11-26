import { describe, expect, it } from 'vitest';

// `npm run test:engine:tz` runs this suite once per zone (P4 core spec S4). This test proves the
// test worker really runs in the zone the script asked for, not the unit-test default.
describe('engine test time zone', () => {
  it('runs in the zone the time-zone script asked for (S4)', () => {
    const wanted = process.env.ENGINE_TEST_TZ ?? 'America/Los_Angeles';
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe(wanted);
  });
});
