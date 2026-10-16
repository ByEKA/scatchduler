import type { ReactElement } from 'react';
import { RecentProjects } from '@/features/home/RecentProjects';
import { SharedSchedulesTable } from '@/features/home/SharedSchedulesTable';
import { WelcomeBanner } from '@/features/home/WelcomeBanner';
import { WorkspacesPanel } from '@/features/home/WorkspacesPanel';

export function HomePage(): ReactElement {
  return (
    <div className="flex flex-col gap-6">
      <WelcomeBanner />
      <RecentProjects />
      <SharedSchedulesTable />
      <WorkspacesPanel />
    </div>
  );
}
