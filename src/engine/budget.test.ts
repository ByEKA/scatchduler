// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { solve } from '@/engine';
import { generateLargeDocument } from '@/engine/testing';

const isCi = Boolean(process.env.CI);

describe('CPM engine performance budget (S6, V3)', () => {
  it('solves 10,000 activities and 15,000 links within budget', () => {
    const doc = generateLargeDocument(10_000, 15_000);
    const res = solve(doc, { calculatedAt: '2026-01-05T08:00:00.000Z' });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.summary.durationMs).toBeLessThan(isCi ? 1000 : 300);
  });

  it('solves 50,000 activities and 150,000 links within budget without stack overflow', () => {
    const doc = generateLargeDocument(50_000, 150_000);
    const res = solve(doc, { calculatedAt: '2026-01-05T08:00:00.000Z' });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.summary.durationMs).toBeLessThan(isCi ? 5000 : 2000);
  });
});
