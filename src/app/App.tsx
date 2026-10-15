import { QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import type { ReactElement } from 'react';
import { createBrowserRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { createQueryClient } from '@/app/queryClient';
import { appRoutes } from '@/app/router';
import { AuthProvider } from '@/auth/AuthProvider';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { DataLayer } from '@/data';
import { DataLayerProvider } from '@/data/DataLayerProvider';
import { ThemeProvider } from '@/hooks/useTheme';

// Created once for the page's lifetime; a router built during render would add a history
// listener on every StrictMode double render.
const router = createBrowserRouter(appRoutes);

/** Providers in the order of spec §4.3, then the router and the toast region. */
export function App({ dataLayer }: { dataLayer: DataLayer }): ReactElement {
  const [queryClient] = useState(() => createQueryClient());
  return (
    <ThemeProvider>
      <DataLayerProvider value={dataLayer}>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <TooltipProvider>
              <RouterProvider router={router} />
              <Toaster />
            </TooltipProvider>
          </AuthProvider>
        </QueryClientProvider>
      </DataLayerProvider>
    </ThemeProvider>
  );
}
