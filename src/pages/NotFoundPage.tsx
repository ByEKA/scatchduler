import type { ReactElement } from 'react';
import { Link } from 'react-router';
import { PAGE_HEADING_CLASSES } from '@/components/common/PlaceholderPage';

/** Shown inside the shell for unknown routes and unknown projects (spec §4.4, §6.6). */
export function NotFoundPage(): ReactElement {
  return (
    <div className="flex flex-col gap-4">
      <h1 className={PAGE_HEADING_CLASSES}>Page not found</h1>
      <div className="flex flex-col items-start gap-2">
        <p className="text-sm text-muted-foreground">
          {"The page you're looking for doesn't exist or was moved."}
        </p>
        <Link
          to="/home"
          className="rounded-sm text-sm font-semibold text-link hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          Go to Home
        </Link>
      </div>
    </div>
  );
}
