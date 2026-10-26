import { runAuthContract } from '@/test/contract/auth.contract';
import { makeSupabaseAuthFixture } from './supabase-fixture';

runAuthContract('supabase', makeSupabaseAuthFixture);
