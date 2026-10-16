import { ListChecks } from 'lucide-react';
import { useRef } from 'react';
import type { ReactElement, RefObject } from 'react';
import { toast } from 'sonner';
import { EmptyState } from '@/components/common/EmptyState';
import { SectionError } from '@/components/common/SectionError';
import { FOCUS_OUTLINE_CLASSES } from '@/components/layout/top-bar-parts';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import type { ID, Task } from '@/data/types';
import { useNow } from '@/hooks/useNow';
import { usePendingTasks, useSetTaskDone } from '@/hooks/useTasks';
import { dueLabel, errorMessage } from '@/lib/format';
import { cn } from '@/lib/utils';

// Spec §6.6: rows 44 tall, 16 px side padding, 12 px gaps, a divider under every row but the last.
const ROW_CLASSES = 'flex h-11 items-center gap-3 border-b px-4 last:border-b-0';

function SkeletonRow(): ReactElement {
  return (
    <div data-testid="task-row-skeleton" aria-hidden="true" className={ROW_CLASSES}>
      <Skeleton className="size-4 shrink-0 rounded-[4px]" />
      <Skeleton className="h-3.5 w-1/2" />
      <Skeleton className="ml-auto h-3 w-16" />
    </div>
  );
}

function Content({
  sectionRef,
  headingRef,
}: {
  sectionRef: RefObject<HTMLElement | null>;
  headingRef: RefObject<HTMLHeadingElement | null>;
}): ReactElement {
  const tasks = usePendingTasks();
  const setTaskDone = useSetTaskDone();
  const now = useNow(60_000);
  const checkboxes = useRef(new Map<ID, HTMLButtonElement>());
  // The task that Undo is bringing back; its checkbox takes focus when its row returns.
  const focusOnReturn = useRef<ID | null>(null);

  if (tasks.data === undefined) {
    // A failed background refetch keeps the cached rows on screen.
    if (!tasks.isError) {
      return (
        <>
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
        </>
      );
    }
    return (
      <SectionError error={tasks.error} onRetry={() => void tasks.refetch()} className="flex-1" />
    );
  }

  if (tasks.data.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <EmptyState
          icon={ListChecks}
          title="You're all caught up"
          description="Tasks assigned to you will show up here."
        />
      </div>
    );
  }

  const undo = (taskId: ID, doneWrite: Promise<unknown>): void => {
    focusOnReturn.current = taskId;
    // The Undo button closes with its toast. Sonner sends focus back to where it was before the
    // toast; with nowhere to send it, the heading holds it until the row is back.
    headingRef.current?.focus();
    // After the done write, so the two writes can't reach the server in the wrong order. A failed
    // done write has already brought the task back and shown its error.
    doneWrite.then(
      () =>
        setTaskDone.mutateAsync({ taskId, done: false }).catch((error: unknown) => {
          focusOnReturn.current = null;
          toast.error(errorMessage(error));
        }),
      () => {
        focusOnReturn.current = null;
      },
    );
  };

  const complete = (taskId: ID, index: number, list: Task[]): void => {
    // The checked row leaves at once, so focus moves to a neighbour or, with none left, the heading.
    const neighbour = list[index + 1] ?? list[index - 1];
    (neighbour ? checkboxes.current.get(neighbour.id) : headingRef.current)?.focus();
    const doneWrite = setTaskDone.mutateAsync({ taskId, done: true });
    // Shown with the optimistic remove (spec §6.6, D15); a failed write takes it back.
    const toastId = toast('Task completed', {
      action: { label: 'Undo', onClick: () => undo(taskId, doneWrite) },
    });
    doneWrite.catch((error: unknown) => {
      toast.dismiss(toastId);
      toast.error(errorMessage(error));
    });
  };

  return (
    <ul>
      {tasks.data.map((task, index, list) => {
        const due = dueLabel(task.dueDate, now);
        return (
          <li key={task.id} className={ROW_CLASSES}>
            <Checkbox
              ref={(node) => {
                if (node === null) return;
                checkboxes.current.set(task.id, node);
                if (focusOnReturn.current === task.id) {
                  focusOnReturn.current = null;
                  // Unless the user has moved focus out of the panel in the meantime.
                  const active = document.activeElement;
                  if (active === document.body || sectionRef.current?.contains(active))
                    node.focus();
                }
                return () => {
                  checkboxes.current.delete(task.id);
                };
              }}
              checked={false}
              onCheckedChange={(checked) => {
                if (checked === true) complete(task.id, index, list);
              }}
              aria-label={`Mark '${task.title}' as done`}
              aria-describedby={due ? `todo-due-${task.id}` : undefined}
            />
            <span className="min-w-0 flex-1 truncate text-sm" title={task.title}>
              {task.title}
            </span>
            {due && (
              <span
                id={`todo-due-${task.id}`}
                className={cn(
                  'shrink-0 text-right text-xs',
                  due.overdue ? 'text-destructive' : 'text-muted-foreground',
                )}
              >
                {due.text}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** The user's pending tasks; checking one marks it done, with Undo in the toast (spec §6.6). */
export function TodoPanel(): ReactElement {
  const sectionRef = useRef<HTMLElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  return (
    <section ref={sectionRef} aria-labelledby="todo-heading" className="flex flex-col gap-4">
      {/* Focusable from script only: it takes focus when the last task is checked off. */}
      <h2
        id="todo-heading"
        ref={headingRef}
        tabIndex={-1}
        className={cn(
          'self-start rounded-sm text-lg font-bold tracking-[-0.01em]',
          FOCUS_OUTLINE_CLASSES,
        )}
      >
        To do
      </h2>
      <div className="flex min-h-[240px] flex-col overflow-hidden rounded-lg bg-card ring-1 ring-edge lg:min-h-[420px]">
        <Content sectionRef={sectionRef} headingRef={headingRef} />
      </div>
    </section>
  );
}
