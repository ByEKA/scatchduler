# Home Screen & App Shell — Design Spec

| | |
|---|---|
| **Date** | 2026-10-14 |
| **Status** | Approved by the owner — 2026-10-14 |
| **Scope** | Phase 1: app shell + Home screen on mock data. Phase 2 (Supabase backend) is designed for, not built. |
| **Readers** | Claude Code (implementer) and the product owner |
| **Language** | All UI copy, code and docs in English |

---

## 1. Summary

We are building our own construction-scheduling product, used first as an internal lab tool. This spec covers the first slice: the signed-in **app shell** (top bar + collapsible sidebar) and the **Home screen**, wired to a data layer that runs on mock data today and on Supabase later without UI changes.

The information architecture and interaction model were derived from an analysis of an existing scheduling product's home screen. The **visual identity is our own** (§7): no third-party logos, illustrations, images or copy are reused.

---

## 2. Goals, success criteria, non-goals

### 2.1 Goals

1. Give users a fast start from Home: create or import a schedule, create a project, jump back into recent projects, see schedules shared with them, switch workspace, see pending tasks.
2. Provide an app shell that every future page reuses.
3. Keep the UI independent of the backend: moving from mock data to Supabase must not change any component.

### 2.2 Success criteria (all must hold)

| # | Criterion | Verified by |
|---|---|---|
| S1 | All five Home sections render through hooks, each with loading, empty, error and populated states | Vitest component tests; manual check with `VITE_MOCK_SCENARIO=empty` and `VITE_MOCK_FAIL_RATE=1` |
| S2 | Top bar, sidebar, switchers, user menu and all dialogs are fully keyboard-operable | Playwright e2e + manual Tab-through |
| S3 | New schedule, Import schedule, New project and New team workspace create records in the mock store, and Home updates without a reload | Playwright e2e |
| S4 | Nothing under `src/components`, `src/features`, `src/pages` or `src/hooks` imports from `src/data/mock` or `src/data/supabase` | ESLint `no-restricted-imports` |
| S5 | `npm run check` (typecheck + lint + unit tests) and `npm run test:e2e` pass | Local run |
| S6 | Layout matches §6 at 1440, 1024, 768 and 375 px widths | Playwright screenshots reviewed by the owner |

### 2.3 Non-goals for Phase 1

- Real authentication or real persistence (the mock store persists to `localStorage` only).
- Parsing schedule files (`.xer`, `.xml`, `.csv`): import stores file metadata only.
- Content for Library, Assets, Projects, Files, Dashboard, Schedule (Gantt) and Settings pages: placeholders only.
- Billing, member management, invitations, notifications, i18n.

---

## 3. Tech stack

| Concern | Choice | Notes |
|---|---|---|
| Build | Vite with the `react-ts` template's settings | set up without the interactive scaffolder (plan Task 1) |
| Language | TypeScript, strict | keep the template's `verbatimModuleSyntax` and `erasableSyntaxOnly`: use `import type`, no `enum`, no constructor parameter properties, no `namespace` |
| UI | React 19 | function components + hooks only |
| Styling | Tailwind CSS v4 via `@tailwindcss/vite` | CSS-first config (`@theme`) in `src/index.css`; no `tailwind.config.js` |
| Components | shadcn/ui (Radix primitives) | generated into `src/components/ui`; never edit their public API, wrap instead |
| Icons | lucide-react | 16 px in UI chrome |
| Routing | React Router ≥ 7, declarative mode (`react-router` package) | `createBrowserRouter` + `RouterProvider` |
| Server state | TanStack Query v5 | every read and write goes through a hook |
| Forms | react-hook-form + zod + `@hookform/resolvers` | one zod schema per form |
| Dates | date-fns | formatting + relative time |
| Toasts | sonner (shadcn `sonner`) | |
| Searchable lists | cmdk (shadcn `command`) | workspace / project switchers |
| Fonts | `@fontsource-variable/inter`, `@fontsource/jetbrains-mono` | self-hosted, no Google Fonts call |
| Unit tests | Vitest + Testing Library (`react`, `user-event`, `jest-dom`) + jsdom | |
| E2E | Playwright (Chromium) | runs against `vite preview` |
| Lint / format | ESLint (typescript-eslint, react-hooks, jsx-a11y) + Prettier with `prettier-plugin-tailwindcss` | |
| Package manager | npm | commit `package-lock.json` |

Use the versions the official scaffolders install at setup time. If a library's current major version differs from what this spec assumes, follow that library's current documentation and keep the behavior described here.

---

## 4. Architecture

### 4.1 Layers

```
pages/ + features/ + components/   React components: render data + local UI state only
            │   import hooks and types only
            ▼
hooks/                             TanStack Query queries & mutations, query keys, invalidation
            │   useRepository() / useAuthService()
            ▼
data/repository.ts  (DataRepository interface)      data/auth.ts  (AuthService interface)
            │   implemented by
            ├── data/mock/       MockRepository + MockAuthService            Phase 1
            └── data/supabase/   SupabaseRepository + SupabaseAuthService    Phase 2
```

Rules:

1. Components never call a repository directly; they use hooks from `src/hooks`.
2. Only `src/data/index.ts` imports adapters. It picks one from `import.meta.env.VITE_DATA_SOURCE` (`mock` by default).
3. The repository and auth service instances are provided through React context (`DataLayerProvider`) so tests can inject fakes.
4. `src/data/types.ts` is the contract for both adapters. Changing it is a design change, not an implementation detail.

### 4.2 Folder structure

```
scheduler-app/
├── CLAUDE.md
├── README.md
├── docs/superpowers/
│   ├── specs/2026-10-14-home-shell-design.md        ← this file
│   └── plans/                                       ← implementation plans
├── index.html                       # inline theme bootstrap (prevents a flash of the wrong theme)
├── .env.example
├── playwright.config.ts
├── e2e/
│   └── home.spec.ts
└── src/
    ├── main.tsx
    ├── index.css                    # Tailwind import, tokens (§6.1), base styles
    ├── vite-env.d.ts                # typed ImportMetaEnv
    ├── app/
    │   ├── App.tsx                  # providers + RouterProvider + Toaster
    │   └── router.tsx               # route table (§4.4)
    ├── config/
    │   └── brand.ts                 # product name, docs URL — placeholders (§7)
    ├── components/
    │   ├── ui/                      # shadcn components (generated)
    │   ├── brand/BrandLogo.tsx
    │   ├── common/
    │   │   ├── EmptyState.tsx
    │   │   ├── SectionError.tsx
    │   │   ├── FileDropzone.tsx
    │   │   ├── PlaceholderPage.tsx
    │   │   └── ProjectPlaceholderPage.tsx
    │   └── layout/
    │       ├── AppShell.tsx
    │       ├── TopBar.tsx
    │       ├── Sidebar.tsx
    │       ├── SidebarNav.tsx
    │       ├── WorkspaceSwitcher.tsx
    │       ├── ProjectSwitcher.tsx
    │       ├── PlanBadge.tsx
    │       └── UserMenu.tsx
    ├── features/
    │   ├── dialogs/
    │   │   ├── DialogsProvider.tsx  # openDialog(kind, options) + useDialogs()
    │   │   └── DialogHost.tsx       # renders the active dialog
    │   ├── home/
    │   │   ├── WelcomeBanner.tsx
    │   │   ├── RecentProjects.tsx
    │   │   ├── ProjectCard.tsx
    │   │   ├── CreateProjectCard.tsx
    │   │   ├── SharedSchedulesTable.tsx
    │   │   ├── WorkspacesPanel.tsx
    │   │   └── TodoPanel.tsx
    │   ├── projects/
    │   │   ├── NewProjectWizard.tsx
    │   │   ├── project-schema.ts
    │   │   └── steps/ (DetailsStep.tsx, AttributesStep.tsx, ClientStep.tsx, LocationStep.tsx)
    │   ├── schedules/
    │   │   ├── NewScheduleDialog.tsx
    │   │   ├── ImportScheduleDialog.tsx
    │   │   └── schedule-schema.ts
    │   └── workspaces/
    │       └── NewTeamWorkspaceDialog.tsx
    ├── hooks/
    │   ├── query-keys.ts
    │   ├── useCurrentUser.ts
    │   ├── useSubscription.ts
    │   ├── useWorkspaces.ts         # useWorkspaces, useCreateTeamWorkspace
    │   ├── useProjects.ts           # useRecentProjects, useWorkspaceProjects, useProjectCodeAvailable, useCreateProject
    │   ├── useSchedules.ts          # useCreateSchedule, useImportSchedule
    │   ├── useSharedWithMe.ts
    │   ├── useTasks.ts              # usePendingTasks, useSetTaskDone
    │   ├── useCurrentContext.tsx    # current workspace + project (§4.5)
    │   ├── useNow.ts                # ticking clock for relative times
    │   ├── useSidebarState.tsx      # desktop open/closed + mobile drawer
    │   └── useTheme.tsx
    ├── auth/
    │   ├── AuthProvider.tsx         # session status, signIn, signOut, route guard helpers
    │   └── RequireAuth.tsx
    ├── data/
    │   ├── types.ts
    │   ├── errors.ts
    │   ├── repository.ts
    │   ├── auth.ts
    │   ├── DataLayerProvider.tsx    # context + useRepository() + useAuthService()
    │   ├── index.ts                 # createDataLayer() — the only adapter import site
    │   └── mock/
    │       ├── MockRepository.ts
    │       ├── MockAuthService.ts
    │       ├── store.ts             # versioned localStorage store
    │       ├── latency.ts           # simulated latency + failure injection
    │       └── seed.ts              # 'default' and 'empty' scenarios
    ├── lib/
    │   ├── utils.ts                 # cn()
    │   ├── format.ts                # greetingDate, shortDate, relativeTime, pluralize, fullName, initials, fileSize, dueLabel, errorMessage
    │   ├── storage.ts               # safe localStorage access (readKey / writeKey)
    │   ├── trial.ts                 # trialStatus
    │   └── cover.ts                 # deterministic project cover
    ├── pages/
    │   ├── HomePage.tsx
    │   ├── SignInPage.tsx
    │   └── NotFoundPage.tsx
    └── test/
        ├── setup.ts
        ├── fakes.ts                 # createTestDataLayer(), makeNewProjectInput() (built on the mock seed)
        ├── viewport.ts              # mockViewport(width) for matchMedia
        └── render.tsx               # renderWithProviders(ui, { route, path, dataLayer }), renderApp(route), OpenDialog
```

