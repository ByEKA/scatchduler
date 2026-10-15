import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

// The custom sizes from the type scale in src/index.css. Without them tailwind-merge reads
// `text-display` as a text color and drops it when a color such as `text-white` follows.
const twMerge = extendTailwindMerge({
  extend: { theme: { text: ['2xs', 'md', 'display'] } },
});

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
