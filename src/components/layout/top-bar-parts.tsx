import { useState } from 'react';
import type { ReactElement, ReactNode, RefObject } from 'react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

/** Keyboard focus for the top bar controls: a 2 px outline in the full-strength ring color. */
export const FOCUS_OUTLINE_CLASSES =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';

/**
 * Keyboard focus for dropdown menu items, drawn inside the item. The shadcn menu items carry
 * outline-hidden, which sets --tw-outline-style to none; Tailwind's outline-2 reads that variable,
 * so this outline also sets outline-solid.
 */
export const MENU_ITEM_FOCUS_CLASSES =
  'focus-visible:outline-solid focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring';

/** What a switcher shows when the workspaces or projects never loaded (spec §6.10). */
export function UnavailableSwitcher(): ReactElement {
  return (
    <button
      type="button"
      disabled
      className="flex h-7 shrink-0 cursor-not-allowed items-center rounded-md bg-secondary/80 px-2.5 text-sm font-medium text-muted-foreground"
    >
      Unavailable
    </button>
  );
}

// True when the label is hidden (the icon-only workspace link below 640 px) or its text is cut
// off. Read when the tooltip asks to open, so it follows the current layout.
function isCutOff(label: HTMLElement | null): boolean {
  if (label === null) return false;
  return getComputedStyle(label).display === 'none' || label.scrollWidth > label.clientWidth;
}

/**
 * Shows the full name in a tooltip while `labelRef`'s text is truncated or hidden (spec §6.10,
 * long text). A name that fits gets no tooltip.
 */
export function NameTooltip({
  name,
  labelRef,
  children,
}: {
  name: string;
  labelRef: RefObject<HTMLElement | null>;
  children: ReactNode;
}): ReactElement {
  const [open, setOpen] = useState(false);
  return (
    <Tooltip open={open} onOpenChange={(next) => setOpen(next && isCutOff(labelRef.current))}>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={6} className="max-w-80 break-words">
        {name}
      </TooltipContent>
    </Tooltip>
  );
}