### 4.3 Providers (outer → inner)

`ThemeProvider` → `DataLayerProvider` (repository + auth service) → `QueryClientProvider` → `AuthProvider` → `TooltipProvider` → `RouterProvider`, with `<Toaster />` as a sibling of the router.
Inside the router, the `AppShell` layout route renders `CurrentContextProvider` → `SidebarStateProvider` → `DialogsProvider` → shell + `<Outlet />` + `<DialogHost />`.

QueryClient defaults: `staleTime: 30_000`, `retry: 1`, `refetchOnWindowFocus: false`. Tests use `retry: false`.

### 4.4 Routes

| Path | Element | Notes |
|---|---|---|
| `/sign-in` | `SignInPage` | outside the shell; redirects to `/home` when signed in |
| `/` | redirect → `/home` | |
| `/home` | `HomePage` | inside `AppShell`, guarded by `RequireAuth` |
| `/library` | `PlaceholderPage title="Library"` | |
| `/assets` | `PlaceholderPage title="Assets"` | |
| `/w/:workspaceId/projects` | `PlaceholderPage title="Projects"` | |
| `/w/:workspaceId/p/:projectId/files` | `ProjectPlaceholderPage section="Files"` | shows project name + code |
| `/w/:workspaceId/p/:projectId/dashboard` | `ProjectPlaceholderPage section="Dashboard"` | |
| `/w/:workspaceId/p/:projectId/schedule` | `ProjectPlaceholderPage section="Schedule"` | reads optional `?scheduleId=` |
| `/settings/profile` | `PlaceholderPage title="Profile"` | |
| `/settings/billing` | `PlaceholderPage title="Billing"` | |
| `/help/sharing` | `PlaceholderPage title="Sharing"` | |
| `*` | `NotFoundPage` | |

All routes except `/sign-in` render inside `AppShell` and `RequireAuth`.

### 4.5 State ownership

| State | Owner | Persistence |
|---|---|---|
| Server data | TanStack Query | mock store (`localStorage`) now, Supabase later |
| Theme (`dark` \| `light`) | `ThemeProvider` | `localStorage['ui.theme']`; default `dark` |
| Sidebar open (≥ 1024 px) | `SidebarStateProvider` | `localStorage['ui.sidebarOpen']`; default `true` |
| Sidebar drawer open (< 1024 px) | `SidebarStateProvider` | not persisted; closes on navigation |
| Current workspace | `CurrentContextProvider` | URL `:workspaceId` → `localStorage['ui.lastWorkspaceId']` → personal workspace |
| Current project | `CurrentContextProvider` | URL `:projectId` → `localStorage['ui.lastProjectId.<workspaceId>']` → most recently updated project in the workspace → none |
| Open dialog | `DialogsProvider` | none |

`useCurrentContext()` returns `{ workspace, project, workspaces, setWorkspace(id), setProject(id) }`. `setWorkspace` stores the id and navigates to `/w/:id/projects`. `setProject` stores the id; if the current route is project-scoped it navigates to the same section for the new project, otherwise it stays on the page.

### 4.6 Dialog orchestration

Dialogs open from several places (banner buttons, create card, switcher footer, links inside other dialogs). A single `DialogsProvider` holds `{ kind, options } | null` and exposes `openDialog(kind, options?)` and `closeDialog()`. `DialogHost` renders the matching dialog.

| `kind` | Options | Opened from |
|---|---|---|
| `newSchedule` | `{ projectId?: ID }` | banner "New schedule" |
| `importSchedule` | `{ projectId?: ID }` | banner "Import schedule" |
| `newProject` | none | banner "New project", Create project card, project switcher footer, "Create a new project" link in schedule dialogs |
| `newTeamWorkspace` | none | Workspaces panel |

Opening a dialog while another is open replaces it (only one dialog at a time).

---

## 5. Domain model & data contract

### 5.1 Types — `src/data/types.ts`

These types are the Phase 2 table shapes (camelCase here, snake_case in Postgres; see §9).

```ts
export type ID = string;          // UUID v4
export type ISODate = string;     // 'YYYY-MM-DD'
export type ISODateTime = string; // ISO 8601, e.g. '2026-10-14T09:30:00.000Z'

export interface User {
  id: ID;
  firstName: string;
  lastName: string;
  email: string;
  avatarUrl: string | null;
}

export type Plan = 'trial' | 'free' | 'pro';

export interface Subscription {
  plan: Plan;
  trialEndsAt: ISODateTime | null; // set only when plan === 'trial'
}

export type WorkspaceKind = 'personal' | 'team';

export interface Workspace {
  id: ID;
  name: string;
  kind: WorkspaceKind;
  createdAt: ISODateTime;
}

export interface WorkspaceSummary extends Workspace {
  projectCount: number;
}

export type ProjectType = 'building' | 'infrastructure' | 'industrial' | 'residential' | 'other';

export interface ProjectAttributes {
  projectType: ProjectType | null;
  startDate: ISODate | null;
  plannedFinishDate: ISODate | null;
}

export interface ProjectClient {
  name: string | null;
  contactName: string | null;
  contactEmail: string | null;
}

export interface ProjectLocation {
  address: string | null;
  city: string | null;
  country: string | null;
}

export interface Project {
  id: ID;
  workspaceId: ID;
  code: string;                  // user-facing "Project ID", unique per workspace (case-insensitive)
  name: string;
  description: string | null;
  coverImageUrl: string | null;  // mock: data URL; Supabase: Storage URL
  statusDate: ISODate | null;    // data date of the project's schedules
  attributes: ProjectAttributes;
  client: ProjectClient;
  location: ProjectLocation;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface ProjectSummary extends Project {
  scheduleCount: number;
}

export type ScheduleSource = 'blank' | 'import';

export interface Schedule {
  id: ID;
  projectId: ID;
  name: string;
  statusDate: ISODate | null;
  source: ScheduleSource;
  sourceFileName: string | null;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface SharedScheduleRow {
  shareId: ID;
  scheduleId: ID;
  scheduleName: string;
  statusDate: ISODate | null;
  projectId: ID;
  projectName: string;
  workspaceId: ID;
  sharedBy: Pick<User, 'id' | 'firstName' | 'lastName' | 'avatarUrl'>;
  sharedAt: ISODateTime;
}

export interface Task {
  id: ID;
  title: string;
  dueDate: ISODate | null;
  done: boolean;
  projectId: ID | null;
  createdAt: ISODateTime;
}
```

### 5.2 Repository — `src/data/repository.ts`

```ts
import type {
  ID, ISODate, Project, ProjectAttributes, ProjectClient, ProjectLocation, ProjectSummary,
  Schedule, SharedScheduleRow, Subscription, Task, User, Workspace, WorkspaceSummary,
} from './types';

export interface NewProjectInput {
  workspaceId: ID;
  code: string;
  name: string;
  description: string | null;
  coverImage: File | null;       // adapter stores it (mock: data URL, Supabase: Storage upload)
  statusDate: ISODate | null;
  attributes: ProjectAttributes;
  client: ProjectClient;
  location: ProjectLocation;
}

export interface NewScheduleInput {
  projectId: ID;
  name: string;
}

export interface ImportScheduleInput {
  projectId: ID;
  name: string;
  file: File;                    // Phase 1: metadata only; Phase 2: uploaded to Storage
}

export interface NewTeamWorkspaceInput {
  name: string;
}

export interface DataRepository {
  getCurrentUser(): Promise<User>;
  getSubscription(): Promise<Subscription>;

  /** Personal workspace first, then team workspaces by name (A→Z). */
  listWorkspaces(): Promise<WorkspaceSummary[]>;
  createTeamWorkspace(input: NewTeamWorkspaceInput): Promise<Workspace>;

  /** All projects of a workspace, updatedAt descending. */
  listProjects(workspaceId: ID): Promise<ProjectSummary[]>;
  /** First `limit` items of listProjects(workspaceId). */
  listRecentProjects(workspaceId: ID, limit: number): Promise<ProjectSummary[]>;
  /** Case-insensitive, trimmed comparison against existing codes in the workspace. */
  isProjectCodeAvailable(workspaceId: ID, code: string): Promise<boolean>;
  /** Rejects with RepositoryError('conflict') when the code is taken. */
  createProject(input: NewProjectInput): Promise<Project>;

  /** Both set the parent project's updatedAt to now. */
  createSchedule(input: NewScheduleInput): Promise<Schedule>;
  importSchedule(input: ImportScheduleInput): Promise<Schedule>;

  /** sharedAt descending. */
  listSharedWithMe(): Promise<SharedScheduleRow[]>;

  /** Tasks with done === false: dueDate ascending (nulls last), then createdAt ascending. */
  listPendingTasks(): Promise<Task[]>;
  setTaskDone(taskId: ID, done: boolean): Promise<Task>;
}
```

### 5.3 Auth service — `src/data/auth.ts`

