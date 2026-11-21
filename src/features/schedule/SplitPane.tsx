import { useCallback, useRef, useState } from 'react';
import type { KeyboardEvent, PointerEvent, ReactElement, ReactNode } from 'react';
import { readKey, UI_SCHEDULE_SPLIT_KEY, writeKey } from '@/lib/storage';
import { cn } from '@/lib/utils';

const DEFAULT_SPLIT_PX = 560;
const MIN_SPLIT_PX = 280;
const MAX_RATIO = 0.75;
const KEYBOARD_STEP_PX = 24;

function readInitialWidth(): number {
  const raw = readKey(UI_SCHEDULE_SPLIT_KEY);
  if (raw === null) return DEFAULT_SPLIT_PX;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < MIN_SPLIT_PX) return DEFAULT_SPLIT_PX;
  return parsed;
}

/**
 * Resizable horizontal split pane hosting the virtualized activity grid on the left and the
 * Canvas 2D Gantt on the right (spec §7.2, §9). Persists width under `ui.scheduleSplitPx`.
 */
export function SplitPane({
  left,
  right,
  className,
}: {
  left: ReactNode;
  right: ReactNode;
  className?: string;
}): ReactElement {
  const containerRef = useRef<HTMLDivElement>(null);
  const [widthPx, setWidthPx] = useState<number>(readInitialWidth);
  const [dragging, setDragging] = useState(false);

  const clampWidth = useCallback((candidate: number): number => {
    const containerWidth = containerRef.current?.getBoundingClientRect().width ?? 0;
    const maxPx =
      containerWidth > MIN_SPLIT_PX * 1.5
        ? Math.floor(containerWidth * MAX_RATIO)
        : Math.max(DEFAULT_SPLIT_PX, candidate);
    return Math.round(Math.max(MIN_SPLIT_PX, Math.min(candidate, maxPx)));
  }, []);

  const commitWidth = useCallback(
    (next: number) => {
      const clamped = clampWidth(next);
      setWidthPx(clamped);
      writeKey(UI_SCHEDULE_SPLIT_KEY, String(clamped));
    },
    [clampWidth],
  );

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = widthPx;
    setDragging(true);

    const handleMove = (moveEvent: globalThis.PointerEvent) => {
      const next = clampWidth(startWidth + (moveEvent.clientX - startX));
      setWidthPx(next);
    };
    const handleUp = (upEvent: globalThis.PointerEvent) => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      window.removeEventListener('pointercancel', handleUp);
      setDragging(false);
      commitWidth(startWidth + (upEvent.clientX - startX));
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    window.addEventListener('pointercancel', handleUp);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      commitWidth(widthPx - KEYBOARD_STEP_PX);
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      commitWidth(widthPx + KEYBOARD_STEP_PX);
    } else if (event.key === 'Home') {
      event.preventDefault();
      commitWidth(MIN_SPLIT_PX);
    }
  };

  return (
    <div
      ref={containerRef}
      className={cn(
        'flex min-h-0 flex-1 overflow-hidden rounded-lg border border-border bg-card',
        dragging && 'select-none',
        className,
      )}
    >
      <div style={{ width: `${widthPx}px` }} className="flex min-h-0 shrink-0 flex-col">
        {left}
      </div>
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- WAI-ARIA Window Splitter uses role="separator" with keyboard resize. */}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize grid and Gantt panes"
        aria-valuemin={MIN_SPLIT_PX}
        aria-valuenow={widthPx}
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- Interactive window splitter is keyboard-focusable per WAI-ARIA.
        tabIndex={0}
        onPointerDown={handlePointerDown}
        onKeyDown={handleKeyDown}
        className={cn(
          'w-1.5 shrink-0 cursor-col-resize bg-border/60 transition-colors hover:bg-ring/60 focus-visible:bg-ring focus-visible:outline-none',
          dragging && 'bg-ring',
        )}
      />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">{right}</div>
    </div>
  );
}
