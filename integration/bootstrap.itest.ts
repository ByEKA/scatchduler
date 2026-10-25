import { createClient } from '@supabase/supabase-js';
import { expect, it } from 'vitest';
import { readLocalStack } from './local-stack';
import { tokenHashFrom, waitForEmail } from './mailbox';

const stack = readLocalStack();
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(stack.apiUrl, stack.secretKey, options);
const unique = (tag: string) =>
  `${tag}.${Date.now()}.${Math.floor(Math.random() * 1e6)}@example.com`;

it('bootstraps an account created as confirmed through the admin API', async () => {
  const email = unique('boot');
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: 'letters12345',
    email_confirm: true,
    user_metadata: { first_name: 'Ada', last_name: 'Lovelace' },
  });
  expect(error).toBeNull();
  const { data: profile } = await admin
    .from('profiles')
    .select('first_name, last_name, email')
    .eq('id', data.user!.id)
    .single();
  expect(profile).toEqual({ first_name: 'Ada', last_name: 'Lovelace', email });
});

it('bootstraps an invited account only when the invitation is accepted', async () => {
  const email = unique('invited');
  const after = new Date();
  const { data } = await admin.auth.admin.inviteUserByEmail(email);
  expect((await admin.from('profiles').select('id').eq('id', data.user!.id)).data).toEqual([]);
  const mail = await waitForEmail(stack.mailUrl, email, { after });
  await createClient(stack.apiUrl, stack.publishableKey, options).auth.verifyOtp({
    token_hash: tokenHashFrom(mail.html),
    type: 'invite',
  });
  expect((await admin.from('profiles').select('id').eq('id', data.user!.id)).data).toHaveLength(1);
});
