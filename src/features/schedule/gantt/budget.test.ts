// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createRecordingDraw2D } from '@/features/schedule/gantt/draw2d';
import {
  GANTT_ROW_HEIGHT,
  renderGantt,
  type GanttLink,
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

describe('Gantt render frame budget (S6, V7)', () => {
  it('renders 10,000 rows and 15,000 links in < 16 ms median frame time', () => {
    const origin = civilDaysFromYmd(2026, 1, 5) * MINUTES_PER_DAY;
    const rows: GanttRow[] = [];
    const links: GanttLink[] = [];

    for (let i = 0; i < 10_000; i++) {
      const start = origin + (i % 60) * MINUTES_PER_DAY;
      const finish = start + 5 * MINUTES_PER_DAY;
      rows.push({
        key: `act:${i}`,
        kind: 'activity',
        activityType: 'task',
        start,
        finish,
        progressFinish: i % 3 === 0 ? start + 2 * MINUTES_PER_DAY : null,
        isCritical: i % 10 === 0,
        isNearCritical: false,
        label: `Activity ${i}`,
      });
    }

    for (let i = 0; i < 15_000; i++) {
      const fromRow = i % 9998;
      const toRow = fromRow + 1 + (i % 2);
      links.push({
        id: `r${i}`,
        fromRow,
        toRow,
        type: 'FS',
        fromMinute: rows[fromRow]!.finish!,
        toMinute: rows[toRow]!.start!,
        isDriving: i % 4 === 0,
        isCritical: i % 10 === 0,
      });
    }

    const timescale = createTimescale('week', origin);
    const nonWorkingDays = (dayMinute: number) => {
      const dow = dayOfWeekFromDays(Math.floor(dayMinute / MINUTES_PER_DAY));
      return dow === 0 || dow === 6;
    };

    const samples: number[] = [];
    for (let frame = 0; frame < 10; frame++) {
      const draw = createRecordingDraw2D(1200, 720);
      const scene: GanttScene = {
        rows,
        links,
        timescale,
        scrollTop: frame * 900 * GANTT_ROW_HEIGHT,
        scrollLeft: 0,
        statusMinute: origin + 10 * MINUTES_PER_DAY,
        todayMinute: origin + 12 * MINUTES_PER_DAY,
        nonWorkingDays,
        show: { critical: true, links: true, drivingPath: null },
        selectedKey: `act:${frame * 900}`,
        theme: TEST_THEME,
      };
      const t0 = performance.now();
      renderGantt(draw, scene);
      samples.push(performance.now() - t0);
    }

    samples.sort((a, b) => a - b);
    const medianMs = samples[Math.floor(samples.length / 2)]!;
    expect(medianMs).toBeLessThan(16);
  });
});
