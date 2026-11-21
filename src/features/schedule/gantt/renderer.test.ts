// @vitest-environment node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createRecordingDraw2D } from '@/features/schedule/gantt/draw2d';
import {
  GANTT_ROW_HEIGHT,
  renderGantt,
  renderTimescaleHeader,
  type GanttRow,
  type GanttScene,
} from '@/features/schedule/gantt/renderer';
import type { GanttTheme } from '@/features/schedule/gantt/theme';
import { createTimescale } from '@/features/schedule/gantt/timescale';
import { civilDaysFromYmd, dayOfWeekFromDays, MINUTES_PER_DAY } from '@/lib/civil-date';

const TEST_THEME: GanttTheme = {
  card: 'var(--card)',
  foreground: 'var(--foreground)',
  mutedForeground: 'var(--muted-foreground)',
  accent: 'var(--accent)',
  border: 'var(--border)',
  bar: 'var(--gantt-bar)',
  barProgress: 'var(--gantt-bar-progress)',
  critical: 'var(--gantt-critical)',
  criticalProgress: 'var(--gantt-critical-progress)',
  summary: 'var(--gantt-summary)',
  milestone: 'var(--gantt-milestone)',
  link: 'var(--gantt-link)',
  linkDriving: 'var(--gantt-link-driving)',
  weekend: 'var(--gantt-weekend)',
  statusLine: 'var(--gantt-status-line)',
  todayLine: 'var(--gantt-today-line)',
  gridLine: 'var(--gantt-grid-line)',
};

const origin = civilDaysFromYmd(2026, 1, 5) * MINUTES_PER_DAY; // Mon Jan 5, 2026

function isWeekend(dayMinute: number): boolean {
  const dow = dayOfWeekFromDays(Math.floor(dayMinute / MINUTES_PER_DAY));
  return dow === 0 || dow === 6;
}

