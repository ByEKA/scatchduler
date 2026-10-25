export interface AuthOptionsEnv {
  VITE_DATA_SOURCE?: string;
  VITE_GOOGLE_SIGN_IN?: string;
}

export interface AuthOptions {
  /** Mock data: any email and password sign in (P2 spec §5.5). */
  demo: boolean;
  /** Show "Continue with Google": always in mock mode, else only with `VITE_GOOGLE_SIGN_IN=true` (§4.2). */
  google: boolean;
}

/**
 * Demo mode and Google-button visibility from the env. Read at call time, so tests can stub the
 * env. Like `createDataLayer`, a missing or blank `VITE_DATA_SOURCE` means mock data.
 */
export function authOptions(env: AuthOptionsEnv = import.meta.env): AuthOptions {
  const demo = (env.VITE_DATA_SOURCE?.trim() || 'mock') === 'mock';
  return { demo, google: demo || env.VITE_GOOGLE_SIGN_IN === 'true' };
}
