# Home Screen & App Shell — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Without the superpowers plugin: execute the tasks in order yourself, following each step literally.

**Goal:** Build the signed-in app shell and the Home screen of our scheduling product on a mock data layer that can later switch to Supabase without UI changes.

**Architecture:** React components read and write only through TanStack Query hooks; hooks call a `DataRepository` / `AuthService` interface provided through React context; Phase 1 ships a localStorage-backed `MockRepository` with seeded scenarios, simulated latency and failure injection. Design tokens live in `src/index.css` (Tailwind v4, CSS-first); UI primitives come from shadcn/ui.

**Tech Stack:** React 19, Vite, TypeScript (strict), Tailwind CSS v4, shadcn/ui (Radix), lucide-react, React Router ≥ 7 (declarative), TanStack Query v5, react-hook-form + zod, date-fns, sonner, cmdk, Vitest + Testing Library + jsdom, Playwright, npm.

**Spec:** `docs/superpowers/specs/2026-10-14-home-shell-design.md` — read it before Task 1. Each task names the spec sections it implements; values in those sections are requirements even when this plan doesn't repeat them.

## Global Constraints

- TypeScript strict with `noUncheckedIndexedAccess`, `verbatimModuleSyntax`, `erasableSyntaxOnly`: use `import type`; no `enum`, no `namespace`, no constructor parameter properties.
- Tailwind CSS v4 through `@tailwindcss/vite`; all theme config lives in `src/index.css`; there is no `tailwind.config.js`.
- shadcn/ui components live in `src/components/ui`; wrap them instead of changing their public API.
- No hard-coded colors in components — use token utilities (`bg-card`, `text-muted-foreground`, `text-link`, `bg-brand-600`, `ring-edge`, …). Only the brand banner uses white overlays (`text-white`, `bg-white/12`, `ring-white/24`) as the spec prescribes.
- UI copy: English, sentence case, verbatim from the spec — or from this plan where the spec is silent. No exclamation marks.
- Only `src/data/index.ts` and `src/test/**` may import `src/data/mock/**` or `src/data/supabase/**` (ESLint-enforced).
- All `localStorage` access goes through `src/lib/storage.ts`. Keys: `mock-db.v1`, `ui.theme`, `ui.sidebarOpen`, `ui.lastWorkspaceId`, `ui.lastProjectId.<workspaceId>`.
- Env: `VITE_DATA_SOURCE` (`mock` default; `supabase` throws `Supabase data source is not implemented yet (Phase 2). Set VITE_DATA_SOURCE=mock.`), `VITE_MOCK_SCENARIO` (`default` | `empty`), `VITE_MOCK_LATENCY_MS` (default `400`), `VITE_MOCK_FAIL_RATE` (default `0`).
- QueryClient: `staleTime: 30_000`, `retry: 1`, `refetchOnWindowFocus: false`; tests use `retry: false`. Recent projects limit: `5`.
- No third-party logos, illustrations, images or copy; icons come from lucide only.
- Text contrast ≥ 4.5 : 1; focus ring, input borders and success icon ≥ 3 : 1 (`npm run check:contrast`).
- Unit tests run with `TZ=America/Los_Angeles`.
- One commit per task, Conventional Commits (`feat:`, `fix:`, `test:`, `chore:`, `docs:`).
- If a CLI behaves differently in the installed version (renamed flag, new prompt), use the closest non-interactive equivalent that produces the same files and note it in the commit body.

## Review Focus

1. **Date-only values shifting by a day** in negative UTC offsets (`'2026-10-12'` parsed as UTC reads Oct 11 in the Americas). Expected: calendar dates display exactly as stored. Pinned by the suite-wide `TZ` (Task 1), `shortDate` / `dueLabel` tests (Task 4) and the seed status-date test (Task 5).
2. **Long unbroken names** (120+ characters, no spaces) in project cards and shared rows. Expected: one truncated line, full text in `title`. Pinned in Task 16 (ProjectCard) and Task 17 (SharedSchedulesTable).
3. **Double-clicking a submit button.** Expected: exactly one record is created. Pinned in Task 14 (New schedule) and Task 15 (New project).
4. **Browser storage unavailable** (private mode, blocked site data, quota). Expected: the app keeps working in memory and nothing throws. Pinned in Task 3 (`storage.ts`) and Task 5 (mock store).
5. **Mixed-case extensions and whitespace-only names** (`BASELINE.XER`, `"   "`). Expected: the extension is accepted, whitespace-only names are rejected, surrounding spaces are trimmed on save. Pinned in Task 14 (import schema) and Task 15 (project schema and save).

## Files beyond the spec's folder tree (§4.2)

| File | Responsibility | Task |
|---|---|---|
| `scripts/check-contrast.mjs` | WCAG contrast check over the tokens | 2 |
| `src/lib/storage.ts` | Safe `localStorage` access with in-memory fallback | 3 |
| `src/app/queryClient.ts` | `createQueryClient()` with the defaults above | 7 |
| `src/test/fakes.ts`, `src/test/render.tsx`, `src/test/viewport.ts` | Test data layer, render helpers, `matchMedia` mock | 7, 11 |
| `src/components/common/StartupError.tsx` | Message shown when `createDataLayer()` throws | 8 |
| `src/components/common/FormDialog.tsx` | Dialog + form + footer + discard confirmation | 10 |
| `src/features/schedules/ProjectCombobox.tsx` | Searchable project picker used by both schedule dialogs | 14 |
| `src/features/projects/WizardStepper.tsx`, `src/hooks/useDebouncedValue.ts` | Wizard stepper, debounced Project ID check | 15 |

## Tasks

| # | Task | Deliverable |
|---|---|---|
| 1 | Tooling scaffold | `npm run check` green with the first test |
| 2 | Design tokens & contrast check | tokens + passing contrast script |
| 3 | Storage, theme, shadcn primitives, brand | ThemeProvider and BrandLogo tested |
| 4 | Domain types & pure helpers | format / trial / cover tested |
| 5 | Data contract, mock store, seed, latency | store and seed tested |
| 6 | Mock repository & auth service | adapter behavior tested |
| 7 | Data layer wiring & hooks | hooks tested |
| 8 | Auth flow, router skeleton, app providers | sign-in and guard tested |
| 9 | Current workspace & project context | resolution rules tested |
| 10 | Dialog infrastructure & New team workspace | dialog host and form dialog tested |
| 11 | App shell layout | sidebar, top bar frame, skip link tested |
| 12 | Top bar controls | switchers, plan badge, user menu tested |
| 13 | Routes & placeholder pages | full route table tested |
| 14 | Schedule dialogs | New schedule + Import tested |
| 15 | New project wizard | 4-step flow tested |
| 16 | Home: banner & recent projects | tested |
| 17 | Home: shared schedules & workspaces | tested |
| 18 | Home: to-do & page composition | tested |
| 19 | End-to-end tests & screenshots | Playwright green |
| 20 | Final verification & docs | all checks green, owner review |

---

### Task 1: Tooling scaffold

**Spec:** §3, §4.2, §8 (npm scripts).

**Files:**
- Create: `package.json`, `tsconfig.json`, `tsconfig.app.json`, `tsconfig.node.json`, `vite.config.ts`, `vitest.config.ts`, `eslint.config.js`, `.prettierrc.json`, `.prettierignore`, `.gitignore`, `.env.example`, `.env.test`, `index.html`, `src/main.tsx`, `src/app/App.tsx`, `src/index.css`, `src/vite-env.d.ts`, `src/lib/utils.ts`, `src/test/setup.ts`
- Test: `src/lib/utils.test.ts`

**Interfaces:**
- Produces: `cn(...inputs: ClassValue[]): string` in `src/lib/utils.ts`; import alias `@/` → `src/`; npm scripts `dev`, `build`, `preview`, `typecheck`, `lint`, `format`, `test`, `test:watch`, `check`; a jsdom test setup with jest-dom matchers, automatic cleanup, `localStorage.clear()` and `<html>` class reset after each test.

- [ ] **Step 1: Commit the kit as the first commit**

```bash
git init
git add -A
git commit -m "docs: add spec, plan and Claude Code project guide"
```
Expected: one commit containing `CLAUDE.md`, `START-HERE.md` and `docs/`.

- [ ] **Step 2: Create `package.json` and install dependencies (no interactive scaffolder)**

```bash
npm init -y
npm pkg set name=scheduler-app version=0.1.0 type=module
npm pkg set private=true --json
npm pkg delete main scripts.test
npm install react react-dom react-router @tanstack/react-query react-hook-form zod @hookform/resolvers date-fns lucide-react clsx tailwind-merge class-variance-authority @fontsource-variable/inter @fontsource/jetbrains-mono
npm install -D vite @vitejs/plugin-react typescript @types/react @types/react-dom @types/node tailwindcss @tailwindcss/vite tw-animate-css vitest jsdom @testing-library/react @testing-library/dom @testing-library/user-event @testing-library/jest-dom eslint@^9 @eslint/js@^9 typescript-eslint eslint-plugin-react-hooks eslint-plugin-react-refresh eslint-plugin-jsx-a11y globals prettier prettier-plugin-tailwindcss
npm pkg set "scripts.dev=vite" "scripts.build=tsc -b && vite build" "scripts.preview=vite preview" "scripts.typecheck=tsc -b" "scripts.lint=eslint ." "scripts.format=prettier --write ." "scripts.test=vitest run" "scripts.test:watch=vitest" "scripts.check=npm run typecheck && npm run lint && npm run test"
```
Expected: `package.json` lists the dependencies and the nine scripts, and `"private": true` is a boolean. `eslint` stays on v9 because `eslint-plugin-jsx-a11y` doesn't accept v10 yet; npm then picks the newest TypeScript that `typescript-eslint` supports. If another peer-dependency conflict appears, pin the newest major that satisfies it — never use `--force` or `--legacy-peer-deps`. npm prints a deprecation warning for `eslint@9`; that is expected.

- [ ] **Step 3: Write the config files with these settings**

