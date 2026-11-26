// @vitest-environment node
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { basename, isAbsolute, relative, sep } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  ENGINE_TIMEZONES,
  buildVitestCommand,
  resolveVitestEntry,
  runForTimezone,
} from './test-engine-timezones.mjs';

const ENGINE_ARGS = ['run', 'src/engine', '--passWithNoTests'];

describe('test-engine-timezones', () => {
  it('keeps the four engine time zones', () => {
    expect(ENGINE_TIMEZONES).toEqual([
      'UTC',
      'America/Los_Angeles',
      'Europe/Istanbul',
      'Pacific/Auckland',
    ]);
  });

  it('resolves the vitest CLI entry from the vitest package bin', () => {
    const entry = resolveVitestEntry();
    expect(isAbsolute(entry)).toBe(true);
    expect(existsSync(entry)).toBe(true);
    expect(basename(entry)).toBe('vitest.mjs');
    expect(relative(process.cwd(), entry).split(sep).join('/')).toBe(
      'node_modules/vitest/vitest.mjs',
    );
  });

  it('spawns the vitest CLI through process.execPath, never npx or a .cmd shim', () => {
    const { command, args, options } = buildVitestCommand('Europe/Istanbul');
    expect(command).toBe(process.execPath);
    expect(args).toEqual([resolveVitestEntry(), ...ENGINE_ARGS]);
    expect(
      [command, ...args].some((part) => /\.(cmd|bat)$/i.test(part) || /(^|[\\/])npx/i.test(part)),
    ).toBe(false);
    expect(options).not.toHaveProperty('shell');
    expect(options.stdio).toBe('inherit');
    expect(options.env).toEqual({
      ...process.env,
      TZ: 'Europe/Istanbul',
      ENGINE_TEST_TZ: 'Europe/Istanbul',
    });
  });

  it('starts the resolved vitest CLI without a shell', () => {
    const { command, args, options } = buildVitestCommand('UTC');
    const result = spawnSync(command, [args[0], '--version'], {
      env: options.env,
      encoding: 'utf8',
    });
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/^vitest\/\d+\.\d+\.\d+ /);
  });

  it('prints the spawn error and returns 1 when vitest cannot start', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const spawn = vi.fn(() => ({
      status: null,
      signal: null,
      error: Object.assign(new Error('spawnSync npx.cmd EINVAL'), { code: 'EINVAL' }),
    }));
    expect(runForTimezone('UTC', spawn)).toBe(1);
    expect(spawn).toHaveBeenCalledWith(
      process.execPath,
      [resolveVitestEntry(), ...ENGINE_ARGS],
      expect.objectContaining({ stdio: 'inherit', env: expect.objectContaining({ TZ: 'UTC' }) }),
    );
    expect(errorSpy).toHaveBeenCalledWith(
      'Engine TZ check: could not start vitest under TZ=UTC: spawnSync npx.cmd EINVAL',
    );
  });

  it('returns the vitest exit status, and 1 with a message when vitest is killed', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(runForTimezone('UTC', () => ({ status: 0, signal: null }))).toBe(0);
    expect(runForTimezone('UTC', () => ({ status: 3, signal: null }))).toBe(3);
    expect(errorSpy).not.toHaveBeenCalled();
    expect(runForTimezone('Pacific/Auckland', () => ({ status: null, signal: 'SIGTERM' }))).toBe(1);
    expect(errorSpy).toHaveBeenCalledWith(
      'Engine TZ check: vitest under TZ=Pacific/Auckland was killed by SIGTERM',
    );
  });
});
