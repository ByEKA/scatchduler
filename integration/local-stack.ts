import { execSync } from 'node:child_process';

/** URLs and keys of the local Supabase stack, as `supabase status -o json` reports them. */
export interface LocalStack {
  apiUrl: string;
  publishableKey: string;
  secretKey: string;
  dbUrl: string;
  mailUrl: string;
}

/** The mail catcher's web port from `config.toml` (`[local_smtp]`), for a status without its URL. */
const DEFAULT_MAIL_URL = 'http://127.0.0.1:54324';

export function parseStatus(json: string): LocalStack {
  const status: unknown = JSON.parse(json);
  if (typeof status !== 'object' || status === null) {
    throw new Error('supabase status did not print a JSON object');
  }
  const values = status as Record<string, unknown>;
  const first = (...names: string[]) => {
    for (const name of names) {
      const value = values[name];
      if (typeof value === 'string' && value !== '') return value;
    }
    return undefined;
  };
  // The newer key names win; the legacy ones are fallbacks. Errors name the newer key.
  const required = (name: string, ...fallbacks: string[]) => {
    const value = first(name, ...fallbacks);
    if (value === undefined) throw new Error(`supabase status is missing ${name}`);
    return value;
  };
  return {
    apiUrl: required('API_URL'),
    publishableKey: required('PUBLISHABLE_KEY', 'ANON_KEY'),
    secretKey: required('SECRET_KEY', 'SERVICE_ROLE_KEY'),
    dbUrl: required('DB_URL'),
    mailUrl: first('MAILPIT_URL', 'INBUCKET_URL') ?? DEFAULT_MAIL_URL,
  };
}

/**
 * Reads the running stack. The keys stay in memory: the secret key is never written to a file.
 * Runs through the shell because on Windows `npx` is `npx.cmd`, which Node won't spawn without one.
 * stderr is captured, not echoed (the CLI prints notices there); a failure's error message has it.
 */
export function readLocalStack(): LocalStack {
  return parseStatus(execSync('npx supabase status -o json', { encoding: 'utf8', stdio: 'pipe' }));
}

/** Content of `.env.supabase.local`: the API URL and the publishable key, never the secret key. */
export function formatLocalEnv(stack: LocalStack): string {
  return `VITE_SUPABASE_URL=${stack.apiUrl}\nVITE_SUPABASE_PUBLISHABLE_KEY=${stack.publishableKey}\n`;
}
