// Private buckets hand out signed URLs (P2 spec D5). URLs are cached in memory per bucket and path
// and reused until 10 minutes before they expire, so the browser cache stays warm across refetches.

/** How long a signed URL stays valid, in seconds. */
const SIGN_SECONDS = 3600;
/** A cached URL is reused only while more than this much of its lifetime remains. */
const REUSE_MARGIN_MS = 10 * 60_000;

export interface SignedUrlCache {
  /** Signed URLs by path; paths the storage couldn't sign are left out. */
  urlsFor(bucket: string, paths: string[]): Promise<Map<string, string>>;
}

export function createSignedUrlCache(
  sign: (
    bucket: string,
    paths: string[],
    expiresIn: number,
  ) => Promise<Array<{ path: string; signedUrl: string }>>,
  now: () => number = Date.now,
): SignedUrlCache {
  const cache = new Map<string, { url: string; expiresAt: number }>();
  // Paths being signed right now, so concurrent callers share one request instead of each
  // signing the same path.
  const inFlight = new Map<string, Promise<string | undefined>>();
  const keyOf = (bucket: string, path: string) => `${bucket}/${path}`;

  function signBatch(bucket: string, paths: string[]): void {
    const signedAt = now();
    const batch = sign(bucket, paths, SIGN_SECONDS).then((signed) => {
      const urls = new Map<string, string>();
      for (const { path, signedUrl } of signed) {
        if (!signedUrl) continue;
        cache.set(keyOf(bucket, path), {
          url: signedUrl,
          expiresAt: signedAt + SIGN_SECONDS * 1000,
        });
        urls.set(path, signedUrl);
      }
      return urls;
    });
    for (const path of paths) {
      const key = keyOf(bucket, path);
      const pending = batch.then((urls) => urls.get(path));
      inFlight.set(key, pending);
      const clear = () => {
        if (inFlight.get(key) === pending) inFlight.delete(key);
      };
      pending.then(clear, clear);
    }
  }

  return {
    async urlsFor(bucket, paths) {
      const unique = [...new Set(paths)];
      const missing: string[] = [];
      for (const path of unique) {
        const key = keyOf(bucket, path);
        const cached = cache.get(key);
        const fresh = cached !== undefined && cached.expiresAt - now() > REUSE_MARGIN_MS;
        if (!fresh && !inFlight.has(key)) missing.push(path);
      }
      if (missing.length > 0) signBatch(bucket, missing);
      // Keep the caller's order.
      const ordered = new Map<string, string>();
      for (const path of unique) {
        const key = keyOf(bucket, path);
        const pending = inFlight.get(key);
        const url = pending ? await pending : cache.get(key)?.url;
        if (url !== undefined) ordered.set(path, url);
      }
      return ordered;
    },
  };
}
