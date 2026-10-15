// Generated cover for projects without a photo (spec §6.10). The hash of the project id picks an
// indigo-to-violet base hue, a second hue 30 to 89 degrees further round and the gradient angle; a
// faint 20 px blueprint grid lies on top.

const FNV_OFFSET_BASIS = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

/** 32-bit FNV-1a over the UTF-16 code units of `input`, as an unsigned integer. */
export function fnv1a(input: string): number {
  let hash = FNV_OFFSET_BASIS;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, FNV_PRIME);
  }
  return hash >>> 0;
}

const GRID_LINE = 'rgb(255 255 255 / 0.07)';

/** Same seed, same cover. The result can be passed straight to a `style` prop. */
export function coverFor(seed: string): { backgroundImage: string; backgroundSize: string } {
  const hash = fnv1a(seed);
  const base = 225 + (hash % 50);
  const second = (base + 30 + ((hash >>> 8) % 60)) % 360;
  const angle = (hash >>> 16) % 360;
  return {
    backgroundImage: [
      `linear-gradient(${GRID_LINE} 1px, transparent 1px)`,
      `linear-gradient(90deg, ${GRID_LINE} 1px, transparent 1px)`,
      `linear-gradient(${angle}deg, hsl(${base} 45% 34%), hsl(${second} 40% 20%))`,
    ].join(', '),
    backgroundSize: '20px 20px, 20px 20px, 100% 100%',
  };
}
