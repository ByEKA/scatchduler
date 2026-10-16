/**
 * The popover shell of spec §6.7 (bg-popover, 1 px border, radius 10, shadow-popover, padding 4)
 * with the §6.11 open animation: fade and zoom from 98 % in 150 ms. The generated PopoverContent
 * and DropdownMenuContent also slide in from the side, and a className can't take that away, so
 * popovers and menus render the Radix content parts with these classes. Each adds its own
 * transform origin.
 */
export const POPOVER_SHELL_CLASSES =
  'z-50 rounded-lg border bg-popover p-1 text-popover-foreground shadow-popover outline-none duration-150 ease-out data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-98';

/**
 * The highlighted cmdk option in the switcher and picker popovers (spec §6.12). The accent
 * background alone is about 1.1 : 1 against the popover, so the option also gets a ring-colored
 * outline. CommandItem carries outline-hidden, which sets --tw-outline-style to none; Tailwind's
 * outline-2 reads that variable, so the outline also sets outline-solid.
 */
export const OPTION_CLASSES =
  'h-8 gap-2 rounded-sm px-2 py-0 data-[selected=true]:outline-solid data-[selected=true]:outline-2 data-[selected=true]:-outline-offset-2 data-[selected=true]:outline-ring';