| File | Settings |
|---|---|
| `tsconfig.json` | `"files": []`, references `./tsconfig.app.json` and `./tsconfig.node.json`, `compilerOptions.paths: { "@/*": ["./src/*"] }` (the shadcn CLI reads aliases here) |
| `tsconfig.app.json` | `target ES2022`, `lib ["ES2022","DOM","DOM.Iterable"]`, `module ESNext`, `moduleResolution bundler`, `jsx react-jsx`, `types ["vite/client"]`, `strict`, `noUncheckedIndexedAccess`, `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`, `verbatimModuleSyntax`, `erasableSyntaxOnly`, `moduleDetection force`, `skipLibCheck`, `noEmit`, `tsBuildInfoFile ./node_modules/.tmp/tsconfig.app.tsbuildinfo`, `paths { "@/*": ["./src/*"] }`; `include ["src"]` |
| `tsconfig.node.json` | `target ES2023`, `lib ["ES2023"]`, `module ESNext`, `moduleResolution bundler`, `types ["node"]`, `strict`, `verbatimModuleSyntax`, `erasableSyntaxOnly`, `skipLibCheck`, `noEmit`, `allowImportingTsExtensions`, `tsBuildInfoFile ./node_modules/.tmp/tsconfig.node.tsbuildinfo`; `include ["vite.config.ts", "vitest.config.ts", "playwright.config.ts", "e2e"]` |
| `vite.config.ts` | plugins `react()`, `tailwindcss()`; `resolve.alias['@'] = fileURLToPath(new URL('./src', import.meta.url))` |
| `vitest.config.ts` | `import viteConfig from './vite.config.ts'` (keep the `.ts` extension — Vite's native config loader warns without it), `process.env.TZ = 'America/Los_Angeles';` at the top of the module body, then export `mergeConfig(viteConfig, defineConfig({ test: { environment: 'jsdom', setupFiles: ['./src/test/setup.ts'], include: ['src/**/*.test.{ts,tsx}', 'scripts/**/*.test.mjs'], restoreMocks: true } }))` |
| `eslint.config.js` | ignores `dist`, `coverage`, `playwright-report`, `test-results`, `src/components/ui`; `@eslint/js` recommended; `typescript-eslint` recommended for `**/*.{ts,tsx}` with browser globals; react-hooks recommended flat config; `jsx-a11y` flat recommended; `react-refresh/only-export-components` as warn; Node globals for `scripts/**` and `*.config.*`; plus the architecture block below |
| `.prettierrc.json` | `{ "singleQuote": true, "semi": true, "printWidth": 100, "plugins": ["prettier-plugin-tailwindcss"] }`; `.prettierignore`: `dist`, `coverage`, `package-lock.json`, `src/components/ui`, `docs`, `*.md` (keeps `npm run format` away from the spec and plan) |
| `.gitignore` | `node_modules`, `dist`, `coverage`, `.env.local`, `.env.*.local`, `test-results`, `playwright-report`, `.DS_Store` |
| `.env.example` | `VITE_DATA_SOURCE=mock`, `VITE_MOCK_SCENARIO=default`, `VITE_MOCK_LATENCY_MS=400`, `VITE_MOCK_FAIL_RATE=0`, then commented `# VITE_SUPABASE_URL=` and `# VITE_SUPABASE_ANON_KEY=` |
| `.env.test` | `VITE_MOCK_LATENCY_MS=0` |
| `src/vite-env.d.ts` | `/// <reference types="vite/client" />`; `ImportMetaEnv` with optional readonly `VITE_DATA_SOURCE?: 'mock' \| 'supabase'`, `VITE_MOCK_SCENARIO?: 'default' \| 'empty'`, `VITE_MOCK_LATENCY_MS?: string`, `VITE_MOCK_FAIL_RATE?: string`, `VITE_SUPABASE_URL?: string`, `VITE_SUPABASE_ANON_KEY?: string`; `interface Window { __resetMockDb?: () => void }` |
| `index.html` | `<html lang="en" class="dark">`, viewport meta, `<title>AppName</title>`, `<div id="root">`, module script `/src/main.tsx` |
| `src/index.css` | `@import "tailwindcss";` (Task 2 completes it) |
| `src/main.tsx` | imports `./index.css`, renders `<StrictMode><App /></StrictMode>` into `#root` |
| `src/app/App.tsx` | temporary `export function App()` returning `<h1>AppName</h1>` (replaced in Task 8) |
| `src/test/setup.ts` | `import '@testing-library/jest-dom/vitest'`; `afterEach`: `cleanup()`, `localStorage.clear()`, `document.documentElement.className = ''`; jsdom gaps: `window.matchMedia` (always `matches: false`, with add/remove listener no-ops), `globalThis.ResizeObserver` no-op class, `Element.prototype.scrollIntoView = vi.fn()`, `Element.prototype.hasPointerCapture = () => false`, `releasePointerCapture` / `setPointerCapture` no-ops |

Architecture block for `eslint.config.js` (S4):

```js
{
  files: ['src/**/*.{ts,tsx}'],
  ignores: ['src/data/**', 'src/test/**'],
  rules: {
    'no-restricted-imports': ['error', { patterns: [{
      group: ['@/data/mock', '@/data/mock/*', '@/data/supabase', '@/data/supabase/*', '**/data/mock/*', '**/data/supabase/*'],
      message: 'UI code must go through hooks; only src/data/index.ts may import adapters.',
    }] }],
  },
},
```

- [ ] **Step 4: Write the failing test** — `src/lib/utils.test.ts`

```ts
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
});
```

- [ ] **Step 5: Run it to see it fail**

Run: `npm test`
Expected: FAIL — cannot resolve `@/lib/utils`.

- [ ] **Step 6: Implement `cn(...inputs: ClassValue[]): string` in `src/lib/utils.ts`** as `twMerge(clsx(inputs))`.

- [ ] **Step 7: Run the checks**

Run: `npm run check && npm run build`
Expected: 2 tests pass; typecheck and lint report no errors; `dist/` is created.

- [ ] **Step 8: Prove the architecture rule fires**

```bash
mkdir -p src/components && printf "import '@/data/mock/store';\nexport {};\n" > src/components/lint-probe.ts
npx eslint src/components/lint-probe.ts; rm src/components/lint-probe.ts
```
Expected: 1 error containing `only src/data/index.ts may import adapters`.

- [ ] **Step 9: Commit**

```bash
git add -A && git commit -m "chore: scaffold Vite, React, TypeScript, Tailwind and Vitest tooling"
```

---

### Task 2: Design tokens, typography & contrast check

**Spec:** §6.1, §6.2, §6.6 (banner background), §6.11 (reduced motion), §7 (one-place recoloring), §8 (contrast row).

**Files:**
- Modify: `src/index.css`, `index.html`, `src/main.tsx`, `package.json`, `src/lib/utils.ts`
- Create: `scripts/check-contrast.mjs`
- Test: `scripts/check-contrast.test.mjs`, `src/lib/utils.test.ts` (one more case)

**Interfaces:**
- Produces: Tailwind color utilities for every §6.1 token — `background`, `foreground`, `card`, `card-foreground`, `popover`, `popover-foreground`, `primary`, `primary-foreground`, `secondary`, `secondary-foreground`, `muted`, `muted-foreground`, `accent`, `accent-foreground`, `destructive`, `success`, `border`, `input`, `ring`, `sidebar`, `sidebar-foreground`, `sidebar-border`, `sidebar-accent`, `sidebar-accent-foreground`, `subtle-foreground`, `link`, `warning-bg`, `warning-border`, `warning-foreground`, `brand-300`, `brand-400`, `brand-500`, `brand-600`, `brand-700`, `brand-900`, plus `edge` (= `--ring-subtle`) and `edge-strong` (= `--ring-strong`) for card rings (`ring-1 ring-edge hover:ring-edge-strong`).
- Produces: text sizes `text-2xs`, `text-xs`, `text-sm`, `text-base`, `text-md`, `text-lg`, `text-display` (§6.2); radii `rounded-sm|md|lg|xl` = 6 / 8 / 10 / 14 px; `font-sans`, `font-mono`; `ease-standard`; custom utilities `banner-surface` and `blueprint-grid`.
- Produces: `scripts/check-contrast.mjs` exporting `parseThemes(css)`, `toRgba(value, vars)`, `contrast(fg, bg)`, `runChecks(css)`; npm script `check:contrast`; `check` now ends with `npm run check:contrast`.
- Produces: `cn()` that knows the custom sizes — `src/lib/utils.ts` builds it with `extendTailwindMerge({ extend: { theme: { text: ['2xs', 'md', 'display'] } } })`; otherwise tailwind-merge reads `text-display` as a color and drops it next to `text-white`.

- [ ] **Step 0: Add the failing `cn` case** to `src/lib/utils.test.ts`, run it (FAIL: `'text-white'`), then switch `cn` to the extended merger and run it again (PASS):

```ts
it('keeps custom font sizes next to text colors', () => {
  expect(cn('text-display', 'text-white')).toBe('text-display text-white');
  expect(cn('text-sm', 'text-display')).toBe('text-display');
});
```

- [ ] **Step 1: Write the failing test** — `scripts/check-contrast.test.mjs`

```js
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
    expect(toRgba('color-mix(in oklab, var(--brand-500) 16%, transparent)', vars)).toEqual([99, 102, 241, 0.16]);
  });

  it('lets .dark inherit the :root values it does not override', () => {
    const { light, dark } = parseThemes(':root { --a: #111111; --b: #222222; } .dark { --b: #333333; }');
    expect(light).toEqual({ '--a': '#111111', '--b': '#222222' });
    expect(dark).toEqual({ '--a': '#111111', '--b': '#333333' });
  });

  it('passes every required pair for the real tokens', () => {
    expect(runChecks(readFileSync('src/index.css', 'utf8'))).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run scripts/check-contrast.test.mjs`
Expected: FAIL — cannot find `./check-contrast.mjs`.

- [ ] **Step 3: Implement `scripts/check-contrast.mjs`**
  - `parseThemes(css: string): { light: Record<string, string>; dark: Record<string, string> }` — custom properties of the first `:root { … }` block and of the `.dark { … }` block; `dark = { ...light, ...darkOwn }`.
  - `toRgba(value: string, vars: Record<string, string>): [r, g, b, a]` — supports `#rrggbb`, `rgb(r g b / a)`, `var(--x)` (resolved recursively through `vars`), and `color-mix(in oklab, <color> N%, transparent)` → that color with alpha `N / 100`; any other form throws `Unsupported color: <value>`.
  - `contrast(fg, bg): number` — composites `fg` over `bg` when `fg` has alpha < 1, then returns the WCAG 2.x ratio.
  - `runChecks(css): Array<{ theme: string; pair: string; ratio: number; min: number }>` — failures only, for both themes, over these pairs ("A over B" = composite A over B first):

  | Foreground | Background | Min |
  |---|---|---|
  | `--foreground` | `--background`, `--card`, `--popover` | 4.5 |
  | `--muted-foreground` | `--background`, `--card` | 4.5 |
  | `--subtle-foreground`, `--sidebar-foreground` | `--sidebar` | 4.5 |
  | `--sidebar-accent-foreground` | `--sidebar-accent` over `--sidebar` | 4.5 |
  | `--link` | `--card`, `--background` | 4.5 |
  | `--primary-foreground` | `--primary` | 4.5 |
  | `--warning-foreground` | `--warning-bg` over `--card` | 4.5 |
  | `--destructive` | `--card` | 4.5 |
  | `--ring` | `--card` | 3 |
  | `--input` | `--card`, `--popover`, `--background` | 3 (spec D9) |
  | `--success` | `--popover` | 3 |
  | `rgb(255 255 255 / 0.85)` | `color-mix(in oklab, var(--brand-400) 30%, transparent)` over `--brand-700` | 4.5 (banner date; once, light vars) |

  - When executed directly (`import.meta.url === pathToFileURL(process.argv[1]).href`): read `src/index.css`, print failures with `console.table` and exit 1, otherwise print `Contrast OK: <n> checks passed` and exit 0.

- [ ] **Step 4: Write `src/index.css`** in this order:
  1. `@import "tailwindcss";` `@import "tw-animate-css";` `@source not "../docs";` (Tailwind would otherwise scan class names in the spec and plan) `@custom-variant dark (&:is(.dark *));`
  2. `:root { … }` — every light value from §6.1, the six `--brand-*` values, `--radius: 10px`, light `--popover-shadow`, and these references: `--primary: var(--brand-600); --link: var(--brand-600); --ring: var(--brand-500); --sidebar-accent: color-mix(in oklab, var(--brand-600) 10%, transparent); --sidebar-accent-foreground: var(--brand-700);`
  3. `.dark { … }` — every dark value from §6.1, dark `--popover-shadow`, and `--primary: var(--brand-600); --link: var(--brand-400); --ring: var(--brand-400); --sidebar-accent: color-mix(in oklab, var(--brand-500) 16%, transparent); --sidebar-accent-foreground: var(--brand-300);`
  4. `@theme inline { … }` — `--color-<name>: var(--<name>)` for each token in Interfaces (with `--color-edge: var(--ring-subtle)` and `--color-edge-strong: var(--ring-strong)`); `--font-sans` / `--font-mono` from §6.1; `--radius-sm: calc(var(--radius) - 4px)`, `--radius-md: calc(var(--radius) - 2px)`, `--radius-lg: var(--radius)`, `--radius-xl: calc(var(--radius) + 4px)`; the §6.2 scale as `--text-<name>` + `--text-<name>--line-height` pairs (e.g. `--text-2xs: 11px; --text-2xs--line-height: 16px;` … `--text-display: 26px; --text-display--line-height: 32px;`); `--shadow-popover: var(--popover-shadow)` (gives the `shadow-popover` utility; the runtime variable has a different name so the mapping isn't circular); `--ease-standard: cubic-bezier(0.4, 0, 0.2, 1)`.
  5. `@utility banner-surface { background: <§6.6 background value>; }` and `@utility blueprint-grid { background-image: linear-gradient(rgb(255 255 255 / 0.07) 1px, transparent 1px), linear-gradient(90deg, rgb(255 255 255 / 0.07) 1px, transparent 1px); background-size: 24px 24px; mask-image: linear-gradient(to left, #000 0%, transparent 70%); }`
  6. `@layer base { * { @apply border-border outline-ring/50; } body { @apply bg-background font-sans text-sm text-foreground antialiased; } }`
  7. `@media (prefers-reduced-motion: reduce) { *, ::before, ::after { animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; transition-duration: 0.01ms !important; scroll-behavior: auto !important; } }`

- [ ] **Step 5: Add the theme bootstrap to `<head>` in `index.html`** (before any stylesheet; exact behavior):

```html
<script>
  (function () {
    try {
      document.documentElement.classList.toggle('dark', localStorage.getItem('ui.theme') !== 'light');
    } catch (e) {
      document.documentElement.classList.add('dark');
    }
  })();
</script>
```

- [ ] **Step 6: Load fonts in `src/main.tsx`** — before `./index.css`: `@fontsource-variable/inter/index.css`, `@fontsource/jetbrains-mono/400.css`, `@fontsource/jetbrains-mono/500.css` (explicit `.css` paths keep TypeScript's side-effect-import check happy).

- [ ] **Step 7: Add the scripts**

```bash
npm pkg set "scripts.check:contrast=node scripts/check-contrast.mjs" "scripts.check=npm run typecheck && npm run lint && npm run test && npm run check:contrast"
```

- [ ] **Step 8: Run the checks**

Run: `npx vitest run scripts/check-contrast.test.mjs && npm run check:contrast && npm run build`
Expected: 4 tests pass; `Contrast OK: 37 checks passed` (31 before spec D9 added the `--input` pairs); build succeeds.

- [ ] **Step 9: Commit**

```bash
git add -A && git commit -m "feat: add design tokens, type scale and contrast check"
```

---

### Task 3: Storage helper, theme, shadcn primitives & brand

**Spec:** §3 (shadcn), §4.5 (theme row), §7 (brand, logo).

**Files:**
- Create: `src/lib/storage.ts`, `src/hooks/useTheme.tsx`, `src/config/brand.ts`, `src/components/brand/BrandLogo.tsx`, `components.json`
- Generate: `src/components/ui/*` (shadcn)
- Modify: `src/components/ui/sonner.tsx`, `src/index.css` (only to undo CLI changes)
- Test: `src/lib/storage.test.ts`, `src/hooks/useTheme.test.tsx`, `src/components/brand/BrandLogo.test.tsx`

**Interfaces:**
- Produces (`src/lib/storage.ts`):
  - `interface StorageLike { getItem(key: string): string | null; setItem(key: string, value: string): void; removeItem(key: string): void }`
  - `getBrowserStorage(): StorageLike | null` — `null` when `window.localStorage` is missing or throws on access
  - `createMemoryStorage(): StorageLike`
  - `readKey(key: string, storage?: StorageLike | null): string | null`, `writeKey(key: string, value: string, storage?: StorageLike | null): void`, `removeKey(key: string, storage?: StorageLike | null): void` — default storage is `getBrowserStorage()`; they never throw; the first failure per key logs one `console.warn`.
- Produces: `type Theme = 'dark' | 'light'`; `ThemeProvider({ children })`; `useTheme(): { theme: Theme; setTheme(theme: Theme): void; toggleTheme(): void }` — initial theme is `'light'` only when `readKey('ui.theme') === 'light'`; an effect toggles the `dark` class on `<html>` and writes `ui.theme`.
- Produces: `brand` (`src/config/brand.ts`, §7); `BrandLogo({ className?: string })` — the mark and wordmark only, no link.
- Produces shadcn components: `button`, `dialog`, `alert-dialog`, `dropdown-menu`, `popover`, `command`, `input`, `textarea`, `label`, `select`, `checkbox`, `skeleton`, `tooltip`, `separator`, `sheet`, `sonner`.

- [ ] **Step 1: Write the failing storage test** — `src/lib/storage.test.ts`

```ts
import { describe, expect, it, vi } from 'vitest';
import { createMemoryStorage, readKey, writeKey, type StorageLike } from '@/lib/storage';

const blocked: StorageLike = {
  getItem: () => { throw new Error('SecurityError'); },
  setItem: () => { throw new Error('QuotaExceededError'); },
  removeItem: () => { throw new Error('SecurityError'); },
};

describe('storage', () => {
  it('round-trips values', () => {
    const storage = createMemoryStorage();
    writeKey('ui.theme', 'light', storage);
    expect(readKey('ui.theme', storage)).toBe('light');
  });

  it('returns null instead of throwing when storage is blocked', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(readKey('test.read', blocked)).toBeNull();
  });

  it('swallows write errors and warns once per key', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(() => {
      writeKey('test.write', 'a', blocked);
      writeKey('test.write', 'b', blocked);
    }).not.toThrow();
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('treats a null storage as empty', () => {
    expect(readKey('ui.theme', null)).toBeNull();
    expect(() => writeKey('ui.theme', 'light', null)).not.toThrow();
  });
});
```

- [ ] **Step 2: Run it to see it fail** — `npx vitest run src/lib/storage.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement `src/lib/storage.ts`** per Interfaces.

- [ ] **Step 4: Write the failing theme test** — `src/hooks/useTheme.test.tsx`

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { ThemeProvider, useTheme } from '@/hooks/useTheme';

function Probe() {
  const { theme, toggleTheme } = useTheme();
  return <button onClick={toggleTheme}>{theme}</button>;
}

describe('ThemeProvider', () => {
  it('defaults to dark and marks <html>', () => {
    render(<ThemeProvider><Probe /></ThemeProvider>);
    expect(screen.getByRole('button')).toHaveTextContent('dark');
    expect(document.documentElement).toHaveClass('dark');
  });

  it('toggles to light, removes the class and persists ui.theme', async () => {
    render(<ThemeProvider><Probe /></ThemeProvider>);
    await userEvent.click(screen.getByRole('button'));
    expect(screen.getByRole('button')).toHaveTextContent('light');
    expect(document.documentElement).not.toHaveClass('dark');
    expect(localStorage.getItem('ui.theme')).toBe('light');
  });

  it('starts from a stored light theme', () => {
    localStorage.setItem('ui.theme', 'light');
    render(<ThemeProvider><Probe /></ThemeProvider>);
    expect(screen.getByRole('button')).toHaveTextContent('light');
  });
});
```

- [ ] **Step 5: Run it to see it fail, implement `src/hooks/useTheme.tsx`, run until 3 tests pass.**

- [ ] **Step 6: Add shadcn/ui** — create `components.json`:

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "rsc": false,
  "tsx": true,
  "tailwind": { "config": "", "css": "src/index.css", "baseColor": "neutral", "cssVariables": true, "prefix": "" },
  "aliases": { "components": "@/components", "utils": "@/lib/utils", "ui": "@/components/ui", "lib": "@/lib", "hooks": "@/hooks" },
  "iconLibrary": "lucide"
}
```

Then run:

```bash
npx --yes shadcn@latest add button dialog alert-dialog dropdown-menu popover command input textarea label select checkbox skeleton tooltip separator sheet sonner --yes --overwrite && git checkout -- src/lib/utils.ts
```

After the CLI:
  - `git diff src/index.css` — restore every §6.1 value and the Task 2 structure if the CLI changed them (keep only imports the components need).
  - In `src/components/ui/sonner.tsx` replace the `next-themes` import with `import { useTheme } from '@/hooks/useTheme'`, then `npm uninstall next-themes`.
  - The CLI needs network access to `https://ui.shadcn.com`. `--yes` does not answer its "file already exists — overwrite?" prompt (a closed stdin exits silently, an open pipe hangs), so `--overwrite` is passed and `git checkout -- src/lib/utils.ts` restores the Task 2 `extendTailwindMerge` version of `cn`.
  - `npx shadcn@latest info` lists all five resolved alias paths under `src/` with the paths-only `tsconfig.json`; no `baseUrl` is needed.

- [ ] **Step 7: Write the failing logo test** — `src/components/brand/BrandLogo.test.tsx`

```tsx
import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { BrandLogo } from '@/components/brand/BrandLogo';
import { brand } from '@/config/brand';

it('renders the wordmark from brand config next to a decorative mark', () => {
  const { container } = render(<BrandLogo />);
  expect(screen.getByText(brand.name)).toBeInTheDocument();
  expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
});
```

- [ ] **Step 8: Implement `src/config/brand.ts` (verbatim §7) and `BrandLogo`** (§7: 24×24 `rounded-sm bg-brand-600` tile with a white inline-SVG mark of three offset bars, wordmark `text-md font-bold tracking-[-0.02em]`).

- [ ] **Step 9: Run** `npm run check` → 15 tests pass, contrast OK; one `react-refresh` warning for `useTheme.tsx` (it exports a hook next to a component) is expected.

- [ ] **Step 10: Commit**

```bash
git add -A && git commit -m "feat: add storage helper, theme provider, shadcn primitives and brand logo"
```

---

### Task 4: Domain types, RepositoryError & pure helpers

**Spec:** §5.1, §5.4, §6.10.

**Files:**
- Create: `src/data/types.ts` (verbatim §5.1), `src/data/errors.ts` (verbatim §5.4), `src/lib/format.ts`, `src/lib/trial.ts`, `src/lib/cover.ts`
- Test: `src/lib/format.test.ts`, `src/lib/trial.test.ts`, `src/lib/cover.test.ts`

**Interfaces:**
- Produces (`src/lib/format.ts`):
  - `greetingDate(now: Date): string` — `format(now, 'EEEE, d MMMM yyyy')`
  - `shortDate(date: ISODate | null): string` — `format(parseISO(date), 'MMM d, yyyy')`, `null` → `'—'`
  - `relativeTime(iso: ISODateTime, now: Date): string` — `formatDistanceStrict(parseISO(iso), now, { addSuffix: true })`
  - `pluralize(count: number, noun: string): string`
  - `fullName(person: { firstName: string; lastName: string }): string`
  - `initials(person: { firstName: string; lastName: string; email?: string }): string` — fallback: first two letters of the email, then `'?'`
  - `fileSize(bytes: number): string`
  - `dueLabel(dueDate: ISODate | null, now: Date): { text: string; overdue: boolean } | null`
  - `errorMessage(error: unknown): string` — copy from §5.4
- Produces (`src/lib/trial.ts`): `trialStatus(endsAt: ISODateTime, now: Date): { daysLeft: number; ended: boolean; label: string; compactLabel: string }` — `daysLeft = max(0, ceil((end − now) / 86 400 000))`, `ended = end <= now`; labels `'{n} days left'` / `'1 day left'` / `'Trial ended'`, compact `'{n}d'` / `'Ended'`.
- Produces (`src/lib/cover.ts`): `fnv1a(input: string): number` (32-bit FNV-1a over UTF-16 code units, unsigned) and `coverFor(seed: string): { backgroundImage: string; backgroundSize: string }` with the §6.10 algorithm and exactly this format:
  - `backgroundImage`: `linear-gradient(rgb(255 255 255 / 0.07) 1px, transparent 1px), linear-gradient(90deg, rgb(255 255 255 / 0.07) 1px, transparent 1px), linear-gradient(${angle}deg, hsl(${base} 45% 34%), hsl(${second} 40% 20%))`
  - `backgroundSize`: `20px 20px, 20px 20px, 100% 100%`

- [ ] **Step 1: Write the failing tests**

`src/lib/format.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { RepositoryError } from '@/data/errors';
import { dueLabel, errorMessage, fileSize, greetingDate, initials, pluralize, relativeTime, shortDate } from '@/lib/format';

const now = new Date(2026, 9, 14, 10, 0, 0); // local time (suite runs in America/Los_Angeles)

describe('format', () => {
  it('formats the greeting date', () => {
    expect(greetingDate(now)).toBe('Wednesday, 14 October 2026');
  });

  it('keeps the calendar day of date-only values', () => {
    expect(shortDate('2026-10-12')).toBe('Oct 12, 2026');
    expect(shortDate(null)).toBe('—');
  });

  it('formats relative times', () => {
    expect(relativeTime(new Date(2026, 9, 14, 9, 57).toISOString(), now)).toBe('3 minutes ago');
    expect(relativeTime(new Date(2026, 9, 12, 10, 0).toISOString(), now)).toBe('2 days ago');
  });

  it('pluralizes counts', () => {
    expect(pluralize(0, 'schedule')).toBe('0 schedules');
    expect(pluralize(1, 'schedule')).toBe('1 schedule');
    expect(pluralize(2, 'project')).toBe('2 projects');
  });

  it('builds initials with an email fallback', () => {
    expect(initials({ firstName: 'deniz', lastName: 'kaya' })).toBe('DK');
    expect(initials({ firstName: '', lastName: '', email: 'mert@example.com' })).toBe('ME');
  });

  it('formats file sizes', () => {
    expect(fileSize(512)).toBe('512 B');
    expect(fileSize(1229)).toBe('1.2 KB');
    expect(fileSize(3.4 * 1024 * 1024)).toBe('3.4 MB');
  });

  it('labels due dates against local calendar days', () => {
    expect(dueLabel(null, now)).toBeNull();
    expect(dueLabel('2026-10-14', now)).toEqual({ text: 'Due today', overdue: false });
    expect(dueLabel('2026-10-15', now)).toEqual({ text: 'Due tomorrow', overdue: false });
    expect(dueLabel('2026-10-20', now)).toEqual({ text: 'Due Oct 20', overdue: false });
    expect(dueLabel('2026-10-10', now)).toEqual({ text: 'Overdue · Oct 10', overdue: true });
  });

  it('maps errors to user-facing copy', () => {
    expect(errorMessage(new RepositoryError('network', 'x'))).toBe("Can't reach the server. Check your connection and try again.");
    expect(errorMessage(new RepositoryError('conflict', 'This ID is already used in this workspace'))).toBe('This ID is already used in this workspace');
    expect(errorMessage(new Error('boom'))).toBe('Something went wrong. Please try again.');
  });
});
```

`src/lib/trial.test.ts`:

```ts
import { expect, it } from 'vitest';
import { trialStatus } from '@/lib/trial';

const now = new Date('2026-10-14T10:00:00.000Z');

it('counts whole days left, rounding partial days up', () => {
  expect(trialStatus('2026-10-23T10:00:00.000Z', now)).toEqual({ daysLeft: 9, ended: false, label: '9 days left', compactLabel: '9d' });
  expect(trialStatus('2026-10-14T22:00:00.000Z', now)).toMatchObject({ daysLeft: 1, ended: false, label: '1 day left' });
});

it('reports an ended trial', () => {
  expect(trialStatus('2026-10-14T09:00:00.000Z', now)).toEqual({ daysLeft: 0, ended: true, label: 'Trial ended', compactLabel: 'Ended' });
});
```

`src/lib/cover.test.ts`:

```ts
import { expect, it } from 'vitest';
import { coverFor, fnv1a } from '@/lib/cover';

it('implements 32-bit FNV-1a', () => {
  expect(fnv1a('')).toBe(0x811c9dc5);
  expect(fnv1a('a')).toBe(0xe40c292c);
});

it('is deterministic and keeps the base hue between 225 and 274', () => {
  const id = '3f2b6c1e-0000-4000-8000-000000000001';
  const cover = coverFor(id);
  expect(coverFor(id)).toEqual(cover);
  const hue = Number(/hsl\((\d+) 45% 34%\)/.exec(cover.backgroundImage)?.[1]);
  expect(hue).toBeGreaterThanOrEqual(225);
  expect(hue).toBeLessThanOrEqual(274);
  expect(cover.backgroundSize).toBe('20px 20px, 20px 20px, 100% 100%');
});

it('gives different ids different covers', () => {
  expect(coverFor('project-a').backgroundImage).not.toBe(coverFor('project-b').backgroundImage);
});
```

- [ ] **Step 2: Run them to see them fail** — `npx vitest run src/lib` → FAIL (modules not found).

- [ ] **Step 3: Implement** `src/data/types.ts`, `src/data/errors.ts`, `src/lib/format.ts`, `src/lib/trial.ts`, `src/lib/cover.ts` per Interfaces. `dueLabel` compares `parseISO(dueDate)` with `now` using `isSameDay`, `addDays(now, 1)` and `isBefore(date, startOfDay(now))`; dates in its labels use `MMM d`. Never use `new Date('YYYY-MM-DD')` for date-only values.

- [ ] **Step 4: Run** `npm run check` → all tests pass.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: add domain types, repository error and formatting helpers"
```

---

### Task 5: Data contract, mock store, seed & latency

**Spec:** §5.2, §5.3, §5.6.

**Files:**
- Create: `src/data/repository.ts` (verbatim §5.2), `src/data/auth.ts` (verbatim §5.3), `src/data/mock/latency.ts`, `src/data/mock/seed.ts`, `src/data/mock/store.ts`
- Test: `src/data/mock/latency.test.ts`, `src/data/mock/seed.test.ts`, `src/data/mock/store.test.ts`

**Interfaces:**
- Consumes: types (Task 4), `RepositoryError` (Task 4), `StorageLike`, `readKey`, `writeKey` (Task 3).
- Produces (`seed.ts`):
  ```ts
  export type Scenario = 'default' | 'empty';
  export interface MockShare { id: ID; scheduleId: ID; sharedById: ID; sharedWithId: ID; sharedAt: ISODateTime }
  export interface MockDb {
    version: 1; scenario: Scenario; seededAt: ISODateTime; currentUserId: ID; session: Session | null;
    users: User[]; subscription: Subscription; workspaces: Workspace[]; projects: Project[];
    schedules: Schedule[]; shares: MockShare[]; tasks: Task[];
  }
  export function seed(scenario: Scenario, now: Date): MockDb;
  ```
- Produces (`store.ts`): `MOCK_DB_KEY = 'mock-db.v1'`; `interface MockStore { read(): MockDb; write(mutate: (draft: MockDb) => void): MockDb; reset(): MockDb }`; `createMockStore(options: { storage: StorageLike | null; scenario: Scenario; now?: () => Date }): MockStore`. `read()` returns a deep copy (`JSON.parse(JSON.stringify(db))` — the document is plain JSON); `write()` mutates a copy, keeps it in memory, persists it with `writeKey`, and returns a copy. Missing, unparsable, `version !== 1` or different-scenario data → reseed and persist; unparsable data logs exactly one `console.warn` mentioning `mock-db.v1`.
- Produces (`latency.ts`): `withLatency<T>(op: () => T | Promise<T>, options: { latencyMs: number; failRate: number; kind: 'read' | 'write'; random?: () => number }): Promise<T>` — waits `latencyMs` (`setTimeout`), then for `kind === 'read'` rejects with `new RepositoryError('network', 'Simulated network error')` when `random() < failRate`, otherwise returns `await op()`.

**Seed contents (`default`)** — everything in spec §5.6, plus these pinned values. Projects are created in this order; `updatedAt` and status dates are relative to the seed time; `createdAt = updatedAt − 30 days`; all optional project fields `null`.

| Code | Name | Workspace | `updatedAt` before seed | Status date (days before) | Schedules (name, in order) |
|---|---|---|---|---|---|
| 001 | Riverside Office Tower | My workspace | 3 minutes | 2 | Main schedule |
| 002 | Metro Line Extension | My workspace | 2 days | — | — |
| 003 | Harbor Logistics Hub | My workspace | 5 days | 7 | Baseline, Update 1, Update 2 |
| 004 | Campus Library Retrofit | My workspace | 21 days | 14 | Baseline, Recovery plan |
| 005 | Northgate Bridge Repair | My workspace | 35 days | — | Baseline |
| 006 | Old Mill Housing | My workspace | 60 days | 30 | — |
| T-01 | Tunnel Ventilation Upgrade | Site Operations | 7 days | 3 | Baseline rev. 3, Look-ahead W42 |

- Schedules: `source: 'blank'`, `sourceFileName: null`, `statusDate` = their project's, `createdAt = updatedAt` = their project's `updatedAt`.
- Users (all `avatarUrl: null`): Deniz Kaya `deniz.kaya@example.com` (current), Mert Demir `mert.demir@example.com`, Elif Arslan `elif.arslan@example.com`.
- Workspaces: "My workspace" (personal, created 90 days before), "Site Operations" (team, 30 days before).
- Shares to the current user: "Baseline rev. 3" by Mert, 1 day before seed; "Look-ahead W42" by Elif, 4 days before.
- Tasks (`done: false`, in this order): "Update status date for Riverside Office Tower" (due seed day, project 001, created −1 day); "Import revised baseline from contractor" (due +3 days, project 003, created −2 days); "Review look-ahead schedule" (no due date, project T-01, created −3 days).
- Subscription `{ plan: 'trial', trialEndsAt: seed + 9 days }`; session `{ userId: currentUserId }`.
- Timestamps (`ISODateTime`) use exact durations — `new Date(now.getTime() - n * 86_400_000).toISOString()` (and `+` for the trial end) — never `addDays` / `subDays`, which shift by an hour across a daylight-saving change and turn "9 days left" into 10 or "1 day ago" into "23 hours ago".
- Date-only values (`ISODate`: status and due dates) are local calendar dates: `format(subDays(now, n), 'yyyy-MM-dd')`.
- `empty`: Deniz only, the personal workspace, the same subscription and session; every other list empty.

- [ ] **Step 1: Write the failing tests**

`src/data/mock/seed.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { seed } from '@/data/mock/seed';

const now = new Date('2026-10-14T10:00:00.000Z');

describe('seed', () => {
  it('builds the default scenario', () => {
    const db = seed('default', now);
    expect(db.workspaces.map((w) => [w.name, w.kind])).toEqual([['My workspace', 'personal'], ['Site Operations', 'team']]);
    const personal = db.workspaces[0]!;
    const own = db.projects.filter((p) => p.workspaceId === personal.id);
    expect(own.map((p) => p.code)).toEqual(['001', '002', '003', '004', '005', '006']);
    expect(own.map((p) => db.schedules.filter((s) => s.projectId === p.id).length)).toEqual([1, 0, 3, 2, 1, 0]);
    expect(db.shares).toHaveLength(2);
    expect(db.tasks.map((t) => t.title)).toEqual([
      'Update status date for Riverside Office Tower',
      'Import revised baseline from contractor',
      'Review look-ahead schedule',
    ]);
    expect(db.subscription).toEqual({ plan: 'trial', trialEndsAt: '2026-10-23T10:00:00.000Z' });
    expect(db.session).toEqual({ userId: db.currentUserId });
  });

  it('stores status dates as local calendar dates', () => {
    // 05:00 UTC is 22:00 the evening before in America/Los_Angeles
    const db = seed('default', new Date('2026-10-14T05:00:00.000Z'));
    expect(db.projects.find((p) => p.code === '001')?.statusDate).toBe('2026-10-11');
  });

  it('keeps only the user and the personal workspace in the empty scenario', () => {
    const db = seed('empty', now);
    expect(db.users).toHaveLength(1);
    expect(db.workspaces.map((w) => w.kind)).toEqual(['personal']);
    expect([db.projects, db.schedules, db.shares, db.tasks]).toEqual([[], [], [], []]);
  });
});
```

`src/data/mock/store.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { createMockStore, MOCK_DB_KEY } from '@/data/mock/store';
import { createMemoryStorage, type StorageLike } from '@/lib/storage';

const now = () => new Date('2026-10-14T10:00:00.000Z');
const blocked: StorageLike = {
  getItem: () => { throw new Error('denied'); },
  setItem: () => { throw new Error('denied'); },
  removeItem: () => { throw new Error('denied'); },
};

describe('mock store', () => {
  it('seeds and persists when storage is empty', () => {
    const storage = createMemoryStorage();
    const store = createMockStore({ storage, scenario: 'default', now });
    expect(store.read().projects).toHaveLength(7);
    expect(JSON.parse(storage.getItem(MOCK_DB_KEY)!)).toMatchObject({ version: 1, scenario: 'default' });
  });

  it('reuses persisted data across instances', () => {
    const storage = createMemoryStorage();
    createMockStore({ storage, scenario: 'default', now }).write((db) => { db.tasks = []; });
    expect(createMockStore({ storage, scenario: 'default', now }).read().tasks).toEqual([]);
  });

  it('returns copies so callers cannot mutate state', () => {
    const store = createMockStore({ storage: createMemoryStorage(), scenario: 'default', now });
    store.read().tasks.pop();
    expect(store.read().tasks).toHaveLength(3);
  });

  it('reseeds unreadable data with one warning', () => {
    const storage = createMemoryStorage();
    storage.setItem(MOCK_DB_KEY, '{not json');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(createMockStore({ storage, scenario: 'default', now }).read().projects).toHaveLength(7);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('reseeds when the scenario changes', () => {
    const storage = createMemoryStorage();
    createMockStore({ storage, scenario: 'default', now });
    expect(createMockStore({ storage, scenario: 'empty', now }).read().projects).toEqual([]);
  });

  it('keeps working in memory when storage is blocked or missing', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    for (const storage of [blocked, null]) {
      const store = createMockStore({ storage, scenario: 'default', now });
      store.write((db) => { db.tasks = []; });
      expect(store.read().tasks).toEqual([]);
    }
  });
});
```

`src/data/mock/latency.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { withLatency } from '@/data/mock/latency';

afterEach(() => { vi.useRealTimers(); });

describe('withLatency', () => {
  it('resolves only after latencyMs', async () => {
    vi.useFakeTimers();
    let done = false;
    const result = withLatency(() => 42, { latencyMs: 400, failRate: 0, kind: 'read' }).then((v) => { done = true; return v; });
    await vi.advanceTimersByTimeAsync(399);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await expect(result).resolves.toBe(42);
  });

  it('fails reads when the draw is below the fail rate', async () => {
    await expect(withLatency(() => 1, { latencyMs: 0, failRate: 0.5, kind: 'read', random: () => 0.1 }))
      .rejects.toMatchObject({ code: 'network', message: 'Simulated network error' });
  });

  it('never fails writes', async () => {
    await expect(withLatency(() => 1, { latencyMs: 0, failRate: 1, kind: 'write', random: () => 0 })).resolves.toBe(1);
  });
});
```

- [ ] **Step 2: Run them to see them fail** — `npx vitest run src/data/mock` → FAIL (modules not found).

- [ ] **Step 3: Implement** `repository.ts`, `auth.ts`, `seed.ts`, `store.ts`, `latency.ts` per Interfaces and the seed table.

- [ ] **Step 4: Run** `npm run check` → all tests pass.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: add data contract, mock store, seed scenarios and latency simulation"
```

---

### Task 6: Mock repository & auth service

**Spec:** §5.2 (method contracts), §5.3, §5.6, §5.7 (conflict copy).

**Files:**
- Create: `src/data/mock/MockRepository.ts`, `src/data/mock/MockAuthService.ts`, `src/test/fakes.ts`
- Test: `src/data/mock/MockRepository.test.ts`, `src/data/mock/MockAuthService.test.ts`

**Interfaces:**
- Consumes: `MockStore`, `withLatency` (Task 5), `DataRepository`, `AuthService`, input types (Task 5).
- Produces:
  - `class MockRepository implements DataRepository` — `constructor(options: { store: MockStore; latencyMs?: number; failRate?: number; random?: () => number; now?: () => Date })`, defaults `0`, `0`, `Math.random`, `() => new Date()`. Every method runs through `withLatency`: `kind: 'read'` for `get*`, `list*` and `isProjectCodeAvailable`, `'write'` otherwise. (Fields are assigned in the constructor body — no parameter properties.)
  - `class MockAuthService implements AuthService` — `constructor(options: { store: MockStore; latencyMs?: number })`; the session lives in `db.session`; listeners are called after `signInWithEmail` (`{ userId: currentUserId }`) and `signOut` (`null`).
  - `makeNewProjectInput(workspaceId: ID, overrides?: Partial<NewProjectInput>): NewProjectInput` in `src/test/fakes.ts` — defaults: `code: '900'`, `name: 'Test project'`, every optional value `null`, nested objects with all-`null` fields.
- Behavior beyond §5.2:
  - `listProjects` for an unknown workspace resolves `[]`.
  - `createProject` trims every string, turns empty optional strings into `null`, stores `coverImage` as a data URL (`FileReader.readAsDataURL`), sets `createdAt = updatedAt = now()`, and rejects duplicates (trimmed, case-insensitive) with `RepositoryError('conflict', 'This ID is already used in this workspace')`.
  - `createSchedule` / `importSchedule`: unknown project → `RepositoryError('not_found', 'Project not found')`; the schedule copies the project's `statusDate`; the project's `updatedAt` becomes `now()`. `importSchedule` stores `source: 'import'` and `sourceFileName = file.name`.
  - `createTeamWorkspace` trims the name and uses `kind: 'team'`.
  - `setTaskDone` on an unknown id → `RepositoryError('not_found', 'Task not found')`.

- [ ] **Step 1: Write the failing tests**

`src/data/mock/MockRepository.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { MockRepository } from '@/data/mock/MockRepository';
import { createMockStore, type MockStore } from '@/data/mock/store';
import { createMemoryStorage } from '@/lib/storage';
import { makeNewProjectInput } from '@/test/fakes';

const now = new Date('2026-10-14T10:00:00.000Z');
let store: MockStore;
let repo: MockRepository;
const personalId = () => store.read().workspaces[0]!.id;
const project = (code: string) => store.read().projects.find((p) => p.code === code)!;

beforeEach(() => {
  store = createMockStore({ storage: createMemoryStorage(), scenario: 'default', now: () => now });
  repo = new MockRepository({ store, now: () => now });
});

describe('MockRepository', () => {
  it('returns the current user and subscription', async () => {
    expect(await repo.getCurrentUser()).toMatchObject({ firstName: 'Deniz', lastName: 'Kaya', email: 'deniz.kaya@example.com' });
    expect(await repo.getSubscription()).toEqual({ plan: 'trial', trialEndsAt: '2026-10-23T10:00:00.000Z' });
  });

  it('lists workspaces personal first, then teams by name, with project counts', async () => {
    await repo.createTeamWorkspace({ name: '  Alpha Crew ' });
    expect((await repo.listWorkspaces()).map((w) => [w.name, w.kind, w.projectCount])).toEqual([
      ['My workspace', 'personal', 6],
      ['Alpha Crew', 'team', 0],
      ['Site Operations', 'team', 1],
    ]);
  });

  it('lists projects newest first with schedule counts and limits recent ones', async () => {
    expect((await repo.listProjects(personalId())).map((p) => [p.code, p.scheduleCount])).toEqual([
      ['001', 1], ['002', 0], ['003', 3], ['004', 2], ['005', 1], ['006', 0],
    ]);
    expect((await repo.listRecentProjects(personalId(), 5)).map((p) => p.code)).toEqual(['001', '002', '003', '004', '005']);
    expect(await repo.listProjects('unknown-workspace')).toEqual([]);
  });

  it('checks project IDs case-insensitively and rejects duplicates', async () => {
    expect(await repo.isProjectCodeAvailable(personalId(), ' 001 ')).toBe(false);
    expect(await repo.isProjectCodeAvailable(personalId(), 'ABC')).toBe(true);
    await repo.createProject(makeNewProjectInput(personalId(), { code: 'abc', name: 'Pier 9' }));
    expect(await repo.isProjectCodeAvailable(personalId(), 'ABC')).toBe(false);
    await expect(repo.createProject(makeNewProjectInput(personalId(), { code: 'ABC', name: 'Duplicate' })))
      .rejects.toMatchObject({ code: 'conflict', message: 'This ID is already used in this workspace' });
  });

  it('trims input, stores null for empty optionals and encodes the cover image', async () => {
    const created = await repo.createProject(makeNewProjectInput(personalId(), {
      code: '007',
      name: '  Pier 9  ',
      description: '',
      coverImage: new File(['png'], 'cover.png', { type: 'image/png' }),
    }));
    expect(created).toMatchObject({ name: 'Pier 9', description: null, createdAt: now.toISOString(), updatedAt: now.toISOString() });
    expect(created.coverImageUrl).toMatch(/^data:image\/png;base64,/);
  });

  it('moves a project to the top of recent projects when a schedule is added', async () => {
    const schedule = await repo.createSchedule({ projectId: project('006').id, name: 'Baseline' });
    expect(schedule).toMatchObject({ source: 'blank', sourceFileName: null, statusDate: project('006').statusDate });
    expect((await repo.listRecentProjects(personalId(), 5))[0]).toMatchObject({ code: '006', scheduleCount: 1, updatedAt: now.toISOString() });
  });

  it('records imported schedules and rejects unknown projects', async () => {
    const imported = await repo.importSchedule({ projectId: project('002').id, name: 'Rev 7', file: new File(['x'], 'rev7.XER') });
    expect(imported).toMatchObject({ source: 'import', sourceFileName: 'rev7.XER' });
    await expect(repo.createSchedule({ projectId: 'nope', name: 'X' })).rejects.toMatchObject({ code: 'not_found', message: 'Project not found' });
  });

  it('lists schedules shared with me newest first', async () => {
    expect((await repo.listSharedWithMe()).map((r) => [r.scheduleName, r.sharedBy.firstName, r.projectName])).toEqual([
      ['Baseline rev. 3', 'Mert', 'Tunnel Ventilation Upgrade'],
      ['Look-ahead W42', 'Elif', 'Tunnel Ventilation Upgrade'],
    ]);
  });

  it('orders pending tasks by due date with undated last, and toggles them', async () => {
    const tasks = await repo.listPendingTasks();
    expect(tasks.map((t) => t.title)).toEqual([
      'Update status date for Riverside Office Tower',
      'Import revised baseline from contractor',
      'Review look-ahead schedule',
    ]);
    await repo.setTaskDone(tasks[0]!.id, true);
    expect(await repo.listPendingTasks()).toHaveLength(2);
    await repo.setTaskDone(tasks[0]!.id, false);
    expect(await repo.listPendingTasks()).toHaveLength(3);
    await expect(repo.setTaskDone('nope', true)).rejects.toMatchObject({ code: 'not_found', message: 'Task not found' });
  });

  it('fails reads but not writes under failure injection', async () => {
    const flaky = new MockRepository({ store, failRate: 1, random: () => 0, now: () => now });
    await expect(flaky.listWorkspaces()).rejects.toMatchObject({ code: 'network' });
    await expect(flaky.createTeamWorkspace({ name: 'Field crew' })).resolves.toMatchObject({ kind: 'team' });
  });
});
```

`src/data/mock/MockAuthService.test.ts`:

```ts
import { expect, it, vi } from 'vitest';
import { MockAuthService } from '@/data/mock/MockAuthService';
import { createMockStore } from '@/data/mock/store';
import { createMemoryStorage } from '@/lib/storage';

it('starts with the seed session, signs out and signs back in', async () => {
  const store = createMockStore({ storage: createMemoryStorage(), scenario: 'default' });
  const auth = new MockAuthService({ store });
  const listener = vi.fn();
  const unsubscribe = auth.onAuthStateChange(listener);
  const session = { userId: store.read().currentUserId };

  expect(await auth.getSession()).toEqual(session);
  await auth.signOut();
  expect(await auth.getSession()).toBeNull();
  expect(listener).toHaveBeenLastCalledWith(null);
  await expect(auth.signInWithEmail('anyone@lab.example')).resolves.toEqual({ status: 'signed-in' });
  expect(listener).toHaveBeenLastCalledWith(session);
  unsubscribe();
});
```

- [ ] **Step 2: Run them to see them fail** — `npx vitest run src/data/mock` → the two new files FAIL.

- [ ] **Step 3: Implement** `MockRepository`, `MockAuthService` and `makeNewProjectInput` per Interfaces.

- [ ] **Step 4: Run** `npm run check` → all tests pass.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: add mock repository and auth service"
```

---

### Task 7: Data layer wiring & hooks

**Spec:** §4.1, §4.3 (QueryClient), §5.5, §5.6 (env, dev helper).

**Files:**
- Create: `src/data/index.ts`, `src/data/DataLayerProvider.tsx`, `src/app/queryClient.ts`, `src/hooks/query-keys.ts`, `src/hooks/useCurrentUser.ts`, `src/hooks/useSubscription.ts`, `src/hooks/useWorkspaces.ts`, `src/hooks/useProjects.ts`, `src/hooks/useSchedules.ts`, `src/hooks/useSharedWithMe.ts`, `src/hooks/useTasks.ts`, `src/hooks/useNow.ts`, `src/test/render.tsx`
- Modify: `src/test/fakes.ts`
- Test: `src/data/index.test.ts`, `src/hooks/data-hooks.test.tsx`, `src/hooks/useNow.test.tsx`

**Interfaces:**
- Consumes: `MockRepository`, `MockAuthService`, `createMockStore` (Tasks 5–6), `getBrowserStorage`, `createMemoryStorage` (Task 3).
- Produces:
  ```ts
  // src/data/index.ts
  export interface DataLayer { repository: DataRepository; auth: AuthService }
  export interface DataLayerEnv { VITE_DATA_SOURCE?: string; VITE_MOCK_SCENARIO?: string; VITE_MOCK_LATENCY_MS?: string; VITE_MOCK_FAIL_RATE?: string }
  export function createDataLayer(env?: DataLayerEnv, storage?: StorageLike | null): DataLayer; // defaults: import.meta.env, getBrowserStorage()
  // src/data/DataLayerProvider.tsx
  export function DataLayerProvider(props: { value: DataLayer; children: ReactNode }): ReactElement;
  export function useRepository(): DataRepository;    // outside the provider: throw Error('useRepository must be used inside DataLayerProvider')
  export function useAuthService(): AuthService;      // same pattern
  // src/app/queryClient.ts
  export function createQueryClient(options?: { test?: boolean }): QueryClient;
  // src/hooks/query-keys.ts — tuples exactly as spec §5.5
  export const queryKeys: { me(); subscription(); workspaces(); projects(workspaceId); recentProjects(workspaceId); workspaceProjects(workspaceId); projectCode(workspaceId, code); sharedWithMe(); pendingTasks() };
  export const RECENT_PROJECTS_LIMIT = 5;
  // hooks (TanStack Query v5 result types)
  useCurrentUser(); useSubscription(); useWorkspaces(); useCreateTeamWorkspace();
  useRecentProjects(workspaceId: ID | undefined); useWorkspaceProjects(workspaceId: ID | undefined);
  useProjectCodeAvailable(workspaceId: ID | undefined, code: string); useCreateProject();
  useCreateSchedule(); useImportSchedule(); useSharedWithMe(); usePendingTasks();
  useSetTaskDone(); // variables: { taskId: ID; done: boolean }
  useNow(intervalMs?: number): Date; // default 60_000
  // src/test/fakes.ts (added)
  export interface TestDataLayer extends DataLayer { repository: MockRepository; store: MockStore }
  export function createTestDataLayer(options?: { scenario?: Scenario; failRate?: number; now?: Date; overrides?: Partial<DataRepository> }): TestDataLayer;
  // src/test/render.tsx
  export function createQueryWrapper(dataLayer: DataLayer): (props: { children: ReactNode }) => ReactElement;
  export function renderWithProviders(ui: ReactElement, options?: { route?: string; path?: string; dataLayer?: TestDataLayer }):
    RenderResult & { user: UserEvent; dataLayer: TestDataLayer; queryClient: QueryClient };
  ```
- Pins:
  - `createDataLayer`: `supabase` → `throw new Error('Supabase data source is not implemented yet (Phase 2). Set VITE_DATA_SOURCE=mock.')`; any other non-`mock` value → `Error('Unknown VITE_DATA_SOURCE "<value>"')`; scenario default `default`; latency default `400`; fail rate default `0`. In `import.meta.env.DEV` it sets `window.__resetMockDb = () => { store.reset(); window.location.reload(); }`.
  - `createQueryClient()` uses the Global Constraints defaults; `{ test: true }` sets `retry: false` for queries and mutations.
  - `useRecentProjects` / `useWorkspaceProjects` are disabled while `workspaceId` is undefined. `useProjectCodeAvailable` is enabled only when `workspaceId` is set and `code.trim()` matches `/^[A-Za-z0-9_-]{1,16}$/`; its key uses `code.trim().toLowerCase()`.
  - Invalidation: `useCreateProject` → `queryKeys.projects(input.workspaceId)` and `queryKeys.workspaces()`; `useCreateSchedule` / `useImportSchedule` → the `['projects']` prefix; `useCreateTeamWorkspace` → `queryKeys.workspaces()`.
  - `useSetTaskDone` is optimistic: `onMutate` cancels `pendingTasks`, snapshots it and removes the task when `done === true`; `onError` restores the snapshot; `onSettled` invalidates `pendingTasks`.
  - `createTestDataLayer`: memory storage, `latencyMs: 0`, `random: () => 0` (so any `failRate > 0` fails every read), `now` default `new Date()`, `overrides` assigned onto the repository instance.
  - `renderWithProviders` (first version): `ThemeProvider` (outermost, so anything that calls `useTheme` — including the shadcn `Toaster` added in Task 10 — always has its provider) → `DataLayerProvider` → `QueryClientProvider` (`createQueryClient({ test: true })`) → `MemoryRouter initialEntries={[route ?? '/']}` → `Routes` (with `path`: that route plus `<Route path="*" element={null} />`; without: `<Route path="*" element={ui} />`) and a `LocationDisplay` (`<div hidden data-testid="location">{pathname}{search}</div>`). `user` is `userEvent.setup({ applyAccept: false })`.

- [ ] **Step 1: Write the failing tests**

`src/data/index.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createDataLayer } from '@/data';
import { createMemoryStorage } from '@/lib/storage';

describe('createDataLayer', () => {
  it('explains that Supabase is not implemented yet', () => {
    expect(() => createDataLayer({ VITE_DATA_SOURCE: 'supabase' }, null))
      .toThrow('Supabase data source is not implemented yet (Phase 2). Set VITE_DATA_SOURCE=mock.');
  });

  it('rejects unknown sources', () => {
    expect(() => createDataLayer({ VITE_DATA_SOURCE: 'firebase' }, null)).toThrow('Unknown VITE_DATA_SOURCE "firebase"');
  });

  it('builds the mock layer from env values', async () => {
    const { repository } = createDataLayer({ VITE_MOCK_SCENARIO: 'empty', VITE_MOCK_LATENCY_MS: '0' }, createMemoryStorage());
    await expect(repository.listWorkspaces()).resolves.toHaveLength(1);
  });
});
```

`src/hooks/data-hooks.test.tsx`:

```tsx
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RepositoryError } from '@/data/errors';
import { useCreateProject, useProjectCodeAvailable, useRecentProjects } from '@/hooks/useProjects';
import { usePendingTasks, useSetTaskDone } from '@/hooks/useTasks';
import { createTestDataLayer, makeNewProjectInput } from '@/test/fakes';
import { createQueryWrapper } from '@/test/render';

describe('data hooks', () => {
  it('useRecentProjects returns the five most recent projects', async () => {
    const dl = createTestDataLayer();
    const workspaceId = dl.store.read().workspaces[0]!.id;
    const { result } = renderHook(() => useRecentProjects(workspaceId), { wrapper: createQueryWrapper(dl) });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.map((p) => p.code)).toEqual(['001', '002', '003', '004', '005']);
  });

  it('useCreateProject refreshes recent projects', async () => {
    const dl = createTestDataLayer();
    const workspaceId = dl.store.read().workspaces[0]!.id;
    const { result } = renderHook(() => ({ recent: useRecentProjects(workspaceId), create: useCreateProject() }), {
      wrapper: createQueryWrapper(dl),
    });
    await waitFor(() => expect(result.current.recent.isSuccess).toBe(true));
    await act(() => result.current.create.mutateAsync(makeNewProjectInput(workspaceId, { code: '007', name: 'Pier 9' })));
    await waitFor(() => expect(result.current.recent.data?.[0]?.code).toBe('007'));
  });

  it('useSetTaskDone removes the task at once and restores it when the write fails', async () => {
    let fail: (error: unknown) => void = () => {};
    const dl = createTestDataLayer({ overrides: { setTaskDone: () => new Promise((_, reject) => { fail = reject; }) } });
    const { result } = renderHook(() => ({ tasks: usePendingTasks(), setDone: useSetTaskDone() }), { wrapper: createQueryWrapper(dl) });
    await waitFor(() => expect(result.current.tasks.data).toHaveLength(3));
    act(() => result.current.setDone.mutate({ taskId: result.current.tasks.data![0]!.id, done: true }));
    await waitFor(() => expect(result.current.tasks.data).toHaveLength(2));
    act(() => fail(new RepositoryError('network', 'offline')));
    await waitFor(() => expect(result.current.tasks.data).toHaveLength(3));
  });

  it('useProjectCodeAvailable stays idle for malformed IDs', () => {
    const dl = createTestDataLayer();
    const workspaceId = dl.store.read().workspaces[0]!.id;
    const { result } = renderHook(() => useProjectCodeAvailable(workspaceId, 'a b'), { wrapper: createQueryWrapper(dl) });
    expect(result.current.fetchStatus).toBe('idle');
  });
});
```

`src/hooks/useNow.test.tsx`:

```tsx
import { act, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useNow } from '@/hooks/useNow';

