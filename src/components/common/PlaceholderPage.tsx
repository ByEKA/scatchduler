import { Construction } from 'lucide-react';
import type { ReactElement } from 'react';
import { EmptyState } from '@/components/common/EmptyState';

/** A page title: `text-lg` (spec §6.2). Pages put their content 16 px below it (spec §6.3). */
export const PAGE_HEADING_CLASSES = 'text-lg font-bold tracking-[-0.01em]';

/** The note every Phase 1 placeholder shows under its heading (spec §6.6). */
export function LaterPhaseNotice(): ReactElement {
  return (
    <div className="py-16">
      <EmptyState icon={Construction} title="This area is part of a later phase." />
    </div>
  );
}

/** A route that a later phase fills in (spec §4.4, §6.6). */
export function PlaceholderPage({ title }: { title: string }): ReactElement {
  return (
    <div className="flex flex-col gap-4">
      <h1 className={PAGE_HEADING_CLASSES}>{title}</h1>
      <LaterPhaseNotice />
    </div>
  );
}
