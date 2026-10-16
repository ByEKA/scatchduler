import { FolderPlus } from 'lucide-react';
import { useEffect, useEffectEvent, useId, useRef } from 'react';
import type { ReactElement } from 'react';
import { EmptyState } from '@/components/common/EmptyState';
import type { FormDialogProps } from '@/components/common/FormDialog';
import { SectionError } from '@/components/common/SectionError';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useDialogs } from '@/features/dialogs/DialogsProvider';
import { useCurrentContext } from '@/hooks/useCurrentContext';

type ScheduleDialogView = 'loading' | 'error' | 'empty' | 'form';

/** What replaces a schedule dialog's fields and footer while it has no project to offer. */
export interface ScheduleDialogFallback {
  body: ReactElement;
  footer: NonNullable<FormDialogProps['footer']>;
}

export interface ScheduleDialogFallbackOptions {
  /**
   * Control heights of the form's fields in px, so the loading state is the form's size. The last
   * field is Project, which has the "Create a new project" link under it.
   */
  fieldHeights: readonly number[];
  /** Focuses the form's first field. */
  focusForm: () => void;
}

/**
 * A schedule dialog while it has no project to offer (spec §6.7, §6.10): skeleton fields while
 * the projects load, Retry when they failed to load, and "Create a project first." with a
 * "Create project" button that opens the new project wizard when the workspace has none.
 * `fallback` is null once the form can show.
 *
 * The dialog stays mounted from one view to the next, so it plays its open animation once. Focus
 * goes to the view's first control when the dialog opens and again when the view changes: the
 * form's first field, or "Create project". While loading or after an error, Radix picks it.
 */
export function useScheduleDialogFallback({
  fieldHeights,
  focusForm,
}: ScheduleDialogFallbackOptions): {
  fallback: ScheduleDialogFallback | null;
  onOpenAutoFocus: (event: Event) => void;
} {
  const { status, error, projects, retry } = useCurrentContext();
  const { openDialog } = useDialogs();
  const noticeId = useId();
  const createRef = useRef<HTMLButtonElement>(null);
  let view: ScheduleDialogView = 'form';
  if (status !== 'ready') view = status;
  else if (projects.length === 0) view = 'empty';

  /** Returns true when it moved focus. */
  function focusView(): boolean {
    if (view === 'form') {
      focusForm();
      return true;
    }
    if (view === 'empty' && createRef.current !== null) {
      createRef.current.focus();
      return true;
    }
    return false;
  }

  // On open this can run before the dialog's content is attached and then does nothing;
  // onOpenAutoFocus covers the open.
  const onViewChange = useEffectEvent(() => {
    focusView();
  });
  useEffect(() => {
    onViewChange();
  }, [view]);

  function onOpenAutoFocus(event: Event): void {
    if (focusView()) event.preventDefault();
  }

  if (view === 'form') return { fallback: null, onOpenAutoFocus };

  return {
    fallback: {
      body: (
        <>
          {view === 'loading' && (
            <div aria-hidden="true" className="flex flex-col gap-4">
              {fieldHeights.map((height, index) => (
                <div key={index} className="flex flex-col gap-1.5">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="w-full" style={{ height }} />
                  {index === fieldHeights.length - 1 && <Skeleton className="h-4 w-32" />}
                </div>
              ))}
            </div>
          )}
          {view === 'error' && <SectionError error={error} onRetry={retry} className="py-6" />}
          {view === 'empty' && (
            <div id={noticeId} className="py-6">
              <EmptyState icon={FolderPlus} title="Create a project first." />
            </div>
          )}
        </>
      ),
      footer: ({ requestClose }) => (
        <>
          <Button type="button" variant="secondary" onClick={requestClose}>
            Cancel
          </Button>
          {view === 'empty' && (
            <Button
              ref={createRef}
              type="button"
              aria-describedby={noticeId}
              onClick={() => openDialog('newProject')}
            >
              Create project
            </Button>
          )}
        </>
      ),
    },
    onOpenAutoFocus,
  };
}
