// matchMedia for jsdom, which has none. Until a test calls mockViewport, no query matches; the
// setup file installs that state and restores it after each test.

type ChangeListener = (event: MediaQueryListEvent) => void;

interface TrackedQuery {
  list: MediaQueryList;
  listeners: Set<ChangeListener>;
  matches: boolean;
}

let viewportWidth: number | null = null;
const trackedQueries = new Set<TrackedQuery>();

/** Evaluates `(min-width: Npx)` and `(max-width: Npx)` conditions, joined with `and`. */
function evaluate(query: string): boolean {
  const width = viewportWidth;
  if (width === null) return false;
  const conditions = [...query.matchAll(/\((min|max)-width:\s*(\d+(?:\.\d+)?)px\)/g)];
  if (conditions.length === 0) return false;
  return conditions.every(([, bound, value]) =>
    bound === 'min' ? width >= Number(value) : width <= Number(value),
  );
}

function matchMedia(query: string): MediaQueryList {
  const listeners = new Set<ChangeListener>();
  const list: MediaQueryList = {
    media: query,
    get matches() {
      return evaluate(query);
    },
    onchange: null,
    addListener: (listener) => {
      if (listener) listeners.add(listener);
    },
    removeListener: (listener) => {
      if (listener) listeners.delete(listener);
    },
    addEventListener: (type: string, listener: unknown) => {
      if (type === 'change' && typeof listener === 'function') {
        listeners.add(listener as ChangeListener);
      }
    },
    removeEventListener: (type: string, listener: unknown) => {
      if (type === 'change' && typeof listener === 'function') {
        listeners.delete(listener as ChangeListener);
      }
    },
    dispatchEvent: () => false,
  };
  trackedQueries.add({ list, listeners, matches: evaluate(query) });
  return list;
}

/** Makes matchMedia answer width queries for a viewport `width` px wide and notifies listeners. */
export function mockViewport(width: number): void {
  viewportWidth = width;
  window.matchMedia = matchMedia;
  for (const tracked of trackedQueries) {
    const matches = evaluate(tracked.list.media);
    if (matches === tracked.matches) continue;
    tracked.matches = matches;
    const event = new Event('change') as MediaQueryListEvent;
    Object.assign(event, { matches, media: tracked.list.media });
    tracked.listeners.forEach((listener) => listener.call(tracked.list, event));
    tracked.list.onchange?.call(tracked.list, event);
  }
}

/** Back to a matchMedia where no query matches; queries created earlier are forgotten. */
export function resetViewport(): void {
  viewportWidth = null;
  trackedQueries.clear();
  window.matchMedia = matchMedia;
}
