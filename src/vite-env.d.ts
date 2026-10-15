/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DATA_SOURCE?: 'mock' | 'supabase';
  readonly VITE_MOCK_SCENARIO?: 'default' | 'empty';
  readonly VITE_MOCK_LATENCY_MS?: string;
  readonly VITE_MOCK_FAIL_RATE?: string;
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
}

interface Window {
  __resetMockDb?: () => void;
}
