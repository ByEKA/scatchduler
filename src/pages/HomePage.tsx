import type { ReactElement } from 'react';
import { RecentProjects } from '@/features/home/RecentProjects';
import { WelcomeBanner } from '@/features/home/WelcomeBanner';

export function HomePage(): ReactElement {
  return (
    <div className="flex flex-col gap-6">
      <WelcomeBanner />
      <RecentProjects />
    </div>
  );
}
