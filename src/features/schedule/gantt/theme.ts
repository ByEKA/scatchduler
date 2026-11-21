export interface GanttTheme {
  card: string;
  foreground: string;
  mutedForeground: string;
  accent: string;
  border: string;
  bar: string;
  barProgress: string;
  critical: string;
  criticalProgress: string;
  summary: string;
  milestone: string;
  link: string;
  linkDriving: string;
  weekend: string;
  statusLine: string;
  todayLine: string;
  gridLine: string;
}

const TOKEN_NAMES: Record<keyof GanttTheme, string> = {
  card: '--card',
  foreground: '--foreground',
  mutedForeground: '--muted-foreground',
  accent: '--accent',
  border: '--border',
  bar: '--gantt-bar',
  barProgress: '--gantt-bar-progress',
  critical: '--gantt-critical',
  criticalProgress: '--gantt-critical-progress',
  summary: '--gantt-summary',
  milestone: '--gantt-milestone',
  link: '--gantt-link',
  linkDriving: '--gantt-link-driving',
  weekend: '--gantt-weekend',
  statusLine: '--gantt-status-line',
  todayLine: '--gantt-today-line',
  gridLine: '--gantt-grid-line',
};

/**
 * Reads all Gantt and grid color tokens from CSS custom properties on `root` (defaults to
 * `document.documentElement`). Contains zero hard-coded hex literals (spec §7.3, S10).
 */
export function readGanttTheme(root?: Element): GanttTheme {
  const target =
    root ?? (typeof document !== 'undefined' ? document.documentElement : undefined);
  const style =
    target && typeof getComputedStyle === 'function' ? getComputedStyle(target) : null;

  const read = (token: string): string => {
    const val = style?.getPropertyValue(token).trim();
    return val && val.length > 0 ? val : `var(${token})`;
  };

  return {
    card: read(TOKEN_NAMES.card),
    foreground: read(TOKEN_NAMES.foreground),
    mutedForeground: read(TOKEN_NAMES.mutedForeground),
    accent: read(TOKEN_NAMES.accent),
    border: read(TOKEN_NAMES.border),
    bar: read(TOKEN_NAMES.bar),
    barProgress: read(TOKEN_NAMES.barProgress),
    critical: read(TOKEN_NAMES.critical),
    criticalProgress: read(TOKEN_NAMES.criticalProgress),
    summary: read(TOKEN_NAMES.summary),
    milestone: read(TOKEN_NAMES.milestone),
    link: read(TOKEN_NAMES.link),
    linkDriving: read(TOKEN_NAMES.linkDriving),
    weekend: read(TOKEN_NAMES.weekend),
    statusLine: read(TOKEN_NAMES.statusLine),
    todayLine: read(TOKEN_NAMES.todayLine),
    gridLine: read(TOKEN_NAMES.gridLine),
  };
}