afterEach(() => { vi.useRealTimers(); });

it('ticks every interval', () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-14T10:00:00.000Z'));
  const { result } = renderHook(() => useNow(60_000));
  expect(result.current.toISOString()).toBe('2026-10-14T10:00:00.000Z');
  act(() => { vi.advanceTimersByTime(60_000); });
  expect(result.current.toISOString()).toBe('2026-10-14T10:01:00.000Z');
});
```

- [ ] **Step 2: Run them to see them fail** — `npx vitest run src/data/index.test.ts src/hooks` → FAIL (modules not found).

- [ ] **Step 3: Implement** every file listed in Interfaces.

- [ ] **Step 4: Run** `npm run check` → all tests pass; the lint rule accepts `src/data/index.ts` importing adapters.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: wire the data layer, query hooks and test utilities"
```

---

### Task 8: Auth flow, router skeleton & app providers

**Spec:** §4.3, §4.4 (`/sign-in`, `/`, `/home`), §5.3, §6.7 (sign-in page).

**Files:**
- Create: `src/auth/AuthProvider.tsx`, `src/auth/RequireAuth.tsx`, `src/pages/SignInPage.tsx`, `src/pages/HomePage.tsx` (stub, completed in Tasks 16–18), `src/app/router.tsx`, `src/components/common/StartupError.tsx`
- Modify: `src/app/App.tsx`, `src/main.tsx`, `src/test/render.tsx` (wrap with `AuthProvider` inside `QueryClientProvider`)
- Test: `src/auth/auth.test.tsx`, `src/pages/SignInPage.test.tsx`

