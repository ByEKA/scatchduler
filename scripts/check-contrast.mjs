// WCAG 2.x contrast check over the design tokens in src/index.css (spec section 8).
// `npm run check:contrast` runs it; the helpers are exported for scripts/check-contrast.test.mjs.
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const TEXT = 4.5;
const NON_TEXT = 3;

// [foreground, background layers from top to bottom, minimum ratio]; checked in both themes.
const TOKEN_PAIRS = [
  ['--foreground', ['--background'], TEXT],
  ['--foreground', ['--card'], TEXT],
  ['--foreground', ['--popover'], TEXT],
  ['--muted-foreground', ['--background'], TEXT],
  ['--muted-foreground', ['--card'], TEXT],
  ['--subtle-foreground', ['--sidebar'], TEXT],
  ['--sidebar-foreground', ['--sidebar'], TEXT],
  ['--sidebar-accent-foreground', ['--sidebar-accent', '--sidebar'], TEXT],
  ['--link', ['--card'], TEXT],
  ['--link', ['--background'], TEXT],
  ['--primary-foreground', ['--primary'], TEXT],
  ['--warning-foreground', ['--warning-bg', '--card'], TEXT],
  ['--destructive', ['--card'], TEXT],
  ['--ring', ['--card'], NON_TEXT],
  ['--success', ['--popover'], NON_TEXT],
];

// The welcome banner's date: white at 85 % over the strongest point of the brand-400 highlight
// (30 %) on brand-700, the lighter end of the banner gradient. The banner is the same in both
// themes, so it is checked once with the :root values.
const BANNER_DATE = {
  pair: 'banner date (white 85%) on --brand-400 at 30% over --brand-700',
  fg: 'rgb(255 255 255 / 0.85)',
  layers: ['color-mix(in oklab, var(--brand-400) 30%, transparent)', 'var(--brand-700)'],
  min: TEXT,
};

function stripComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

// Custom properties declared in the first rule whose whole selector is `selector`.
function readBlock(css, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const rule = new RegExp(`(?:^|[{};])\\s*${escaped}\\s*\\{([^}]*)\\}`).exec(css);
  const properties = {};
  for (const [, name, value] of (rule?.[1] ?? '').matchAll(/(--[\w-]+)\s*:\s*([^;]+)/g)) {
    properties[name] = value.trim();
  }
  return properties;
}

export function parseThemes(css) {
  const source = stripComments(css);
  const light = readBlock(source, ':root');
  const darkOwn = readBlock(source, '.dark');
  // Without this, a renamed or missing rule would make the dark checks measure the light values.
  for (const [selector, block] of [
    [':root', light],
    ['.dark', darkOwn],
  ]) {
    if (Object.keys(block).length === 0) {
      throw new Error(`No custom properties in a "${selector} { ... }" rule`);
    }
  }
  return { light, dark: { ...light, ...darkOwn } };
}

function resolve(value, vars, seen) {
  const text = value.trim();

  const hex = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(text);
  if (hex) {
    return [parseInt(hex[1], 16), parseInt(hex[2], 16), parseInt(hex[3], 16), 1];
  }

  const rgb = /^rgb\(\s*(\d+)\s+(\d+)\s+(\d+)\s*\/\s*(\d*\.?\d+)\s*\)$/i.exec(text);
  if (rgb) {
    return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3]), Number(rgb[4])];
  }

  const reference = /^var\(\s*(--[\w-]+)\s*\)$/.exec(text);
  if (reference) {
    const name = reference[1];
    if (seen.includes(name)) {
      throw new Error(`Circular reference: ${[...seen, name].join(' -> ')}`);
    }
    if (vars[name] === undefined) {
      throw new Error(`Undefined custom property: ${name}`);
    }
    return resolve(vars[name], vars, [...seen, name]);
  }

  const mix = /^color-mix\(\s*in\s+oklab\s*,\s*(.+?)\s+(\d*\.?\d+)%\s*,\s*transparent\s*\)$/i.exec(
    text,
  );
  if (mix) {
    const [r, g, b, a] = resolve(mix[1], vars, seen);
    return [r, g, b, (a * Number(mix[2])) / 100];
  }

  throw new Error(`Unsupported color: ${value}`);
}

export function toRgba(value, vars) {
  return resolve(value, vars, []);
}

// Source-over compositing of `top` onto `bottom`, both [r, g, b, a].
function over(top, bottom) {
  const [tr, tg, tb, ta] = top;
  const [br, bg, bb, ba] = bottom;
  const alpha = ta + ba * (1 - ta);
  if (alpha === 0) return [0, 0, 0, 0];
  const channel = (t, b) => (t * ta + b * ba * (1 - ta)) / alpha;
  return [channel(tr, br), channel(tg, bg), channel(tb, bb), alpha];
}

function luminance([r, g, b]) {
  const linear = (value) => {
    const c = value / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

export function contrast(fg, bg) {
  if (bg[3] < 1) {
    throw new Error(`Background must be opaque to measure contrast: rgba(${bg.join(', ')})`);
  }
  const text = fg[3] < 1 ? over(fg, bg) : fg;
  const a = luminance(text);
  const b = luminance(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

function measure(theme, vars, { pair, fg, layers, min }) {
  const background = layers
    .map((layer) => toRgba(layer, vars))
    .reduceRight((below, layer) => over(layer, below));
  return { theme, pair, ratio: contrast(toRgba(fg, vars), background), min };
}

function measureAll(css) {
  const themes = parseThemes(css);
  const results = [];
  for (const [theme, vars] of Object.entries(themes)) {
    for (const [fg, layers, min] of TOKEN_PAIRS) {
      const check = {
        pair: `${fg} on ${layers.join(' over ')}`,
        fg: `var(${fg})`,
        layers: layers.map((name) => `var(${name})`),
        min,
      };
      results.push(measure(theme, vars, check));
    }
  }
  results.push(measure('light', themes.light, BANNER_DATE));
  return results;
}

// Ratios are cut (not rounded) to two decimals so a failing ratio never prints as the minimum
// it missed.
function failuresOf(results) {
  return results
    .filter(({ ratio, min }) => ratio < min)
    .map((result) => ({ ...result, ratio: Math.floor(result.ratio * 100) / 100 }));
}

export function runChecks(css) {
  return failuresOf(measureAll(css));
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const results = measureAll(readFileSync(new URL('../src/index.css', import.meta.url), 'utf8'));
  const failures = failuresOf(results);
  if (failures.length > 0) {
    console.table(failures);
    process.exitCode = 1;
  } else {
    console.log(`Contrast OK: ${results.length} checks passed`);
  }
}
