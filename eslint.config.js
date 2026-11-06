import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import reactHooks from 'eslint-plugin-react-hooks';
import { reactRefresh } from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const ADAPTER_PATTERN = {
  group: [
    '@/data/mock',
    '@/data/mock/*',
    '@/data/supabase',
    '@/data/supabase/*',
    '**/data/mock/*',
    '**/data/supabase/*',
  ],
  message: 'UI code must go through hooks; only src/data/index.ts may import adapters.',
};

// src/import/** has its own `@/data/*` rule (PURE_IMPORT_PATTERN), so it repeats only the relative
// half of ADAPTER_PATTERN: the whole group would report '@/data/mock/seed' twice.
const RELATIVE_ADAPTER_PATTERN = {
  regex: '^\\.{1,2}/(?:.*/)?data/(?:mock|supabase)(?:/|$)',
  message: ADAPTER_PATTERN.message,
};

const PARSER_LIBRARIES = ['xlsx', 'papaparse', 'fast-xml-parser', 'fflate'];
const PARSER_LIBRARY_MESSAGE =
  'Parser libraries are imported statically only inside src/import; elsewhere use import().';
const PARSER_LIBRARY_PATHS = PARSER_LIBRARIES.map((name) => ({
  name,
  message: PARSER_LIBRARY_MESSAGE,
}));
// `paths` matches the bare name only; this group covers subpaths such as 'fflate/browser'.
const PARSER_LIBRARY_SUBPATHS = {
  group: PARSER_LIBRARIES.map((name) => `${name}/*`),
  message: PARSER_LIBRARY_MESSAGE,
};

// `group` patterns follow .gitignore rules: a bare '@/data' also matches '@/data/' as the parent
// of '@/data/types', and a file under an excluded parent can't be re-included by '!@/data/types'.
// So a bare specifier next to a negation is restricted through `paths` (an exact match) instead.
const PURE_IMPORT_MESSAGE = 'src/import is pure TypeScript: no React, hooks, UI or adapters.';
const PURE_IMPORT_PATTERN = {
  group: [
    'react',
    'react/*',
    'react-dom',
    'react-dom/*',
    '@/hooks',
    '@/hooks/*',
    '@/components',
    '@/components/*',
    '@/features',
    '@/features/*',
    '@/pages',
    '@/pages/*',
    '@/data/*',
    '!@/data/types',
  ],
  message: PURE_IMPORT_MESSAGE,
};
const PURE_IMPORT_PATHS = [{ name: '@/data', message: PURE_IMPORT_MESSAGE }];

const HOOKS_IMPORT_MESSAGE =
  'Hooks use the import parser through @/import/client; other src/import modules for types only.';

export default defineConfig([
  globalIgnores([
    '.claude',
    'dist',
    'dist-e2e',
    'dist-supabase',
    'playwright-report-supabase',
    'test-results-supabase',
    'coverage',
    'playwright-report',
    'test-results',
    'src/components/ui',
    'src/data/supabase/database.types.ts',
    // Deno code (P2 spec §12); logic.ts next to it is linted.
    'supabase/functions/**/index.ts',
  ]),
  js.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      jsxA11y.flatConfigs.recommended,
    ],
    plugins: { 'react-refresh': reactRefresh.plugin },
    languageOptions: { globals: globals.browser },
    rules: {
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },
  {
    files: ['public/**/*.js'],
    languageOptions: { sourceType: 'script', globals: globals.browser },
  },
  {
    files: ['scripts/**', '*.config.*'],
    languageOptions: { globals: globals.node },
  },
  // Import boundaries (P2 data layer; P3 core spec §3 and S7). A flat-config block replaces
  // `no-restricted-imports` instead of merging it, so each block that touches a file lists every
  // rule that applies there. scripts/import-boundaries.test.mjs pins these blocks.
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/data/**', 'src/test/**', 'src/hooks/**', 'src/import/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            ADAPTER_PATTERN,
            {
              group: ['@/import', '@/import/*'],
              message: 'Only hooks use the import parser, through @/import/client.',
            },
            PARSER_LIBRARY_SUBPATHS,
          ],
          paths: PARSER_LIBRARY_PATHS,
        },
      ],
    },
  },
  {
    files: ['src/hooks/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            ADAPTER_PATTERN,
            {
              group: ['@/import/*', '!@/import/client'],
              allowTypeImports: true,
              message: HOOKS_IMPORT_MESSAGE,
            },
            PARSER_LIBRARY_SUBPATHS,
          ],
          paths: [
            { name: '@/import', allowTypeImports: true, message: HOOKS_IMPORT_MESSAGE },
            ...PARSER_LIBRARY_PATHS,
          ],
        },
      ],
    },
  },
  {
    files: ['src/data/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: [PARSER_LIBRARY_SUBPATHS], paths: PARSER_LIBRARY_PATHS },
      ],
    },
  },
  {
    files: ['src/import/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: [PURE_IMPORT_PATTERN, RELATIVE_ADAPTER_PATTERN], paths: PURE_IMPORT_PATHS },
      ],
    },
  },
  {
    files: ['src/import/client.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            PURE_IMPORT_PATTERN,
            RELATIVE_ADAPTER_PATTERN,
            {
              group: ['./*', '!./protocol'],
              allowTypeImports: true,
              message:
                'client.ts statically imports only ./protocol; it loads ./in-thread with import().',
            },
          ],
          paths: PURE_IMPORT_PATHS,
        },
      ],
    },
  },
]);
