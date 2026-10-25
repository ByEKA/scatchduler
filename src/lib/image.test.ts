import { describe, expect, it } from 'vitest';
import { fitWithin, prepareCoverImage } from '@/lib/image';

describe('cover images', () => {
  it.each([
    [4000, 3000, { width: 1600, height: 1200 }],
    [3000, 4000, { width: 1200, height: 1600 }],
    [800, 600, { width: 800, height: 600 }],
    [4000, 1, { width: 1600, height: 1 }],
  ])('fits %i×%i within 1600 px', (w, h, expected) => {
    expect(fitWithin(w, h, 1600)).toEqual(expected);
  });

  it('keeps the original file when the browser cannot re-encode images', async () => {
    const file = new File(['x'], 'photo.png', { type: 'image/png' });
    expect(await prepareCoverImage(file)).toBe(file);
  });
});
