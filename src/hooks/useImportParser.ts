import { createContext, useContext, useEffect, useMemo } from 'react';
import { createImportClient, ImportClientError, type ImportClient } from '@/import/client';

// The import dialog's parser (P3 core spec §4.4, §5.3). Components never import src/import (S7);
// they take the client and its types from here. Tests provide a fake or an in-thread client
// through ImportClientFactoryContext.

export type { ImportClient } from '@/import/client';
export type { AnalyzeOutcome, InspectOutcome, TablePreview } from '@/import/protocol';

export const ImportClientFactoryContext = createContext<() => ImportClient>(() =>
  createImportClient(),
);

interface LazyImportClient extends ImportClient {
  /** Mounted, again after a `dispose` in StrictMode's second effect run: requests may run. */
  open(): void;
}

/** A client created by `factory` on its first request, so rendering never starts a worker. */
function lazyImportClient(factory: () => ImportClient): LazyImportClient {
  let client: ImportClient | null = null;
  let closed = false;
  const run = <T>(request: (current: ImportClient) => Promise<T>): Promise<T> => {
    if (closed) return Promise.reject(new ImportClientError('cancelled'));
    client ??= factory();
    return request(client);
  };
  return {
    inspect: (file) => run((current) => current.inspect(file)),
    preview: (table, encoding) => run((current) => current.preview(table, encoding)),
    analyze: (mapping, options) => run((current) => current.analyze(mapping, options)),
    pack: (report) => run((current) => current.pack(report)),
    cancel: () => client?.cancel(),
    dispose: () => {
      closed = true;
      client?.dispose();
      client = null;
    },
    open: () => {
      closed = false;
    },
  };
}

/**
 * One parser client for the calling component: a stable object whose methods create the client
 * (and its worker) on first use, disposed when the component unmounts, which terminates the
 * worker and drops any answer still on its way.
 */
export function useImportParser(): ImportClient {
  const factory = useContext(ImportClientFactoryContext);
  const parser = useMemo(() => lazyImportClient(factory), [factory]);
  useEffect(() => {
    parser.open();
    return () => parser.dispose();
  }, [parser]);
  return parser;
}
