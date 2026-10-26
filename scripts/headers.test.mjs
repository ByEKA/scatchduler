import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

it('sets the security headers for every path', () => {
  const lines = readFileSync('public/_headers', 'utf8')
    .split('\n')
    .map((l) => l.trim());
  expect(lines[0]).toBe('/*');
  expect(lines).toContain(
    "Content-Security-Policy: default-src 'self'; connect-src 'self' https://*.supabase.co wss://*.supabase.co; img-src 'self' data: blob: https://*.supabase.co; style-src 'self' 'unsafe-inline'; font-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
  );
  expect(lines).toContain('X-Content-Type-Options: nosniff');
  expect(lines).toContain('Referrer-Policy: strict-origin-when-cross-origin');
  expect(lines).toContain('Permissions-Policy: camera=(), microphone=(), geolocation=()');
});

it('keeps index.html free of inline scripts', () => {
  const html = readFileSync('index.html', 'utf8');
  const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)];
  expect(scripts.length).toBeGreaterThan(0);
  for (const [, attributes, body] of scripts) {
    expect(attributes).toMatch(/\bsrc=/);
    expect(body.trim()).toBe('');
  }
});
