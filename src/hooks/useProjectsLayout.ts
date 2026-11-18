import { useCallback, useState } from 'react';
import { readKey, writeKey } from '@/lib/storage';

export type ProjectsLayout = 'tiles' | 'list';

const LAYOUT_KEY = 'ui.projectsLayout';

// Tiles is the default; only a stored 'list' switches it, so a stale or foreign value reads as tiles.
function storedLayout(): ProjectsLayout {
  return readKey(LAYOUT_KEY) === 'list' ? 'list' : 'tiles';
}

/** The Projects page layout, remembered in `ui.projectsLayout` (P3 core spec §6.2, D21). */
export function useProjectsLayout(): [ProjectsLayout, (layout: ProjectsLayout) => void] {
  const [layout, setLayoutState] = useState<ProjectsLayout>(storedLayout);
  const setLayout = useCallback((next: ProjectsLayout) => {
    setLayoutState(next);
    writeKey(LAYOUT_KEY, next);
  }, []);
  return [layout, setLayout];
}