**Interfaces:**
- Consumes: `useAuthService` (Task 7), `createDataLayer`, `createQueryClient` (Task 7), `ThemeProvider` (Task 3), shadcn `Toaster`, `TooltipProvider`.
- Produces:
  ```ts
  export type AuthStatus = 'loading' | 'signed-in' | 'signed-out';
  export function AuthProvider(props: { children: ReactNode }): ReactElement;
  export function useAuth(): {
    status: AuthStatus; session: Session | null;
    signInWithEmail(email: string): Promise<'signed-in' | 'link-sent'>;
    signOut(): Promise<void>; // auth.signOut(), then queryClient.clear()
  };
  export function RequireAuth(props: { children: ReactNode }): ReactElement;
  export const appRoutes: RouteObject[];          // src/app/router.tsx
  export function App(props: { dataLayer: DataLayer }): ReactElement;
  export function StartupError(props: { message: string }): ReactElement;
  ```
- Pins:
  - `RequireAuth`: while `loading`, a centered spinner with `role="status"` and `aria-label="Loading"`; when `signed-out`, `<Navigate to="/sign-in" replace state={{ from: location }} />`.
  - `appRoutes` (this task): `/sign-in` → `SignInPage`; `/` → `<RequireAuth><Outlet /></RequireAuth>` with children `index` → `<Navigate to="/home" replace />` and `home` → `HomePage`. Task 11 inserts `AppShell`, Task 13 completes the table.
  - `App`: `ThemeProvider` → `DataLayerProvider` → `QueryClientProvider` → `AuthProvider` → `TooltipProvider` → `RouterProvider` (`createBrowserRouter(appRoutes)`, created once) plus `<Toaster />`.
  - `main.tsx`: call `createDataLayer()` inside `try`; on error render `<StartupError message={…} />` (centered `text-sm` message) instead of `<App />`.
  - `SignInPage`: copy and layout from spec §6.7; label "Email"; the demo note shows when `(import.meta.env.VITE_DATA_SOURCE ?? 'mock') === 'mock'`; signed-in visitors are redirected to `state.from` or `/home`; a `link-sent` result replaces the form with "Check your inbox for a sign-in link." The `<form>` has `noValidate` — otherwise the browser's own `type="email"` check (also enforced by jsdom) blocks submit and the zod message never shows.
  - `HomePage` stub renders nothing but `<div />` (Tasks 16–18 fill it).

- [ ] **Step 1: Write the failing tests**

`src/pages/SignInPage.test.tsx`:

```tsx
import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SignInPage } from '@/pages/SignInPage';
import { createTestDataLayer } from '@/test/fakes';
import { renderWithProviders } from '@/test/render';

async function signedOut() {
  const dataLayer = createTestDataLayer();
  await dataLayer.auth.signOut();
  return dataLayer;
}

describe('SignInPage', () => {
  it('signs in with any email in demo mode and opens Home', async () => {
    const { user } = renderWithProviders(<SignInPage />, { route: '/sign-in', path: '/sign-in', dataLayer: await signedOut() });
    expect(await screen.findByText('Demo mode: any email signs you in as the demo user.')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Email'), 'lab@example.com');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/home'));
  });

  it('validates the email address', async () => {
    const { user } = renderWithProviders(<SignInPage />, { route: '/sign-in', path: '/sign-in', dataLayer: await signedOut() });
    await user.type(await screen.findByLabelText('Email'), 'nope');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByText('Enter a valid email address')).toBeInTheDocument();
  });

  it('sends signed-in visitors to Home', async () => {
    renderWithProviders(<SignInPage />, { route: '/sign-in', path: '/sign-in' });
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/home'));
  });
});
```

`src/auth/auth.test.tsx`:

```tsx
import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RequireAuth } from '@/auth/RequireAuth';
import { useAuth } from '@/auth/AuthProvider';
import { createTestDataLayer } from '@/test/fakes';
import { renderWithProviders } from '@/test/render';

describe('auth', () => {
  it('redirects signed-out visitors to /sign-in', async () => {
    const dataLayer = createTestDataLayer();
    await dataLayer.auth.signOut();
    renderWithProviders(<RequireAuth><p>Secret</p></RequireAuth>, { route: '/home', path: '/home', dataLayer });
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/sign-in'));
    expect(screen.queryByText('Secret')).not.toBeInTheDocument();
  });

  it('renders protected content for signed-in users', async () => {
    renderWithProviders(<RequireAuth><p>Secret</p></RequireAuth>, { route: '/home', path: '/home' });
    expect(await screen.findByText('Secret')).toBeInTheDocument();
  });

  it('clears cached data on sign-out', async () => {
    function SignOut() {
      const { signOut } = useAuth();
      return <button onClick={() => void signOut()}>Sign out</button>;
    }
    const { user, queryClient } = renderWithProviders(<SignOut />);
    queryClient.setQueryData(['me'], { firstName: 'Deniz' });
    await user.click(await screen.findByRole('button', { name: 'Sign out' }));
    await waitFor(() => expect(queryClient.getQueryData(['me'])).toBeUndefined());
  });
});
```

- [ ] **Step 2: Run them to see them fail** — `npx vitest run src/auth src/pages` → FAIL (modules not found).

- [ ] **Step 3: Implement** the files in Interfaces and update `render.tsx`.

- [ ] **Step 4: Run** `npm run check` → all tests pass. (Optional owner check, skip when running unattended: `npm run dev`, open `http://localhost:5173` → redirected to `/home`, no console errors.)

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: add auth provider, sign-in page and router skeleton"
```

---

### Task 9: Current workspace & project context

**Spec:** §4.5 (current workspace / project rows, `useCurrentContext`).

**Files:**
- Create: `src/hooks/useCurrentContext.tsx`
- Modify: `src/test/render.tsx` (wrap the routes in `CurrentContextProvider`, inside `MemoryRouter`)
- Test: `src/hooks/useCurrentContext.test.tsx`

**Interfaces:**
- Consumes: `useWorkspaces`, `useWorkspaceProjects` (Task 7), `readKey`, `writeKey` (Task 3).
- Produces:
  ```ts
  export interface CurrentContextValue {
    status: 'loading' | 'ready' | 'error';
    workspaces: WorkspaceSummary[];
    workspace: WorkspaceSummary | null;
    projects: ProjectSummary[];   // current workspace, updatedAt desc
    project: ProjectSummary | null;
    setWorkspace(id: ID): void;
    setProject(id: ID): void;
    retry(): void;                // refetches workspaces and projects
  }
  export function CurrentContextProvider(props: { children: ReactNode }): ReactElement;
  export function useCurrentContext(): CurrentContextValue;
  ```
- Pins:
  - Read URL ids with `useMatch('/w/:workspaceId/*')` and `useMatch('/w/:workspaceId/p/:projectId/*')` — they work from a layout route, where `useParams()` would miss child params.
  - Resolution exactly as §4.5; ids that don't exist are skipped. When the resolved workspace or project comes from the URL, write it to `ui.lastWorkspaceId` / `ui.lastProjectId.<workspaceId>`.
  - `setWorkspace(id)`: write `ui.lastWorkspaceId`, navigate to `/w/:id/projects`. `setProject(id)`: write `ui.lastProjectId.<workspaceId>`; if the path matches `/w/:workspaceId/p/:projectId/:section`, navigate to the same section for `id`.
  - `status`: `error` when the workspaces query failed; `loading` until workspaces — and, if a workspace resolved, its projects — have loaded; otherwise `ready`.

- [ ] **Step 1: Write the failing test** — `src/hooks/useCurrentContext.test.tsx`

```tsx
import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useCurrentContext } from '@/hooks/useCurrentContext';
import { createTestDataLayer } from '@/test/fakes';
import { renderWithProviders } from '@/test/render';

function Probe() {
  const ctx = useCurrentContext();
  return (
    <div>
      <p data-testid="ctx">{`${ctx.status}|${ctx.workspace?.name ?? '-'}|${ctx.project?.code ?? '-'}`}</p>
      <button onClick={() => ctx.setProject(ctx.projects.find((p) => p.code === '003')!.id)}>pick 003</button>
      <button onClick={() => ctx.setWorkspace(ctx.workspaces[1]!.id)}>pick team</button>
    </div>
  );
}

describe('useCurrentContext', () => {
  it('falls back to the personal workspace and its most recent project', async () => {
    renderWithProviders(<Probe />, { route: '/home', path: '/home' });
    await waitFor(() => expect(screen.getByTestId('ctx')).toHaveTextContent('ready|My workspace|001'));
  });

  it('prefers ids from the URL and remembers them', async () => {
    const dl = createTestDataLayer();
    const team = dl.store.read().workspaces[1]!;
    renderWithProviders(<Probe />, { route: `/w/${team.id}/projects`, path: '/w/:workspaceId/projects', dataLayer: dl });
    await waitFor(() => expect(screen.getByTestId('ctx')).toHaveTextContent('ready|Site Operations|T-01'));
    expect(localStorage.getItem('ui.lastWorkspaceId')).toBe(team.id);
  });

  it('uses the stored project and ignores stored ids that no longer exist', async () => {
    const dl = createTestDataLayer();
    const db = dl.store.read();
    localStorage.setItem('ui.lastWorkspaceId', 'missing-id');
    localStorage.setItem(`ui.lastProjectId.${db.workspaces[0]!.id}`, db.projects.find((p) => p.code === '003')!.id);
    renderWithProviders(<Probe />, { route: '/home', path: '/home', dataLayer: dl });
    await waitFor(() => expect(screen.getByTestId('ctx')).toHaveTextContent('ready|My workspace|003'));
  });

  it('keeps the current project section when switching projects', async () => {
    const dl = createTestDataLayer();
    const db = dl.store.read();
    const personal = db.workspaces[0]!;
    const riverside = db.projects.find((p) => p.code === '001')!;
    const harbor = db.projects.find((p) => p.code === '003')!;
    const { user } = renderWithProviders(<Probe />, {
      route: `/w/${personal.id}/p/${riverside.id}/dashboard`,
      path: '/w/:workspaceId/p/:projectId/dashboard',
      dataLayer: dl,
    });
    await waitFor(() => expect(screen.getByTestId('ctx')).toHaveTextContent('ready|My workspace|001'));
    await user.click(screen.getByRole('button', { name: 'pick 003' }));
    expect(screen.getByTestId('location')).toHaveTextContent(`/w/${personal.id}/p/${harbor.id}/dashboard`);
  });

  it('opens the projects page of a newly picked workspace', async () => {
    const dl = createTestDataLayer();
    const team = dl.store.read().workspaces[1]!;
    const { user } = renderWithProviders(<Probe />, { route: '/home', dataLayer: dl });
    await waitFor(() => expect(screen.getByTestId('ctx')).toHaveTextContent('ready'));
    await user.click(screen.getByRole('button', { name: 'pick team' }));
    expect(screen.getByTestId('location')).toHaveTextContent(`/w/${team.id}/projects`);
    expect(localStorage.getItem('ui.lastWorkspaceId')).toBe(team.id);
  });

  it('reports an error when workspaces fail to load', async () => {
    renderWithProviders(<Probe />, { route: '/home', path: '/home', dataLayer: createTestDataLayer({ failRate: 1 }) });
    await waitFor(() => expect(screen.getByTestId('ctx')).toHaveTextContent('error|-|-'));
  });

  it('has no project in an empty workspace', async () => {
    renderWithProviders(<Probe />, { route: '/home', path: '/home', dataLayer: createTestDataLayer({ scenario: 'empty' }) });
    await waitFor(() => expect(screen.getByTestId('ctx')).toHaveTextContent('ready|My workspace|-'));
  });
});
```

- [ ] **Step 2: Run it to see it fail** — `npx vitest run src/hooks/useCurrentContext.test.tsx` → FAIL.

- [ ] **Step 3: Implement** `useCurrentContext.tsx` and update `render.tsx`.

- [ ] **Step 4: Run** `npm run check` → all tests pass.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: resolve the current workspace and project"
```

