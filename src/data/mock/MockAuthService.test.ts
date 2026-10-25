import { expect, it } from 'vitest';
import { MockAuthService } from '@/data/mock/MockAuthService';
import { createMockStore } from '@/data/mock/store';
import { createMemoryStorage } from '@/lib/storage';

it('signs in through Google at once and needs a session to change the password', async () => {
  const store = createMockStore({ storage: createMemoryStorage(), scenario: 'default' });
  const auth = new MockAuthService({ store });
  await auth.signOut();
  await expect(auth.updatePassword('letters12345')).rejects.toMatchObject({ code: 'unauthorized' });
  await auth.signInWithGoogle(null);
  expect(await auth.getSession()).toEqual({ userId: store.read().currentUserId });
  await expect(auth.updatePassword('letters12345')).resolves.toBeUndefined();
});
