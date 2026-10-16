import { TriangleAlert } from 'lucide-react';
import type { ReactElement } from 'react';
import { Button } from '@/components/ui/button';
import { errorMessage } from '@/lib/format';
import { cn } from '@/lib/utils';

/** A failed read in a section or page: the error copy and a Retry button (spec §6.6). */
export function SectionError({
  error,
  onRetry,
  className,
}: {
  error: unknown;
  onRetry: () => void;
  className?: string;
}): ReactElement {
  return (
    <div
      role="alert"
      className={cn('flex flex-col items-center justify-center gap-3 p-4 text-center', className)}
    >
      <TriangleAlert className="size-5 text-destructive" aria-hidden="true" />
      <p className="text-sm">{errorMessage(error)}</p>
      <Button type="button" variant="secondary" onClick={onRetry}>
        Retry
      </Button>
    </div>
  );
}