---

### Task 10: Dialog infrastructure & New team workspace dialog

**Spec:** §4.6, §6.6 (`FileDropzone` row), §6.7 (dialog table; New team workspace), §5.7 (team workspace row).

**Files:**
- Create: `src/features/dialogs/DialogsProvider.tsx`, `src/features/dialogs/DialogHost.tsx`, `src/components/common/FormDialog.tsx`, `src/components/common/FileDropzone.tsx`, `src/features/workspaces/NewTeamWorkspaceDialog.tsx`
- Modify: `src/test/render.tsx`
- Test: `src/features/dialogs/dialogs.test.tsx`, `src/components/common/FileDropzone.test.tsx`

**Interfaces:**
- Consumes: `useCreateTeamWorkspace` (Task 7), `errorMessage`, `fileSize` (Task 4), shadcn `dialog`, `alert-dialog`, `button`, `input`, `label`, sonner `toast`.
- Produces:
  ```ts
  export type DialogKind = 'newSchedule' | 'importSchedule' | 'newProject' | 'newTeamWorkspace';
  export interface DialogOptions { projectId?: ID }
  export function DialogsProvider(props: { children: ReactNode }): ReactElement;
  export function useDialogs(): {
    active: { kind: DialogKind; options: DialogOptions } | null;
    openDialog(kind: DialogKind, options?: DialogOptions): void; // replaces any open dialog
    closeDialog(): void;
  };
  export function DialogHost(): ReactElement | null; // this task registers 'newTeamWorkspace'; Tasks 14–15 add the rest
  export function FormDialog(props: {
    title: string; description: string; width: 'sm' | 'md' | 'lg' | 'xl'; // 440 | 520 | 560 | 640 px
    isDirty: boolean; isPending: boolean; submitLabel: string; pendingLabel: string;
    onSubmit: (event: FormEvent<HTMLFormElement>) => void; onClose: () => void; children: ReactNode;
    submitDisabled?: boolean;
    footer?: (helpers: { requestClose: () => void }) => ReactNode; // replaces the default footer
  }): ReactElement;
  export function FileDropzone(props: {
    label: string; accept: string[]; maxBytes: number; hint: string;
    value: File | null; onChange: (file: File | null) => void;
    error?: string; height?: number; icon?: LucideIcon;
  }): ReactElement;
  export function NewTeamWorkspaceDialog(): ReactElement;
  // src/test/render.tsx (added)
  export function OpenDialog(props: { kind: DialogKind; options?: DialogOptions }): null; // opens once on mount
  ```
- Pins:
  - `FormDialog`: rendered open (DialogHost mounts it only while active). Escape, overlay click, the close button (aria-label "Close") and "Cancel" all call `requestClose()`: closes at once when `!isDirty`, otherwise shows an AlertDialog "Discard changes?" with "Keep editing" / "Discard". Default footer: "Cancel" (secondary) + submit (`type="submit"`), disabled when `isPending || submitDisabled`, showing a `Loader2` spinner and `pendingLabel` while pending. `aria-describedby` points at the description. Forms use react-hook-form with its default `shouldFocusError` so an invalid submit focuses the first invalid field. The `<form>` has `noValidate` so the browser's (and jsdom's) built-in validation never blocks submit — zod owns validation.
  - No `autoFocus` attributes (jsx-a11y rejects them): Radix focuses the first field when the dialog opens; to also select a default value use RHF `setFocus(name, { shouldSelect: true })` from the dialog's `onOpenAutoFocus` (call `event.preventDefault()` first).
  - Required fields: the label text has no `*`; a `*` goes in a sibling `<span aria-hidden="true">` next to the `<label>`, and the control gets `aria-required="true"`. Tests and e2e locate fields by their exact label text.
  - `FileDropzone`: a `<button type="button" aria-label={label}>` opens a visually hidden `<input type="file" aria-label={label} accept={accept.join(',')}>`; it accepts drops and reads the dropped file with `Array.from(event.dataTransfer.files)[0]`; it never validates (forms validate with zod). With a value it shows the file name, `fileSize(file.size)` and a "Remove file" button.
  - `NewTeamWorkspaceDialog`: width `sm`; title, description and submit copy from §6.7; field label "Workspace name"; zod rule from §5.7; success → `toast.success('Workspace created')` and close; failure → `toast.error(errorMessage(error))`, dialog stays open.
  - `render.tsx`: `DialogsProvider` sits inside `CurrentContextProvider`; render `<DialogHost />`, sonner `<Toaster />` and a `DialogStateProbe` (`<div hidden data-testid="dialog">{active?.kind ?? 'none'}</div>`). `OpenDialog` calls `openDialog` once from a mount effect; if the react-hooks plugin flags that line, disable the rule on that line only — it is a test helper.

- [ ] **Step 1: Write the failing tests**

`src/features/dialogs/dialogs.test.tsx`:

```tsx
import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useDialogs } from '@/features/dialogs/DialogsProvider';
import { createTestDataLayer } from '@/test/fakes';
import { OpenDialog, renderWithProviders } from '@/test/render';

describe('dialogs', () => {
  it('keeps only the latest requested dialog', async () => {
    function Twice() {
      const { openDialog } = useDialogs();
      return <button onClick={() => { openDialog('newSchedule'); openDialog('newProject'); }}>open</button>;
    }
    const { user } = renderWithProviders(<Twice />);
    await user.click(screen.getByRole('button', { name: 'open' }));
    expect(screen.getByTestId('dialog')).toHaveTextContent('newProject');
  });

  it('creates a team workspace', async () => {
    const dataLayer = createTestDataLayer();
    const { user } = renderWithProviders(<OpenDialog kind="newTeamWorkspace" />, { dataLayer });
    const dialog = await screen.findByRole('dialog', { name: 'New team workspace' });
    expect(within(dialog).getByText('Team workspaces hold projects you work on with others.')).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText('Workspace name'), 'Field crew');
    await user.click(within(dialog).getByRole('button', { name: 'Create workspace' }));
    expect(await screen.findByText('Workspace created')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('dialog')).toHaveTextContent('none'));
    expect(dataLayer.store.read().workspaces.map((w) => w.name)).toContain('Field crew');
  });

  it('validates the workspace name', async () => {
    const { user } = renderWithProviders(<OpenDialog kind="newTeamWorkspace" />);
    await user.type(await screen.findByLabelText('Workspace name'), ' a ');
    await user.click(screen.getByRole('button', { name: 'Create workspace' }));
    expect(await screen.findByText('Use 2–40 characters')).toBeInTheDocument();
  });

  it('closes a pristine form at once', async () => {
    const { user } = renderWithProviders(<OpenDialog kind="newTeamWorkspace" />);
    await screen.findByRole('dialog', { name: 'New team workspace' });
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.getByTestId('dialog')).toHaveTextContent('none'));
  });

  it('confirms before discarding a dirty form', async () => {
    const { user } = renderWithProviders(<OpenDialog kind="newTeamWorkspace" />);
    await user.type(await screen.findByLabelText('Workspace name'), 'Field crew');
    await user.keyboard('{Escape}');
    const confirm = await screen.findByRole('alertdialog', { name: 'Discard changes?' });
    await user.click(within(confirm).getByRole('button', { name: 'Keep editing' }));
    expect(screen.getByLabelText('Workspace name')).toHaveValue('Field crew');
    await user.keyboard('{Escape}');
    await user.click(await screen.findByRole('button', { name: 'Discard' }));
    await waitFor(() => expect(screen.getByTestId('dialog')).toHaveTextContent('none'));
  });
});
```

`src/components/common/FileDropzone.test.tsx`:

```tsx
import { fireEvent, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { FileDropzone } from '@/components/common/FileDropzone';
import { renderWithProviders } from '@/test/render';

function Harness({ onChange }: { onChange: (file: File | null) => void }) {
  const [file, setFile] = useState<File | null>(null);
  return (
    <FileDropzone
      label="Schedule file" accept={['.xer', '.xml', '.csv']} maxBytes={20 * 1024 * 1024} hint="Hint"
      value={file} onChange={(next) => { setFile(next); onChange(next); }}
    />
  );
}

describe('FileDropzone', () => {
  it('passes the chosen file up and shows its name and size', async () => {
    const onChange = vi.fn();
    const { user } = renderWithProviders(<Harness onChange={onChange} />);
    await user.upload(screen.getByLabelText('Schedule file', { selector: 'input' }), new File(['abc'], 'plan.xer'));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ name: 'plan.xer' }));
    expect(screen.getByText('plan.xer')).toBeInTheDocument();
    expect(screen.getByText('3 B')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Remove file' }));
    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  it('accepts a dropped file', () => {
    const onChange = vi.fn();
    renderWithProviders(<Harness onChange={onChange} />);
    fireEvent.drop(screen.getByRole('button', { name: 'Schedule file' }), { dataTransfer: { files: [new File(['x'], 'drop.csv')] } });
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ name: 'drop.csv' }));
  });
});
```

- [ ] **Step 2: Run them to see them fail** — `npx vitest run src/features/dialogs src/components/common` → FAIL.

- [ ] **Step 3: Implement** the files in Interfaces and update `render.tsx`.

- [ ] **Step 4: Run** `npm run check` → all tests pass.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: add dialog host, form dialog, file dropzone and team workspace dialog"
```

---

### Task 11: App shell layout

**Spec:** §4.3, §6.3, §6.4 (sidebar toggle, logo rows), §6.5, §6.9 (sidebar modes), §6.12 (skip link, landmarks, focus order).

**Files:**
- Create: `src/hooks/useSidebarState.tsx`, `src/components/layout/AppShell.tsx`, `src/components/layout/Sidebar.tsx`, `src/components/layout/SidebarNav.tsx`, `src/components/layout/TopBar.tsx`, `src/test/viewport.ts`
- Modify: `src/app/router.tsx` (protected layout element becomes `<RequireAuth><AppShell /></RequireAuth>`), `src/test/render.tsx` (`TooltipProvider` outside the router; `SidebarStateProvider` between `CurrentContextProvider` and `DialogsProvider`), `src/test/setup.ts` (call `resetViewport()` after each test)
- Test: `src/hooks/useSidebarState.test.tsx`, `src/components/layout/SidebarNav.test.tsx`, `src/components/layout/TopBar.test.tsx`, `src/components/layout/AppShell.test.tsx`

**Interfaces:**
- Consumes: `useCurrentContext` (Task 9), `DialogsProvider`, `DialogHost` (Task 10), `BrandLogo`, `brand` (Task 3), `readKey` / `writeKey`.
- Produces:
  ```ts
  // src/test/viewport.ts
  export function mockViewport(width: number): void; // matchMedia answering (min-width|max-width: Npx) for `width`, notifying 'change' listeners
  export function resetViewport(): void;
  // src/hooks/useSidebarState.tsx
  export function SidebarStateProvider(props: { children: ReactNode }): ReactElement;
  export function useSidebarState(): { mode: 'inline' | 'drawer'; open: boolean; toggle(): void; setOpen(open: boolean): void };
  // components
  export function SidebarNav(props: { onNavigate?: () => void }): ReactElement; // <nav aria-label="Primary">
  export function Sidebar(): ReactElement;
  export function TopBar(): ReactElement;   // this task: toggle + logo; Task 12 adds the controls
  export function AppShell(): ReactElement; // CurrentContextProvider → SidebarStateProvider → DialogsProvider → frame + <Outlet /> + <DialogHost />
  ```
- Pins:
  - `mode` is `inline` when `matchMedia('(min-width: 1024px)').matches`, else `drawer`; read it with `useSyncExternalStore` subscribed to the query's `change` event (no `setState` inside an effect — react-hooks' `set-state-in-effect` rule is an error).
  - Inline: `open` starts from `ui.sidebarOpen` (`'false'` → closed, otherwise open) and is persisted on change. The closed inline sidebar keeps `<aside id="app-sidebar">` with `data-state="closed"`, width 0, `aria-hidden="true"` and `inert`.
  - Drawer: starts closed, not persisted, closes whenever `location.pathname` changes. Derive it instead of syncing it: keep `openedAt: string | null` (the pathname it was opened on) and compute `open = openedAt === location.pathname`; `toggle()` sets `openedAt` to the current pathname or `null`. It renders a left `Sheet` (width 240) whose title "Navigation" is visually hidden.
  - Toggle labels: inline open "Hide sidebar", inline closed "Show sidebar", drawer "Open navigation"; `aria-expanded={open}`, `aria-controls="app-sidebar"`.
  - Logo link: `<Link to="/home" aria-label={`${brand.name} home`}>` around `BrandLogo`.
  - Frame and measurements: spec §6.3; skip link "Skip to content" → `#main` is the first focusable element; `<main id="main" tabIndex={-1}>` wraps a `mx-auto max-w-[1600px]` column with the `<Outlet />`.
  - `SidebarNav`: model and states from §6.5. Group labels are plain `<p>` elements, not headings (the Home page test counts `h2`s). Without a current project the three project items render as focusable `<span aria-disabled="true">` with the Tooltip "Create or select a project first"; without a current workspace the Projects item is disabled the same way.
  - Touch: nav items and icon buttons add `pointer-coarse:h-10` (§6.12).

- [ ] **Step 1: Write the failing tests**

`src/hooks/useSidebarState.test.tsx`:

```tsx
import { screen } from '@testing-library/react';
import { Link } from 'react-router';
import { describe, expect, it } from 'vitest';
import { useSidebarState } from '@/hooks/useSidebarState';
import { renderWithProviders } from '@/test/render';
import { mockViewport } from '@/test/viewport';

function Probe() {
  const { mode, open, toggle } = useSidebarState();
  return (
    <>
      <p data-testid="sidebar">{`${mode}|${String(open)}`}</p>
      <button onClick={toggle}>toggle</button>
      <Link to="/library">go</Link>
    </>
  );
}

describe('useSidebarState', () => {
  it('is inline and open on desktop, and persists closing', async () => {
    mockViewport(1440);
    const { user } = renderWithProviders(<Probe />, { route: '/home' });
    expect(screen.getByTestId('sidebar')).toHaveTextContent('inline|true');
    await user.click(screen.getByRole('button', { name: 'toggle' }));
    expect(screen.getByTestId('sidebar')).toHaveTextContent('inline|false');
    expect(localStorage.getItem('ui.sidebarOpen')).toBe('false');
  });

  it('starts closed when ui.sidebarOpen is "false"', () => {
    mockViewport(1440);
    localStorage.setItem('ui.sidebarOpen', 'false');
    renderWithProviders(<Probe />, { route: '/home' });
    expect(screen.getByTestId('sidebar')).toHaveTextContent('inline|false');
  });

  it('uses a closed drawer below 1024px that closes on navigation', async () => {
    mockViewport(800);
    const { user } = renderWithProviders(<Probe />, { route: '/home' });
    expect(screen.getByTestId('sidebar')).toHaveTextContent('drawer|false');
    await user.click(screen.getByRole('button', { name: 'toggle' }));
    expect(screen.getByTestId('sidebar')).toHaveTextContent('drawer|true');
    await user.click(screen.getByRole('link', { name: 'go' }));
    expect(screen.getByTestId('sidebar')).toHaveTextContent('drawer|false');
  });
});
```

`src/components/layout/SidebarNav.test.tsx`:

```tsx
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SidebarNav } from '@/components/layout/SidebarNav';
import { createTestDataLayer } from '@/test/fakes';
import { renderWithProviders } from '@/test/render';

describe('SidebarNav', () => {
  it('marks Home as current and links project items to the current project', async () => {
    const dl = createTestDataLayer();
    const db = dl.store.read();
    const personal = db.workspaces[0]!;
    const riverside = db.projects.find((p) => p.code === '001')!;
    renderWithProviders(<SidebarNav />, { route: '/home', path: '/home', dataLayer: dl });
    expect(await screen.findByRole('link', { name: 'Home' })).toHaveAttribute('aria-current', 'page');
    expect(await screen.findByRole('link', { name: 'Projects' })).toHaveAttribute('href', `/w/${personal.id}/projects`);
    expect(await screen.findByRole('link', { name: 'Files' })).toHaveAttribute('href', `/w/${personal.id}/p/${riverside.id}/files`);
    expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('href', `/w/${personal.id}/p/${riverside.id}/dashboard`);
    expect(screen.getByRole('link', { name: 'Schedule' })).toHaveAttribute('href', `/w/${personal.id}/p/${riverside.id}/schedule`);
    expect(screen.getByText('Workspace')).toBeInTheDocument();
    expect(screen.getByText('Project')).toBeInTheDocument();
  });

  it('disables project items when the workspace has no projects', async () => {
    renderWithProviders(<SidebarNav />, { route: '/home', path: '/home', dataLayer: createTestDataLayer({ scenario: 'empty' }) });
    await screen.findByRole('link', { name: 'Projects' });
    expect(screen.queryByRole('link', { name: 'Files' })).not.toBeInTheDocument();
    expect(screen.getByText('Files').closest('[aria-disabled="true"]')).not.toBeNull();
  });
});
```

`src/components/layout/TopBar.test.tsx`:

```tsx
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TopBar } from '@/components/layout/TopBar';
import { brand } from '@/config/brand';
import { renderWithProviders } from '@/test/render';
import { mockViewport } from '@/test/viewport';

describe('TopBar', () => {
  it('toggles the inline sidebar', async () => {
    mockViewport(1440);
    const { user } = renderWithProviders(<TopBar />);
    const toggle = screen.getByRole('button', { name: 'Hide sidebar' });
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await user.click(toggle);
    expect(screen.getByRole('button', { name: 'Show sidebar' })).toHaveAttribute('aria-expanded', 'false');
  });

  it('offers the navigation drawer below 1024px', () => {
    mockViewport(800);
    renderWithProviders(<TopBar />);
    expect(screen.getByRole('button', { name: 'Open navigation' })).toBeInTheDocument();
  });

  it('links the logo to Home', () => {
    renderWithProviders(<TopBar />);
    expect(screen.getByRole('link', { name: `${brand.name} home` })).toHaveAttribute('href', '/home');
  });
});
```

`src/components/layout/AppShell.test.tsx`:

```tsx
import { screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { AppShell } from '@/components/layout/AppShell';
import { renderWithProviders } from '@/test/render';
import { mockViewport } from '@/test/viewport';

it('puts the skip link first and exposes the landmarks', async () => {
  mockViewport(1440);
  const { user } = renderWithProviders(<AppShell />, { route: '/home' });
  await user.tab();
  expect(screen.getByRole('link', { name: 'Skip to content' })).toHaveFocus();
  expect(screen.getByRole('banner')).toBeInTheDocument();
  expect(screen.getByRole('navigation', { name: 'Primary' })).toBeInTheDocument();
  expect(screen.getByRole('main')).toHaveAttribute('id', 'main');
});
```

