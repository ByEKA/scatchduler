import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

// The custom sizes from the type scale in src/index.css. Without them tailwind-merge reads
// `text-display` as a text color and drops it when a color such as `text-white` follows.
// `ease-standard` is the custom easing; without it a component's default `ease-in-out` would stay
// next to it and the CSS order would pick the winner.
const twMerge = extendTailwindMerge({
  extend: { theme: { text: ['2xs', 'md', 'display'], ease: ['standard'] } },
});

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
