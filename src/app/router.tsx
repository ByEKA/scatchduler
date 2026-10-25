import { Navigate } from 'react-router';
import type { RouteObject } from 'react-router';
import { RequireAuth } from '@/auth/RequireAuth';
import { PlaceholderPage } from '@/components/common/PlaceholderPage';
import { ProjectPlaceholderPage } from '@/components/common/ProjectPlaceholderPage';
import { AppShell } from '@/components/layout/AppShell';
import { AcceptInvitePage } from '@/pages/AcceptInvitePage';
import { AuthCallbackPage } from '@/pages/AuthCallbackPage';
import { ForgotPasswordPage } from '@/pages/ForgotPasswordPage';
import { HomePage } from '@/pages/HomePage';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { ResetPasswordPage } from '@/pages/ResetPasswordPage';
import { SignInPage } from '@/pages/SignInPage';

// Route table (spec §4.4, P2 spec §5.4). The auth pages sit outside RequireAuth and AppShell;
// every other route sits under them, unknown paths included.
export const appRoutes: RouteObject[] = [
  { path: '/sign-in', element: <SignInPage /> },
  { path: '/forgot-password', element: <ForgotPasswordPage /> },
  { path: '/reset-password', element: <ResetPasswordPage /> },
  { path: '/accept-invite', element: <AcceptInvitePage /> },
  { path: '/auth/callback', element: <AuthCallbackPage /> },
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