- [ ] **Step 2: Run them to see them fail** — `npx vitest run src/hooks/useSidebarState.test.tsx src/components/layout` → FAIL.

- [ ] **Step 3: Implement** the files in Interfaces, then update `router.tsx`, `render.tsx` and `setup.ts`.

- [ ] **Step 4: Run** `npm run check` → all tests pass. (Optional owner check: in `npm run dev`, at ≥ 1024 px the sidebar hides and shows and survives a reload; below 1024 px the drawer opens and closes on navigation.)

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: add app shell with collapsible sidebar and top bar"
```

---

### Task 12: Top bar controls

**Spec:** §6.4, §6.7 (workspace popover, project popover, user menu), §6.9 (compact variants), §6.10 (trial text, failure rows).

**Files:**
- Create: `src/components/layout/WorkspaceSwitcher.tsx`, `src/components/layout/ProjectSwitcher.tsx`, `src/components/layout/PlanBadge.tsx`, `src/components/layout/UserMenu.tsx`
- Modify: `src/components/layout/TopBar.tsx` (left cluster: toggle, logo, workspace switcher, project switcher; right cluster: plan badge, user menu)
- Test: `src/components/layout/WorkspaceSwitcher.test.tsx`, `src/components/layout/ProjectSwitcher.test.tsx`, `src/components/layout/PlanBadge.test.tsx`, `src/components/layout/UserMenu.test.tsx`

**Interfaces:**
- Consumes: `useCurrentContext` (Task 9), `useSubscription`, `useCurrentUser`, `useNow` (Task 7), `useAuth` (Task 8), `useTheme`, `brand` (Task 3), `useDialogs` (Task 10), `trialStatus`, `fullName`, `initials` (Task 4).
- Produces: `WorkspaceSwitcher()`, `ProjectSwitcher()`, `PlanBadge()`, `UserMenu()` — no props.
- Pins:
  - Workspace name is a link (accessible name = workspace name) to `/w/:id/projects`; the chevron is a button `aria-label="Switch workspace"` opening a `Command` popover: input placeholder "Search workspaces…", empty text "No workspaces found", tags "Personal" / "Team".
  - Project switcher: button `aria-label="Switch project"` whose visible text is the project name or "Select project"; popover input "Search projects…", empty "No projects found", footer item "Create new project" → `openDialog('newProject')`.
  - When `useCurrentContext().status === 'error'` both switchers render a disabled button with text "Unavailable".
  - `PlanBadge`: renders nothing unless `plan === 'trial'`; a `<Link to="/settings/billing">` whose aria-label is `Trial: {label}. Upgrade now.` or, when ended, `Trial ended. Upgrade now.`; shows `compactLabel` below 640 px; refreshes with `useNow()`.
  - `UserMenu` trigger `aria-label="Account menu for {fullName}"`; items and actions from §6.7; Documentation is `<a href={brand.docsUrl} target="_blank" rel="noreferrer">`; the theme item reads "Light mode" in the dark theme and "Dark mode" in the light theme; "Log out" awaits `signOut()` then navigates to `/sign-in`. If the user query failed, the trigger shows a `User` icon and no name, aria-label "Account menu".
  - Below 640 px (§6.9): the workspace name link shows only a `Building2` icon (the name stays its accessible name), the project label is capped at 120 px, the plan badge shows only `compactLabel` (no "TRIAL" label or dot), the account trigger hides the first name and the top bar cluster gaps are 8 px (spec D10). Between 640 and 767 px the workspace name is capped at 120 px. Below 768 px the logo link is hidden (spec D10).
  - The "TRIAL" label is at 70 % opacity in the dark theme only (spec D10).
  - All of these size variants are CSS-only (render both forms, toggle with responsive `hidden` / `sm:inline` utilities). Never pick them with `matchMedia` in JavaScript: tests run with `matchMedia` returning `false` and must still find the full labels.

- [ ] **Step 1: Write the failing tests**

`src/components/layout/WorkspaceSwitcher.test.tsx`:

```tsx
import { screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { WorkspaceSwitcher } from '@/components/layout/WorkspaceSwitcher';
import { createTestDataLayer } from '@/test/fakes';
import { renderWithProviders } from '@/test/render';

it('links the current workspace and switches with the keyboard', async () => {
  const dl = createTestDataLayer();
  const [personal, team] = dl.store.read().workspaces;
  const { user } = renderWithProviders(<WorkspaceSwitcher />, { route: '/home', path: '/home', dataLayer: dl });
  expect(await screen.findByRole('link', { name: 'My workspace' })).toHaveAttribute('href', `/w/${personal!.id}/projects`);
  await user.click(screen.getByRole('button', { name: 'Switch workspace' }));
  await user.keyboard('site');
  expect(screen.queryByRole('option', { name: /My workspace/ })).not.toBeInTheDocument();
  await user.keyboard('{Enter}');
  expect(screen.getByTestId('location')).toHaveTextContent(`/w/${team!.id}/projects`);
});
```

`src/components/layout/ProjectSwitcher.test.tsx`:

```tsx
import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ProjectSwitcher } from '@/components/layout/ProjectSwitcher';
import { createTestDataLayer } from '@/test/fakes';
import { renderWithProviders } from '@/test/render';

describe('ProjectSwitcher', () => {
  it('shows the current project and switches projects', async () => {
    const dl = createTestDataLayer();
    const db = dl.store.read();
    const personal = db.workspaces[0]!;
    const harbor = db.projects.find((p) => p.code === '003')!;
    const { user } = renderWithProviders(<ProjectSwitcher />, { route: '/home', path: '/home', dataLayer: dl });
    const trigger = await screen.findByRole('button', { name: 'Switch project' });
    await waitFor(() => expect(trigger).toHaveTextContent('Riverside Office Tower'));
    await user.click(trigger);
    await user.click(screen.getByRole('option', { name: /Harbor Logistics Hub/ }));
    await waitFor(() => expect(trigger).toHaveTextContent('Harbor Logistics Hub'));
    expect(localStorage.getItem(`ui.lastProjectId.${personal.id}`)).toBe(harbor.id);
  });

  it('opens the new project dialog from the footer', async () => {
    const { user } = renderWithProviders(<ProjectSwitcher />, { route: '/home', path: '/home' });
    await user.click(await screen.findByRole('button', { name: 'Switch project' }));
    await user.click(screen.getByRole('option', { name: /Create new project/ }));
    expect(screen.getByTestId('dialog')).toHaveTextContent('newProject');
  });
});
```

`src/components/layout/PlanBadge.test.tsx`:

```tsx
import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PlanBadge } from '@/components/layout/PlanBadge';
import { queryKeys } from '@/hooks/query-keys';
import { createTestDataLayer } from '@/test/fakes';
import { renderWithProviders } from '@/test/render';

