import { brand } from '@/config/brand';
import { cn } from '@/lib/utils';

// Placeholder logo (spec 7): a 24 px brand tile holding a tiny Gantt chart, then the product name.
// The mark uses --primary-foreground, which is white in both themes; the tile color is --brand-600.
export function BrandLogo({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <span className="flex size-6 shrink-0 items-center justify-center rounded-sm bg-brand-600 text-primary-foreground">
        <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" className="size-4">
          <rect x="2" y="3" width="6" height="2" rx="1" />
          <rect x="5" y="7" width="8" height="2" rx="1" />
          <rect x="9" y="11" width="5" height="2" rx="1" />
        </svg>
      </span>
      <span className="text-md font-bold tracking-[-0.02em]">{brand.name}</span>
    </span>
  );
}
