import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useProjectsLayout } from '@/hooks/useProjectsLayout';

describe('useProjectsLayout', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('defaults to tiles, persists list and map in localStorage, and ignores unknown values', () => {
    const first = renderHook(() => useProjectsLayout());
    expect(first.result.current[0]).toBe('tiles');

    act(() => {
      first.result.current[1]('map');
    });
    expect(first.result.current[0]).toBe('map');
    expect(window.localStorage.getItem('ui.projectsLayout')).toBe('map');
    first.unmount();

    const second = renderHook(() => useProjectsLayout());
    expect(second.result.current[0]).toBe('map');

    act(() => {
      second.result.current[1]('list');
    });
    expect(second.result.current[0]).toBe('list');
    second.unmount();

    window.localStorage.setItem('ui.projectsLayout', 'unknown');
    const third = renderHook(() => useProjectsLayout());
    expect(third.result.current[0]).toBe('tiles');
  });
});
