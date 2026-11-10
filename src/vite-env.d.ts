/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DATA_SOURCE?: 'mock' | 'supabase';
  readonly VITE_MOCK_SCENARIO?: 'default' | 'empty';
  readonly VITE_MOCK_TEAM_ROLE?: 'owner' | 'editor' | 'viewer';
  readonly VITE_MOCK_LATENCY_MS?: string;
  readonly VITE_MOCK_FAIL_RATE?: string;
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  readonly VITE_GOOGLE_SIGN_IN?: string;
}

interface Window {
  __resetMockDb?: () => void;
}

// The parser's test fixtures as bytes (the `fixtureBytes` loader in vite.config.ts).
declare module '*?bytes' {
  const bytes: Uint8Array;
  export default bytes;
}
