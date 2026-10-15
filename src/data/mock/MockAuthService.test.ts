import { expect, it, vi } from 'vitest';
import { MockAuthService } from '@/data/mock/MockAuthService';
import { createMockStore } from '@/data/mock/store';
import { createMemoryStorage } from '@/lib/storage';

it('starts with the seed session, signs out and signs back in', async () => {
  const store = createMockStore({ storage: createMemoryStorage(), scenario: 'default' });
  const auth = new MockAuthService({ store });
  const listener = vi.fn();
  const unsubscribe = auth.onAuthStateChange(listener);
  const session = { userId: store.read().currentUserId };

  expect(await auth.getSession()).toEqual(session);
  await auth.signOut();
  expect(await auth.getSession()).toBeNull();
  expect(listener).toHaveBeenLastCalledWith(null);
  await expect(auth.signInWithEmail('anyone@lab.example')).resolves.toEqual({
    status: 'signed-in',
  });
  expect(listener).toHaveBeenLastCalledWith(session);
  unsubscribe();
});

it('stops calling a listener once it unsubscribes', async () => {
  const auth = new MockAuthService({
    store: createMockStore({ storage: createMemoryStorage(), scenario: 'default' }),
  });
  const listener = vi.fn();
  auth.onAuthStateChange(listener)();
  await auth.signOut();
  expect(listener).not.toHaveBeenCalled();
});
