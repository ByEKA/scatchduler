import { Navigate, Outlet } from 'react-router';
import type { RouteObject } from 'react-router';
import { RequireAuth } from '@/auth/RequireAuth';
import { HomePage } from '@/pages/HomePage';
import { SignInPage } from '@/pages/SignInPage';

// Route table (spec §4.4). Every route except /sign-in sits under RequireAuth.
export const appRoutes: RouteObject[] = [
  { path: '/sign-in', element: <SignInPage /> },
  {
    path: '/',
    element: (
      <RequireAuth>
        <Outlet />
      </RequireAuth>
    ),
    children: [
      { index: true, element: <Navigate to="/home" replace /> },
      { path: 'home', element: <HomePage /> },
    ],
  },
];
