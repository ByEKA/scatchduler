import { act, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useNow } from '@/hooks/useNow';

afterEach(() => {
  vi.useRealTimers();
});

it('ticks every interval', () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-14T10:00:00.000Z'));
  const { result } = renderHook(() => useNow(60_000));
  expect(result.current.toISOString()).toBe('2026-10-14T10:00:00.000Z');
  act(() => {
    vi.advanceTimersByTime(60_000);
  });
  expect(result.current.toISOString()).toBe('2026-10-14T10:01:00.000Z');
});
