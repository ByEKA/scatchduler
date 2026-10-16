import { Navigate } from 'react-router';
import type { RouteObject } from 'react-router';
import { RequireAuth } from '@/auth/RequireAuth';
import { PlaceholderPage } from '@/components/common/PlaceholderPage';
import { ProjectPlaceholderPage } from '@/components/common/ProjectPlaceholderPage';
import { AppShell } from '@/components/layout/AppShell';
import { HomePage } from '@/pages/HomePage';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { SignInPage } from '@/pages/SignInPage';

// Route table (spec §4.4). Every route except /sign-in sits under RequireAuth and AppShell,
// unknown paths included.
export const appRoutes: RouteObject[] = [
  { path: '/sign-in', element: <SignInPage /> },
  {
    path: '/',
    element: (
      <RequireAuth>
        <AppShell />
      </RequireAuth>
    ),
    children: [
      { index: true, element: <Navigate to="/home" replace /> },
      { path: 'home', element: <HomePage /> },
      { path: 'library', element: <PlaceholderPage title="Library" /> },
      { path: 'assets', element: <PlaceholderPage title="Assets" /> },
      { path: 'w/:workspaceId/projects', element: <PlaceholderPage title="Projects" /> },
      {
        path: 'w/:workspaceId/p/:projectId/files',
        element: <ProjectPlaceholderPage section="Files" />,
      },
      {
        path: 'w/:workspaceId/p/:projectId/dashboard',
        element: <ProjectPlaceholderPage section="Dashboard" />,
      },
      {
        path: 'w/:workspaceId/p/:projectId/schedule',
        element: <ProjectPlaceholderPage section="Schedule" />,
      },
      { path: 'settings/profile', element: <PlaceholderPage title="Profile" /> },
      { path: 'settings/billing', element: <PlaceholderPage title="Billing" /> },
      { path: 'help/sharing', element: <PlaceholderPage title="Sharing" /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];