```ts
import type { ID } from './types';

export interface Session {
  userId: ID;
}

export interface AuthService {
  getSession(): Promise<Session | null>;
  /** Mock: signs in the seed user immediately. Supabase: sends a magic link (signInWithOtp). */
  signInWithEmail(email: string): Promise<{ status: 'signed-in' | 'link-sent' }>;
  signOut(): Promise<void>;
  /** Returns an unsubscribe function. */
  onAuthStateChange(listener: (session: Session | null) => void): () => void;
}
```

`AuthProvider` exposes `{ status: 'loading' | 'signed-in' | 'signed-out', session, signInWithEmail, signOut }`. `RequireAuth` shows a full-screen spinner while `loading`, redirects to `/sign-in` when `signed-out`. On sign-out the query cache is cleared.

### 5.4 Errors — `src/data/errors.ts`

```ts
export type RepositoryErrorCode =
  | 'not_found' | 'conflict' | 'validation' | 'unauthorized' | 'network' | 'unknown';

export class RepositoryError extends Error {
  readonly code: RepositoryErrorCode;
  constructor(code: RepositoryErrorCode, message: string) {
    super(message);
    this.name = 'RepositoryError';
    this.code = code;
  }
}
```

Adapters only ever reject with `RepositoryError`. UI maps codes to copy in one helper (`errorMessage(error)` in `src/lib/format.ts`): `network` → "Can't reach the server. Check your connection and try again.", `conflict` → the adapter's message, everything else → "Something went wrong. Please try again."

### 5.5 Hooks, query keys, invalidation

| Hook | Query key | Invalidated / updated by |
|---|---|---|
| `useCurrentUser()` | `['me']` | — |
| `useSubscription()` | `['subscription']` | — |
| `useWorkspaces()` | `['workspaces']` | `useCreateProject`, `useCreateTeamWorkspace` |
| `useRecentProjects(workspaceId)` | `['projects', workspaceId, 'recent']` | `useCreateProject`, `useCreateSchedule`, `useImportSchedule` |
| `useWorkspaceProjects(workspaceId)` | `['projects', workspaceId, 'all']` | same as above |
| `useProjectCodeAvailable(workspaceId, code)` | `['projects', workspaceId, 'code', code]` | `useCreateProject`; enabled only when `code` passes format validation; debounced 300 ms by the caller |
| `useSharedWithMe()` | `['shared-with-me']` | — |
| `usePendingTasks()` | `['tasks', 'pending']` | `useSetTaskDone` (optimistic remove / restore) |

Invalidating the prefix `['projects', workspaceId]` covers both project lists. Query-key factories live in `src/hooks/query-keys.ts`; no inline key arrays elsewhere. Recent projects use `limit = 5`.

### 5.6 Mock adapter behavior

- **Store:** one JSON document in `localStorage['mock-db.v1']` holding `{ version, scenario, seededAt, users, subscription, workspaces, projects, schedules, shares, tasks, currentUserId, session }`. Missing, unparsable or older-version data → reseed (log one `console.warn`).
- **Scenario:** `VITE_MOCK_SCENARIO` = `default` | `empty` (default `default`). If the stored scenario differs from the env value, reseed.
- **Latency:** every method awaits `VITE_MOCK_LATENCY_MS` (default `400`; unit tests and e2e use `0`).
- **Failure injection:** `VITE_MOCK_FAIL_RATE` from `0` to `1` (default `0`). When a random draw falls below it, **read** methods reject with `RepositoryError('network', 'Simulated network error')`. Writes never fail randomly.
- **Cover images:** files are read with `FileReader` into data URLs (max 5 MB is enforced by the form).
- **Dev helper:** in dev builds only, `window.__resetMockDb()` reseeds and reloads.
- **IDs and time:** `crypto.randomUUID()`; timestamps are ISO strings. Seed timestamps are computed relative to `seededAt`, so relative times look natural on first load.

**Seed — `default` scenario** (all names invented; no real people or companies):

| Entity | Data |
|---|---|
| Current user | Deniz Kaya, `deniz.kaya@example.com`, no avatar |
| Subscription | `trial`, ends 9 days after `seededAt` |
| Workspaces | "My workspace" (personal); "Site Operations" (team) |
| Projects in My workspace (updatedAt) | Riverside Office Tower `001` (3 min ago, status date 2 days before seed, 1 schedule) · Metro Line Extension `002` (2 days ago, no status date, 0 schedules) · Harbor Logistics Hub `003` (5 days ago, 3 schedules) · Campus Library Retrofit `004` (3 weeks ago, 2 schedules) · Northgate Bridge Repair `005` (5 weeks ago, 1 schedule) · Old Mill Housing `006` (2 months ago, 0 schedules) |
| Projects in Site Operations | Tunnel Ventilation Upgrade `T-01` (1 week ago, 2 schedules) |
| Users (other) | Mert Demir, Elif Arslan |
| Shared with me | "Baseline rev. 3" in Tunnel Ventilation Upgrade, shared by Mert Demir 1 day ago · "Look-ahead W42" in Tunnel Ventilation Upgrade, shared by Elif Arslan 4 days ago |
| Pending tasks | "Update status date for Riverside Office Tower" (due seed day) · "Import revised baseline from contractor" (due +3 days) · "Review look-ahead schedule" (no due date) |

**Seed — `empty` scenario:** same user, subscription and personal workspace; no team workspaces, projects, shares or tasks.

### 5.7 Validation rules (zod)

| Form | Field | Rule | Error copy |
|---|---|---|---|
| New project · Details | Project name | trimmed, 1–80 chars | "Enter a project name" · "Use 80 characters or fewer" |
| | Project ID (`code`) | trimmed, 1–16 chars, `/^[A-Za-z0-9_-]+$/`, unique in workspace (async) | "Enter a project ID" · "Use letters, numbers, - or _" · "This ID is already used in this workspace" |
| | Project photo | optional; `image/jpeg` or `image/png`; ≤ 5 MB | "Use a JPG or PNG image" · "Image must be 5 MB or smaller" |
| | Description | optional; ≤ 500 chars (live counter) | "Use 500 characters or fewer" |
| New project · Attributes | Project type | optional; one of `ProjectType` | — |
| | Start date / Planned finish | optional ISO dates; finish ≥ start when both set | "Finish must be on or after the start date" · "Enter a valid date" when the value isn't `YYYY-MM-DD` (D12) |
| | Status date | optional ISO date | "Enter a valid date" when the value isn't `YYYY-MM-DD` (D12) |
| New project · Client | Client name, Contact person | optional; ≤ 80 chars | "Use 80 characters or fewer" |
| | Contact email | optional; valid email | "Enter a valid email address" |
| New project · Location | Address | optional; ≤ 160 chars | "Use 160 characters or fewer" |
| | City, Country | optional; ≤ 80 chars | "Use 80 characters or fewer" |
| New schedule | Name | trimmed, 1–80 chars; default "New schedule" | "Enter a schedule name" |
| | Project | required | "Choose a project" |
| Import schedule | File | required; extension `.xer`, `.xml` or `.csv`; ≤ 20 MB | "Choose a file to import" · "Use a .xer, .xml or .csv file" · "File must be 20 MB or smaller" |
| | Name | trimmed, 1–80 chars; defaults to the file name without extension | "Enter a schedule name" |
| | Project | required | "Choose a project" |
| New team workspace | Name | trimmed, 2–40 chars | "Use 2–40 characters" |
| Sign in | Email | valid email | "Enter a valid email address" |

Empty optional strings are stored as `null`.

---

## 6. UI specification

Measurements are CSS pixels at 100 % zoom. Use Tailwind utilities backed by the tokens below; never hard-code colors in components.

### 6.1 Design tokens — `src/index.css`

shadcn variable names are the base; our extra tokens follow. Light values live on `:root`, dark values on `.dark`. The app defaults to **dark** (`<html class="dark">`). All tokens are exposed to Tailwind through `@theme inline` (e.g. `--color-card: var(--card)` → `bg-card`).

| Token | Dark | Light | Used for |
|---|---|---|---|
| `--background` | `#151518` | `#f7f7f8` | main canvas (scroll area) |
| `--foreground` | `#e4e4e7` | `#18181b` | primary text |
| `--card` / `--card-foreground` | `#1c1c20` / `#e4e4e7` | `#ffffff` / `#18181b` | top bar, cards, panels |
| `--popover` / `--popover-foreground` | `#232328` / `#e4e4e7` | `#ffffff` / `#18181b` | popovers, menus, dialogs |
| `--primary` / `--primary-foreground` | `#4f46e5` / `#ffffff` | `#4f46e5` / `#ffffff` | primary buttons |
| `--secondary` / `--secondary-foreground` | `#26262b` / `#e4e4e7` | `#f0f0f2` / `#18181b` | secondary buttons, switcher controls |
| `--muted` / `--muted-foreground` | `#26262b` / `#a1a1aa` | `#f0f0f2` / `#52525b` | table header, chips / secondary text |
| `--accent` / `--accent-foreground` | `#2a2a30` / `#f4f4f5` | `#ececef` / `#18181b` | hover backgrounds |
| `--destructive` | `#f87171` | `#dc2626` | errors, overdue |
| `--success` | `#4ade80` | `#16a34a` | "ID available" check mark |
| `--border` | `#2a2a30` | `#e4e4e7` | dividers |
| `--input` | `#71717a` | `#8a8a94` | input borders, dashed outlines (≥ 3 : 1 on card, popover and background; D9) |
| `--ring` | `#818cf8` | `#6366f1` | focus ring |
| `--sidebar` / `--sidebar-foreground` | `#0e0e11` / `#a1a1aa` | `#f4f4f5` / `#52525b` | sidebar |
| `--sidebar-border` | `#2a2a30` | `#e4e4e7` | sidebar edge |
| `--sidebar-accent` / `--sidebar-accent-foreground` | `rgb(99 102 241 / 0.16)` / `#a5b4fc` | `rgb(79 70 229 / 0.10)` / `#4338ca` | active nav item, current workspace row |
| `--subtle-foreground` | `#8b8b94` | `#6b6b74` | sidebar group labels, placeholders |
| `--link` | `#818cf8` | `#4f46e5` | text links and link-buttons |
| `--ring-subtle` | `rgb(255 255 255 / 0.08)` | `rgb(0 0 0 / 0.08)` | 1 px card ring |
| `--ring-strong` | `rgb(255 255 255 / 0.18)` | `rgb(0 0 0 / 0.16)` | hovered card ring |
| `--warning-bg` / `--warning-border` / `--warning-foreground` | `rgb(245 158 11 / 0.12)` / `rgb(245 158 11 / 0.35)` / `#fbbf24` | `#fffbeb` / `#fcd34d` / `#b45309` | plan badge |
| `--brand-300 … --brand-900` | `#a5b4fc` (300), `#818cf8` (400), `#6366f1` (500), `#4f46e5` (600), `#4338ca` (700), `#312e81` (900) | same | banner, icon tiles, accents |

