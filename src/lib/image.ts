// Cover photos are shrunk in the browser before upload (P2 spec §8.3), so both adapters store the
// smaller image.

/** The longest edge of a stored cover photo, in pixels. */
export const COVER_MAX_EDGE = 1600;
/** JPEG quality of a re-encoded cover photo. */
export const COVER_QUALITY = 0.85;

/**
 * Scales `width` × `height` so the long edge is at most `max`, keeping the aspect ratio. Sizes
 * are rounded and at least 1; a smaller image is never upscaled.
 */
export function fitWithin(
  width: number,
  height: number,
  max: number,
): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function encodeJpeg(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob(resolve, 'image/jpeg', COVER_QUALITY);
  });
}

/**
 * The photo scaled to `COVER_MAX_EDGE` and re-encoded as JPEG over a white background (for
 * transparent PNGs). Returns `file` unchanged when the browser can't decode or encode images
 * (e.g. jsdom), when encoding fails, or when the result isn't smaller.
 */
export async function prepareCoverImage(file: File): Promise<File> {
  if (typeof createImageBitmap !== 'function') return file;
  try {
    const bitmap = await createImageBitmap(file);
    try {
      const size = fitWithin(bitmap.width, bitmap.height, COVER_MAX_EDGE);
      const canvas = document.createElement('canvas');
      canvas.width = size.width;
      canvas.height = size.height;
      const context = canvas.getContext('2d');
      if (context === null) return file;
      // The canvas background, not UI styling: JPEG has no transparency.
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, size.width, size.height);
      context.drawImage(bitmap, 0, 0, size.width, size.height);
      const blob = await encodeJpeg(canvas);
      if (blob === null || blob.size >= file.size) return file;
      const baseName = file.name.replace(/\.[^.]*$/, '');
      return new File([blob], `${baseName}.jpg`, { type: 'image/jpeg' });
    } finally {
      bitmap.close();
    }
  } catch {
    // Not a decodable image, or the canvas is unavailable: upload the original.
    return file;
  }
}
