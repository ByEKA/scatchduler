import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { TOKEN_PAIRS, contrast, parseThemes, runChecks, toRgba } from './check-contrast.mjs';

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

  it('checks the status badge pairs', () => {
    expect(TOKEN_PAIRS).toEqual(
      expect.arrayContaining([
        ['--muted-foreground', ['--muted'], 4.5],
        ['--success', ['--card'], 3],
        ['--success', ['--background'], 3],
        ['--warning-foreground', ['--warning-bg', '--card'], 4.5],
      ]),
    );
  });

  it('declares all twelve --gantt-* tokens in both themes and checks the four non-text pairs', () => {
    const css = readFileSync('src/index.css', 'utf8');
    const { light, dark } = parseThemes(css);
    const expected = [
      '--gantt-bar',
      '--gantt-bar-progress',
      '--gantt-critical',
      '--gantt-critical-progress',
      '--gantt-summary',
      '--gantt-milestone',
      '--gantt-link',
      '--gantt-link-driving',
      '--gantt-weekend',
      '--gantt-status-line',
      '--gantt-today-line',
      '--gantt-grid-line',
    ];
    for (const name of expected) {
      expect(light[name], `light ${name}`).toBeDefined();
      expect(dark[name], `dark ${name}`).toBeDefined();
    }
    const checked = TOKEN_PAIRS.map(([fg]) => fg);
    expect(checked).toEqual(
      expect.arrayContaining([
        '--gantt-bar',
        '--gantt-critical',
        '--gantt-status-line',
        '--gantt-summary',
      ]),
    );
    expect(runChecks(css)).toEqual([]);
  });
});
