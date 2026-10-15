import type { ID } from './types';

export interface Session {
  userId: ID;
}

export interface AuthService {
  getSession(): Promise<Session | null>;
  /** Mock: signs in the seed user immediately. Supabase: sends a magic link (signInWithOtp). */
  signInWithEmail(email: string): Promise<{ status: 'signed-in' | 'link-sent' }>;
  signOut(): Promise<void>;
  /** Returns an unsubscribe function. */
  onAuthStateChange(listener: (session: Session | null) => void): () => void;
}
