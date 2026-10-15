import { describe, expect, it } from 'vitest';
import { cn } from '@/lib/utils';

describe('cn', () => {
  it('merges conflicting Tailwind classes, last one wins', () => {
    expect(cn('px-2 text-sm', 'px-4')).toBe('text-sm px-4');
  });

  it('drops falsy values', () => {
    const off = false as boolean;
    expect(cn('a', off && 'b', undefined, null, 'c')).toBe('a c');
  });

  it('keeps custom font sizes next to text colors', () => {
    expect(cn('text-display', 'text-white')).toBe('text-display text-white');
    expect(cn('text-sm', 'text-display')).toBe('text-display');
  });
});