Other theme values:

| Token | Value |
|---|---|
| `--font-sans` | `'Inter Variable', ui-sans-serif, system-ui, sans-serif` |
| `--font-mono` | `'JetBrains Mono', ui-monospace, SFMono-Regular, monospace` |
| `--radius` | `10px` → shadcn derives `sm` 6, `md` 8, `lg` 10, `xl` 14 |
| `--popover-shadow` (exposed as the `shadow-popover` utility) | dark `0 8px 24px rgb(0 0 0 / 0.45)`; light `0 8px 24px rgb(0 0 0 / 0.12)` |
| `--ease-standard` | `cubic-bezier(0.4, 0, 0.2, 1)` |

The brand scale is the single place to change the product color (§7).

### 6.2 Typography

Override Tailwind's size scale in `@theme` so the UI is compact (13 px base):

| Utility | Size / line-height | Typical weight | Use |
|---|---|---|---|
| `text-2xs` | 11 / 16 | 500 | sidebar group labels, table headers, project codes |
| `text-xs` | 12 / 16 | 400–600 | meta text, badges, card footers, field labels |
| `text-sm` | 13 / 18 | 400–500 | body, nav items, inputs, menu items (**body default**) |
| `text-base` | 14 / 20 | 600 | banner buttons, create-card label |
| `text-md` | 15 / 20 | 600 | card titles, dialog titles |
| `text-lg` | 16 / 20 | 700 | section headings (`tracking-[-0.01em]`) |
| `text-display` | 26 / 32 | 700 | greeting |

Body: `font-sans text-sm text-foreground bg-background antialiased`. Codes (`001`) use `font-mono text-2xs`.

### 6.3 Shell layout

```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│ [≡] [Logo]  [My workspace |⇅] [Riverside Office Tower v]   (TRIAL · 9 days left) (DK Deniz v) │ 48
├──────────────┬───────────────────────────────────────────────────────────────────────┤
│ Home         │ ┌───────────────────────────────────────────────────────────────────┐ │
│ Library      │ │ Hello, Deniz                                                      │ │
│ Assets       │ │ Wednesday, 14 October 2026                                        │ │ 200
│              │ │                                                                   │ │
│ WORKSPACE    │ │ [New schedule] [Import schedule] | [New project]                  │ │
│ Projects     │ └───────────────────────────────────────────────────────────────────┘ │
│              │ Recent projects                                                       │
│ PROJECT      │ ┌───────────┐ ┌───────────┐ ┌───────────┐                             │
│ Files        │ │   card    │ │   card    │ │   card    │                             │ 260
│ Dashboard    │ └───────────┘ └───────────┘ └───────────┘                             │
│ Schedule     │ ┌───────────┐ ┌───────────┐ ┌ - - - - - ┐                             │
│              │ │   card    │ │   card    │   + Create                                │ 260
│              │ └───────────┘ └───────────┘ └ - - - - - ┘                             │
│              │ Shared with me                                                        │
│              │ ┌───────────────────────────────────────────────────────────────────┐ │
│              │ │ SCHEDULE              SHARED BY          SHARED       STATUS DATE │ │
│              │ │ rows | empty state                                                │ │
│              │ └───────────────────────────────────────────────────────────────────┘ │
│              │ ┌ Workspaces ───────────────────────────────────────────────────────┐ │
│              │ │ [H] My workspace                                  6 projects  >   │ │
│              │ │ [T] Site Operations                               1 project   >   │ │
│              │ └───────────────────────────────────────────────────────────────────┘ │
│              │ To do                                                                 │
│              │ ┌───────────────────────────────────────────────────────────────────┐ │
│              │ │ [ ] Update status date for Riverside Office Tower      Due today  │ │
│              │ └───────────────────────────────────────────────────────────────────┘ │
│     176      │                                                                       │
└──────────────┴───────────────────────────────────────────────────────────────────────┘
```

| Region | Spec |
|---|---|
| Page frame | CSS grid, `height: 100dvh`, rows `48px 1fr`; second row columns `auto 1fr`. Only `main` scrolls. |
| Top bar | height 48; `bg-card`; bottom border 1 px `border`; padding-x 12; flex, `items-center justify-between`; left and right clusters `gap-3` (12), `gap-2` (8) below 640 px (D10). |
| Sidebar | width 176 (open) / 0 (closed); `bg-sidebar`; right border 1 px `sidebar-border`; padding 12; scrolls on overflow. `id="app-sidebar"`. |
| Main | `min-w-0 overflow-y-auto bg-background`, `scrollbar-gutter: stable`; padding top 12, bottom 24, x 12 (< 1024) / 16 (≥ 1024). |
| Content column | `max-width: 1600px; margin-inline: auto`; vertical stack with 24 between sections; 16 between a section heading and its content. |

### 6.4 Top bar

| Element | Spec | Behavior |
|---|---|---|
| Sidebar toggle | 32×32 ghost icon button, radius 8, `PanelLeft` 18 px, `muted-foreground` → `foreground` on hover | Desktop: toggles sidebar (aria-label "Hide sidebar" / "Show sidebar"). < 1024: opens drawer ("Open navigation"). `aria-expanded`, `aria-controls="app-sidebar"`. |
| Brand logo | `BrandLogo`, height 24; hidden below 768 px (D10) | Link to `/home`, aria-label "{brand.name} home". |
| Workspace switcher | Split control, height 28. Left: workspace name, `text-sm font-medium`, padding-x 10, radius `8 0 0 8`, `bg-secondary/80`, hover `bg-accent`, max-width 200 (truncate). Right: 28×28 button, `ChevronsUpDown` 14 px, radius `0 8 8 0`, 1 px left border `border` | Left navigates to `/w/:id/projects`. Right opens the workspace popover (§6.7). |
| Project switcher | Button height 28, padding-x 10, gap 6, radius 8, `bg-secondary/80`, max-width 320 (truncate), `ChevronDown` 14 px. Label = current project name, or "Select project" in `muted-foreground` | Opens the project popover (§6.7). |
| Plan badge | Only when `plan === 'trial'`. Pill height 26, padding `4 12`, gap 8, 1 px `warning-border`, `bg-warning-bg`, `text-warning-foreground`. Content: "TRIAL" (`text-2xs` 600 uppercase, `tracking-[0.06em]`, 70 % opacity in the dark theme, full opacity in the light theme; D10) · 4 px dot (current color, 50 %) · "{n} days left" (`text-xs` 600) | Link to `/settings/billing`; aria-label "Trial: {n} days left. Upgrade now." Text rules in §6.10. |
| Account menu trigger | Height 36, padding-x 6, gap 8, radius 8, hover `bg-accent`. Avatar 32 circle (`bg-secondary`, initials `text-xs` 500 `muted-foreground`, or image) + first name `text-sm` 500 + `ChevronDown` 14 px muted | Opens user menu (§6.7). aria-label "Account menu for {full name}". |

### 6.5 Sidebar

Navigation is data-driven (`SidebarNav.tsx`):

| Group label | Item | lucide icon | Target |
|---|---|---|---|
| — | Home | `House` | `/home` |
| — | Library | `LibraryBig` | `/library` |
| — | Assets | `Boxes` | `/assets` |
| Workspace | Projects | `FolderKanban` | `/w/:workspaceId/projects` (current workspace) |
| Project | Files | `FolderOpen` | `/w/:workspaceId/p/:projectId/files` (current project) |
| Project | Dashboard | `ChartColumn` | `/w/:workspaceId/p/:projectId/dashboard` |
| Project | Schedule | `ChartGantt` | `/w/:workspaceId/p/:projectId/schedule` |

If an icon name is missing in the installed lucide version, use the closest equivalent.

| Part | Spec |
|---|---|
| Group label | `text-2xs` 500 uppercase, `tracking-[0.06em]`, `text-subtle-foreground`, padding-x 8, margin-top 12, margin-bottom 6 |
| Item | `NavLink`; height 32, padding-x 8, gap 8, radius 8, `text-sm` 500, icon 16; items 2 px apart |
| Default | `text-sidebar-foreground` |
| Hover | `bg-accent text-foreground` |
| Active (`aria-current="page"`) | `bg-sidebar-accent text-sidebar-accent-foreground`, inset ring 1 px `brand-500 / 35 %` |
| Disabled (project items with no current project) | 50 % opacity, `aria-disabled="true"`, focusable span with Tooltip "Create or select a project first" |

Collapse:

