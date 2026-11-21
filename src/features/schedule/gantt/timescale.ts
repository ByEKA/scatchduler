import {
  civilDaysFromYmd,
  dayOfWeekFromDays,
  isoWeekNumber,
  MINUTES_PER_DAY,
  ymdFromCivilDays,
} from '@/lib/civil-date';

export type GanttZoom = 'day' | 'week' | 'month' | 'quarter';

export const PX_PER_DAY: Record<GanttZoom, number> = {
  day: 32,
  week: 12,
  month: 3,
  quarter: 1,
};

export interface TimescaleCell {
  x: number;
  width: number;
  label: string;
}

export interface Timescale {
  zoom: GanttZoom;
  originMinute: number;
  pxPerDay: number;
  x(minute: number): number;
  minuteAt(x: number): number;
  tiers(fromX: number, toX: number): [TimescaleCell[], TimescaleCell[]];
}

const MONTH_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/**
 * Pure timezone-independent Gantt timescale mapping civil minutes ↔ viewport pixels across
 * four zoom levels (`day`, `week`, `month`, `quarter`) with two-tier header cells.
 */
export function createTimescale(zoom: GanttZoom, originMinute: number): Timescale {
  const pxPerDay = PX_PER_DAY[zoom];

  const x = (minute: number): number => ((minute - originMinute) / MINUTES_PER_DAY) * pxPerDay;
  const minuteAt = (px: number): number => originMinute + (px / pxPerDay) * MINUTES_PER_DAY;

  const tiers = (fromX: number, toX: number): [TimescaleCell[], TimescaleCell[]] => {
    if (toX <= fromX) return [[], []];
    const startMinute = minuteAt(fromX);
    const endMinute = minuteAt(toX);
    const startDay = Math.floor(startMinute / MINUTES_PER_DAY);
    const endDay = Math.ceil(endMinute / MINUTES_PER_DAY);

    const top: TimescaleCell[] = [];
    const bottom: TimescaleCell[] = [];

    const buildMonthCells = (withYear: boolean): TimescaleCell[] => {
      const cells: TimescaleCell[] = [];
      const first = ymdFromCivilDays(startDay);
      let y = first.year;
      let m = first.month;
      for (;;) {
        const mStartDay = civilDaysFromYmd(y, m, 1);
        if (mStartDay >= endDay) break;
        const nextY = m === 12 ? y + 1 : y;
        const nextM = m === 12 ? 1 : m + 1;
        const mEndDay = civilDaysFromYmd(nextY, nextM, 1);
        const x1 = x(mStartDay * MINUTES_PER_DAY);
        const x2 = x(mEndDay * MINUTES_PER_DAY);
        cells.push({
          x: x1,
          width: x2 - x1,
          label: withYear ? `${MONTH_SHORT[m - 1]!} ${y}` : MONTH_SHORT[m - 1]!,
        });
        y = nextY;
        m = nextM;
      }
      return cells;
    };

    const buildYearCells = (): TimescaleCell[] => {
      const cells: TimescaleCell[] = [];
      const first = ymdFromCivilDays(startDay);
      const last = ymdFromCivilDays(Math.max(startDay, endDay - 1));
      for (let y = first.year; y <= last.year; y++) {
        const yStart = civilDaysFromYmd(y, 1, 1);
        const yEnd = civilDaysFromYmd(y + 1, 1, 1);
        const x1 = x(yStart * MINUTES_PER_DAY);
        const x2 = x(yEnd * MINUTES_PER_DAY);
        cells.push({ x: x1, width: x2 - x1, label: String(y) });
      }
      return cells;
    };

    if (zoom === 'day') {
      top.push(...buildMonthCells(true));
      for (let d = startDay; d < endDay; d++) {
        const { day } = ymdFromCivilDays(d);
        const x1 = x(d * MINUTES_PER_DAY);
        const x2 = x((d + 1) * MINUTES_PER_DAY);
        bottom.push({ x: x1, width: x2 - x1, label: pad2(day) });
      }
      return [top, bottom];
    }

    if (zoom === 'week') {
      top.push(...buildMonthCells(true));
      // Align bottom tier to Monday (ISO week start).
      const dow = dayOfWeekFromDays(startDay);
      const offsetToMonday = dow === 0 ? -6 : 1 - dow;
      for (let d = startDay + offsetToMonday; d < endDay; d += 7) {
        const x1 = x(d * MINUTES_PER_DAY);
        const x2 = x((d + 7) * MINUTES_PER_DAY);
        bottom.push({
          x: x1,
          width: x2 - x1,
          label: `W${pad2(isoWeekNumber(d))}`,
        });
      }
      return [top, bottom];
    }

    if (zoom === 'month') {
      top.push(...buildYearCells());
      bottom.push(...buildMonthCells(false));
      return [top, bottom];
    }

    // Quarter zoom
    top.push(...buildYearCells());
    const first = ymdFromCivilDays(startDay);
    let y = first.year;
    let q = Math.floor((first.month - 1) / 3); // 0..3
    for (;;) {
      const qStartMonth = q * 3 + 1;
      const qStartDay = civilDaysFromYmd(y, qStartMonth, 1);
      if (qStartDay >= endDay) break;
      const nextQ = q === 3 ? 0 : q + 1;
      const nextY = q === 3 ? y + 1 : y;
      const qEndDay = civilDaysFromYmd(nextY, nextQ * 3 + 1, 1);
      const x1 = x(qStartDay * MINUTES_PER_DAY);
      const x2 = x(qEndDay * MINUTES_PER_DAY);
      bottom.push({ x: x1, width: x2 - x1, label: `Q${q + 1}` });
      y = nextY;
      q = nextQ;
    }
    return [top, bottom];
  };

  return { zoom, originMinute, pxPerDay, x, minuteAt, tiers };
}
