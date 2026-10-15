import { describe, expect, it } from 'vitest';
import { createDataLayer } from '@/data';
import { createMemoryStorage } from '@/lib/storage';

describe('createDataLayer', () => {
  it('explains that Supabase is not implemented yet', () => {
    expect(() => createDataLayer({ VITE_DATA_SOURCE: 'supabase' }, null)).toThrow(
      'Supabase data source is not implemented yet (Phase 2). Set VITE_DATA_SOURCE=mock.',
    );
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
