import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { contrast, parseThemes, runChecks, toRgba } from './check-contrast.mjs';

describe('check-contrast', () => {
  it('computes WCAG ratios', () => {
    expect(contrast(toRgba('#000000', {}), toRgba('#ffffff', {}))).toBeCloseTo(21, 1);
  });

  it('resolves var(), rgb() with alpha and color-mix() with transparent', () => {
    const vars = { '--brand-500': '#6366f1' };
    expect(toRgba('var(--brand-500)', vars)).toEqual([99, 102, 241, 1]);
    expect(toRgba('rgb(245 158 11 / 0.12)', vars)).toEqual([245, 158, 11, 0.12]);
    expect(toRgba('color-mix(in oklab, var(--brand-500) 16%, transparent)', vars)).toEqual([
      99, 102, 241, 0.16,
    ]);
  });

  it('lets .dark inherit the :root values it does not override', () => {
    const { light, dark } = parseThemes(
      ':root { --a: #111111; --b: #222222; } .dark { --b: #333333; }',
    );
    expect(light).toEqual({ '--a': '#111111', '--b': '#222222' });
    expect(dark).toEqual({ '--a': '#111111', '--b': '#333333' });
  });

  it('passes every required pair for the real tokens', () => {
    expect(runChecks(readFileSync('src/index.css', 'utf8'))).toEqual([]);
  });
});
