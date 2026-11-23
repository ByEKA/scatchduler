import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { PointerEvent, ReactElement, WheelEvent } from 'react';
import type {
  ComputedScheduleSummary,
  DrivingPath,
  ScheduleDocument,
} from '@/data/schedule-types';
import type { ScheduleCommand } from '@/features/schedule/commands';
import { formatScheduleDate, formatWorkingDays } from '@/features/schedule/format-schedule';
import {
  commitGanttDrag,
  startGanttDrag,
  updateGanttDrag,
  type GanttDragState,
} from '@/features/schedule/gantt/drag';
import { CanvasDraw2D } from '@/features/schedule/gantt/draw2d';
import {
  computeZoomToFit,
  hitTestBar,
  hitTestGanttTarget,
} from '@/features/schedule/gantt/hit-test';
import {
  GANTT_HEADER_HEIGHT,
  GANTT_ROW_HEIGHT,
  renderGantt,
  renderTimescaleHeader,
  type GanttLink,
  type GanttRow,
  type GanttScene,
} from '@/features/schedule/gantt/renderer';
import { readGanttTheme, type GanttTheme } from '@/features/schedule/gantt/theme';
import { createTimescale, type GanttZoom } from '@/features/schedule/gantt/timescale';
import type { VisibleRow } from '@/features/schedule/rows';
import {
  civilDaysFromYmd,
  dayOfWeekFromDays,
  MINUTES_PER_DAY,
  wallClockToCivilMinutes,
  ymdFromCivilDays,
} from '@/lib/civil-date';

export interface ScheduleGanttHandle {
  zoomToFit(): void;
}

export interface ScheduleGanttProps {
  rows: readonly VisibleRow[];
  document: ScheduleDocument;
  summary: ComputedScheduleSummary | null;
  selectedKey: string | null;
  showCritical: boolean;
  showLinks: boolean;
  drivingPath: DrivingPath | null;
  zoom: GanttZoom;
  mode?: 'view' | 'edit';
  onDispatch?(command: ScheduleCommand): unknown;
  onZoomChange(zoom: GanttZoom): void;
  onSelectKey(key: string | null): void;
  scrollTop: number;
  onScrollTopChange(scrollTop: number): void;
}

const ZOOM_STEPS: readonly GanttZoom[] = ['day', 'week', 'month', 'quarter'];

function todayCivilMinute(): number {
  const now = new Date();
  return civilDaysFromYmd(now.getFullYear(), now.getMonth() + 1, now.getDate()) * MINUTES_PER_DAY;
}

