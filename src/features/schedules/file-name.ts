// A leaf module: codes.ts and schedule-schema.ts both use it, and schedule-schema.ts imports
// codes.ts, so living in either would make an import cycle.

/** The file name without its last extension and outer spaces: "Baseline.v2.XER" → "Baseline.v2". */
export function scheduleNameFromFile(fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  // In ".xer" the only dot starts the name, so there is no extension to drop.
  return (dot > 0 ? fileName.slice(0, dot) : fileName).trim();
}
