import { useCallback, useState } from 'react';
import { readKey, writeKey } from '@/lib/storage';

export type ProjectsLayout = 'tiles' | 'list' | 'map';

const LAYOUT_KEY = 'ui.projectsLayout';

// Tiles is the default; only stored 'list' or 'map' switches it, so unknown values read as tiles.
function storedLayout(): ProjectsLayout {
  const raw = readKey(LAYOUT_KEY);
  if (raw === 'list' || raw === 'map') return raw;
  return 'tiles';
}

/** The Projects page layout, remembered in `ui.projectsLayout` (P3 core spec §6.2, D21, P4 later §7.3.2). */
export function useProjectsLayout(): [ProjectsLayout, (layout: ProjectsLayout) => void] {
  const [layout, setLayoutState] = useState<ProjectsLayout>(storedLayout);
  const setLayout = useCallback((next: ProjectsLayout) => {
    setLayoutState(next);
    writeKey(LAYOUT_KEY, next);
  }, []);
  return [layout, setLayout];
}
