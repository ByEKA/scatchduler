import { Compass, ExternalLink, MapPin, MapPinOff, Minus, Plus, X } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import type { PointerEvent, ReactElement } from 'react';
import { Link } from 'react-router';
import { StatusBadge } from '@/components/common/StatusBadge';
import { FOCUS_OUTLINE_CLASSES } from '@/components/layout/top-bar-parts';
import { Button } from '@/components/ui/button';
import type { ProjectStatus, ProjectSummary, WorkspaceSummary } from '@/data/types';
import { useDialogs } from '@/features/dialogs/DialogsProvider';
import { canEdit } from '@/features/workspaces/roles';
import { coverFor } from '@/lib/cover';
import { cn } from '@/lib/utils';

const MAP_WIDTH = 800;
const MAP_HEIGHT = 500;
const MIN_ZOOM = 1;
const MAX_ZOOM = 12;

interface MapViewport {
  centerLat: number;
  centerLng: number;
  zoom: number;
}

// Default framing over Türkiye when no projects have coordinates.
const DEFAULT_VIEWPORT: MapViewport = {
  centerLat: 39.2,
  centerLng: 34.5,
  zoom: 4,
};

// Simplified reference landmass polygons ([lng, lat][]) so the map has crisp geographical
// context locally, in CI and offline without any external tile server (D2, V5).
const LANDMASS_POLYGONS: ReadonlyArray<ReadonlyArray<readonly [number, number]>> = [
  // Türkiye — Anatolia
  [
    [26.1, 39.9],
    [27.2, 40.3],
    [29.1, 41.2],
    [31.5, 41.3],
    [33.5, 42.0],
    [35.2, 42.0],
    [37.9, 41.0],
    [41.5, 41.5],
    [43.8, 40.9],
    [44.8, 39.6],
    [44.3, 37.3],
    [42.4, 37.2],
    [38.8, 36.8],
    [36.6, 36.8],
    [36.1, 35.9],
    [35.4, 36.6],
    [33.2, 36.1],
    [30.6, 36.8],
    [29.1, 36.5],
    [27.3, 37.0],
    [26.3, 38.4],
    [26.1, 39.9],
  ],
  // Türkiye — Thrace
  [
    [26.1, 40.6],
    [26.6, 41.7],
    [28.0, 41.9],
    [29.1, 41.2],
    [28.1, 41.0],
    [26.8, 40.5],
    [26.1, 40.6],
  ],
  // Cyprus
  [
    [32.3, 35.1],
    [33.9, 35.5],
    [34.5, 35.6],
    [33.6, 34.7],
    [32.4, 34.8],
    [32.3, 35.1],
  ],
  // Greece / Balkans reference
  [
    [19.5, 42.5],
    [23.0, 44.0],
    [27.5, 43.5],
    [26.6, 41.7],
    [26.0, 40.8],
    [23.8, 40.3],
    [23.0, 38.0],
    [22.4, 36.5],
    [21.2, 37.8],
    [20.2, 39.5],
    [19.5, 42.5],
  ],
  // Europe simplified outline (visible when zoomed out)
  [
    [-9.5, 37.0],
    [-9.0, 43.0],
    [-1.5, 43.5],
    [-4.5, 48.5],
    [2.0, 51.0],
    [9.0, 54.0],
    [14.0, 54.0],
    [24.0, 60.0],
    [30.0, 60.0],
    [36.0, 47.0],
    [28.5, 45.0],
    [19.5, 42.5],
    [14.0, 45.5],
    [16.0, 40.5],
    [12.5, 42.0],
    [8.5, 44.3],
    [3.0, 42.5],
    [-5.5, 36.0],
    [-9.5, 37.0],
  ],
  // North Africa & Levant reference
  [
    [-10.0, 35.0],
    [10.0, 37.0],
    [15.0, 32.5],
    [25.0, 31.5],
    [32.5, 31.2],
    [35.5, 33.5],
    [36.1, 35.9],
    [42.0, 36.5],
    [48.0, 30.0],
    [40.0, 24.0],
    [34.0, 26.0],
    [25.0, 22.0],
    [-10.0, 22.0],
    [-10.0, 35.0],
  ],
];

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function projectPoint(lat: number, lng: number, viewport: MapViewport): { x: number; y: number } {
  const degreesPerScreenLng = 64 / viewport.zoom;
  const cosLat = Math.max(0.35, Math.cos((viewport.centerLat * Math.PI) / 180));
  const degreesPerScreenLat = degreesPerScreenLng * (MAP_HEIGHT / MAP_WIDTH) * cosLat;
  const x = MAP_WIDTH / 2 + ((lng - viewport.centerLng) / degreesPerScreenLng) * MAP_WIDTH;
  const y = MAP_HEIGHT / 2 - ((lat - viewport.centerLat) / degreesPerScreenLat) * MAP_HEIGHT;
  return { x, y };
}

