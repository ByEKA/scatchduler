import { describe, expect, it } from 'vitest';
import { collectPackages, formatLicenses, licenseOf } from './third-party-licenses.mjs';

const tree = {
  name: 'scheduler-app',
  version: '0.1.0',
  path: '/app',
  dependencies: {
    'react-dom': {
      name: 'react-dom',
      version: '19.3.1',
      license: 'MIT',
      path: '/app/node_modules/react-dom',
      dependencies: {
        scheduler: {
          name: 'scheduler',
          version: '0.27.0',
          license: 'MIT',
          path: '/app/node_modules/scheduler',
        },
        react: { version: '19.3.1' },
        // An unmet optional peer dependency: `npm ls` prints it without a version.
        '@opentelemetry/api': {},
      },
    },
    react: { name: 'react', version: '19.3.1', license: 'MIT', path: '/app/node_modules/react' },
    xlsx: {
      name: 'xlsx',
      version: '0.20.3',
      license: 'Apache-2.0',
      path: '/app/node_modules/xlsx',
    },
    old: {
      name: 'old',
      version: '1.0.0',
      licenses: [{ type: 'MIT' }, { type: 'BSD-2-Clause' }],
      path: '/app/node_modules/old',
    },
  },
};

describe('third-party-licenses', () => {
  it('lists each production package once, by name', () => {
    expect(collectPackages(tree).map((p) => `${p.name}@${p.version}`)).toEqual([
      'old@1.0.0',
      'react@19.3.1',
      'react-dom@19.3.1',
      'scheduler@0.27.0',
      'xlsx@0.20.3',
    ]);
  });

  it('reads licence types in their old and new forms', () => {
    expect(licenseOf({ license: 'MIT' })).toBe('MIT');
    expect(licenseOf({ license: { type: 'ISC' } })).toBe('ISC');
    expect(licenseOf({ licenses: [{ type: 'MIT' }, { type: 'BSD-2-Clause' }] })).toBe(
      'MIT OR BSD-2-Clause',
    );
    expect(licenseOf({})).toBe('UNKNOWN');
  });

  it('writes every package with its licence and its licence and NOTICE texts', () => {
    const files = {
      '/app/node_modules/xlsx': [
        ['LICENSE', 'Apache text'],
        ['NOTICE', 'SheetJS notice'],
      ],
      '/app/node_modules/react': [['LICENSE', 'MIT text']],
    };
    const text = formatLicenses(collectPackages(tree), (dir) => files[dir] ?? []);
    expect(text.startsWith('Third-party licences\n')).toBe(true);
    expect(text).toContain('xlsx 0.20.3\nLicense: Apache-2.0\n');
    expect(text).toContain('--- NOTICE ---\nSheetJS notice');
    expect(text).toContain('scheduler 0.27.0\nLicense: MIT\n');
    expect(text).toContain('react 19.3.1\nLicense: MIT\n\n--- LICENSE ---\nMIT text');
    expect(text.indexOf('react 19.3.1')).toBeLessThan(text.indexOf('xlsx 0.20.3'));
  });
});
