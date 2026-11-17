import { describe, expect, it } from 'vitest';
import {
  coordinateDecimals,
  parseCoordinate,
  splitCoordinatePair,
} from '@/features/projects/coordinates';

describe('coordinates', () => {
  it('reads a period or a comma as the decimal mark', () => {
    expect(parseCoordinate(' 41.0151 ')).toBe(41.0151);
    expect(parseCoordinate('41,0151')).toBe(41.0151);
    expect(parseCoordinate('-28.9795')).toBe(-28.9795);
    expect(parseCoordinate('')).toBeNull();
    expect(parseCoordinate('north')).toBeNaN();
    expect(parseCoordinate('1e3')).toBeNaN();
    expect(coordinateDecimals('41,0151234')).toBe(7);
    expect(coordinateDecimals('41')).toBe(0);
  });

  it('splits a pasted pair and leaves single numbers alone', () => {
    expect(splitCoordinatePair('41.0151, 28.9795')).toEqual(['41.0151', '28.9795']);
    expect(splitCoordinatePair('41.0151,28.9795')).toEqual(['41.0151', '28.9795']);
    expect(splitCoordinatePair('41,0151; 28,9795')).toEqual(['41,0151', '28,9795']);
    expect(splitCoordinatePair('-33.8688 151.2093')).toEqual(['-33.8688', '151.2093']);
    expect(splitCoordinatePair('41,0151')).toBeNull();
    expect(splitCoordinatePair('41.0151')).toBeNull();
  });
});