function computeFitViewport(mapped: readonly ProjectSummary[]): MapViewport {
  if (mapped.length === 0) return DEFAULT_VIEWPORT;
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLng = Infinity;
  let maxLng = -Infinity;
  for (const project of mapped) {
    const lat = project.location.latitude!;
    const lng = project.location.longitude!;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
  }
  const centerLat = (minLat + maxLat) / 2;
  const centerLng = (minLng + maxLng) / 2;
  const spanLng = Math.max(2.5, (maxLng - minLng) * 1.6);
  const cosLat = Math.max(0.35, Math.cos((centerLat * Math.PI) / 180));
  const spanLatAsLng = Math.max(
    2.5,
    ((maxLat - minLat) * 1.6) / (cosLat * (MAP_HEIGHT / MAP_WIDTH)),
  );
  const span = Math.max(spanLng, spanLatAsLng);
  const zoom = clamp(Math.round((64 / span) * 10) / 10, MIN_ZOOM, 8);
  return { centerLat, centerLng, zoom };
}

function pinColorClasses(status: ProjectStatus, selected: boolean): string {
  const ring = selected
    ? 'ring-2 ring-ring ring-offset-2 ring-offset-card scale-110'
    : 'ring-1 ring-card';
  switch (status) {
    case 'active':
      return cn('bg-primary text-primary-foreground', ring);
    case 'on_hold':
      return cn('bg-warning-foreground text-background', ring);
    case 'completed':
      return cn('bg-success text-background', ring);
    case 'cancelled':
      return cn('bg-muted-foreground text-background', ring);
  }
}

/**
 * Self-contained interactive SVG coordinate map and "Not on the map" side panel for ProjectsPage
 * (spec §7.3.2, D2, S9, V5). Uses zero external map tiles or network requests.
 */
