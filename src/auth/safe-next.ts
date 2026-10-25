/** Where the app goes after sign-in when `next` is missing or unsafe. */
const DEFAULT_NEXT = '/home';

/**
 * The open-redirect guard for `?next=` (P2 spec §5.5): only a path inside the app is kept. It
 * must start with `/`, but not `//` or `/\`, which browsers read as another host.
 */
export function safeNext(next: string | null | undefined): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) {
    return DEFAULT_NEXT;
  }
  return next;
}
