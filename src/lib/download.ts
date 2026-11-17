/** How long an object URL outlives its click; some browsers read it after `click()` returns. */
const REVOKE_AFTER_MS = 10_000;

/**
 * Saves `blob` as a download named `fileName` (P3 core plan, "Files beyond the spec's tree"): a
 * temporary `<a download>` to an object URL is clicked once and removed, and the URL is revoked
 * shortly after.
 */
export function saveFile(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.hidden = true;
  document.body.append(link);
  try {
    link.click();
  } finally {
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), REVOKE_AFTER_MS);
  }
}