describe('Gantt headless renderer (S10, S12)', () => {
  it('draws task bars, progress fill, critical coloring, milestones, WBS brackets, LOE bars, weekends, status and today lines', () => {
    const rows: GanttRow[] = [
      {
        key: 'wbs:w1',
        kind: 'wbs',
        activityType: null,
        start: origin,
        finish: origin + 10 * MINUTES_PER_DAY,
        progressFinish: null,
        isCritical: true,
        isNearCritical: false,
        label: 'Phase 1',
      },
      {
        key: 'act:a1',
        kind: 'activity',
        activityType: 'task',
        start: origin,
        finish: origin + 5 * MINUTES_PER_DAY,
        progressFinish: origin + 2 * MINUTES_PER_DAY,
        isCritical: true,
        isNearCritical: false,
        label: 'Excavation',
      },
      {
        key: 'act:a2',
        kind: 'activity',
        activityType: 'finish_milestone',
        start: origin + 5 * MINUTES_PER_DAY,
        finish: origin + 5 * MINUTES_PER_DAY,
        progressFinish: null,
        isCritical: false,
        isNearCritical: false,
        label: 'Handover',
      },
      {
        key: 'act:a3',
        kind: 'activity',
        activityType: 'level_of_effort',
        start: origin,
        finish: origin + 8 * MINUTES_PER_DAY,
        progressFinish: null,
        isCritical: false,
        isNearCritical: false,
        label: 'Site supervision',
      },
    ];

    const scene: GanttScene = {
      rows,
      links: [],
      timescale: createTimescale('day', origin),
      scrollTop: 0,
      scrollLeft: 0,
      statusMinute: origin + 3 * MINUTES_PER_DAY,
      todayMinute: origin + 4 * MINUTES_PER_DAY,
      nonWorkingDays: isWeekend,
      show: { critical: true, links: true, drivingPath: null },
      selectedKey: 'act:a1',
      theme: TEST_THEME,
    };

    const draw = createRecordingDraw2D(640, 320);
    renderGantt(draw, scene);

    // Weekend band drawn
    expect(draw.calls.some((c) => c.op === 'fillRect' && c.args[4] === TEST_THEME.weekend)).toBe(
      true,
    );
    // Selected row accent drawn
    expect(draw.calls.some((c) => c.op === 'fillRect' && c.args[4] === TEST_THEME.accent)).toBe(
      true,
    );
    // Critical task bar + progress fill
    expect(draw.calls.some((c) => c.op === 'fillRect' && c.args[4] === TEST_THEME.critical)).toBe(
      true,
    );
    expect(
      draw.calls.some((c) => c.op === 'fillRect' && c.args[4] === TEST_THEME.criticalProgress),
    ).toBe(true);
    // Milestone 4-point diamond polygon
    expect(
      draw.calls.some(
        (c) =>
          c.op === 'fillPolygon' &&
          Array.isArray(c.args[0]) &&
          (c.args[0] as unknown[]).length === 4 &&
          c.args[1] === TEST_THEME.milestone,
      ),
    ).toBe(true);
    // WBS summary bracket end-caps
    expect(
      draw.calls.some((c) => c.op === 'fillPolygon' && c.args[1] === TEST_THEME.summary),
    ).toBe(true);
    // Status line (solid) and today line (dashed)
    expect(draw.calls.some((c) => c.op === 'line' && c.args[4] === TEST_THEME.statusLine)).toBe(
      true,
    );
    expect(
      draw.calls.some(
        (c) =>
          c.op === 'line' &&
          c.args[4] === TEST_THEME.todayLine &&
          Array.isArray((c.args[5] as { dash?: number[] } | undefined)?.dash),
      ),
    ).toBe(true);

    // Turning off show.critical switches critical task bar back to standard theme.bar
    const nonCritDraw = createRecordingDraw2D(640, 320);
    renderGantt(nonCritDraw, { ...scene, show: { ...scene.show, critical: false } });
    expect(
      nonCritDraw.calls.some((c) => c.op === 'fillRect' && c.args[4] === TEST_THEME.critical),
    ).toBe(false);
    expect(
      nonCritDraw.calls.some((c) => c.op === 'fillRect' && c.args[4] === TEST_THEME.bar),
    ).toBe(true);

    // Header renders two tiers cleanly
    const headerDraw = createRecordingDraw2D(640, 44);
    renderTimescaleHeader(headerDraw, scene.timescale, 0, TEST_THEME);
    expect(headerDraw.calls.some((c) => c.op === 'text' && c.args[2] === 'Jan 2026')).toBe(true);
  });

  it('culls 10,000 rows to the visible viewport in O(viewport rows)', () => {
    const rows: GanttRow[] = [];
    for (let i = 0; i < 10_000; i++) {
      rows.push({
        key: `act:${i}`,
        kind: 'activity',
        activityType: 'task',
        start: origin + (i % 20) * MINUTES_PER_DAY,
        finish: origin + ((i % 20) + 5) * MINUTES_PER_DAY,
        progressFinish: null,
        isCritical: i % 10 === 0,
        isNearCritical: false,
        label: `Activity ${i}`,
      });
    }

    const draw = createRecordingDraw2D(800, 10 * GANTT_ROW_HEIGHT);
    renderGantt(draw, {
      rows,
      links: [],
      timescale: createTimescale('week', origin),
      scrollTop: 5000 * GANTT_ROW_HEIGHT,
      scrollLeft: 0,
      statusMinute: null,
      todayMinute: null,
      nonWorkingDays: isWeekend,
      show: { critical: true, links: true, drivingPath: null },
      selectedKey: null,
      theme: TEST_THEME,
    });

    expect(draw.calls.length).toBeLessThan(200);
  });

  it('contains zero hard-coded hex color literals in renderer.ts and theme.ts (S10)', () => {
    const rendererSrc = readFileSync(
      resolve(process.cwd(), 'src/features/schedule/gantt/renderer.ts'),
      'utf8',
    );
    const themeSrc = readFileSync(
      resolve(process.cwd(), 'src/features/schedule/gantt/theme.ts'),
      'utf8',
    );
    expect(rendererSrc).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(themeSrc).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });
});