- **≥ 1024 px:** inline column. The toggle hides it completely (no icon rail) with a 200 ms width transition; state persists (`ui.sidebarOpen`).
- **< 1024 px:** not in the grid. The toggle opens a left `Sheet` (width 240) containing the same nav; it closes on route change, Escape and backdrop click.

### 6.6 Home sections

#### WelcomeBanner

| Part | Spec |
|---|---|
| Container | `<section aria-labelledby="welcome-heading">`, radius 10, padding `24 28`, min-height 200, flex column `justify-between`, gap 24, `relative overflow-hidden`, white text |
| Background (same in both themes) | `radial-gradient(120% 160% at 100% 0%, color-mix(in oklab, var(--brand-400) 30%, transparent) 0%, transparent 55%), linear-gradient(135deg, var(--brand-700) 0%, var(--brand-900) 100%)` — the highlight stays at 30 % so the date text keeps ≥ 4.5 : 1 where it overlaps |
| Blueprint overlay | decorative `::before` (`aria-hidden`): 1 px lines `rgb(255 255 255 / 0.07)` every 24 px both ways, masked with `linear-gradient(to left, #000 0%, transparent 70%)` so the grid fades toward the text |
| Heading | `<h1 id="welcome-heading">` "Hello, {firstName}" — `text-display`, `tracking-[-0.01em]`. While the user loads: 220×32 skeleton (`bg-white/20`) |
| Date | `<p>` `text-sm` 500, `text-white/85`, 4 below the heading; `format(now, 'EEEE, d MMMM yyyy')` → "Wednesday, 14 October 2026"; refreshed by `useNow(60_000)` |
| Actions | flex, wrap, gap 12, `items-center` |

| Action | Icon (16) | Style | On click |
|---|---|---|---|
| New schedule | `FilePlus2` | solid white: `bg-white text-brand-700 hover:bg-white/90` | `openDialog('newSchedule', { projectId: currentProject?.id })` |
| Import schedule | `FileUp` | glass: `bg-white/12 text-white ring-1 ring-inset ring-white/24 hover:bg-white/20` | `openDialog('importSchedule', { projectId: currentProject?.id })` |
| Divider | — | 1×28, `bg-white/25`, `aria-hidden`, hidden < 640 px | — |
| New project | `FolderPlus` | glass (as Import) | `openDialog('newProject')` |

All banner buttons: height 44, padding-x 20, gap 8, radius 8, `text-base` 600; pressed `scale-[0.98]`; focus-visible ring 2 px white with 2 px offset in `brand-700`.

#### RecentProjects

- `<section aria-labelledby="recent-heading">` with `<h2>` "Recent projects" (`text-lg`).
- Grid: 3 columns ≥ 1024, 2 columns 640–1023, 1 column < 640; gap 20. Items: up to 5 `ProjectCard` (from `useRecentProjects(currentWorkspace.id)`) followed by `CreateProjectCard`.
- Loading: 3 card skeletons of the same size. Error: `SectionError` spanning all columns, height 260. No projects: only `CreateProjectCard`.

#### ProjectCard

```
┌─────────────────────────────────────────┐  260 tall, radius 10, bg-card, ring 1px --ring-subtle
│                                         │
│          cover (126 tall)               │  photo (object-cover) or generated cover (lib/cover.ts)
│                                         │
├─────────────────────────────────────────┤
│ Riverside Office Tower   001            │  name text-md 600 (truncate) · code font-mono text-2xs 500 muted · gap 8
│ [calendar] Status date Oct 12, 2026     │  text-xs muted · icon 14 · gap 6 · 6 below the name row
│                                         │  body: padding 16 12 0, flex-1
├─────────────────────────────────────────┤  1px top border
│ [clock] 3 minutes ago       1 schedule >│  footer: 38 tall, padding-x 14, text-xs; link 600 text-link
└─────────────────────────────────────────┘
```

- **Semantics:** `<article>`. The name is a `<Link>` to `/w/:workspaceId/p/:projectId/files` with a stretched `::after` (inset 0) so the whole card is clickable. The schedules link (`/w/:workspaceId/p/:projectId/schedule`) sits above it (`relative z-10`). No nested interactive elements.
- **Status line:** "Status date {MMM d, yyyy}" or "Status date —".
- **Footer:** left `Clock` 14 + `formatDistanceToNowStrict(updatedAt, { addSuffix: true })`, refreshed every 60 s. Right: "0 schedules" / "1 schedule" / "{n} schedules" + `ChevronRight` 14.
- **Cover:** `coverImageUrl` if present, else `coverFor(project.id)` (§6.10). Cover container `overflow-hidden`.
- **States:** hover → ring `--ring-strong`, cover `scale(1.03)` (200 ms); keyboard focus on the name link → 2 px `ring` around the whole card (`has-[a:focus-visible]:ring-2`); `title` attribute carries the full name.

#### CreateProjectCard

- `<button type="button">`, 260 tall, radius 10, `bg-card/40`, 1 px **dashed** `input` border, flex column centered, gap 12, padding-x 24.
- Visual: 72×72 tile, radius 16, `bg-brand-500/12`, 1 px dashed `brand-400/40` border, `FolderPlus` 28 in `brand-400`. Label: `Plus` 16 + "Create new project", `text-base` 700, `text-link`.
- Hover: border `brand-400`, `bg-card/60`. Click → `openDialog('newProject')`.

#### SharedSchedulesTable

- `<section aria-labelledby="shared-heading">`, `<h2>` "Shared with me", then a panel: radius 10, `bg-card`, ring 1 px `--ring-subtle`, `overflow-hidden`.
- Real `<table>` with `table-layout: fixed`. Columns: Schedule 38 %, Shared by 24 %, Shared 19 %, Status date 19 %.
- Header row: height 40, `bg-muted/50`, bottom border; cells `text-2xs` 500 uppercase, `tracking-[0.04em]`, `muted-foreground`; first cell padding-left 20, last cell padding-right 28, others padding-x 6.
- Body rows: height 56; bottom border except the last; hover `bg-accent/40`; whole row clickable through a stretched link on the schedule name → `/w/:workspaceId/p/:projectId/schedule?scheduleId=:scheduleId`.

| Column | Content |
|---|---|
| Schedule | name `text-sm` 500 (truncate) above project name `text-xs` muted (truncate) |
| Shared by | 20 px avatar (initials) + full name `text-sm` |
| Shared | relative time `text-sm` muted |
| Status date | `MMM d, yyyy` or "—" |

- Empty: body min-height 210, centered `EmptyState` (`Share2`): title "Nothing shared yet", description "Schedules that others share with you will appear here.", link "How sharing works" → `/help/sharing`.
- Loading: header + 3 skeleton rows. Error: `SectionError` inside the body.

#### WorkspacesPanel

- `<section aria-labelledby="workspaces-heading">` **is** the panel (radius 10, `bg-card`, ring 1 px `--ring-subtle`, `overflow-hidden`); its `<h2>` "Workspaces" sits inside: `text-sm` 700, padding `12 16 8`.
- One row per workspace (`listWorkspaces` order): `<button>`, full width, height 52, padding-x 16, gap 12, left-aligned.
  - Icon tile 32×32, radius 8, `bg-brand-600`, white 16 px icon: `House` (personal) or `Users` (team).
  - Name `text-sm` 600 (truncate). Right: "{n} projects" (1 → "1 project") `text-xs` muted + `ChevronRight` 16 muted.
  - Current workspace: `bg-sidebar-accent`. Others: hover `bg-accent/60`.
  - Click → `setWorkspace(id)`.
- No team workspaces: an inline block (padding 16, gap 16): 64×48 tile, radius 8, dashed `input` border, `Users` + small `Plus` icons; text "No team workspaces yet" (`text-sm` muted) with a link-button "+ New team workspace" (`text-sm` 700 `text-link`) below → `openDialog('newTeamWorkspace')`.
- With team workspaces: footer link-button "+ New team workspace" (padding `12 16`) instead.
- Loading: 2 skeleton rows. Error: `SectionError`.

#### TodoPanel

- `<section aria-labelledby="todo-heading">`, `<h2>` "To do", then a panel (radius 10, `bg-card`, ring) with min-height 420 (≥ 1024) / 240 (< 1024).
- Rows (`usePendingTasks`): height 44, padding-x 16, gap 12, bottom border except the last.
  - shadcn `Checkbox` (aria-label "Mark '{title}' as done") · title `text-sm` (truncate) · due text right-aligned `text-xs`: "Due today", "Due tomorrow", "Due {MMM d}"; past due → `text-destructive` "Overdue · {MMM d}"; no due date → nothing.
  - Checking a task removes it optimistically and shows a toast "Task completed" with an **Undo** action (`setTaskDone(id, false)`, row returns in place).
- Empty: centered `EmptyState` (`ListChecks`): title "You're all caught up", description "Tasks assigned to you will show up here."
- Loading: 3 skeleton rows. Error: `SectionError`.

#### Shared building blocks

| Component | Spec |
|---|---|
| `EmptyState` | Props `icon`, `title`, `description?`, `action?`, `size?: 'md' \| 'sm'`. `md`: 64×64 tile, radius 16, `bg-muted`, 1 px dashed `input` border, icon 28 `muted-foreground`; title `text-sm` 600; description `text-sm` muted; max-width 320; gap 8; centered. `sm`: same pieces laid out horizontally with a 48 tile. |
| `SectionError` | `role="alert"`; `TriangleAlert` 20 `text-destructive`; message from `errorMessage(error)`; secondary button "Retry" → `onRetry()`. Centered in its container. |
| `FileDropzone` | Props `accept`, `maxBytes`, `hint`, `value: File \| null`, `onChange`, `error?`, `height?`. Dashed 1 px `input` border, radius 10, centered icon + text; drag-over → `border-brand-400 bg-brand-500/5`; it is a `<button>` that opens a hidden `<input type="file">`; with a file, shows a chip (name, `fileSize()`, remove `X` button with aria-label "Remove file"). |
| `PlaceholderPage` | `<h1>` title (`text-lg`) followed by an `EmptyState` (`Construction` icon) whose title is "This area is part of a later phase." — no separate description line. |
| `ProjectPlaceholderPage` | Same, with header "{project.name} · {section}" and the project code chip; `NotFoundPage` content if the project id is unknown. |

