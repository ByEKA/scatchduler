import { describe, expect, it, vi } from 'vitest';
import { createMemoryStorage, readKey, writeKey, type StorageLike } from '@/lib/storage';

const blocked: StorageLike = {
  getItem: () => {
    throw new Error('SecurityError');
  },
  setItem: () => {
    throw new Error('QuotaExceededError');
  },
  removeItem: () => {
    throw new Error('SecurityError');
  },
};

describe('storage', () => {
  it('round-trips values', () => {
    const storage = createMemoryStorage();
    writeKey('ui.theme', 'light', storage);
    expect(readKey('ui.theme', storage)).toBe('light');
  });

  it('returns null instead of throwing when storage is blocked', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(readKey('test.read', blocked)).toBeNull();
  });

  it('swallows write errors and warns once per key', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(() => {
      writeKey('test.write', 'a', blocked);
      writeKey('test.write', 'b', blocked);
    }).not.toThrow();
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('treats a null storage as empty', () => {
    expect(readKey('ui.theme', null)).toBeNull();
    expect(() => writeKey('ui.theme', 'light', null)).not.toThrow();
  });
});