describe('PlanBadge', () => {
  it('shows the trial countdown and links to billing', async () => {
    renderWithProviders(<PlanBadge />);
    const badge = await screen.findByRole('link', { name: 'Trial: 9 days left. Upgrade now.' });
    expect(badge).toHaveAttribute('href', '/settings/billing');
    expect(badge).toHaveTextContent('9 days left');
  });

  it('says the trial ended after the end date', async () => {
    const dataLayer = createTestDataLayer({ overrides: { getSubscription: async () => ({ plan: 'trial', trialEndsAt: '2020-01-01T00:00:00.000Z' }) } });
    renderWithProviders(<PlanBadge />, { dataLayer });
    expect(await screen.findByRole('link', { name: 'Trial ended. Upgrade now.' })).toHaveTextContent('Trial ended');
  });

  it('renders nothing on paid plans', async () => {
    const dataLayer = createTestDataLayer({ overrides: { getSubscription: async () => ({ plan: 'pro', trialEndsAt: null }) } });
    const { queryClient } = renderWithProviders(<PlanBadge />, { dataLayer });
    await waitFor(() => expect(queryClient.getQueryData(queryKeys.subscription())).toBeDefined());
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});
```

`src/components/layout/UserMenu.test.tsx`:

```tsx
import { screen, waitFor } from '@testing-library/react';
import { expect, it } from 'vitest';
import { UserMenu } from '@/components/layout/UserMenu';
import { brand } from '@/config/brand';
import { renderWithProviders } from '@/test/render';

it('shows the account, toggles the theme and signs out', async () => {
  const { user } = renderWithProviders(<UserMenu />, { route: '/home' });
  await user.click(await screen.findByRole('button', { name: 'Account menu for Deniz Kaya' }));
  expect(screen.getByText('deniz.kaya@example.com')).toBeInTheDocument();
  expect(screen.getByRole('menuitem', { name: /Documentation/ })).toHaveAttribute('href', brand.docsUrl);
  await user.click(screen.getByRole('menuitem', { name: 'Light mode' }));
  expect(document.documentElement).not.toHaveClass('dark');
  await user.click(screen.getByRole('button', { name: 'Account menu for Deniz Kaya' }));
  expect(screen.getByRole('menuitem', { name: 'Dark mode' })).toBeInTheDocument();
  await user.click(screen.getByRole('menuitem', { name: 'Log out' }));
  await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/sign-in'));
});
```

- [ ] **Step 2: Run them to see them fail** — `npx vitest run src/components/layout` → the four new files FAIL.

- [ ] **Step 3: Implement** the four components, mount them in `TopBar`, update `render.tsx`.

- [ ] **Step 4: Run** `npm run check` → all tests pass.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: add workspace and project switchers, plan badge and user menu"
```

---

### Task 13: Routes, placeholder pages & shared states

**Spec:** §4.4, §6.6 (`EmptyState`, `SectionError`, `PlaceholderPage`, `ProjectPlaceholderPage` rows).

**Files:**
- Create: `src/components/common/EmptyState.tsx`, `src/components/common/SectionError.tsx`, `src/components/common/PlaceholderPage.tsx`, `src/components/common/ProjectPlaceholderPage.tsx`, `src/pages/NotFoundPage.tsx`
- Modify: `src/app/router.tsx` (complete §4.4 table; `*` renders `NotFoundPage` inside the shell), `src/test/render.tsx` (add `renderApp`)
- Test: `src/app/router.test.tsx`

**Interfaces:**
- Consumes: `useWorkspaceProjects` (Task 7), `errorMessage` (Task 4), `AppShell` (Task 11).
- Produces:
  ```ts
  export function EmptyState(props: { icon: LucideIcon; title: string; description?: string; action?: ReactNode; size?: 'md' | 'sm' }): ReactElement;
  export function SectionError(props: { error: unknown; onRetry: () => void; className?: string }): ReactElement; // role="alert", button "Retry"
  export function PlaceholderPage(props: { title: string }): ReactElement;
  export function ProjectPlaceholderPage(props: { section: 'Files' | 'Dashboard' | 'Schedule' }): ReactElement;
  export function NotFoundPage(): ReactElement;
  // src/test/render.tsx (added)
  export function renderApp(route: string, options?: { dataLayer?: TestDataLayer }):
    RenderResult & { user: UserEvent; dataLayer: TestDataLayer; router: ReturnType<typeof createMemoryRouter> };
  ```
- Pins:
  - `EmptyState` renders its title as a `<p>` (never a heading) and its icon tile as decorative (`aria-hidden`).
  - `PlaceholderPage`: `<h1>` = `title` (`text-lg`), then `EmptyState` with the `Construction` icon and title "This area is part of a later phase."
  - `ProjectPlaceholderPage`: reads `workspaceId` / `projectId` with `useParams`, looks the project up in `useWorkspaceProjects(workspaceId)`; found → `<h1>` "{project.name} · {section}" plus the code chip and the same `EmptyState`; not found (after loading) → `NotFoundPage` content.
  - `NotFoundPage` copy (new): heading "Page not found", text "The page you're looking for doesn't exist or was moved.", link "Go to Home" → `/home`.
  - `renderApp`: `createMemoryRouter(appRoutes, { initialEntries: [route] })` inside `ThemeProvider` → `DataLayerProvider` → `QueryClientProvider` (test client) → `AuthProvider` → `TooltipProvider`, plus `<Toaster />`.

- [ ] **Step 1: Write the failing test** — `src/app/router.test.tsx`

```tsx
import { act, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createTestDataLayer } from '@/test/fakes';
import { renderApp } from '@/test/render';
import { mockViewport } from '@/test/viewport';

describe('routes', () => {
  it('redirects / to /home', async () => {
    const { router } = renderApp('/');
    await waitFor(() => expect(router.state.location.pathname).toBe('/home'));
  });

  it('sends signed-out visitors to /sign-in', async () => {
    const dataLayer = createTestDataLayer();
    await dataLayer.auth.signOut();
    const { router } = renderApp('/home', { dataLayer });
    await waitFor(() => expect(router.state.location.pathname).toBe('/sign-in'));
  });

  it('renders placeholder pages inside the shell', async () => {
    mockViewport(1440);
    renderApp('/library');
    expect(await screen.findByRole('heading', { level: 1, name: 'Library' })).toBeInTheDocument();
    expect(screen.getByText('This area is part of a later phase.')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Primary' })).toBeInTheDocument();
  });

  it('names the project on project pages', async () => {
    const dataLayer = createTestDataLayer();
    const db = dataLayer.store.read();
    const personal = db.workspaces[0]!;
    const riverside = db.projects.find((p) => p.code === '001')!;
    renderApp(`/w/${personal.id}/p/${riverside.id}/files`, { dataLayer });
    const heading = await screen.findByRole('heading', { level: 1, name: 'Riverside Office Tower · Files' });
    expect(within(screen.getByRole('main')).getByText('001')).toBeInTheDocument();
    expect(heading).toBeInTheDocument();
  });

  it('shows Not found for unknown routes and unknown projects', async () => {
    const { router } = renderApp('/nope');
    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to Home' })).toHaveAttribute('href', '/home');
    await act(() => router.navigate('/w/unknown/p/unknown/files'));
    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it to see it fail** — `npx vitest run src/app/router.test.tsx` → FAIL.

- [ ] **Step 3: Implement** the components, complete `appRoutes`, add `renderApp`.

- [ ] **Step 4: Run** `npm run check` → all tests pass. (Optional owner check: in `npm run dev`, every sidebar link opens its placeholder.)

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: complete the route table with placeholder and not-found pages"
```

---

### Task 14: Schedule dialogs

**Spec:** §5.7 (New schedule and Import schedule rows), §6.7 (New schedule dialog, Import schedule dialog, dialog table), §6.10 (file size, no-project row). Review Focus 3 and 5.

**Files:**
- Create: `src/features/schedules/schedule-schema.ts`, `src/features/schedules/ProjectCombobox.tsx`, `src/features/schedules/NewScheduleDialog.tsx`, `src/features/schedules/ImportScheduleDialog.tsx`
- Modify: `src/features/dialogs/DialogHost.tsx` (register `newSchedule`, `importSchedule`)
- Test: `src/features/schedules/schedule-schema.test.ts`, `src/features/schedules/NewScheduleDialog.test.tsx`, `src/features/schedules/ImportScheduleDialog.test.tsx`

**Interfaces:**
- Consumes: `FormDialog`, `FileDropzone`, `useDialogs` (Task 10), `useCurrentContext` (Task 9), `useCreateSchedule`, `useImportSchedule` (Task 7), `errorMessage` (Task 4).
- Produces:
  ```ts
  export const SCHEDULE_EXTENSIONS: readonly ['.xer', '.xml', '.csv'];
  export const MAX_SCHEDULE_BYTES: number; // 20 * 1024 * 1024
  export const newScheduleSchema;   // z.object({ name, projectId })
  export const importScheduleSchema; // z.object({ file, name, projectId })
  export type NewScheduleValues = z.infer<typeof newScheduleSchema>;
  export type ImportScheduleValues = z.infer<typeof importScheduleSchema>;
  export function scheduleNameFromFile(fileName: string): string; // drops the last extension
  export function ProjectCombobox(props: { id: string; value: ID | null; onChange(id: ID): void; invalid?: boolean; describedBy?: string }): ReactElement;
  export function NewScheduleDialog(props: { projectId?: ID }): ReactElement;
  export function ImportScheduleDialog(props: { projectId?: ID }): ReactElement;
  ```
- Pins:
  - Names: trimmed; empty → "Enter a schedule name"; over 80 → "Use 80 characters or fewer". Project empty → "Choose a project". File: missing → "Choose a file to import"; extension checked case-insensitively → "Use a .xer, .xml or .csv file"; over `MAX_SCHEDULE_BYTES` → "File must be 20 MB or smaller".
  - Labels: "Name", "Project", "Schedule file". The combobox trigger is labelled "Project" and shows code chip + name; options show code and name and come from the current workspace (spec D11). "Create a new project" on a changed form asks "Discard changes?" first (spec D11).
  - New schedule: width `md`; default name "New schedule", focused and selected on open with `setFocus('name', { shouldSelect: true })` (Task 10 pins — no `autoFocus`); submit "Create schedule" / "Creating…"; success → `toast.success('Schedule created')`, close, navigate `/w/:workspaceId/p/:projectId/schedule?scheduleId=:id`.
  - Import: width `lg`; dropzone copy from §6.7; choosing a file fills an empty Name with `scheduleNameFromFile`; submit "Import" / "Importing…"; success → `toast.success('Schedule imported')`, close, navigate to the new schedule page.
  - Both: project default = `options.projectId` → current project → first project; failure → `toast.error(errorMessage(error))`, dialog stays open with its values; a ref guard makes repeated submits while pending a no-op; with no projects, the form is replaced by "Create a project first." and a primary "Create project" → `openDialog('newProject')`.

- [ ] **Step 1: Write the failing tests**

`src/features/schedules/schedule-schema.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { ZodType } from 'zod';
import { importScheduleSchema, MAX_SCHEDULE_BYTES, newScheduleSchema, scheduleNameFromFile } from '@/features/schedules/schedule-schema';

const issues = (schema: ZodType, value: unknown) => {
  const result = schema.safeParse(value);
  return result.success ? [] : result.error.issues.map((issue) => issue.message);
};

describe('schedule schemas', () => {
  it('validates names and project', () => {
    expect(issues(newScheduleSchema, { name: '   ', projectId: 'p' })).toEqual(['Enter a schedule name']);
    expect(issues(newScheduleSchema, { name: 'x'.repeat(81), projectId: 'p' })).toEqual(['Use 80 characters or fewer']);
    expect(issues(newScheduleSchema, { name: 'Baseline', projectId: '' })).toEqual(['Choose a project']);
  });

  it('validates import files case-insensitively and by size', () => {
    const base = { name: 'Baseline', projectId: 'p' };
    expect(issues(importScheduleSchema, { ...base, file: null })).toEqual(['Choose a file to import']);
    expect(issues(importScheduleSchema, { ...base, file: new File(['x'], 'plan.pdf') })).toEqual(['Use a .xer, .xml or .csv file']);
    expect(issues(importScheduleSchema, { ...base, file: new File(['x'], 'BASELINE.XER') })).toEqual([]);
    const big = new File(['x'], 'big.xer');
    Object.defineProperty(big, 'size', { value: MAX_SCHEDULE_BYTES + 1 });
    expect(issues(importScheduleSchema, { ...base, file: big })).toEqual(['File must be 20 MB or smaller']);
  });

  it('derives a schedule name from the file name', () => {
    expect(scheduleNameFromFile('Baseline.v2.XER')).toBe('Baseline.v2');
  });
});
```

`src/features/schedules/NewScheduleDialog.test.tsx`:

```tsx
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RepositoryError } from '@/data/errors';
import { createTestDataLayer } from '@/test/fakes';
import { OpenDialog, renderWithProviders } from '@/test/render';

async function open(dataLayer = createTestDataLayer()) {
  const utils = renderWithProviders(<OpenDialog kind="newSchedule" />, { route: '/home', path: '/home', dataLayer });
  await waitFor(() => expect(screen.getByLabelText('Project')).toHaveTextContent('Riverside Office Tower'));
  return utils;
}

describe('NewScheduleDialog', () => {
  it('creates a schedule for the current project and opens it', async () => {
    const dataLayer = createTestDataLayer();
    const db = dataLayer.store.read();
    const personal = db.workspaces[0]!;
    const riverside = db.projects.find((p) => p.code === '001')!;
    const { user } = await open(dataLayer);
    const name = screen.getByLabelText('Name');
    expect(name).toHaveValue('New schedule');
    await user.clear(name);
    await user.type(name, 'Look-ahead W43');
    await user.click(screen.getByRole('button', { name: 'Create schedule' }));
    expect(await screen.findByText('Schedule created')).toBeInTheDocument();
    const created = dataLayer.store.read().schedules.find((s) => s.name === 'Look-ahead W43')!;
    expect(screen.getByTestId('location')).toHaveTextContent(`/w/${personal.id}/p/${riverside.id}/schedule?scheduleId=${created.id}`);
    expect(screen.queryByRole('dialog', { name: 'New schedule' })).not.toBeInTheDocument();
  });

  it('submits once when the button is clicked twice', async () => {
    const dataLayer = createTestDataLayer();
    await open(dataLayer);
    const button = screen.getByRole('button', { name: 'Create schedule' });
    fireEvent.click(button);
    fireEvent.click(button);
    await screen.findByText('Schedule created');
    expect(dataLayer.store.read().schedules.filter((s) => s.name === 'New schedule')).toHaveLength(1);
  });

  it('keeps the form open with its values when saving fails', async () => {
    const dataLayer = createTestDataLayer({ overrides: { createSchedule: () => Promise.reject(new RepositoryError('network', 'offline')) } });
    const { user } = await open(dataLayer);
    await user.click(screen.getByRole('button', { name: 'Create schedule' }));
    expect(await screen.findByText("Can't reach the server. Check your connection and try again.")).toBeInTheDocument();
    expect(screen.getByLabelText('Name')).toHaveValue('New schedule');
  });

  it('asks for a project first in an empty workspace', async () => {
    const { user } = renderWithProviders(<OpenDialog kind="newSchedule" />, {
      route: '/home', path: '/home', dataLayer: createTestDataLayer({ scenario: 'empty' }),
    });
    expect(await screen.findByText('Create a project first.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Create project' }));
    expect(screen.getByTestId('dialog')).toHaveTextContent('newProject');
  });
});
```

`src/features/schedules/ImportScheduleDialog.test.tsx`:

```tsx
import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createTestDataLayer } from '@/test/fakes';
import { OpenDialog, renderWithProviders } from '@/test/render';

describe('ImportScheduleDialog', () => {
  it('imports a schedule file with a mixed-case extension', async () => {
    const dataLayer = createTestDataLayer();
    const { user } = renderWithProviders(<OpenDialog kind="importSchedule" />, { route: '/home', path: '/home', dataLayer });
    await user.upload(await screen.findByLabelText('Schedule file', { selector: 'input' }), new File(['x'], 'Rev7.XER'));
    expect(screen.getByLabelText('Name')).toHaveValue('Rev7');
    await waitFor(() => expect(screen.getByLabelText('Project')).toHaveTextContent('Riverside Office Tower'));
    await user.click(screen.getByRole('button', { name: 'Import' }));
    expect(await screen.findByText('Schedule imported')).toBeInTheDocument();
    expect(dataLayer.store.read().schedules.find((s) => s.name === 'Rev7')).toMatchObject({ source: 'import', sourceFileName: 'Rev7.XER' });
  });

  it('rejects unsupported files', async () => {
    const { user } = renderWithProviders(<OpenDialog kind="importSchedule" />, { route: '/home', path: '/home' });
    await user.upload(await screen.findByLabelText('Schedule file', { selector: 'input' }), new File(['x'], 'plan.pdf'));
    await user.click(screen.getByRole('button', { name: 'Import' }));
    expect(await screen.findByText('Use a .xer, .xml or .csv file')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run them to see them fail** — `npx vitest run src/features/schedules` → FAIL.

- [ ] **Step 3: Implement** the files in Interfaces and register both dialogs in `DialogHost`.

- [ ] **Step 4: Run** `npm run check` → all tests pass.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: add new schedule and import schedule dialogs"
```

---

### Task 15: New project wizard

**Spec:** §5.7 (New project rows), §6.7 (New project wizard, dialog table), §4.5 (`setProject`). Review Focus 3 and 5.

**Files:**
- Create: `src/features/projects/project-schema.ts`, `src/features/projects/WizardStepper.tsx`, `src/features/projects/steps/DetailsStep.tsx`, `src/features/projects/steps/AttributesStep.tsx`, `src/features/projects/steps/ClientStep.tsx`, `src/features/projects/steps/LocationStep.tsx`, `src/features/projects/NewProjectWizard.tsx`, `src/hooks/useDebouncedValue.ts`
- Modify: `src/features/dialogs/DialogHost.tsx` (register `newProject`)
- Test: `src/features/projects/project-schema.test.ts`, `src/features/projects/NewProjectWizard.test.tsx`

**Interfaces:**
- Consumes: `FormDialog`, `FileDropzone` (Task 10), `useCreateProject`, `useProjectCodeAvailable` (Task 7), `useCurrentContext` (Task 9), `errorMessage` (Task 4), `RepositoryError`.
- Produces:
  ```ts
  export const WIZARD_STEPS: readonly [
    { id: 'details'; label: 'Details' }, { id: 'attributes'; label: 'Attributes' },
    { id: 'client'; label: 'Client' }, { id: 'location'; label: 'Location' },
  ];
  export type WizardStepId = (typeof WIZARD_STEPS)[number]['id'];
  export interface ProjectFormValues {
    name: string; code: string; coverImage: File | null; description: string;
    projectType: ProjectType | ''; statusDate: string; startDate: string; plannedFinishDate: string;
    clientName: string; contactName: string; contactEmail: string;
    address: string; city: string; country: string;
  }
  export const EMPTY_PROJECT_FORM: ProjectFormValues;
  export const STEP_FIELDS: Record<WizardStepId, Array<keyof ProjectFormValues>>;
  export const projectFormSchema; // one z.object for all fields + superRefine for the date order
  export function toNewProjectInput(values: ProjectFormValues, workspaceId: ID): NewProjectInput; // trims; '' → null
  export function useDebouncedValue<T>(value: T, delayMs: number): T;
  export function WizardStepper(props: { current: number; completed: number; onSelect(index: number): void }): ReactElement;
  export function NewProjectWizard(): ReactElement;
  ```
- Pins:
  - Messages from §5.7, plus "Use 16 characters or fewer" for codes over 16 and "Enter a valid date" for a date that isn't `YYYY-MM-DD` (spec D12). The code regex is `/^[A-Za-z0-9_-]*$/` combined with `min(1)`, so an empty code reports only "Enter a project ID". Email uses a refine with `/^[^\s@]+@[^\s@]+\.[^\s@]+$/` that accepts `''`. The date-order issue is reported on `plannedFinishDate`.
  - Labels: "Project name", "Project ID", "Project photo", "Description (optional)", "Project type" (options None, Building, Infrastructure, Industrial, Residential, Other; spec D13), "Status date", "Start date", "Planned finish date", "Client name", "Contact person", "Contact email", "Address", "City", "Country".
  - Width `xl`; title "New project"; visually hidden live region "Step {n} of 4: {label}"; footer via `FormDialog.footer`: left "Cancel", right "Back" (from step 2) and "Next" or "Create project" ("Creating…" while pending). "Next" validates only `STEP_FIELDS[current]` with `trigger()`.
  - Project ID availability: `useProjectCodeAvailable(workspace.id, useDebouncedValue(code, 300))`; taken → field error "This ID is already used in this workspace" and "Next" disabled (on step 4 "Create project" stays enabled and a submit with a known-taken ID returns to step 1 without a request; spec D12); the check failing → hint "Couldn't check this ID right now", "Next" stays enabled.
  - Submit: `useCreateProject` with `toNewProjectInput`; success → `toast.success('Project created')`, close, `setProject(project.id)`; `RepositoryError` with code `conflict` → go to step 1 and set the Project ID error; other errors → `toast.error(errorMessage(error))`. A ref guard ignores repeated submits while pending.

- [ ] **Step 1: Write the failing tests**

`src/features/projects/project-schema.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { EMPTY_PROJECT_FORM, projectFormSchema, toNewProjectInput, type ProjectFormValues } from '@/features/projects/project-schema';

const valid: ProjectFormValues = { ...EMPTY_PROJECT_FORM, name: 'Pier 9', code: '007' };
const issues = (values: ProjectFormValues) => {
  const result = projectFormSchema.safeParse(values);
  return result.success ? [] : result.error.issues.map((issue) => issue.message);
};

describe('project form schema', () => {
  it('requires a non-blank name and a well-formed ID', () => {
    expect(issues(valid)).toEqual([]);
    expect(issues({ ...valid, name: '   ' })).toEqual(['Enter a project name']);
    expect(issues({ ...valid, code: '' })).toEqual(['Enter a project ID']);
    expect(issues({ ...valid, code: 'a b' })).toEqual(['Use letters, numbers, - or _']);
    expect(issues({ ...valid, code: 'x'.repeat(17) })).toEqual(['Use 16 characters or fewer']);
  });

  it('limits the description and the photo', () => {
    expect(issues({ ...valid, description: 'x'.repeat(501) })).toEqual(['Use 500 characters or fewer']);
    expect(issues({ ...valid, coverImage: new File(['x'], 'a.gif', { type: 'image/gif' }) })).toEqual(['Use a JPG or PNG image']);
    const big = new File(['x'], 'a.png', { type: 'image/png' });
    Object.defineProperty(big, 'size', { value: 5 * 1024 * 1024 + 1 });
    expect(issues({ ...valid, coverImage: big })).toEqual(['Image must be 5 MB or smaller']);
  });

  it('checks date order and email', () => {
    expect(issues({ ...valid, startDate: '2026-11-01', plannedFinishDate: '2026-10-01' })).toEqual(['Finish must be on or after the start date']);
    expect(issues({ ...valid, contactEmail: 'nope' })).toEqual(['Enter a valid email address']);
  });

  it('maps form values to NewProjectInput with trimmed strings and nulls', () => {
    expect(toNewProjectInput({ ...valid, name: '  Pier 9  ', city: '  ', clientName: 'Port Authority' }, 'w1')).toEqual({
      workspaceId: 'w1', code: '007', name: 'Pier 9', description: null, coverImage: null, statusDate: null,
      attributes: { projectType: null, startDate: null, plannedFinishDate: null },
      client: { name: 'Port Authority', contactName: null, contactEmail: null },
      location: { address: null, city: null, country: null },
    });
  });
});
```

`src/features/projects/NewProjectWizard.test.tsx`:

```tsx
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RepositoryError } from '@/data/errors';
import { createTestDataLayer } from '@/test/fakes';
import { OpenDialog, renderWithProviders } from '@/test/render';

async function openWizard(dataLayer = createTestDataLayer()) {
  const utils = renderWithProviders(<OpenDialog kind="newProject" />, { route: '/home', path: '/home', dataLayer });
  await screen.findByRole('dialog', { name: 'New project' });
  return utils;
}

async function fillDetailsAndGoToLastStep(user: Awaited<ReturnType<typeof openWizard>>['user'], code = '007') {
  await user.type(screen.getByLabelText('Project name'), '  Pier 9  ');
  await user.type(screen.getByLabelText('Project ID'), code);
  for (const step of ['Attributes', 'Client', 'Location']) {
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByText(new RegExp(`Step \\d of 4: ${step}`))).toBeInTheDocument();
  }
}

describe('NewProjectWizard', () => {
  it('validates step 1 before moving on', async () => {
    const { user } = await openWizard();
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByText('Enter a project name')).toBeInTheDocument();
    expect(screen.getByText('Enter a project ID')).toBeInTheDocument();
    expect(screen.getByText('Step 1 of 4: Details')).toBeInTheDocument();
  });

  it('flags an ID that is already used', async () => {
    const { user } = await openWizard();
    await user.type(screen.getByLabelText('Project ID'), '001');
    expect(await screen.findByText('This ID is already used in this workspace')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
  });

  it('keeps values when going back and creates the project', async () => {
    const dataLayer = createTestDataLayer();
    const personal = dataLayer.store.read().workspaces[0]!;
    const { user } = await openWizard(dataLayer);
    await user.type(screen.getByLabelText('Project name'), '  Pier 9  ');
    await user.type(screen.getByLabelText('Project ID'), '007');
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByText('Step 2 of 4: Attributes')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByLabelText('Project name')).toHaveValue('  Pier 9  ');
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(await screen.findByRole('button', { name: 'Next' }));
    await user.type(await screen.findByLabelText('Client name'), 'Port Authority');
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(await screen.findByRole('button', { name: 'Create project' }));
    expect(await screen.findByText('Project created')).toBeInTheDocument();
    const created = dataLayer.store.read().projects.find((p) => p.code === '007')!;
    expect(created).toMatchObject({ name: 'Pier 9', client: { name: 'Port Authority', contactName: null, contactEmail: null } });
    expect(localStorage.getItem(`ui.lastProjectId.${personal.id}`)).toBe(created.id);
  });

  it('creates a single project on a double click', async () => {
    const dataLayer = createTestDataLayer();
    const { user } = await openWizard(dataLayer);
    await fillDetailsAndGoToLastStep(user);
    const create = screen.getByRole('button', { name: 'Create project' });
    fireEvent.click(create);
    fireEvent.click(create);
    await screen.findByText('Project created');
    expect(dataLayer.store.read().projects.filter((p) => p.code === '007')).toHaveLength(1);
  });

  it('returns to step 1 when the ID is taken at submit time', async () => {
    const dataLayer = createTestDataLayer({
      overrides: {
        isProjectCodeAvailable: async () => true,
        createProject: () => Promise.reject(new RepositoryError('conflict', 'This ID is already used in this workspace')),
      },
    });
    const { user } = await openWizard(dataLayer);
    await fillDetailsAndGoToLastStep(user, '001');
    await user.click(screen.getByRole('button', { name: 'Create project' }));
    expect(await screen.findByText('Step 1 of 4: Details')).toBeInTheDocument();
    expect(screen.getByText('This ID is already used in this workspace')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run them to see them fail** — `npx vitest run src/features/projects` → FAIL.

- [ ] **Step 3: Implement** the files in Interfaces and register the wizard in `DialogHost`.

- [ ] **Step 4: Run** `npm run check` → all tests pass.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: add the four-step new project wizard"
```

---

### Task 16: Home — welcome banner & recent projects

**Spec:** §6.6 (WelcomeBanner, RecentProjects, ProjectCard, CreateProjectCard), §6.8, §6.10 (cover, long text, user failure row), §6.11. Review Focus 2.

**Files:**
- Create: `src/features/home/WelcomeBanner.tsx`, `src/features/home/RecentProjects.tsx`, `src/features/home/ProjectCard.tsx`, `src/features/home/CreateProjectCard.tsx`
- Modify: `src/pages/HomePage.tsx` (`<div className="flex flex-col gap-6">` with `WelcomeBanner` and `RecentProjects`)
- Test: `src/features/home/WelcomeBanner.test.tsx`, `src/features/home/ProjectCard.test.tsx`, `src/features/home/RecentProjects.test.tsx`

**Interfaces:**
- Consumes: `useCurrentUser`, `useRecentProjects`, `useNow` (Task 7), `useCurrentContext` (Task 9), `useDialogs` (Task 10), `SectionError` (Task 13), `greetingDate`, `shortDate`, `relativeTime`, `pluralize` (Task 4), `coverFor` (Task 4).
- Produces: `WelcomeBanner()`, `RecentProjects()`, `ProjectCard(props: { project: ProjectSummary })`, `ProjectCardSkeleton()` (`data-testid="project-card-skeleton"`, a plain `<div>` — never an `<article>`, so tests that count cards don't count skeletons), `CreateProjectCard()`.
- Pins:
  - Heading ids `welcome-heading` and `recent-heading`; sections use `aria-labelledby`.
  - Banner: `banner-surface` + a decorative `blueprint-grid` layer; greeting "Hello, {firstName}" or "Hello" when the user query failed; date line from `greetingDate(useNow())`; buttons and their dialog calls from §6.6.
  - `ProjectCard`: `<article>`; the project name is a `<Link>` (class `truncate`, `title` = full name) to `/w/:workspaceId/p/:projectId/files`, stretched over the card with `after:absolute after:inset-0`; the schedules link (`/w/:workspaceId/p/:projectId/schedule`, text `pluralize(scheduleCount, 'schedule')`) sits above it with `relative z-10`; the status line is one text node `Status date ${shortDate(statusDate)}`; the cover element has `data-testid="project-cover"` and `data-cover="photo"` (with `<img alt="">`) or `data-cover="generated"` (with `style={coverFor(project.id)}`).
  - `RecentProjects`: grid `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5`; loading (context or query pending) → 3 skeletons; error (context or query) → `SectionError` spanning the grid whose Retry calls `refetch()` or `retry()`; then up to 5 cards and `CreateProjectCard`.

- [ ] **Step 1: Write the failing tests**

`src/features/home/WelcomeBanner.test.tsx`:

```tsx
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { WelcomeBanner } from '@/features/home/WelcomeBanner';
import { greetingDate } from '@/lib/format';
import { createTestDataLayer } from '@/test/fakes';
import { renderWithProviders } from '@/test/render';

describe('WelcomeBanner', () => {
  it("greets the user with today's date and opens the creation dialogs", async () => {
    const { user } = renderWithProviders(<WelcomeBanner />, { route: '/home', path: '/home' });
    expect(await screen.findByRole('heading', { level: 1, name: 'Hello, Deniz' })).toBeInTheDocument();
    expect(screen.getByText(greetingDate(new Date()))).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'New schedule' }));
    expect(await screen.findByRole('dialog', { name: 'New schedule' })).toBeInTheDocument();
  });

  it('opens the project wizard', async () => {
    const { user } = renderWithProviders(<WelcomeBanner />, { route: '/home', path: '/home' });
    await user.click(await screen.findByRole('button', { name: 'New project' }));
    expect(await screen.findByRole('dialog', { name: 'New project' })).toBeInTheDocument();
  });

  it('says "Hello" when the user cannot be loaded', async () => {
    renderWithProviders(<WelcomeBanner />, { dataLayer: createTestDataLayer({ failRate: 1 }) });
    expect(await screen.findByRole('heading', { level: 1, name: 'Hello' })).toBeInTheDocument();
  });
});
```

`src/features/home/ProjectCard.test.tsx`:

```tsx
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ProjectSummary } from '@/data/types';
import { ProjectCard } from '@/features/home/ProjectCard';
import { shortDate } from '@/lib/format';
import { createTestDataLayer } from '@/test/fakes';
import { renderWithProviders } from '@/test/render';

function summary(code: string, patch: Partial<ProjectSummary> = {}): ProjectSummary {
  const db = createTestDataLayer().store.read();
  const project = db.projects.find((p) => p.code === code)!;
  return { ...project, scheduleCount: db.schedules.filter((s) => s.projectId === project.id).length, ...patch };
}

describe('ProjectCard', () => {
  it('links the card and the schedule count', () => {
    const project = summary('001');
    renderWithProviders(<ProjectCard project={project} />);
    expect(screen.getByRole('link', { name: 'Riverside Office Tower' })).toHaveAttribute('href', `/w/${project.workspaceId}/p/${project.id}/files`);
    expect(screen.getByRole('link', { name: /1 schedule/ })).toHaveAttribute('href', `/w/${project.workspaceId}/p/${project.id}/schedule`);
    expect(screen.getByText(`Status date ${shortDate(project.statusDate)}`)).toBeInTheDocument();
    expect(screen.getByText('001')).toBeInTheDocument();
  });

  it('shows a dash without a status date and a generated cover without a photo', () => {
    renderWithProviders(<ProjectCard project={summary('002')} />);
    expect(screen.getByText('Status date —')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /0 schedules/ })).toBeInTheDocument();
    expect(screen.getByTestId('project-cover')).toHaveAttribute('data-cover', 'generated');
  });

  it('truncates long names and keeps the full name in the title', () => {
    const long = 'Tunnel'.repeat(25);
    renderWithProviders(<ProjectCard project={summary('001', { name: long })} />);
    const link = screen.getByRole('link', { name: long });
    expect(link).toHaveClass('truncate');
    expect(link).toHaveAttribute('title', long);
  });
});
```

`src/features/home/RecentProjects.test.tsx`:

```tsx
import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { RepositoryError } from '@/data/errors';
import { RecentProjects } from '@/features/home/RecentProjects';
import { createTestDataLayer } from '@/test/fakes';
import { renderWithProviders } from '@/test/render';

describe('RecentProjects', () => {
  it('shows the five most recent projects and the create card', async () => {
    renderWithProviders(<RecentProjects />, { route: '/home', path: '/home' });
    const region = await screen.findByRole('region', { name: 'Recent projects' });
    await waitFor(() => expect(within(region).getAllByRole('article')).toHaveLength(5));
    expect(within(region).getByRole('button', { name: 'Create new project' })).toBeInTheDocument();
  });

  it('shows three skeletons while loading', async () => {
    const dataLayer = createTestDataLayer({ overrides: { listRecentProjects: () => new Promise(() => {}) } });
    renderWithProviders(<RecentProjects />, { dataLayer });
    expect(await screen.findAllByTestId('project-card-skeleton')).toHaveLength(3);
  });

  it('shows an error that can be retried', async () => {
    const dataLayer = createTestDataLayer();
    vi.spyOn(dataLayer.repository, 'listRecentProjects').mockRejectedValueOnce(new RepositoryError('network', 'offline'));
    const { user } = renderWithProviders(<RecentProjects />, { dataLayer });
    expect(await screen.findByRole('alert')).toHaveTextContent("Can't reach the server. Check your connection and try again.");
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(5));
  });

  it('shows only the create card without projects and opens the wizard from it', async () => {
    const { user } = renderWithProviders(<RecentProjects />, { dataLayer: createTestDataLayer({ scenario: 'empty' }) });
    const create = await screen.findByRole('button', { name: 'Create new project' });
    expect(screen.queryAllByRole('article')).toHaveLength(0);
    await user.click(create);
    expect(await screen.findByRole('dialog', { name: 'New project' })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run them to see them fail** — `npx vitest run src/features/home` → FAIL.

- [ ] **Step 3: Implement** the components and update `HomePage`.

- [ ] **Step 4: Run** `npm run check` → all tests pass. (Optional owner check: in `npm run dev` at 1440 px the banner and 3-column grid match §6.3 / §6.6, and hover shows the stronger ring and cover zoom.)

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: add welcome banner and recent projects to Home"
```

---

### Task 17: Home — shared schedules & workspaces

**Spec:** §6.6 (SharedSchedulesTable, WorkspacesPanel), §6.9 (column hiding), §6.10. Review Focus 2.

**Files:**
- Create: `src/features/home/SharedSchedulesTable.tsx`, `src/features/home/WorkspacesPanel.tsx`
- Modify: `src/pages/HomePage.tsx` (append both, in that order)
- Test: `src/features/home/SharedSchedulesTable.test.tsx`, `src/features/home/WorkspacesPanel.test.tsx`

**Interfaces:**
- Consumes: `useSharedWithMe`, `useNow` (Task 7), `useCurrentContext` (Task 9), `useDialogs` (Task 10), `EmptyState`, `SectionError` (Task 13), `shortDate`, `relativeTime`, `pluralize`, `fullName`, `initials` (Task 4).
- Produces: `SharedSchedulesTable()` (skeleton rows `data-testid="shared-row-skeleton"`), `WorkspacesPanel()` (skeleton rows `data-testid="workspace-row-skeleton"`).
- Pins:
  - Heading ids `shared-heading` and `workspaces-heading`.
  - Table: real `<table>` with `table-layout: fixed`; header cells hold the text "Schedule", "Shared by", "Shared", "Status date" (uppercase via CSS); "Shared by" hidden below 768 px and "Status date" below 640 px with responsive `hidden … :table-cell` utilities; the schedule-name link carries `truncate` and `title` (the schedule name, the project name and "Shared by {full name}" on separate lines; spec D14); the empty state sits in one full-width row.
  - Workspace rows are `<button>`s; the current one has `aria-current="true"`; the team empty block and the "New team workspace" link-button follow §6.6.

- [ ] **Step 1: Write the failing tests**

`src/features/home/SharedSchedulesTable.test.tsx`:

```tsx
import { screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SharedSchedulesTable } from '@/features/home/SharedSchedulesTable';
import { createTestDataLayer } from '@/test/fakes';
import { renderWithProviders } from '@/test/render';

describe('SharedSchedulesTable', () => {
  it('lists shared schedules newest first with links', async () => {
    const dataLayer = createTestDataLayer();
    const db = dataLayer.store.read();
    const team = db.workspaces[1]!;
    const tunnel = db.projects.find((p) => p.code === 'T-01')!;
    const baseline = db.schedules.find((s) => s.name === 'Baseline rev. 3')!;
    renderWithProviders(<SharedSchedulesTable />, { dataLayer });
    await screen.findByText('Baseline rev. 3'); // wait past the skeleton rows
    const table = screen.getByRole('table');
    expect(within(table).getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['Schedule', 'Shared by', 'Shared', 'Status date']);
    const rows = within(table).getAllByRole('row');
    expect(rows).toHaveLength(3);
    for (const text of ['Baseline rev. 3', 'Tunnel Ventilation Upgrade', 'Mert Demir', '1 day ago']) {
      expect(rows[1]).toHaveTextContent(text);
    }
    expect(within(rows[1]!).getByRole('link', { name: 'Baseline rev. 3' }))
      .toHaveAttribute('href', `/w/${team.id}/p/${tunnel.id}/schedule?scheduleId=${baseline.id}`);
  });

  it('explains the empty state', async () => {
    renderWithProviders(<SharedSchedulesTable />, { dataLayer: createTestDataLayer({ scenario: 'empty' }) });
    expect(await screen.findByText('Nothing shared yet')).toBeInTheDocument();
    expect(screen.getByText('Schedules that others share with you will appear here.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'How sharing works' })).toHaveAttribute('href', '/help/sharing');
  });

  it('truncates long schedule names', async () => {
    const dataLayer = createTestDataLayer();
    const [row] = await dataLayer.repository.listSharedWithMe();
    const long = 'Lookahead'.repeat(15);
    vi.spyOn(dataLayer.repository, 'listSharedWithMe').mockResolvedValue([{ ...row!, scheduleName: long }]);
    renderWithProviders(<SharedSchedulesTable />, { dataLayer });
    const link = await screen.findByRole('link', { name: long });
    expect(link).toHaveClass('truncate');
    expect(link).toHaveAttribute('title', `${long}\n${row!.projectName}\nShared by ${row!.sharedBy.firstName} ${row!.sharedBy.lastName}`); // spec D14
  });
});
```

`src/features/home/WorkspacesPanel.test.tsx`:

```tsx
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { WorkspacesPanel } from '@/features/home/WorkspacesPanel';
import { createTestDataLayer } from '@/test/fakes';
import { renderWithProviders } from '@/test/render';

describe('WorkspacesPanel', () => {
  it('lists workspaces with counts and marks the current one', async () => {
    const dataLayer = createTestDataLayer();
    const team = dataLayer.store.read().workspaces[1]!;
    const { user } = renderWithProviders(<WorkspacesPanel />, { route: '/home', path: '/home', dataLayer });
    const mine = await screen.findByRole('button', { name: /My workspace/ });
    expect(mine).toHaveTextContent('6 projects');
    expect(mine).toHaveAttribute('aria-current', 'true');
    const ops = screen.getByRole('button', { name: /Site Operations/ });
    expect(ops).toHaveTextContent('1 project');
    await user.click(ops);
    expect(screen.getByTestId('location')).toHaveTextContent(`/w/${team.id}/projects`);
  });

  it('invites creating a team workspace when there is none', async () => {
    const { user } = renderWithProviders(<WorkspacesPanel />, { dataLayer: createTestDataLayer({ scenario: 'empty' }) });
    expect(await screen.findByText('No team workspaces yet')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'New team workspace' }));
    expect(await screen.findByRole('dialog', { name: 'New team workspace' })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run them to see them fail** — `npx vitest run src/features/home` → the two new files FAIL.

- [ ] **Step 3: Implement** both components and append them to `HomePage`.

- [ ] **Step 4: Run** `npm run check` → all tests pass.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: add shared schedules table and workspaces panel to Home"
```

---

### Task 18: Home — to-do panel & page composition

**Spec:** §6.6 (TodoPanel), §6.10 (due dates), §2.2 S1.

**Files:**
- Create: `src/features/home/TodoPanel.tsx`
- Modify: `src/pages/HomePage.tsx` (append `TodoPanel`; final order: banner, recent, shared, workspaces, to-do)
- Test: `src/features/home/TodoPanel.test.tsx`, `src/pages/HomePage.test.tsx`

**Interfaces:**
- Consumes: `usePendingTasks`, `useSetTaskDone`, `useNow` (Task 7), `EmptyState`, `SectionError` (Task 13), `dueLabel` (Task 4), sonner `toast`.
- Produces: `TodoPanel()` (skeleton rows `data-testid="task-row-skeleton"`), final `HomePage()`.
- Pins: heading id `todo-heading`; checkbox aria-label `Mark '{title}' as done`; checking calls `setTaskDone({ taskId, done: true })` and shows `toast('Task completed', { action: { label: 'Undo', onClick: () => setTaskDone({ taskId, done: false }) } })`; overdue labels use `text-destructive`.

- [ ] **Step 1: Write the failing tests**

`src/features/home/TodoPanel.test.tsx`:

```tsx
import { screen, waitFor, within } from '@testing-library/react';
import { addDays, format } from 'date-fns';
import { describe, expect, it } from 'vitest';
import { TodoPanel } from '@/features/home/TodoPanel';
import { dueLabel } from '@/lib/format';
import { createTestDataLayer } from '@/test/fakes';
import { renderWithProviders } from '@/test/render';

describe('TodoPanel', () => {
  it('lists pending tasks with their due labels', async () => {
    renderWithProviders(<TodoPanel />);
    const region = await screen.findByRole('region', { name: 'To do' });
    expect(await within(region).findAllByRole('checkbox')).toHaveLength(3);
    expect(within(region).getByText('Due today')).toBeInTheDocument();
    const inThreeDays = dueLabel(format(addDays(new Date(), 3), 'yyyy-MM-dd'), new Date())!.text;
    expect(within(region).getByText(inThreeDays)).toBeInTheDocument();
  });

  it('completes a task and can undo it', async () => {
    const title = 'Update status date for Riverside Office Tower';
    const { user } = renderWithProviders(<TodoPanel />);
    await user.click(await screen.findByRole('checkbox', { name: `Mark '${title}' as done` }));
    await waitFor(() => expect(screen.queryByText(title)).not.toBeInTheDocument());
    expect(await screen.findByText('Task completed')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(await screen.findByText(title)).toBeInTheDocument();
  });

  it('shows the caught-up state', async () => {
    renderWithProviders(<TodoPanel />, { dataLayer: createTestDataLayer({ scenario: 'empty' }) });
    expect(await screen.findByText("You're all caught up")).toBeInTheDocument();
    expect(screen.getByText('Tasks assigned to you will show up here.')).toBeInTheDocument();
  });
});
```

`src/pages/HomePage.test.tsx`:

```tsx
import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createTestDataLayer } from '@/test/fakes';
import { renderApp } from '@/test/render';
import { mockViewport } from '@/test/viewport';

describe('HomePage', () => {
  it('renders every section in order', async () => {
    mockViewport(1440);
    renderApp('/home');
    expect(await screen.findByRole('heading', { level: 1, name: 'Hello, Deniz' })).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual([
      'Recent projects', 'Shared with me', 'Workspaces', 'To do',
    ]);
  });

  it('shows an error in each data section when reads fail', async () => {
    mockViewport(1440);
    renderApp('/home', { dataLayer: createTestDataLayer({ failRate: 1 }) });
    expect(await screen.findByRole('heading', { level: 1, name: 'Hello' })).toBeInTheDocument();
    await waitFor(() => expect(within(screen.getByRole('main')).getAllByRole('alert')).toHaveLength(4));
  });
});
```

- [ ] **Step 2: Run them to see them fail** — `npx vitest run src/features/home/TodoPanel.test.tsx src/pages/HomePage.test.tsx` → FAIL.

- [ ] **Step 3: Implement** `TodoPanel` and finish `HomePage`.

- [ ] **Step 4: Run** `npm run check` → all tests pass. (The empty and error states are covered by the tests above; the owner re-checks them visually in Task 20.)

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: add to-do panel and complete the Home page"
```

---

### Task 19: End-to-end tests & screenshots

**Spec:** §2.2 (S2, S3, S6), §8 (end-to-end row).

**Files:**
- Create: `playwright.config.ts`, `.env.e2e`, `e2e/home.spec.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: the whole app through its accessible names (no test ids).
- Produces: `npm run test:e2e`; screenshots `test-results/screens/home-{1440,1024,768,375}.png`.

- [ ] **Step 1: Install Playwright and add the script**

```bash
npm install -D @playwright/test
npx playwright install chromium
npm pkg set "scripts.test:e2e=playwright test"
```

- [ ] **Step 2: Configure** — `.env.e2e`: `VITE_DATA_SOURCE=mock`, `VITE_MOCK_SCENARIO=default`, `VITE_MOCK_LATENCY_MS=0`, `VITE_MOCK_FAIL_RATE=0`. `playwright.config.ts`:

```ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { baseURL: 'http://localhost:4173', trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } }],
  webServer: {
    command: 'npm run build -- --mode e2e && npm run preview -- --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
```

- [ ] **Step 3: Write the tests** — `e2e/home.spec.ts`

```ts
import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/home');
  await expect(page.getByRole('heading', { level: 1, name: 'Hello, Deniz' })).toBeVisible();
});

test('Home shows the seeded data', async ({ page }) => {
  const recent = page.getByRole('region', { name: 'Recent projects' });
  await expect(recent.getByRole('article')).toHaveCount(5);
  await expect(recent.getByRole('button', { name: 'Create new project' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Shared with me' }).getByRole('row')).toHaveCount(3);
  await expect(page.getByRole('region', { name: 'Workspaces' }).getByRole('button', { name: /Site Operations/ })).toBeVisible();
  await expect(page.getByRole('region', { name: 'To do' }).getByRole('checkbox')).toHaveCount(3);
});

test('the sidebar state survives a reload', async ({ page }) => {
  await page.getByRole('button', { name: 'Hide sidebar' }).click();
  await expect(page.locator('#app-sidebar')).toHaveAttribute('data-state', 'closed');
  await page.reload();
  await expect(page.getByRole('button', { name: 'Show sidebar' })).toBeVisible();
});

test('switching workspace works with the keyboard only', async ({ page }) => {
  await page.getByRole('button', { name: 'Switch workspace' }).focus();
  await page.keyboard.press('Enter');
  await page.keyboard.type('site');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/w\/[^/]+\/projects$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Projects' })).toBeVisible();
});

test('a schedule can be created from the banner', async ({ page }) => {
  await page.getByRole('button', { name: 'New schedule' }).click();
  await page.getByLabel('Name', { exact: true }).fill('Look-ahead W43');
  await page.getByRole('button', { name: 'Create schedule' }).click();
  await expect(page.getByText('Schedule created')).toBeVisible();
  await expect(page).toHaveURL(/\/schedule\?scheduleId=/);
});

test('a project can be created through the wizard', async ({ page }) => {
  await page.getByRole('button', { name: 'New project', exact: true }).click(); // not the "Create new project" card
  await page.getByLabel('Project name', { exact: true }).fill('Pier 9');
  await page.getByLabel('Project ID', { exact: true }).fill('007');
  for (let step = 0; step < 3; step += 1) await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: 'Create project' }).click();
  await expect(page.getByText('Project created')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Recent projects' }).getByRole('article').first()).toContainText('Pier 9');
});

test('a schedule file can be imported', async ({ page }) => {
  await page.getByRole('button', { name: 'Import schedule', exact: true }).click();
  await page.locator('input[type="file"]').setInputFiles({ name: 'Rev7.XER', mimeType: 'application/octet-stream', buffer: Buffer.from('x') });
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Rev7');
  await page.getByRole('button', { name: 'Import', exact: true }).click();
  await expect(page.getByText('Schedule imported')).toBeVisible();
  await expect(page).toHaveURL(/\/schedule\?scheduleId=/);
});

test('a team workspace can be created', async ({ page }) => {
  const workspaces = page.getByRole('region', { name: 'Workspaces' });
  await workspaces.getByRole('button', { name: 'New team workspace', exact: true }).click();
  await page.getByLabel('Workspace name', { exact: true }).fill('Field crew');
  await page.getByRole('button', { name: 'Create workspace', exact: true }).click();
  await expect(page.getByText('Workspace created')).toBeVisible();
  await expect(workspaces.getByRole('button', { name: /Field crew/ })).toBeVisible();
});

test('the theme choice survives a reload', async ({ page }) => {
  await page.getByRole('button', { name: 'Account menu for Deniz Kaya' }).click();
  await page.getByRole('menuitem', { name: 'Light mode' }).click();
  await expect(page.locator('html')).not.toHaveClass(/dark/);
  await page.reload();
  await expect(page.locator('html')).not.toHaveClass(/dark/);
});

for (const width of [1440, 1024, 768, 375]) {
  test(`screenshot at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/home');
    await expect(page.getByRole('heading', { level: 1, name: 'Hello, Deniz' })).toBeVisible();
    await page.screenshot({ path: `test-results/screens/home-${width}.png`, fullPage: true });
  });
}
```

- [ ] **Step 4: Run** `npm run test:e2e`
Expected: `12 passed`; four PNGs in `test-results/screens/`.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "test: add end-to-end flows and responsive screenshots"
```