### 6.7 Overlays

**Popover shell (all popovers and menus):** `bg-popover`, 1 px `border`, radius 10, `shadow-popover`, padding 4; open animation fade + zoom 98 → 100 % in 150 ms.

**Workspace popover**

- Width 288; `side="bottom" align="start" sideOffset={6}`.
- shadcn `Command`: input "Search workspaces…" (height 36, `Search` icon); list max-height 320.
- Item: height 32, padding-x 8, gap 8, radius 6 — letter tile 20×20 (radius 6, `bg-brand-600`, white `text-2xs` 600 initial), name `text-sm`, right tag "Personal" / "Team" `text-2xs` muted. Current item: `Check` 14 in `text-link`.
- Select (click / Enter) → `setWorkspace(id)` and close. No match → "No workspaces found".

**Project popover**

- Width 304; same anchoring; input "Search projects…".
- Items (current workspace, `updatedAt` desc): name `text-sm` (truncate) + right code chip (`font-mono text-2xs`, `bg-muted`, radius 6, padding `1 6`). Current: `bg-accent` + `Check`.
- Separator, then footer item "+ Create new project" (`text-link`) → close + `openDialog('newProject')`.
- Select → `setProject(id)` and close. No match → "No projects found". No projects → footer only.

**User menu** (shadcn `DropdownMenu`)

- Width 220, `align="end" sideOffset={6}`.
- Label block: full name `text-sm` 600, email `text-xs` muted (truncate).
- Items (icon 16, height 32): Profile (`User`) → `/settings/profile` · Documentation (`BookOpen`, trailing `ExternalLink` 12) → `brand.docsUrl` in a new tab · Billing (`CreditCard`) → `/settings/billing` · separator · theme item: "Light mode" + `Sun` (in dark) / "Dark mode" + `Moon` (in light) → toggle theme · separator · Log out (`LogOut`) → `signOut()` then `/sign-in`.

**Dialogs** (shadcn `Dialog`)

