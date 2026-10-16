import { FilePlus2, FileUp, FolderPlus } from 'lucide-react';
import type { ReactElement } from 'react';
import { useDialogs } from '@/features/dialogs/DialogsProvider';
import { useCurrentContext } from '@/hooks/useCurrentContext';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNow } from '@/hooks/useNow';
import { greetingDate } from '@/lib/format';
import { cn } from '@/lib/utils';

// Spec §6.6: 44 tall, 20 px side padding, 16 px icons. Below 640 px the buttons stack full-width
// (§6.9). The focus ring is white with a brand-700 gap; the press scale stays off under reduced
// motion (§6.11).
const BUTTON_CLASSES =
  'inline-flex h-11 w-full items-center justify-center gap-2 rounded-md px-5 text-base font-semibold whitespace-nowrap outline-hidden transition duration-150 ease-standard focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-brand-700 motion-safe:active:scale-[0.98] sm:w-auto [&_svg]:size-4 [&_svg]:shrink-0';

const SOLID_CLASSES = 'bg-white text-brand-700 hover:bg-white/90';

// The glass border is an inset ring, so the focus ring can still sit outside the button.
const GLASS_CLASSES = 'bg-white/12 text-white inset-ring inset-ring-white/24 hover:bg-white/20';

/** "Hello, {firstName}" or, without a name, "Hello"; a skeleton while the user loads. */
function Greeting(): ReactElement {
  const { data: user, isPending } = useCurrentUser();
  const firstName = user?.firstName.trim() ?? '';
  return (
    <h1 id="welcome-heading" className="text-display font-bold tracking-[-0.01em]">
      {isPending ? (
        <>
          <span className="sr-only">Hello</span>
          <span
            aria-hidden="true"
            className="block h-8 w-[220px] max-w-full animate-pulse rounded-md bg-white/20"
          />
        </>
      ) : firstName === '' ? (
        'Hello'
      ) : (
        `Hello, ${firstName}`
      )}
    </h1>
  );
}

/** The greeting, today's date and the three creation actions on the brand surface (spec §6.6). */
export function WelcomeBanner(): ReactElement {
  const { project } = useCurrentContext();
  const { openDialog } = useDialogs();
  const now = useNow(60_000);

  return (
    <section
      aria-labelledby="welcome-heading"
      className="relative flex min-h-[200px] flex-col justify-between gap-6 overflow-hidden rounded-lg p-5 text-white banner-surface before:pointer-events-none before:absolute before:inset-0 before:blueprint-grid sm:px-7 sm:py-6"
    >
      <div className="relative">
        <Greeting />
        <p className="mt-1 text-sm font-medium text-white/85">{greetingDate(now)}</p>
      </div>
      <div className="relative flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <button
          type="button"
          className={cn(BUTTON_CLASSES, SOLID_CLASSES)}
          onClick={() => openDialog('newSchedule', { projectId: project?.id })}
        >
          <FilePlus2 aria-hidden="true" />
          New schedule
        </button>
        <button
          type="button"
          className={cn(BUTTON_CLASSES, GLASS_CLASSES)}
          onClick={() => openDialog('importSchedule', { projectId: project?.id })}
        >
          <FileUp aria-hidden="true" />
          Import schedule
        </button>
        <div aria-hidden="true" className="hidden h-7 w-px bg-white/25 sm:block" />
        <button
          type="button"
          className={cn(BUTTON_CLASSES, GLASS_CLASSES)}
          onClick={() => openDialog('newProject')}
        >
          <FolderPlus aria-hidden="true" />
          New project
        </button>
      </div>
    </section>
  );
}
