import { FolderPlus, Plus } from 'lucide-react';
import type { ReactElement } from 'react';
import { FOCUS_OUTLINE_CLASSES } from '@/components/layout/top-bar-parts';
import { useDialogs } from '@/features/dialogs/DialogsProvider';
import { cn } from '@/lib/utils';

/** The dashed card after the recent projects; opens the new project wizard (spec §6.6). */
export function CreateProjectCard(): ReactElement {
  const { openDialog } = useDialogs();
  return (
    <button
      type="button"
      onClick={() => openDialog('newProject')}
      className={cn(
        'flex h-[260px] flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-input bg-card/40 px-6 transition-colors duration-150 ease-standard hover:border-brand-400 hover:bg-card/60',
        FOCUS_OUTLINE_CLASSES,
      )}
    >
      <span
        aria-hidden="true"
        className="flex size-[72px] items-center justify-center rounded-2xl border border-dashed border-brand-400/40 bg-brand-500/12"
      >
        <FolderPlus className="size-7 text-brand-400" />
      </span>
      <span className="flex items-center gap-2 text-base font-bold text-link">
        <Plus className="size-4" aria-hidden="true" />
        Create new project
      </span>
    </button>
  );
}