function defaultOriginFromRows(rows: readonly GanttRow[]): number {
  let minStart = Number.POSITIVE_INFINITY;
  for (const row of rows) {
    if (row.start !== null && row.start < minStart) minStart = row.start;
    else if (row.finish !== null && row.finish < minStart) minStart = row.finish;
  }
  if (!Number.isFinite(minStart)) {
    return todayCivilMinute() - 7 * MINUTES_PER_DAY;
  }
  return Math.floor((minStart - 2 * MINUTES_PER_DAY) / MINUTES_PER_DAY) * MINUTES_PER_DAY;
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/**
 * Interactive Canvas 2D Gantt chart with sticky two-tier timescale header, theme-reactive CSS
 * tokens, synced vertical scroll, click selection, hover tooltip, drag pan, Ctrl+Wheel zoom,
 * zoom-to-fit, and Edit-mode bar drag-and-drop & link drawing (spec §7.2, P4 later §5).
 */
export const ScheduleGantt = forwardRef<ScheduleGanttHandle, ScheduleGanttProps>(
  function ScheduleGantt(
    {
      rows,
      document: scheduleDoc,
      summary,
      selectedKey,
      showCritical,
      showLinks,
      drivingPath,
      zoom,
      mode = 'view',
      onDispatch,
      onZoomChange,
      onSelectKey,
      scrollTop,
      onScrollTopChange,
    },
    ref,
  ): ReactElement {
    const containerRef = useRef<HTMLDivElement>(null);
    const headerCanvasRef = useRef<HTMLCanvasElement>(null);
    const bodyCanvasRef = useRef<HTMLCanvasElement>(null);
    const dragRef = useRef<{
      active: boolean;
      startX: number;
      startScrollLeft: number;
      moved: boolean;
    }>({ active: false, startX: 0, startScrollLeft: 0, moved: false });

    const [size, setSize] = useState<{ width: number; height: number }>({
      width: 640,
      height: 400,
    });
    const [theme, setTheme] = useState<GanttTheme>(() => readGanttTheme());
    const [originOverride, setOriginOverride] = useState<number | null>(null);
    const [scrollLeft, setScrollLeft] = useState<number>(0);
    const [hover, setHover] = useState<{ row: VisibleRow; x: number; y: number } | null>(null);
    const [ganttDrag, setGanttDrag] = useState<GanttDragState | null>(null);
    const [cursorStyle, setCursorStyle] = useState<string>('grab');
    const editMode = mode === 'edit' && onDispatch !== undefined;

    const todayMinute = useMemo(() => todayCivilMinute(), []);

    const { ganttRows, rowsByKey, rowIndexByActId } = useMemo(() => {
      const mapped: GanttRow[] = [];
      const byKey = new Map<string, VisibleRow>();
      const byActId = new Map<string, number>();

      for (let i = 0; i < rows.length; i++) {
        const r = rows[i]!;
        byKey.set(r.key, r);
        if (r.kind === 'activity') byActId.set(r.id, i);

        const startMin = wallClockToCivilMinutes(r.start);
        const finishMin = wallClockToCivilMinutes(r.finish);
        let progressFinish: number | null = null;
        if (
          r.kind === 'activity' &&
          startMin !== null &&
          finishMin !== null &&
          finishMin > startMin &&
          r.percentComplete !== null &&
          r.percentComplete > 0
        ) {
          progressFinish =
            startMin + Math.round(((finishMin - startMin) * Math.min(100, r.percentComplete)) / 100);
        }

        mapped.push({
          key: r.key,
          kind: r.kind,
          activityType: r.activityType,
          start: startMin,
          finish: finishMin,
          progressFinish,
          isCritical: r.isCritical,
          isNearCritical: r.isNearCritical,
          label: r.name,
        });
      }

      return { ganttRows: mapped, rowsByKey: byKey, rowIndexByActId: byActId };
    }, [rows]);

    const ganttLinks = useMemo<GanttLink[]>(() => {
      if (!showLinks || scheduleDoc.relationships.length === 0) return [];
      const result: GanttLink[] = [];
      for (const rel of scheduleDoc.relationships) {
        const fromRow = rowIndexByActId.get(rel.predecessorId);
        const toRow = rowIndexByActId.get(rel.successorId);
        if (fromRow === undefined || toRow === undefined) continue;

        const pred = ganttRows[fromRow]!;
        const succ = ganttRows[toRow]!;
        const fromMinute =
          rel.type === 'SS' || rel.type === 'SF'
            ? (pred.start ?? pred.finish)
            : (pred.finish ?? pred.start);
        const toMinute =
          rel.type === 'FF' || rel.type === 'SF'
            ? (succ.finish ?? succ.start)
            : (succ.start ?? succ.finish);
        if (fromMinute === null || toMinute === null) continue;

        const computedRel = summary?.relationships[rel.id];
        result.push({
          id: rel.id,
          fromRow,
          toRow,
          type: rel.type,
          fromMinute,
          toMinute,
          isDriving: computedRel?.isDriving ?? false,
          isCritical: pred.isCritical && succ.isCritical,
        });
      }
      return result;
    }, [ganttRows, rowIndexByActId, scheduleDoc.relationships, showLinks, summary]);

    const nonWorkingDays = useMemo(() => {
      const cal =
        scheduleDoc.calendars.find((c) => c.id === scheduleDoc.settings.defaultCalendarId) ??
        scheduleDoc.calendars[0];
      if (!cal) {
        return (dayMinute: number) => {
          const dow = dayOfWeekFromDays(Math.floor(dayMinute / MINUTES_PER_DAY));
          return dow === 0 || dow === 6;
        };
      }
      const excMap = new Map(cal.exceptions.map((e) => [e.date, e.periods.length === 0]));
      return (dayMinute: number) => {
        const days = Math.floor(dayMinute / MINUTES_PER_DAY);
        if (excMap.size > 0) {
          const { year, month, day } = ymdFromCivilDays(days);
          const iso = `${String(year).padStart(4, '0')}-${pad2(month)}-${pad2(day)}`;
          const override = excMap.get(iso);
          if (override !== undefined) return override;
        }
        const dow = dayOfWeekFromDays(days);
        return (cal.week[dow]?.length ?? 0) === 0;
      };
    }, [scheduleDoc.calendars, scheduleDoc.settings.defaultCalendarId]);

    const originMinute = originOverride ?? defaultOriginFromRows(ganttRows);
    const timescale = useMemo(() => createTimescale(zoom, originMinute), [zoom, originMinute]);
    const statusMinute = useMemo(
      () => wallClockToCivilMinutes(scheduleDoc.settings.statusDate),
      [scheduleDoc.settings.statusDate],
    );

    const drivingPathSet = useMemo<ReadonlySet<string> | null>(() => {
      if (drivingPath === null) return null;
      const set = new Set<string>();
      for (const actId of drivingPath.activityIds) set.add(`act:${actId}`);
      for (const relId of drivingPath.relationshipIds) set.add(`rel:${relId}`);
      return set;
    }, [drivingPath]);

    const zoomToFit = useCallback(() => {
      const fit = computeZoomToFit(ganttRows, size.width);
      setOriginOverride(fit.originMinute);
      setScrollLeft(fit.scrollLeft);
      onZoomChange(fit.zoom);
    }, [ganttRows, onZoomChange, size.width]);

    useImperativeHandle(ref, () => ({ zoomToFit }), [zoomToFit]);

    // Measure container via ResizeObserver
    useEffect(() => {
      const el = containerRef.current;
      if (!el) return;
      const updateSize = () => {
        const rect = el.getBoundingClientRect();
        const width = Math.max(100, Math.floor(rect.width || el.clientWidth || 640));
        const height = Math.max(
          100,
          Math.floor((rect.height || el.clientHeight || 444) - GANTT_HEADER_HEIGHT),
        );
        setSize((prev) =>
          prev.width === width && prev.height === height ? prev : { width, height },
        );
      };
      if (typeof ResizeObserver === 'undefined') return;
      const observer = new ResizeObserver(updateSize);
      observer.observe(el);
      return () => observer.disconnect();
    }, []);

    // Re-read CSS tokens whenever dark/light theme class changes on <html>
    useEffect(() => {
      if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') return;
      const observer = new MutationObserver(() => {
        setTheme(readGanttTheme());
      });
      observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['class'],
      });
      return () => observer.disconnect();
    }, []);

    // Cancel active Gantt drag on Escape
    useEffect(() => {
      if (ganttDrag === null) return;
      const onKeyDown = (event: KeyboardEvent) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          setGanttDrag(null);
        }
      };
      window.addEventListener('keydown', onKeyDown);
      return () => window.removeEventListener('keydown', onKeyDown);
    }, [ganttDrag]);

    // Render header and body canvases on requestAnimationFrame
    useEffect(() => {
      const paint = () => {
        const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;

        const headerCanvas = headerCanvasRef.current;
        if (headerCanvas) {
          headerCanvas.width = Math.round(size.width * dpr);
          headerCanvas.height = Math.round(GANTT_HEADER_HEIGHT * dpr);
          const ctx = headerCanvas.getContext('2d');
          if (ctx) {
            const draw = new CanvasDraw2D(ctx, size.width, GANTT_HEADER_HEIGHT, dpr);
            renderTimescaleHeader(draw, timescale, scrollLeft, theme);
          }
        }

        const bodyCanvas = bodyCanvasRef.current;
        if (bodyCanvas) {
          bodyCanvas.width = Math.round(size.width * dpr);
          bodyCanvas.height = Math.round(size.height * dpr);
          const ctx = bodyCanvas.getContext('2d');
          if (ctx) {
            const draw = new CanvasDraw2D(ctx, size.width, size.height, dpr);
            const scene: GanttScene = {
              rows: ganttRows,
              links: ganttLinks,
              timescale,
              scrollTop,
              scrollLeft,
              statusMinute,
              todayMinute,
              nonWorkingDays,
              show: {
                critical: showCritical,
                links: showLinks,
                drivingPath: drivingPathSet,
              },
              selectedKey,
              hoveredRowKey: hover?.row.key ?? null,
              editMode,
              interactionOverlay: ganttDrag?.overlay ?? null,
              theme,
            };
            renderGantt(draw, scene);
          }
        }
      };

      const frameId =
        typeof requestAnimationFrame === 'function' ? requestAnimationFrame(paint) : 0;
      if (frameId === 0) paint();
      return () => {
        if (frameId !== 0 && typeof cancelAnimationFrame === 'function') {
          cancelAnimationFrame(frameId);
        }
      };
    }, [
      drivingPathSet,
      editMode,
      ganttDrag?.overlay,
      ganttLinks,
      ganttRows,
      hover?.row.key,
      nonWorkingDays,
      scrollLeft,
      scrollTop,
      selectedKey,
      showCritical,
      showLinks,
      size.height,
      size.width,
      statusMinute,
      theme,
      timescale,
      todayMinute,
    ]);

    const getCanvasCoords = (clientX: number, clientY: number) => {
      const rect = bodyCanvasRef.current?.getBoundingClientRect();
      if (!rect) return { x: clientX, y: clientY };
      return { x: clientX - rect.left, y: clientY - rect.top };
    };

    const handlePointerDown = (event: PointerEvent<HTMLCanvasElement>) => {
      if (event.button !== 0) return;
      if (editMode) {
        const { x, y } = getCanvasCoords(event.clientX, event.clientY);
        const target = hitTestGanttTarget(x, y, ganttRows, timescale, scrollLeft, scrollTop, true);
        if (target && target.kind !== 'bar-select') {
          const visRow = rowsByKey.get(target.row.key);
          const started = startGanttDrag(target, x, y, {
            hoursPerDay: visRow?.hoursPerDay ?? 8,
          });
          if (started) {
            setGanttDrag(started);
            setHover(null);
            onSelectKey(target.row.key);
            return;
          }
        }
      }
      dragRef.current = {
        active: true,
        startX: event.clientX,
        startScrollLeft: scrollLeft,
        moved: false,
      };
    };

    const handlePointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
      if (ganttDrag !== null) {
        const { x, y } = getCanvasCoords(event.clientX, event.clientY);
        setGanttDrag((prev) =>
          prev ? updateGanttDrag(prev, x, y, ganttRows, timescale, scrollLeft, scrollTop) : null,
        );
        return;
      }

      if (dragRef.current.active) {
        const dx = event.clientX - dragRef.current.startX;
        if (Math.abs(dx) > 4) {
          dragRef.current.moved = true;
          setHover(null);
        }
        if (dragRef.current.moved) {
          setScrollLeft(dragRef.current.startScrollLeft - dx);
          return;
        }
      }

      const { x, y } = getCanvasCoords(event.clientX, event.clientY);
      const target = hitTestGanttTarget(
        x,
        y,
        ganttRows,
        timescale,
        scrollLeft,
        scrollTop,
        editMode,
      );
      if (!target) {
        if (cursorStyle !== 'grab') setCursorStyle('grab');
        if (hover !== null) setHover(null);
        return;
      }

      const nextCursor =
        target.kind === 'bar-resize'
          ? 'ew-resize'
          : target.kind === 'bar-progress'
            ? 'col-resize'
            : target.kind === 'link-port-start' || target.kind === 'link-port-finish'
              ? 'crosshair'
              : target.kind === 'bar-move'
                ? 'grab'
                : 'pointer';
      if (cursorStyle !== nextCursor) setCursorStyle(nextCursor);

      const visRow = rowsByKey.get(target.row.key);
      if (
        visRow &&
        target.kind !== 'link-port-start' &&
        target.kind !== 'link-port-finish'
      ) {
        setHover({ row: visRow, x, y });
      } else if (hover !== null) {
        setHover(null);
      }
    };

    const handlePointerUp = (event: PointerEvent<HTMLCanvasElement>) => {
      if (ganttDrag !== null) {
        const { x, y } = getCanvasCoords(event.clientX, event.clientY);
        const finalDrag = updateGanttDrag(
          ganttDrag,
          x,
          y,
          ganttRows,
          timescale,
          scrollLeft,
          scrollTop,
        );
        const cmd = commitGanttDrag(finalDrag);
        setGanttDrag(null);
        if (cmd && onDispatch) {
          onDispatch(cmd);
        }
        return;
      }

      const wasMoved = dragRef.current.moved;
      dragRef.current.active = false;
      dragRef.current.moved = false;
      if (wasMoved) return;

      const { x, y } = getCanvasCoords(event.clientX, event.clientY);
      const hit = hitTestBar(x, y, ganttRows, timescale, scrollLeft, scrollTop);
      if (hit) {
        onSelectKey(hit.key);
      }
    };

    const handlePointerLeave = () => {
      dragRef.current.active = false;
      dragRef.current.moved = false;
      setGanttDrag(null);
      setHover(null);
    };

    const handleWheel = (event: WheelEvent<HTMLCanvasElement>) => {
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault();
        const idx = ZOOM_STEPS.indexOf(zoom);
        const nextIdx =
          event.deltaY > 0
            ? Math.min(ZOOM_STEPS.length - 1, idx + 1)
            : Math.max(0, idx - 1);
        const nextZoom = ZOOM_STEPS[nextIdx]!;
        if (nextZoom !== zoom) {
          const { x } = getCanvasCoords(event.clientX, event.clientY);
          const anchorMinute = timescale.minuteAt(scrollLeft + x);
          const nextTs = createTimescale(nextZoom, originMinute);
          setScrollLeft(nextTs.x(anchorMinute) - x);
          onZoomChange(nextZoom);
        }
        return;
      }

      if (event.shiftKey || Math.abs(event.deltaX) > Math.abs(event.deltaY)) {
        const delta = Math.abs(event.deltaX) > 0 ? event.deltaX : event.deltaY;
        setScrollLeft((prev) => prev + delta);
        return;
      }

      const maxScrollTop = Math.max(0, ganttRows.length * GANTT_ROW_HEIGHT - size.height);
      const nextTop = Math.max(0, Math.min(maxScrollTop, scrollTop + event.deltaY));
      if (nextTop !== scrollTop) {
        onScrollTopChange(nextTop);
      }
    };

    return (
      <div
        ref={containerRef}
        className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-card select-none"
      >
        <canvas
          ref={headerCanvasRef}
          aria-label="Gantt timescale"
          style={{ width: '100%', height: `${GANTT_HEADER_HEIGHT}px` }}
          className="block shrink-0"
        />
        <div className="relative min-h-0 flex-1">
          <canvas
            ref={bodyCanvasRef}
            aria-label="Gantt chart"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerLeave}
            onWheel={handleWheel}
            style={{
              width: '100%',
              height: '100%',
              cursor: ganttDrag ? 'grabbing' : cursorStyle,
            }}
            className="block"
          />
          {hover !== null && (
            <div
              role="tooltip"
              style={{
                left: `${Math.min(Math.max(8, hover.x + 12), Math.max(8, size.width - 230))}px`,
                top: `${Math.min(Math.max(8, hover.y + 12), Math.max(8, size.height - 76))}px`,
              }}
              className="pointer-events-none absolute z-20 max-w-[224px] rounded-md border border-border bg-popover px-2.5 py-1.5 text-xs text-popover-foreground shadow-popover"
            >
              <div className="truncate font-medium">
                {hover.row.code} · {hover.row.name}
              </div>
              <div className="mt-0.5 text-2xs tabular-nums text-muted-foreground">
                {formatScheduleDate(hover.row.start)} → {formatScheduleDate(hover.row.finish)}
              </div>
              <div className="mt-0.5 flex items-center gap-2 text-2xs tabular-nums text-muted-foreground">
                <span>
                  {formatWorkingDays(hover.row.durationMinutes, hover.row.hoursPerDay)}
                </span>
                {hover.row.totalFloat !== null && (
                  <span>
                    Float{' '}
                    {formatWorkingDays(hover.row.totalFloat, hover.row.hoursPerDay, {
                      signed: true,
                    })}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  },
);
