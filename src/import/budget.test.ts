import { describe, expect, it } from 'vitest';
import { analyze, inspect } from '@/import/index';
import { generateXer } from '@/import/testing';

const ci = Boolean(
  (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.CI,
);

describe('budget (S5)', () => {
  it('reads and checks 10,000 activities and 15,000 links in time', async () => {
    const bytes = generateXer({ activities: 10000, links: 15000 });
    const started = performance.now();
    const inspected = await inspect(bytes, 'big.xer');
    if (inspected.kind === 'refused') throw new Error(inspected.message);
    const outcome = await analyze(bytes, 'big.xer', inspected.mapping);
    expect(outcome.kind).toBe('analyzed');
    expect(performance.now() - started).toBeLessThan(ci ? 15000 : 5000);
  }, 60000);
});
