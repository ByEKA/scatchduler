import type { ReactElement } from 'react';

/** Shown instead of the app when the data layer can't be built, e.g. a wrong VITE_* setting. */
export function StartupError({ message }: { message: string }): ReactElement {
  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <p className="max-w-md text-center text-sm">{message}</p>
    </main>
  );
}
