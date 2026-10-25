import { runAuthContract } from '@/test/contract/auth.contract';
import { createTestDataLayer } from '@/test/fakes';

runAuthContract('mock', async () => ({
  auth: createTestDataLayer().auth,
  email: 'deniz.kaya@example.com',
  password: 'any-password-1',
  badPassword: 'wrong-password',
  freshToken: async () => crypto.randomUUID(),
}));
