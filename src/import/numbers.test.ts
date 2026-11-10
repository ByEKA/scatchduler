import { describe, expect, it } from 'vitest';
import { guessDecimalSeparator, parseNumber } from '@/import/numbers';

describe('numbers', () => {
  it('reads decimal commas and periods, grouping and percent signs', () => {
    expect(parseNumber('2,5', ',')).toBe(2.5);
    expect(parseNumber('1.234,5', ',')).toBe(1234.5);
    expect(parseNumber('1,234.5', '.')).toBe(1234.5);
    expect(parseNumber(' 50% ', '.')).toBe(50);
    expect(parseNumber('-3', '.')).toBe(-3);
    expect(parseNumber('', ',')).toBeNull();
    expect(parseNumber('abc', '.')).toBeNaN();
  });

  it('guesses the decimal separator from samples', () => {
    expect(guessDecimalSeparator(['2,5', '10', '1.234,5'])).toBe(',');
    expect(guessDecimalSeparator(['2.5', '1,234.5'])).toBe('.');
    expect(guessDecimalSeparator(['10', '20'])).toBe('.');
  });
});
