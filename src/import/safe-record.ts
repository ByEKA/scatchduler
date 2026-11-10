// Records keyed by names from a file have no prototype, so a name such as "__proto__" or
// "constructor" is an ordinary key (P3 core spec §5.11).
export function createRecord<T>(): Record<string, T> {
  return Object.create(null) as Record<string, T>;
}
