import type { LucideIcon } from 'lucide-react';
import type { ReactElement, ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  size?: 'md' | 'sm';
}

/**
 * Icon tile, title, optional description and action (spec §6.6). `md` stacks them centered under a
 * 64 px tile; `sm` puts a 48 px tile to the left of the text. The title is a paragraph, so an empty
 * state never adds to the page's heading outline.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  size = 'md',
}: EmptyStateProps): ReactElement {
  const small = size === 'sm';
  return (
    <div
      className={cn(
        'mx-auto flex max-w-[320px] gap-2',
        small ? 'items-center text-left' : 'flex-col items-center text-center',
      )}
    >
      <div
        aria-hidden="true"
        className={cn(
          'flex shrink-0 items-center justify-center rounded-2xl border border-dashed border-input bg-muted',
          small ? 'size-12' : 'size-16',
        )}
      >
        <Icon className={cn('text-muted-foreground', small ? 'size-5' : 'size-7')} />
      </div>
      <div className={cn('flex min-w-0 flex-col gap-2', small ? 'items-start' : 'items-center')}>
        <p className="text-sm font-semibold">{title}</p>
        {description !== undefined && (
          <p className="text-sm text-muted-foreground">{description}</p>
        )}
        {action}
      </div>
    </div>
  );
}
