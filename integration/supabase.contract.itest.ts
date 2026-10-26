import { runRepositoryContract } from '@/test/contract/repository.contract';
import { makeSupabaseRepositoryFixture } from './supabase-fixture';

runRepositoryContract('supabase', makeSupabaseRepositoryFixture);
