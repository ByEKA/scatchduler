import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { render, type RenderResult } from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import { useEffect, useState } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { createMemoryRouter, MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { createQueryClient } from '@/app/queryClient';
import { appRoutes } from '@/app/router';
import { AuthProvider } from '@/auth/AuthProvider';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { DataLayer } from '@/data';
import { DataLayerProvider } from '@/data/DataLayerProvider';
import { DialogHost } from '@/features/dialogs/DialogHost';
import {
  DialogsProvider,
  useDialogs,
  type DialogKind,
  type DialogOptions,
} from '@/features/dialogs/DialogsProvider';
import { CurrentContextProvider } from '@/hooks/useCurrentContext';
import { SidebarStateProvider } from '@/hooks/useSidebarState';
import { ThemeProvider } from '@/hooks/useTheme';
import { createTestDataLayer, type TestDataLayer } from '@/test/fakes';

/** A `renderHook` wrapper: the data layer and a fresh test QueryClient, nothing else. */
export function createQueryWrapper(
  dataLayer: DataLayer,
): (props: { children: ReactNode }) => ReactElement {
  const queryClient = createQueryClient({ test: true });
  return function QueryWrapper({ children }) {
    return (
      <DataLayerProvider value={dataLayer}>
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      </DataLayerProvider>
    );
  };
}

/** The router location, for tests that check where a click navigated. */
function LocationDisplay() {
  const { pathname, search } = useLocation();
  return (
    <div hidden data-testid="location">
      {pathname}
      {search}
    </div>
  );
}

/** The open dialog's kind, or "none", for tests that check what a click opened or closed. */
function DialogStateProbe() {
  const { active } = useDialogs();
  return (
    <div hidden data-testid="dialog">
      {active?.kind ?? 'none'}
    </div>
  );
}

/** Opens a dialog once, on mount. Render it as the `ui` of `renderWithProviders`. */
export function OpenDialog({ kind, options }: { kind: DialogKind; options?: DialogOptions }): null {
  const { openDialog } = useDialogs();
  // The props as they were on mount, so a re-render never opens the dialog again.
  const [request] = useState(() => ({ kind, options }));
  useEffect(() => {
    openDialog(request.kind, request.options);
  }, [openDialog, request]);
  return null;
}

export interface RenderWithProvidersOptions {
  /** The starting URL; `/` by default. */
  route?: string;
  /** Route pattern that renders `ui`; other URLs render nothing. Unset: `ui` renders on any URL. */
  path?: string;
  dataLayer?: TestDataLayer;
}

export function renderWithProviders(
  ui: ReactElement,
  options: RenderWithProvidersOptions = {},
): RenderResult & { user: UserEvent; dataLayer: TestDataLayer; queryClient: QueryClient } {
  const { route = '/', path, dataLayer = createTestDataLayer() } = options;
  const queryClient = createQueryClient({ test: true });
  const user = userEvent.setup({ applyAccept: false });
  const result = render(
    <ThemeProvider>
      <DataLayerProvider value={dataLayer}>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <TooltipProvider>
              {/* Without useTransitions={false}, MemoryRouter wraps location updates in
                  startTransition. A navigation that follows an awaited save then renders after
                  the toast, which sonner flushes at once, so the URL still reads the old page
                  when the toast shows. */}
              <MemoryRouter initialEntries={[route]} useTransitions={false}>
                <CurrentContextProvider>
                  <SidebarStateProvider>
                    <DialogsProvider>
                      <Routes>
                        {path === undefined ? (
                          <Route path="*" element={ui} />
                        ) : (
                          <>
                            <Route path={path} element={ui} />
                            <Route path="*" element={null} />
                          </>
                        )}
                      </Routes>
                      <DialogHost />
                      <DialogStateProbe />
                    </DialogsProvider>
                  </SidebarStateProvider>
                </CurrentContextProvider>
                <LocationDisplay />
              </MemoryRouter>
              <Toaster />
            </TooltipProvider>
          </AuthProvider>
        </QueryClientProvider>
      </DataLayerProvider>
    </ThemeProvider>,
  );
  return { ...result, user, dataLayer, queryClient };
}

/**
 * The whole app at `route`: the real route table in a memory router, under the providers of
 * `App` (spec §4.3) with a test QueryClient.
 */
export function renderApp(
  route: string,
  options: { dataLayer?: TestDataLayer } = {},
): RenderResult & {
  user: UserEvent;
  dataLayer: TestDataLayer;
  router: ReturnType<typeof createMemoryRouter>;
} {
  const { dataLayer = createTestDataLayer() } = options;
  const queryClient = createQueryClient({ test: true });
  const router = createMemoryRouter(appRoutes, { initialEntries: [route] });
  const user = userEvent.setup({ applyAccept: false });
  const result = render(
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
    </ThemeProvider>,
  );
  return { ...result, user, dataLayer, router };
}