| Part | Spec |
|---|---|
| Overlay | `bg-black/60 backdrop-blur-[2px]` |
| Content | `bg-popover`, 1 px border, radius 14, padding 24; width: New schedule 520, Import 560, New project 640, New team workspace 440; `max-width: calc(100vw - 32px)`; `max-height: calc(100dvh - 48px)` with a scrolling body |
| Header | title `text-md` 600; description `text-sm` muted; 28×28 close button top-right (aria-label "Close") |
| Fields | label `text-xs` 600 with 6 gap to the control; controls height 36; fields 16 apart; error `text-xs text-destructive` under the field via `aria-describedby`, plus `aria-invalid` (not on `FileDropzone`, a button, where ARIA doesn't support it: its error is linked through `aria-describedby` only; D11). In this spec a `*` after a label means "required": the label text itself has no `*` — the marker is a sibling `aria-hidden` span and the control gets `aria-required="true"`. Forms use `noValidate`; zod owns validation. No `autoFocus` attributes: the first field is focused on open. |
| Footer | right-aligned, gap 8: "Cancel" (secondary) + primary. The primary stays enabled so an invalid submit can show its errors; it is disabled only while pending (spinner + "Creating…" / "Importing…") or while the Project ID is known to be taken. In the wizard that applies to "Next" on step 1; "Create project" on step 4 stays enabled, and a submit with a known-taken ID returns to step 1 with the Project ID error and sends no request (D12). A second click while pending never submits twice. |
| Closing | Escape, overlay click or Cancel; a control that replaces the dialog ("Create a new project") leaves it the same way. If the form is dirty, confirm with an AlertDialog "Discard changes?" ("Keep editing" / "Discard"); "Discard" then closes the dialog or opens the other one (D11) |
| Submit | on invalid submit, focus the first invalid field |

**New schedule dialog**

- Title "New schedule"; description "Name the schedule and choose its project."
- Name (focused on open, default "New schedule" preselected).
- Project combobox (Popover + Command) over the current workspace's projects: items show code chip and name (D11). Default: `options.projectId` → current project → first project of the workspace.
- Link-button "+ Create a new project" → `openDialog('newProject')`.
- Workspace without projects: replace the form with an inline notice "Create a project first." + primary "Create project" → `openDialog('newProject')`.
- Submit "Create schedule" → `useCreateSchedule` → toast "Schedule created" → close → navigate to `/w/:wid/p/:pid/schedule?scheduleId=:id`.

**Import schedule dialog**

- Title "Import schedule"; description "Upload a schedule exported from your planning tool."
- `FileDropzone` (height 140, `FileUp` 24): "Drop a file here or click to browse"; hint "Primavera P6 (.xer), MS Project XML (.xml) or CSV · up to 20 MB".
- Name (filled from the file name without extension when empty), Project combobox (as above), same no-project notice.
- Submit "Import" → `useImportSchedule` → toast "Schedule imported" → close → navigate to the new schedule page.

**New project wizard**

- Title "New project". Stepper below the title with 4 steps: Details, Attributes, Client, Location.
  - Marker 20 circle: current = `bg-primary` + white number `text-2xs` 600; completed = `bg-brand-600/20` + `Check` 12 `text-link`; upcoming = 1 px `input` border + muted number. Labels `text-xs` 500 (current `foreground`, others muted). Completed steps are clickable buttons named "{label}, completed" (", completed" visually hidden; D13); upcoming steps are not.
  - Visually hidden `aria-live="polite"` region: "Step 2 of 4: Attributes".
- Step 1 — Details: row (2 columns ≥ 640): Project name* | Project ID* (mono input; while checking availability show a spinner; when free show `Check` in `text-success`; if the check itself fails, show the hint "Couldn't check this ID right now" and allow continuing — the conflict check on submit is authoritative); Project photo (`FileDropzone`, height 120, JPG/PNG ≤ 5 MB, hint "JPG or PNG · up to 5 MB" (D12), thumbnail preview 96×64 with remove); Description textarea (3 rows) with counter "{n}/500".
- Step 2 — Attributes: Project type (Select: None, Building, Infrastructure, Industrial, Residential, Other; "None" is the empty value and the default; D13) | Status date; Start date | Planned finish date. Dates use native `<input type="date">` styled as inputs.
- Step 3 — Client: Client name; Contact person | Contact email.
- Step 4 — Location: Address; City | Country.
- Footer: "Cancel" on the left; on the right "Back" (secondary, from step 2) + "Next" (primary) or "Create project" on step 4. "Next" validates the current step only.
- Submit → `useCreateProject` → toast "Project created" → close → `setProject(newId)`; the user stays on the current page (Home shows the project first in Recent projects).
- A `conflict` error on submit (code taken meanwhile) → return to step 1 and show the Project ID error.

**New team workspace dialog**

- Title "New team workspace"; description "Team workspaces hold projects you work on with others."
- One field labelled "Workspace name". Submit "Create workspace" → `useCreateTeamWorkspace` → toast "Workspace created" → close (no navigation).

**Sign-in page** (`/sign-in`, outside the shell)

- Centered card (width 380, radius 14, `bg-card`, ring, padding 32): `BrandLogo`, title "Sign in" (`text-lg`), description "Use your work email to continue.", Email field, primary "Continue".
- `signInWithEmail(email)`: `signed-in` → navigate to `/home`; `link-sent` → replace the form with "Check your inbox for a sign-in link." (Phase 2).
- Mock mode shows a muted note under the button: "Demo mode: any email signs you in as the demo user."

### 6.8 Interaction & state matrix

| Element | State | Behavior |
|---|---|---|
| Nav item | hover / active / disabled | §6.5 |
| Banner buttons | hover / pressed / focus | §6.6 |
| Project card | hover | ring `--ring-strong`, cover zoom 1.03 |
| Project card | keyboard focus | 2 px `ring` around the card |
| Schedules link, text links | hover | underline |
| Create project card | hover | border `brand-400`, `bg-card/60` |
| Shared table row | hover | `bg-accent/40` |
| Workspace row | current / hover | `bg-sidebar-accent` / `bg-accent/60` |
| Task checkbox | checked | optimistic remove + "Task completed" toast with Undo |
| Primary buttons | pending | spinner, disabled, pending label |
| Every Home section | loading / error / empty | skeleton / `SectionError` + Retry / `EmptyState` |
| Plan badge | trial ended | `text-destructive`, border `destructive/40`, text "Trial ended" |

### 6.9 Responsive behavior

| Width | Changes |
|---|---|
| ≥ 1280 px | Layout as specified. |
| 1024–1279 px | Same; banner actions may wrap. |
| 768–1023 px | Sidebar becomes a left drawer (`Sheet`, 240 wide), closed by default; project grid 2 columns; main padding-x 12. |
| 640–767 px | Project grid 2 columns; table hides "Shared by"; workspace switcher label max-width 120; brand logo hidden (D10). |
| < 640 px | Project grid 1 column; banner padding 20, actions stack full-width, divider hidden; table shows Schedule + Shared only; workspace switcher shows a `Building2` icon + chevron only (name in aria-label); brand logo hidden; top bar cluster gaps 8 (D10); project switcher label max-width 120; plan badge shows only the compact "{n}d" / "Ended", without the "TRIAL" label and dot (full text kept in aria-label); account trigger hides the first name; To do min-height 240; dialogs use a 16 px viewport margin; wizard step labels hidden (markers only). |

### 6.10 Rules, formats and edge cases

| Topic | Rule |
|---|---|
| Greeting date | `format(now, 'EEEE, d MMMM yyyy')` |
| Short date | `format(parseISO(date), 'MMM d, yyyy')`; `null` → "—" |
| Relative time | `formatDistanceToNowStrict(date, { addSuffix: true })`, refreshed every 60 s |
| Pluralization | `pluralize(n, 'schedule')` → "0 schedules", "1 schedule", "2 schedules" (same for project) |
| Initials | first letter of first name + first letter of last name, uppercase; fallback first two letters of email |
| Trial days | `trialStatus(endsAt, now)` → `{ daysLeft, ended, label, compactLabel }` with `daysLeft = max(0, ceil((endsAt − now) / 1 day))` and `ended = endsAt ≤ now`; label: > 1 → "{n} days left", = 1 → "1 day left", ended → "Trial ended"; compact: "{n}d" / "Ended". Timestamps are offset by exact milliseconds, never calendar days, so a daylight-saving change can't add an hour. |
| Project cover | `coverFor(id)`: 32-bit FNV-1a hash of the id → base hue `225 + hash % 50` (indigo–violet), second hue `(base + 30 + (hash >>> 8) % 60) % 360`, angle `(hash >>> 16) % 360`; returns `background-image: linear-gradient({angle}deg, hsl({base} 45% 34%), hsl({second} 40% 20%))` layered under a 20 px blueprint grid (`rgb(255 255 255 / 0.07)` 1 px lines). Same id → same cover. |
| File size | `fileSize(bytes)` → "512 B", "1.2 KB", "3.4 MB" (1 decimal above 1 KB) |
| Long text | truncate with ellipsis; full text in `title` (cards, table) or Tooltip (switchers) |
| Many projects | Home shows the 5 most recent; switchers list all with search and scroll |
| Missing values | status date "—"; avatar → initials; cover → generated |
| Slow network | skeletons sized like final content (no layout shift) |
| Mutation failure | toast with `errorMessage(error)`; dialog stays open with values kept |
| No project in workspace | project nav items disabled; schedule dialogs show the "Create a project first." notice |
| Current user fails to load | greeting reads "Hello" (no name); account trigger shows a `User` icon instead of initials and hides the name |
| Subscription fails to load | plan badge hidden |
| Workspaces fail to load | RecentProjects and WorkspacesPanel show `SectionError` whose Retry refetches workspaces; switchers show a disabled "Unavailable" label; Projects nav item disabled |
| Due dates | compared as local calendar dates (`isToday(parseISO(dueDate))`, etc.) |

### 6.11 Motion

| Element | Trigger | Animation | Duration | Easing |
|---|---|---|---|---|
| Card ring / cover | hover | ring color; cover scale 1 → 1.03 | 150 / 200 ms | `--ease-standard` |
| Sidebar (≥ 1024) | toggle | width 176 ↔ 0, content opacity | 200 ms | `--ease-standard` |
| Drawer (< 1024) | open / close | slide from left | 200 ms | `--ease-standard` |
| Popover / menu | open | fade + zoom 98 → 100 % | 150 ms | ease-out |
| Dialog | open / close | overlay fade; content fade + zoom 98 → 100 % | 200 ms | ease-out |
| Wizard step | change | content fade | 120 ms | ease-out |
| Skeleton | loading | pulse | 1.5 s loop | ease-in-out |

With `prefers-reduced-motion: reduce`, disable scale, slide and zoom (opacity changes become instant).

### 6.12 Accessibility

- Landmarks: `<header>` (top bar), `<nav aria-label="Primary">` (sidebar), `<main id="main" tabIndex={-1}>`; each Home section is `aria-labelledby` its heading. Heading order: one `h1` (greeting), then `h2` per section.
- First focusable element: visually hidden "Skip to content" link → `#main`.
- Focus order: skip link → sidebar toggle → logo → workspace name → workspace chevron → project switcher → plan badge → account menu → sidebar nav → main content.
- Every icon-only control has an `aria-label`. Popovers, menus and dialogs use Radix behavior (roving focus, Escape, focus return).
- Active nav item: `aria-current="page"`.
- Cards use the stretched-link pattern; the schedules link is separately focusable.
- Forms: labels bound to inputs, errors through `aria-describedby` + `aria-invalid` (`aria-describedby` only on `FileDropzone`; D11), first invalid field focused on submit.
- Toasts announce through sonner's live region; Undo is keyboard reachable.
- Contrast: text ≥ 4.5 : 1 on its background in both themes; focus ring and UI boundaries (input borders) ≥ 3 : 1 (verified in §8). Dividers (`--border`) are decorative and not held to 3 : 1 (D9).
- With `(pointer: coarse)`, nav items and icon buttons grow to 40 px tall.

---

## 7. Brand & content rules

**Brand config** — `src/config/brand.ts` (placeholders until the product is named):

```ts
export const brand = {
  name: 'AppName',
  docsUrl: 'https://example.com/docs',
  supportEmail: 'support@example.com',
} as const;
```

**Logo** — `BrandLogo` renders an original placeholder: a 24×24 tile (radius 6, `bg-brand-600`) holding a white inline-SVG mark of three horizontal bars of different lengths and offsets (a tiny Gantt), followed by the wordmark `brand.name` (`text-md` 700, `tracking-[-0.02em]`). Replace both when the real brand exists.

**One-place recoloring** — in `src/index.css`, `--primary`, `--link`, `--ring`, `--sidebar-accent` and `--sidebar-accent-foreground` are written in terms of the brand scale (for example `--primary: var(--brand-600)`, `--sidebar-accent: color-mix(in oklab, var(--brand-500) 16%, transparent)`), so changing the product color means editing only the six `--brand-*` values.

**IP rules**

- Never add third-party logos, illustrations, screenshots, cover images, icon sets other than lucide, or marketing copy.
- Empty-state visuals are compositions of lucide icons (§6.6). Project covers are generated (§6.10) or uploaded by the user.
- The UI copy in this spec is ours; use it verbatim so the product reads consistently.

**Copy style** — sentence case for headings, buttons and menu items ("New schedule", "Recent projects"); digits for numbers; no exclamation marks; errors say what to do next. A leading "+" in this spec's copy (e.g. "+ New team workspace") stands for a `Plus` icon, not a typed character, so the control's accessible name is just the words. Where the implementation plan pins an exact label or string in a test, that string is the requirement.

---

## 8. Testing strategy

| Layer | Tooling | What is covered |
|---|---|---|
| Pure functions | Vitest | `lib/format` (greeting date, short date incl. `null`, relative time with a fixed clock, pluralize, initials, fileSize, errorMessage), `lib/trial` (exact days, partial day, past end), `lib/cover` (deterministic, hue range, different ids differ) |
| Mock adapter | Vitest | workspace order and project counts; project sort and `limit`; case-insensitive code availability; `createProject` conflict; `createSchedule` / `importSchedule` bump `updatedAt` and `scheduleCount`; shared rows order; pending task order; `setTaskDone`; reseed on corrupt store and on scenario change; failure injection (rate 1 → reads reject with `network`, writes succeed) |
| Components | Vitest + Testing Library via `renderWithProviders` with an in-memory repository | PlanBadge variants; SidebarNav active and disabled items; ProjectCard content and links; RecentProjects loading / error / empty / populated; SharedSchedulesTable empty and rows; WorkspacesPanel with and without team workspaces; TodoPanel complete + Undo; WelcomeBanner greeting; UserMenu theme toggle; NewScheduleDialog validation and submit; ImportScheduleDialog file validation; NewProjectWizard per-step validation, async code check, conflict path |
| End-to-end | Playwright against `vite preview`, `VITE_MOCK_LATENCY_MS=0` | (1) Home shows seed data: greeting, 5 cards + create card, 2 shared rows, 2 workspaces, 3 tasks. (2) Sidebar toggle persists after reload. (3) Keyboard-only workspace switch. (4) Create schedule from the banner → toast → schedule page. (5) Create project through all 4 steps → first in Recent projects. (6) Theme toggle persists after reload. (7) Screenshots at 1440, 1024, 768, 375 saved to `test-results/screens/` for owner review (not diffed). |
| Contrast | `scripts/check-contrast.mjs` | Reads `:root` and `.dark` token values from `src/index.css` and asserts WCAG ratios for: foreground on background / card / popover; muted-foreground on background / card; subtle-foreground and sidebar-foreground on sidebar; sidebar-accent-foreground on sidebar-accent (composited over sidebar); link on card and background; primary-foreground on primary; warning-foreground on warning-bg (composited over card); destructive on card; input on card, popover and background; banner date text (white 85 %) over `brand-700` with the 30 % `brand-400` highlight. Text pairs ≥ 4.5; ring, input borders and success icon vs their surface ≥ 3. It resolves `var(--x)` references and treats `color-mix(in oklab, var(--x) N%, transparent)` as `--x` at N % alpha. |
| Architecture | ESLint `no-restricted-imports` | Files outside `src/data` (and `src/test`) cannot import `src/data/mock/**` or `src/data/supabase/**` (S4). |

npm scripts:

| Script | Command |
|---|---|
| `dev` | `vite` |
| `build` | `tsc -b && vite build` |
| `preview` | `vite preview` |
| `typecheck` | `tsc -b` |
| `lint` | `eslint .` |
| `format` | `prettier --write .` |
| `test` | `vitest run` |
| `test:watch` | `vitest` |
| `test:e2e` | `playwright test` |
| `check:contrast` | `node scripts/check-contrast.mjs` |
| `check` | `npm run typecheck && npm run lint && npm run test && npm run check:contrast` |

---

## 9. Phase 2 readiness — Supabase

Phase 2 is a separate spec + plan written after Phase 1 is merged. Phase 1 must leave these seams in place:

| Seam | Phase 1 state | Phase 2 work |
|---|---|---|
| `VITE_DATA_SOURCE` | `mock` (only value implemented; `supabase` throws a clear "not implemented yet" error at startup) | add `supabase` branch in `createDataLayer()` |
| `DataRepository`, `AuthService` | interfaces + mock adapters | `src/data/supabase/{client,mappers,SupabaseRepository,SupabaseAuthService}.ts` |
| Env | `.env.example` lists `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (commented) | real values in `.env.local` (never committed) |
| Auth UI | `/sign-in` with email → `signInWithEmail` | magic link (`signInWithOtp`, redirect to `/home`) returns `link-sent` |
| Files | cover images as data URLs; import keeps file metadata | Storage buckets `project-covers` (public read) and `schedule-imports` (private) |

**Type ↔ table mapping**

| Type | Source | Notes |
|---|---|---|
| `User` | `profiles` | snake_case ↔ camelCase in `mappers.ts` |
| `Subscription` | `subscriptions` | |
| `WorkspaceSummary` | view `workspace_summaries` | |
| `ProjectSummary` | view `project_summaries` | flat `client_*`, `location_*`, attribute columns → nested objects |
| `Schedule` | `schedules` | |
| `SharedScheduleRow` | view `shared_with_me` | filtered by `auth.uid()` |
| `Task` | `tasks` | pending: `done = false order by due_date asc nulls last, created_at asc` |

**Error mapping** — Postgres `23505` (unique violation) → `conflict`; PostgREST `PGRST116` (no rows) → `not_found`; HTTP 401 / expired JWT → `unauthorized`; `fetch` failure → `network`; anything else → `unknown`.

**Schema draft** (validated and finalized in Phase 2; future file `supabase/migrations/0001_init.sql`):

```sql
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  first_name text not null,
  last_name text not null,
  email text not null,
  avatar_url text,
  created_at timestamptz not null default now()
);

