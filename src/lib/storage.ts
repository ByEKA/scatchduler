// The only module that touches localStorage. Private windows, blocked site data and a full quota
// make the browser throw on access; these helpers turn that into "no stored value" so the app
// keeps running on its in-memory state.

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** `window.localStorage`, or `null` when it is missing or the browser refuses access to it. */
export function getBrowserStorage(): StorageLike | null {
  try {
    if (typeof window === 'undefined') return null;
    return window.localStorage ?? null;
  } catch {
    return null;
  }
}

export function createMemoryStorage(): StorageLike {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, String(value));
    },
    removeItem: (key) => {
      values.delete(key);
    },
  };
}

// Keys that have already logged a failure. A blocked storage fails on every call, so one warning
// per key is enough to show up in the console without flooding it.
const warnedKeys = new Set<string>();

function warnOnce(key: string, action: 'read' | 'write' | 'remove', error: unknown): void {
  if (warnedKeys.has(key)) return;
  warnedKeys.add(key);
  console.warn(`Browser storage: could not ${action} "${key}"; continuing without it.`, error);
}

export function readKey(
  key: string,
  storage: StorageLike | null = getBrowserStorage(),
): string | null {
  if (!storage) return null;
  try {
    return storage.getItem(key);
  } catch (error) {
    warnOnce(key, 'read', error);
    return null;
  }
}

export function writeKey(
  key: string,
  value: string,
  storage: StorageLike | null = getBrowserStorage(),
): void {
  if (!storage) return;
  try {
    storage.setItem(key, value);
  } catch (error) {
    warnOnce(key, 'write', error);
  }
}

export function removeKey(key: string, storage: StorageLike | null = getBrowserStorage()): void {
  if (!storage) return;
  try {
    storage.removeItem(key);
  } catch (error) {
    warnOnce(key, 'remove', error);
  }
}
