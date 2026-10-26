// `npm run db:reset` runs this after `supabase db reset`: it loads the default seed into the local
// stack (P2 spec §4.4, §9). The secret key is read from `supabase status` and stays in memory.
import { createClient } from '@supabase/supabase-js';
import type { Database } from '../src/data/supabase/database.types';
import { readLocalStack } from '../integration/local-stack';
import { loadSeed } from '../integration/seed-loader';

const PASSWORD = 'localdemo2026';

const stack = readLocalStack();
const admin = createClient<Database>(stack.apiUrl, stack.secretKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const seeded = await loadSeed(admin, { scenario: 'default', now: new Date(), password: PASSWORD });

console.log('Local accounts:');
for (const account of [seeded.users.current, seeded.users.mert, seeded.users.elif]) {
  if (account) console.log(`  ${account.firstName} ${account.lastName} <${account.email}>`);
}
console.log(`Password for all local accounts: ${PASSWORD}`);
