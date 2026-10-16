import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react';
import type { ReactElement, ReactNode } from 'react';
import { useMatch, useNavigate } from 'react-router';
import type { ID, ProjectSummary, WorkspaceSummary } from '@/data/types';
import { useWorkspaceProjects } from '@/hooks/useProjects';
import { useWorkspaces } from '@/hooks/useWorkspaces';
import { readKey, writeKey } from '@/lib/storage';

export interface CurrentContextValue {
  status: 'loading' | 'ready' | 'error';
  /** While status is 'error': the error of the list that never loaded. Otherwise null. */
  error: unknown;
  workspaces: WorkspaceSummary[];
  workspace: WorkspaceSummary | null;
  /** Projects of the current workspace, updatedAt descending. */
  projects: ProjectSummary[];
  project: ProjectSummary | null;
  setWorkspace(id: ID): void;
  setProject(id: ID): void;
  /** Refetches the workspaces and the current workspace's projects. */
  retry(): void;
}

const LAST_WORKSPACE_KEY = 'ui.lastWorkspaceId';

function lastProjectKey(workspaceId: ID): string {
  return `ui.lastProjectId.${workspaceId}`;
}

/**
 * The remembered workspace and project ids as an external store. Values are kept in memory and
 * written through storage.ts, so a choice still holds for the session when the browser blocks
 * storage. Subscribers re-render when a value changes, including writes made from an effect.
 */
interface RememberedIds {
  subscribe(listener: () => void): () => void;
  get(key: string): string | null;
  set(key: string, value: string): void;
}

function createRememberedIds(): RememberedIds {
  const values = new Map<string, string | null>();
  const listeners = new Set<() => void>();
  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    get(key) {
      if (!values.has(key)) values.set(key, readKey(key));
      return values.get(key) ?? null;
    },
    set(key, value) {
      if (values.get(key) === value) return;
      values.set(key, value);
      writeKey(key, value);
      listeners.forEach((listener) => listener());
    },
  };
}

const CurrentContext = createContext<CurrentContextValue | null>(null);

/**
 * Resolves the current workspace and project (spec §4.5) from the URL, then the remembered ids,
 * then the defaults. Ids that don't match a loaded workspace or project are skipped.
 */
export function CurrentContextProvider({ children }: { children: ReactNode }): ReactElement {
  const navigate = useNavigate();
  // useMatch works from a layout route, where useParams() would not see the child route's params.
  const workspaceMatch = useMatch('/w/:workspaceId/*');
  const projectMatch = useMatch('/w/:workspaceId/p/:projectId/*');
  const sectionMatch = useMatch('/w/:workspaceId/p/:projectId/:section');
  const urlWorkspaceId = workspaceMatch?.params.workspaceId;
  const urlProjectId = projectMatch?.params.projectId;
  const section = sectionMatch?.params.section;

  const [remembered] = useState(createRememberedIds);
  const storedWorkspaceId = useSyncExternalStore(remembered.subscribe, () =>
    remembered.get(LAST_WORKSPACE_KEY),
  );

  const workspacesQuery = useWorkspaces();
  const workspaces = useMemo(() => workspacesQuery.data ?? [], [workspacesQuery.data]);
  const workspace =
    workspaces.find((w) => w.id === urlWorkspaceId) ??
    workspaces.find((w) => w.id === storedWorkspaceId) ??
    workspaces.find((w) => w.kind === 'personal') ??
    null;
  const workspaceId = workspace?.id;

  const storedProjectId = useSyncExternalStore(remembered.subscribe, () =>
    workspaceId === undefined ? null : remembered.get(lastProjectKey(workspaceId)),
  );

  const projectsQuery = useWorkspaceProjects(workspaceId);
  const projects = useMemo(() => projectsQuery.data ?? [], [projectsQuery.data]);
  const project =
    projects.find((p) => p.id === urlProjectId) ??
    projects.find((p) => p.id === storedProjectId) ??
    projects[0] ??
    null;

  // 'error' only when a list never loaded: a failed background refetch keeps the cached data on
  // screen. A failed project list counts too; otherwise it would read as an empty workspace
  // ("Create a project first.", "No projects found").
  const workspacesFailed = workspacesQuery.isError && workspacesQuery.data === undefined;
  const projectsFailed =
    workspaceId !== undefined && projectsQuery.isError && projectsQuery.data === undefined;
  let status: CurrentContextValue['status'] = 'ready';
  let error: unknown = null;
  if (workspacesFailed || projectsFailed) {
    status = 'error';
    error = workspacesFailed ? workspacesQuery.error : projectsQuery.error;
  } else if (workspacesQuery.isPending || (workspaceId !== undefined && projectsQuery.isPending)) {
    status = 'loading';
  }

  // Remember ids that came from the URL, so pages without ids in their path open the same place.
  const urlWorkspaceToRemember = workspaceId === urlWorkspaceId ? workspaceId : undefined;
  const urlProjectToRemember =
    project !== null && project.id === urlProjectId ? project.id : undefined;
  useEffect(() => {
    if (urlWorkspaceToRemember !== undefined) {
      remembered.set(LAST_WORKSPACE_KEY, urlWorkspaceToRemember);
    }
  }, [remembered, urlWorkspaceToRemember]);
  useEffect(() => {
    if (workspaceId !== undefined && urlProjectToRemember !== undefined) {
      remembered.set(lastProjectKey(workspaceId), urlProjectToRemember);
    }
  }, [remembered, workspaceId, urlProjectToRemember]);

  const setWorkspace = useCallback(
    (id: ID) => {
      remembered.set(LAST_WORKSPACE_KEY, id);
      void navigate(`/w/${id}/projects`);
    },
    [remembered, navigate],
  );

  const setProject = useCallback(
    (id: ID) => {
      if (workspaceId === undefined) return;
      remembered.set(lastProjectKey(workspaceId), id);
      // On a project page, open the same section for the new project; elsewhere stay put.
      if (section !== undefined) void navigate(`/w/${workspaceId}/p/${id}/${section}`);
    },
    [remembered, navigate, workspaceId, section],
  );

  const { refetch: refetchWorkspaces } = workspacesQuery;
  const { refetch: refetchProjects } = projectsQuery;
  const retry = useCallback(() => {
    void refetchWorkspaces();
    // The projects query is idle (skipToken) until a workspace resolves; it can't be refetched.
    if (workspaceId !== undefined) void refetchProjects();
  }, [refetchWorkspaces, refetchProjects, workspaceId]);

  const value = useMemo(
    () => ({
      status,
      error,
      workspaces,
      workspace,
      projects,
      project,
      setWorkspace,
      setProject,
      retry,
    }),
    [status, error, workspaces, workspace, projects, project, setWorkspace, setProject, retry],
  );

  return <CurrentContext value={value}>{children}</CurrentContext>;
}

export function useCurrentContext(): CurrentContextValue {
  const context = useContext(CurrentContext);
  if (!context) {
    throw new Error('useCurrentContext must be used inside CurrentContextProvider');
  }
  return context;
}
