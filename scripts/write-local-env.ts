// npm run db:env: writes the local stack's API URL and publishable key for `vite --mode supabase`.
// The secret key never goes into the file (P2 spec §4.2).
import { writeFileSync } from 'node:fs';
import { formatLocalEnv, readLocalStack } from '../integration/local-stack';

writeFileSync(new URL('../.env.supabase.local', import.meta.url), formatLocalEnv(readLocalStack()));
console.log('Wrote .env.supabase.local');
