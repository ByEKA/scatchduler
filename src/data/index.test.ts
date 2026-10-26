import { describe, expect, it, vi } from 'vitest';
import { createDataLayer } from '@/data';
import { SupabaseAuthService } from '@/data/supabase/SupabaseAuthService';
import { SupabaseRepository } from '@/data/supabase/SupabaseRepository';
import { createMemoryStorage } from '@/lib/storage';

describe('createDataLayer', () => {
  it('needs the Supabase URL and publishable key', () => {
    expect(() => createDataLayer({ VITE_DATA_SOURCE: 'supabase' }, null)).toThrow(
      'Missing VITE_SUPABASE_URL',
    );
    expect(() =>
      createDataLayer(
        { VITE_DATA_SOURCE: 'supabase', VITE_SUPABASE_URL: 'http://127.0.0.1:54321' },
        null,
      ),
    ).toThrow('Missing VITE_SUPABASE_PUBLISHABLE_KEY');
  });

  it('builds the Supabase layer without touching the network', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const layer = createDataLayer(
      {
        VITE_DATA_SOURCE: 'supabase',
        VITE_SUPABASE_URL: 'http://127.0.0.1:54321',
        VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test',
      },
      null,
    );
    expect(layer.repository).toBeInstanceOf(SupabaseRepository);
    expect(layer.auth).toBeInstanceOf(SupabaseAuthService);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('rejects unknown sources', () => {
    expect(() => createDataLayer({ VITE_DATA_SOURCE: 'firebase' }, null)).toThrow(
      'Unknown VITE_DATA_SOURCE "firebase"',
    );
  });

  it('builds the mock layer from env values', async () => {
    const { repository } = createDataLayer(
      { VITE_MOCK_SCENARIO: 'empty', VITE_MOCK_LATENCY_MS: '0' },
      createMemoryStorage(),
    );
    await expect(repository.listWorkspaces()).resolves.toHaveLength(1);
    const siteRole = async (teamRole: string) => {
      const layer = createDataLayer(
        { VITE_MOCK_TEAM_ROLE: teamRole, VITE_MOCK_LATENCY_MS: '0' },
        createMemoryStorage(),
      );
      const workspaces = await layer.repository.listWorkspaces();
      return workspaces.find((w) => w.name === 'Site Operations')?.myRole;
    };
    await expect(siteRole('viewer')).resolves.toBe('viewer');
    await expect(siteRole('manager')).resolves.toBe('owner');
  });

  it('applies the fail rate and rejects mock settings that do not exist', async () => {
    const { repository } = createDataLayer(
      { VITE_MOCK_FAIL_RATE: '1', VITE_MOCK_LATENCY_MS: '0' },
      createMemoryStorage(),
    );
    await expect(repository.listWorkspaces()).rejects.toMatchObject({ code: 'network' });
    expect(() => createDataLayer({ VITE_MOCK_SCENARIO: 'busy' }, null)).toThrow(
      'Unknown VITE_MOCK_SCENARIO "busy"',
    );
    expect(() => createDataLayer({ VITE_MOCK_LATENCY_MS: '-5' }, null)).toThrow(
      'Invalid VITE_MOCK_LATENCY_MS "-5"',
    );
    expect(() => createDataLayer({ VITE_MOCK_FAIL_RATE: '2' }, null)).toThrow(
      'Invalid VITE_MOCK_FAIL_RATE "2"',
    );
  });
});