create table public.subscriptions (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  plan text not null default 'trial' check (plan in ('trial', 'free', 'pro')),
  trial_ends_at timestamptz
);

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 40),
  kind text not null check (kind in ('personal', 'team')),
  owner_id uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);

create table public.workspace_members (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  primary key (workspace_id, user_id)
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  code text not null check (code ~ '^[A-Za-z0-9_-]{1,16}$'),
  name text not null check (char_length(name) between 1 and 80),
  description text check (char_length(description) <= 500),
  cover_image_url text,
  status_date date,
  project_type text check (project_type in ('building', 'infrastructure', 'industrial', 'residential', 'other')),
  start_date date,
  planned_finish_date date,
  client_name text,
  client_contact_name text,
  client_contact_email text,
  location_address text,
  location_city text,
  location_country text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (planned_finish_date is null or start_date is null or planned_finish_date >= start_date)
);
create unique index projects_workspace_code_uq on public.projects (workspace_id, lower(code));

create table public.schedules (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  status_date date,
  source text not null check (source in ('blank', 'import')),
  source_file_name text,
  source_file_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.schedule_shares (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid not null references public.schedules (id) on delete cascade,
  shared_by uuid not null references public.profiles (id),
  shared_with uuid not null references public.profiles (id),
  shared_at timestamptz not null default now(),
  unique (schedule_id, shared_with)
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  assignee_id uuid not null references public.profiles (id) on delete cascade,
  project_id uuid references public.projects (id) on delete set null,
  title text not null,
  due_date date,
  done boolean not null default false,
  created_at timestamptz not null default now()
);

-- A new schedule bumps its project's updated_at (drives "Recent projects").
create function public.touch_project() returns trigger language plpgsql as $$
begin
  update public.projects set updated_at = now() where id = new.project_id;
  return new;
end $$;
create trigger schedules_touch_project after insert on public.schedules
  for each row execute function public.touch_project();

-- Read models (security_invoker so RLS of the caller applies).
create view public.project_summaries with (security_invoker = true) as
  select p.*, (select count(*) from public.schedules s where s.project_id = p.id)::int as schedule_count
  from public.projects p;

create view public.workspace_summaries with (security_invoker = true) as
  select w.*, (select count(*) from public.projects p where p.workspace_id = w.id)::int as project_count
  from public.workspaces w;

create view public.shared_with_me with (security_invoker = true) as
  select sh.id as share_id, s.id as schedule_id, s.name as schedule_name, s.status_date,
         p.id as project_id, p.name as project_name, p.workspace_id,
         pr.id as shared_by_id, pr.first_name as shared_by_first_name,
         pr.last_name as shared_by_last_name, pr.avatar_url as shared_by_avatar_url,
         sh.shared_at
  from public.schedule_shares sh
  join public.schedules s on s.id = sh.schedule_id
  join public.projects p on p.id = s.project_id
  join public.profiles pr on pr.id = sh.shared_by
  where sh.shared_with = auth.uid();
```

**Row-level security (intent; exact policies written and tested in Phase 2)**

| Table | Read | Write |
|---|---|---|
| `profiles` | self, members of a shared workspace, people who shared a schedule with you | self |
| `subscriptions` | self | service role only |
| `workspaces` | members (`is_member(id)` security-definer helper) | insert by any user as owner (trigger adds owner membership) |
| `workspace_members` | members of the same workspace | owner |
| `projects` | members of the workspace | members of the workspace |
| `schedules` | members of the project's workspace, or recipients of a share | members of the project's workspace |
| `schedule_shares` | `shared_with = auth.uid()` or `shared_by = auth.uid()` | `shared_by = auth.uid()` and member of the schedule's workspace |
| `tasks` | `assignee_id = auth.uid()` | `assignee_id = auth.uid()` (update `done` only) |

**Sign-up bootstrap** — a trigger on `auth.users` insert creates the profile, a personal workspace named "My workspace", the owner membership and a `trial` subscription ending 14 days later.

---

## 10. Decisions log

| # | Decision | Reason |
|---|---|---|
| D1 | Repository interface + adapters (mock now, Supabase later) instead of MSW or Supabase-first | UI stays backend-agnostic; fast iteration; easy tests (owner-approved 2026-10-14) |
| D2 | Phase 2 backend: Supabase | auth, Postgres, storage and RLS in one service (owner-approved) |
| D3 | Brand color indigo, recolorable from six tokens | owner choice; keeps our identity distinct |
| D4 | All UI copy and docs in English | owner choice |
| D5 | Stretched-link cards instead of nested interactive elements | valid HTML, accessible keyboard order |
| D6 | One `DialogsProvider` for all creation dialogs | dialogs open from several places and chain into each other |
| D7 | Native date inputs in the wizard | keeps Phase 1 small; can be swapped for a date picker later |
| D8 | Sidebar hides fully (no icon rail) on desktop, drawer below 1024 px | matches the analyzed interaction model, simplest to build |
| D9 | `--input` raised to `#71717a` (dark) / `#8a8a94` (light) so input borders reach 3 : 1 on card, popover and background; the contrast check covers these pairs; field components drop the dark-theme `bg-input/30` fill | §6.12 asks for 3 : 1 UI boundaries; the earlier values measured 1.38–1.61 : 1, and on the lighter fill muted text would drop below 4.5 : 1 (owner decision 2026-10-15) |
| D10 | The "TRIAL" label keeps 70 % opacity only in the dark theme; below 768 px the brand logo is hidden; below 640 px the top bar cluster gaps drop to 8 px and the plan badge shows only "{n}d" / "Ended" | at 70 % the light-theme label measured 2.89 : 1 against the 4.5 : 1 that §6.12 asks of text (4.84 : 1 at full opacity; dark measures 4.85 : 1 at 70 %). With only the earlier §6.9 changes the top bar needed about 445 px at 375 px and its controls overlapped; these changes leave the project label about 75 px. With the logo back at 640 px, the full badge and the first name left the workspace name 22 px and the project label 61 px, so the logo stays hidden up to 767 px (owner decisions 2026-10-16) |
| D11 | Schedule dialogs: the project picker lists the current workspace's projects and drops the workspace-name column; "Create a new project" on a changed form asks "Discard changes?" before the new project dialog replaces it; `FileDropzone` reports its error through `aria-describedby` only | the default-project rule and the no-project notice already scope the picker to one workspace, so every option showed the same workspace name; replacing a changed dialog without asking lost the typed name and, in Import, the chosen file; ARIA 1.2 doesn't support `aria-invalid` on role `button` and jsx-a11y rejects it (owner decisions 2026-10-16) |
| D12 | New project wizard: "Create project" stays enabled when the Project ID turns out to be taken after step 1 and sends the user back to step 1 with the error instead of submitting; the photo hint reads "JPG or PNG · up to 5 MB"; a date that isn't `YYYY-MM-DD` gets "Enter a valid date" | the ID can be known taken only after step 1 when the debounced check answers after "Next" or the workspace changes while the dialog is open; a disabled button on step 4 would hide the reason, which sits on step 1, and the redirect matches the spec's conflict-on-submit rule. A native date input accepts a five-digit year, which `parseISO` can't read and the date formatting would later fail on (owner decisions 2026-10-16) |
| D13 | New project wizard: Project type gets a first option "None" (the empty value); completed stepper buttons are named "{label}, completed" | the type is optional, but once a type was picked it could not be cleared without closing the dialog; the completed state showed only in the decorative check marker (owner decisions 2026-10-16) |

---

## 11. Later phases (not in this spec)

Supabase backend (Phase 2) · schedule file parsing and the Gantt view · project dashboard KPIs · project files · schedule library and templates · sharing UI · team members and invitations · billing · notifications · Turkish localization.