---

### Task 20: Final verification & docs

**Spec:** §2.2 (all success criteria), §6.12, §9 (Phase 2 seams).

**Files:**
- Create: `README.md`, `docs/superpowers/plans/2026-10-14-phase1-verification.md`
- Modify: `CLAUDE.md` (Status section)

- [ ] **Step 1: Run every automated check**

Run: `npm run check && npm run test:e2e && npm run build`
Expected: typecheck, lint, all unit tests and `Contrast OK: 37 checks passed`; `12 passed` end-to-end; build succeeds. Record the test counts.

- [ ] **Step 2: Verification notes** — run item 7 yourself and record its output; write items 1–6 into `docs/superpowers/plans/2026-10-14-phase1-verification.md` as an unchecked owner checklist (each with a pass/fail box and a note line). They need a person at a browser, so don't start a dev server in the foreground for them:
  1. Keyboard only: focus order matches §6.12; every popover, menu and dialog opens, works and closes with the keyboard; focus returns to its trigger.
  2. `.env.local` with `VITE_MOCK_SCENARIO=empty`, then `VITE_MOCK_FAIL_RATE=1`: every empty and error state of §6.6 appears and Retry recovers after removing the fail rate.
  3. Light theme: every screen readable; no hard-coded dark colors.
  4. DevTools → Rendering → `prefers-reduced-motion: reduce`: no zoom or slide animations remain.
  5. 375 px: drawer navigation, stacked banner buttons, two table columns, compact plan badge.
  6. `VITE_DATA_SOURCE=supabase`: the startup screen shows "Supabase data source is not implemented yet (Phase 2). Set VITE_DATA_SOURCE=mock."
  7. `grep -rn "data/mock" src --include=*.ts --include=*.tsx` lists only files under `src/data` and `src/test`.

- [ ] **Step 3: Write `README.md`** — product summary, prerequisites (Node 22 LTS or newer, npm), the npm scripts table (spec §8), environment variables (Global Constraints), the architecture rules (CLAUDE.md), the dev helper `window.__resetMockDb()`, and "Phase 2: Supabase" pointing to spec §9.

- [ ] **Step 4: Update `CLAUDE.md`** — set the Status line to `Phase 1 complete (v0.1.0). Next: write the Phase 2 (Supabase) spec.`

- [ ] **Step 5: Owner review** — ask the owner to review `test-results/screens/*.png` against spec §6 (S6) and the verification notes; fix anything they reject before tagging.

- [ ] **Step 6: Commit and tag**

```bash
git add -A && git commit -m "docs: add README and phase 1 verification notes"
git tag v0.1.0
```
