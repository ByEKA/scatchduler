import type { ReactElement } from 'react';
import { cn } from '@/lib/utils';

// The owner adds Google's official "G" mark as this file (P2 spec §5.5); the code never draws or
// embeds it. The glob matches nothing while the file is missing, so the app builds either way.
const ownerFiles = import.meta.glob<string>('/src/assets/third-party/google-g.svg', {
  eager: true,
  query: '?url',
  import: 'default',
});
const defaultSrc: string | null = Object.values(ownerFiles)[0] ?? null;

/** The Google mark for "Continue with Google", or nothing when the owner's file is missing. */
export function GoogleMark({
  src = defaultSrc,
  className,
}: {
  src?: string | null;
  className?: string;
}): ReactElement | null {
  if (!src) return null;
  return <img src={src} alt="" aria-hidden="true" className={cn('size-4', className)} />;
}
