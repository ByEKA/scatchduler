import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import {
  ImportClientFactoryContext,
  useImportParser,
  type ImportClient,
} from '@/hooks/useImportParser';

describe('useImportParser', () => {
  it('creates its client on first use, not during render, and disposes it on unmount', async () => {
    const client = {
      inspect: vi.fn(async () => ({ kind: 'refused', message: 'x', fileName: 'a', size: 1 })),
      dispose: vi.fn(),
    } as unknown as ImportClient;
    const factory = vi.fn(() => client);
    const wrapper = ({ children }: { children: ReactNode }) => (
      <ImportClientFactoryContext value={factory}>{children}</ImportClientFactoryContext>
    );
    const { result, rerender, unmount } = renderHook(() => useImportParser(), { wrapper });
    rerender();
    expect(factory).not.toHaveBeenCalled();
    await result.current.inspect(new File(['x'], 'a.xer'));
    await result.current.inspect(new File(['x'], 'b.xer'));
    expect(factory).toHaveBeenCalledOnce();
    unmount();
    expect(client.dispose).toHaveBeenCalledOnce();
  });
});
