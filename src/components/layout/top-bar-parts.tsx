import { useState } from 'react';
import type { ReactElement, ReactNode, RefObject } from 'react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

/**
 * The popover shell of spec §6.7 (bg-popover, 1 px border, radius 10, shadow-popover, padding 4)
 * with the §6.11 open animation: fade and zoom from 98 % in 150 ms. The generated PopoverContent
 * and DropdownMenuContent also slide in from the side, and a className can't take that away, so
 * the top bar renders the Radix content parts with these classes. Each adds its own
 * transform origin.
 */
export const POPOVER_SHELL_CLASSES =
  'z-50 rounded-lg border bg-popover p-1 text-popover-foreground shadow-popover outline-none duration-150 ease-out data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-98';

/** Keyboard focus for the top bar controls: a 2 px outline in the full-strength ring color. */
export const FOCUS_OUTLINE_CLASSES =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';

// The shadcn menu and command items carry outline-hidden, which sets --tw-outline-style to none;
// Tailwind's outline-2 reads that variable, so these outlines also set outline-solid.

/** Keyboard focus for dropdown menu items, drawn inside the item. */
export const MENU_ITEM_FOCUS_CLASSES =
  'focus-visible:outline-solid focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring';

/**
 * The highlighted option in the switcher popovers (spec §6.12). The accent background alone is
 * about 1.1 : 1 against the popover, so the option also gets a ring-colored outline.
 */
export const OPTION_CLASSES =
  'h-8 gap-2 rounded-sm px-2 py-0 data-[selected=true]:outline-solid data-[selected=true]:outline-2 data-[selected=true]:-outline-offset-2 data-[selected=true]:outline-ring';

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