export function ProjectsMap({
  projects,
  workspace,
}: {
  projects: readonly ProjectSummary[];
  workspace: WorkspaceSummary;
}): ReactElement {
  const { openDialog } = useDialogs();
  const editable = canEdit(workspace);

  const { mapped, unmapped } = useMemo(() => {
    const withCoords: ProjectSummary[] = [];
    const withoutCoords: ProjectSummary[] = [];
    for (const project of projects) {
      if (project.location.latitude !== null && project.location.longitude !== null) {
        withCoords.push(project);
      } else {
        withoutCoords.push(project);
      }
    }
    return { mapped: withCoords, unmapped: withoutCoords };
  }, [projects]);

  const initialFit = useMemo(() => computeFitViewport(mapped), [mapped]);
  const [viewportOverride, setViewportOverride] = useState<MapViewport | null>(null);
  const viewport = viewportOverride ?? initialFit;

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedProject = useMemo(
    () => (selectedId === null ? null : (mapped.find((p) => p.id === selectedId) ?? null)),
    [mapped, selectedId],
  );

  const containerRef = useRef<HTMLDivElement>(null);
  const panRef = useRef<{
    active: boolean;
    startX: number;
    startY: number;
    startViewport: MapViewport;
  } | null>(null);

  const handlePointerDown = (event: PointerEvent<SVGSVGElement>) => {
    if (event.button !== 0) return;
    panRef.current = {
      active: true,
      startX: event.clientX,
      startY: event.clientY,
      startViewport: viewport,
    };
  };

  const handlePointerMove = (event: PointerEvent<SVGSVGElement>) => {
    const pan = panRef.current;
    if (!pan?.active) return;
    const rect = containerRef.current?.getBoundingClientRect();
    const widthPx = rect?.width || MAP_WIDTH;
    const heightPx = rect?.height || MAP_HEIGHT;
    const dx = event.clientX - pan.startX;
    const dy = event.clientY - pan.startY;
    const degreesPerScreenLng = 64 / pan.startViewport.zoom;
    const cosLat = Math.max(0.35, Math.cos((pan.startViewport.centerLat * Math.PI) / 180));
    const degreesPerScreenLat = degreesPerScreenLng * (MAP_HEIGHT / MAP_WIDTH) * cosLat;
    const nextLng = clamp(
      pan.startViewport.centerLng - (dx / widthPx) * degreesPerScreenLng,
      -180,
      180,
    );
    const nextLat = clamp(
      pan.startViewport.centerLat + (dy / heightPx) * degreesPerScreenLat,
      -80,
      80,
    );
    setViewportOverride({ ...pan.startViewport, centerLat: nextLat, centerLng: nextLng });
  };

  const handlePointerUp = () => {
    panRef.current = null;
  };

  const zoomBy = (factor: number) => {
    setViewportOverride((prev) => {
      const base = prev ?? initialFit;
      const nextZoom = clamp(Math.round(base.zoom * factor * 10) / 10, MIN_ZOOM, MAX_ZOOM);
      return { ...base, zoom: nextZoom };
    });
  };

  const fitToProjects = () => {
    setViewportOverride(computeFitViewport(mapped));
  };

  // Compute visible graticule lines (every 5° when zoomed in, 15° when zoomed out)
  const graticuleStep = viewport.zoom >= 4 ? 2 : viewport.zoom >= 2 ? 5 : 15;
  const latLines: number[] = [];
  const lngLines: number[] = [];
  for (let lat = -75; lat <= 75; lat += graticuleStep) latLines.push(lat);
  for (let lng = -180; lng <= 180; lng += graticuleStep) lngLines.push(lng);

  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
      {/* Interactive SVG coordinate map */}
      <div
        ref={containerRef}
        className="relative flex min-h-[460px] flex-1 flex-col overflow-hidden rounded-lg bg-card ring-1 ring-edge select-none"
      >
        <svg
          role="img"
          aria-label="Projects coordinate map"
          viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
          preserveAspectRatio="xMidYMid slice"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
          className="h-[460px] w-full cursor-grab bg-background/70 active:cursor-grabbing"
        >
          {/* Graticule grid lines */}
          <g className="stroke-border/60" strokeWidth={0.75}>
            {latLines.map((lat) => {
              const { y } = projectPoint(lat, viewport.centerLng, viewport);
              if (y < -10 || y > MAP_HEIGHT + 10) return null;
              return (
                <g key={`lat-${lat}`}>
                  <line x1={0} y1={y} x2={MAP_WIDTH} y2={y} />
                  <text
                    x={8}
                    y={y - 3}
                    className="fill-muted-foreground font-mono text-[9px]"
                    stroke="none"
                  >
                    {lat >= 0 ? `${lat}°N` : `${Math.abs(lat)}°S`}
                  </text>
                </g>
              );
            })}
            {lngLines.map((lng) => {
              const { x } = projectPoint(viewport.centerLat, lng, viewport);
              if (x < -10 || x > MAP_WIDTH + 10) return null;
              return (
                <g key={`lng-${lng}`}>
                  <line x1={x} y1={0} x2={x} y2={MAP_HEIGHT} />
                  <text
                    x={x + 3}
                    y={MAP_HEIGHT - 6}
                    className="fill-muted-foreground font-mono text-[9px]"
                    stroke="none"
                  >
                    {lng >= 0 ? `${lng}°E` : `${Math.abs(lng)}°W`}
                  </text>
                </g>
              );
            })}
          </g>

          {/* Reference landmass polygons */}
          <g className="fill-muted stroke-border" strokeWidth={1.25} strokeLinejoin="round">
            {LANDMASS_POLYGONS.map((ring, idx) => {
              const d = ring
                .map(([lng, lat], i) => {
                  const pt = projectPoint(lat, lng, viewport);
                  return `${i === 0 ? 'M' : 'L'}${pt.x.toFixed(1)},${pt.y.toFixed(1)}`;
                })
                .join(' ');
              return <path key={idx} d={`${d} Z`} />;
            })}
          </g>
        </svg>

        {/* HTML overlay pins for crisp keyboard focus & accessible click targets */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          {mapped.map((project) => {
            const pt = projectPoint(
              project.location.latitude!,
              project.location.longitude!,
              viewport,
            );
            const leftPct = (pt.x / MAP_WIDTH) * 100;
            const topPct = (pt.y / MAP_HEIGHT) * 100;
            if (leftPct < -5 || leftPct > 105 || topPct < -5 || topPct > 105) return null;
            const isSelected = selectedProject?.id === project.id;
            return (
              <button
                key={project.id}
                type="button"
                aria-label={`${project.name} (${project.code})`}
                aria-pressed={isSelected}
                onClick={() => setSelectedId(isSelected ? null : project.id)}
                style={{ left: `${leftPct}%`, top: `${topPct}%` }}
                className={cn(
                  'pointer-events-auto absolute flex -translate-x-1/2 -translate-y-1/2 items-center gap-1 rounded-full px-2 py-1 text-2xs font-semibold shadow-sm transition-transform hover:scale-105',
                  pinColorClasses(project.attributes.status, isSelected),
                  FOCUS_OUTLINE_CLASSES,
                )}
              >
                <MapPin className="size-3 shrink-0" aria-hidden="true" />
                <span className="font-mono">{project.code}</span>
              </button>
            );
          })}
        </div>

        {/* Zoom & Fit controls */}
        <div
          role="group"
          aria-label="Map controls"
          className="absolute top-3 right-3 flex items-center gap-1 rounded-md border border-border bg-card/95 p-1 shadow-xs backdrop-blur-xs"
        >
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Zoom in"
            disabled={viewport.zoom >= MAX_ZOOM}
            onClick={() => zoomBy(1.5)}
            className="size-7"
          >
            <Plus className="size-3.5" aria-hidden="true" />
          </Button>
          <span
            data-testid="map-zoom-level"
            className="min-w-10 text-center font-mono text-2xs text-muted-foreground tabular-nums"
          >
            {viewport.zoom.toFixed(1)}×
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Zoom out"
            disabled={viewport.zoom <= MIN_ZOOM}
            onClick={() => zoomBy(1 / 1.5)}
            className="size-7"
          >
            <Minus className="size-3.5" aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Fit to projects"
            onClick={fitToProjects}
            className="size-7"
          >
            <Compass className="size-3.5" aria-hidden="true" />
          </Button>
        </div>

        {/* Legend */}
        <div className="absolute bottom-3 left-3 flex flex-wrap items-center gap-3 rounded-md border border-border bg-card/95 px-2.5 py-1.5 text-2xs text-muted-foreground shadow-xs backdrop-blur-xs">
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-primary" aria-hidden="true" />
            Active
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-warning-foreground" aria-hidden="true" />
            On hold
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-success" aria-hidden="true" />
            Completed
          </span>
          <span className="font-mono tabular-nums">{mapped.length} pinned</span>
        </div>

        {/* Selected project popover card */}
        {selectedProject !== null && (
          <section
            aria-label={selectedProject.name}
            className="absolute right-3 bottom-3 z-10 flex w-72 max-w-[calc(100%-24px)] flex-col gap-2.5 rounded-lg border border-border bg-popover p-3 text-popover-foreground shadow-popover"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2.5">
                {selectedProject.coverImageUrl ? (
                  <img
                    src={selectedProject.coverImageUrl}
                    alt=""
                    className="h-10 w-12 shrink-0 rounded-sm object-cover"
                  />
                ) : (
                  <div
                    aria-hidden="true"
                    style={coverFor(selectedProject.id)}
                    className="h-10 w-12 shrink-0 rounded-sm"
                  />
                )}
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-sm font-semibold">{selectedProject.name}</span>
                  </div>
                  <div className="mt-0.5 flex items-center gap-1.5">
                    <span className="rounded-sm bg-muted px-1 font-mono text-2xs text-muted-foreground">
                      {selectedProject.code}
                    </span>
                    <StatusBadge status={selectedProject.attributes.status} />
                  </div>
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Close project card"
                onClick={() => setSelectedId(null)}
                className="size-6 shrink-0"
              >
                <X className="size-3.5" aria-hidden="true" />
              </Button>
            </div>

            <div className="flex flex-col gap-0.5 text-xs text-muted-foreground">
              {(selectedProject.client.name || selectedProject.location.city) && (
                <span className="truncate">
                  {[selectedProject.client.name, selectedProject.location.city]
                    .filter((part): part is string => part !== null && part.trim() !== '')
                    .join(' · ')}
                </span>
              )}
              <span className="font-mono text-2xs tabular-nums">
                {selectedProject.location.latitude?.toFixed(4)},{' '}
                {selectedProject.location.longitude?.toFixed(4)}
              </span>
            </div>

            <div className="flex items-center justify-end gap-2">
              <Button asChild size="xs">
                <Link to={`/w/${selectedProject.workspaceId}/p/${selectedProject.id}/files`}>
                  Open project
                  <ExternalLink className="size-3" aria-hidden="true" />
                </Link>
              </Button>
            </div>
          </section>
        )}
      </div>

      {/* Right side panel: Not on the map */}
      <aside
        aria-label="Not on the map"
        className="flex w-full shrink-0 flex-col gap-3 rounded-lg bg-card p-3.5 ring-1 ring-edge lg:w-72"
      >
        <div className="flex items-center gap-2">
          <MapPinOff className="size-4 text-muted-foreground" aria-hidden="true" />
          <h2 className="text-sm font-semibold">{`Not on the map (${unmapped.length})`}</h2>
        </div>

        {unmapped.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            All matching projects have map coordinates.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {unmapped.map((project) => (
              <li
                key={project.id}
                className="flex flex-col gap-1.5 rounded-md border border-border bg-background/60 p-2.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <Link
                    to={`/w/${project.workspaceId}/p/${project.id}/files`}
                    className={cn(
                      'truncate rounded-sm text-xs font-semibold hover:underline',
                      FOCUS_OUTLINE_CLASSES,
                    )}
                  >
                    {project.name}
                  </Link>
                  <span className="shrink-0 rounded-sm bg-muted px-1 font-mono text-2xs text-muted-foreground">
                    {project.code}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-2xs text-muted-foreground">
                    {project.location.city ?? 'No city'}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="xs"
                    onClick={() =>
                      openDialog('editProject', {
                        workspaceId: project.workspaceId,
                        projectId: project.id,
                      })
                    }
                    className="h-6 border-input bg-card px-2 text-2xs dark:bg-card"
                  >
                    {editable ? 'Edit location' : 'Project details'}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </aside>
    </div>
  );
}
