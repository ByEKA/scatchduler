import { createContext, useContext } from 'react';
import type { ReactElement, ReactNode } from 'react';
import type { DataLayer } from '@/data';
import type { AuthService } from '@/data/auth';
import type { DataRepository } from '@/data/repository';

const DataLayerContext = createContext<DataLayer | null>(null);

/** Hands the repository and auth service to the hooks below it; tests pass a fake layer here. */
export function DataLayerProvider({
  value,
  children,
}: {
  value: DataLayer;
  children: ReactNode;
}): ReactElement {
  return <DataLayerContext value={value}>{children}</DataLayerContext>;
}

function useDataLayer(hookName: string): DataLayer {
  const context = useContext(DataLayerContext);
  if (!context) {
    throw new Error(`${hookName} must be used inside DataLayerProvider`);
  }
  return context;
}

export function useRepository(): DataRepository {
  return useDataLayer('useRepository').repository;
}

export function useAuthService(): AuthService {
  return useDataLayer('useAuthService').auth;
}
