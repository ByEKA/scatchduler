import { Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { ReactElement } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import type {
  ComputedScheduleSummary,
  RelationshipType,
  ScheduleActivity,
  ScheduleDocument,
  ScheduleRelationship,
} from '@/data/schedule-types';
import type { CommandResult, ScheduleCommand } from '@/features/schedule/commands';
import { formatWorkingDays } from '@/features/schedule/format-schedule';

export interface RelationshipsTabProps {
  document: ScheduleDocument;
  summary: ComputedScheduleSummary | null;
  activity: ScheduleActivity;
  mode: 'view' | 'edit';
  onJumpToActivity(activityId: string): void;
  onDispatch(command: ScheduleCommand): CommandResult;
}

const REL_TYPES: readonly RelationshipType[] = ['FS', 'SS', 'FF', 'SF'];

const CONTROL_CLASSES =
  'h-6 rounded-sm border border-input bg-background px-1.5 text-xs text-foreground outline-none focus-visible:border-ring';

function RelationshipTable({
  title,
  direction,
  relationships,
  activity,
  allActivities,
  activitiesById,
  summary,
  hoursPerDay,
  editable,
  onJumpToActivity,
  onDispatch,
}: {
  title: 'Predecessors' | 'Successors';
  direction: 'predecessor' | 'successor';
  relationships: readonly ScheduleRelationship[];
  activity: ScheduleActivity;
  allActivities: readonly ScheduleActivity[];
  activitiesById: ReadonlyMap<string, ScheduleActivity>;
  summary: ComputedScheduleSummary | null;
  hoursPerDay: number;
  editable: boolean;
  onJumpToActivity(activityId: string): void;
  onDispatch(command: ScheduleCommand): CommandResult;
}): ReactElement {
  const [targetId, setTargetId] = useState<string>('');
  const [relType, setRelType] = useState<RelationshipType>('FS');
  const [lagDays, setLagDays] = useState<string>('0');
  const [error, setError] = useState<string | null>(null);

  const dayMinutes = (hoursPerDay > 0 ? hoursPerDay : 8) * 60;
  const labelPrefix = direction === 'predecessor' ? 'Predecessor' : 'Successor';

  const handleAdd = () => {
    setError(null);
    const chosenId = targetId || allActivities[0]?.id || '';
    if (!chosenId) return;
    const lagNum = Number.parseFloat(lagDays);
    const lagMinutes = Number.isFinite(lagNum) ? Math.round(lagNum * dayMinutes) : 0;
    const res = onDispatch({
      type: 'addRelationship',
      predecessorId: direction === 'predecessor' ? chosenId : activity.id,
      successorId: direction === 'predecessor' ? activity.id : chosenId,
      relType,
      lagMinutes,
      lagElapsed: false,
    });
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setLagDays('0');
  };

  return (
    <section aria-label={title} className="flex min-w-0 flex-col gap-2">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-foreground">
          {title} ({relationships.length})
        </h3>
      </div>

      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full border-collapse text-left text-xs">
          <thead>
            <tr className="border-b border-border bg-muted/50 text-2xs text-muted-foreground">
              <th className="px-2 py-1 font-medium">Code</th>
              <th className="px-2 py-1 font-medium">Name</th>
              <th className="px-2 py-1 font-medium">Type</th>
              <th className="px-2 py-1 text-right font-medium">Lag</th>
              <th className="px-2 py-1 font-medium">Driving</th>
              <th className="px-2 py-1 text-right font-medium">Free float</th>
              {editable && (
                <th className="px-2 py-1 font-medium">
                  <span className="sr-only">Remove</span>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {relationships.length === 0 ? (
              <tr>
                <td
                  colSpan={editable ? 7 : 6}
                  className="px-2 py-3 text-center text-muted-foreground"
                >
                  No {title.toLowerCase()}.
                </td>
              </tr>
            ) : (
              relationships.map((rel) => {
                const otherId =
                  direction === 'predecessor' ? rel.predecessorId : rel.successorId;
                const other = activitiesById.get(otherId);
                const computed = summary?.relationships[rel.id];
                const lagInDays =
                  Math.round((rel.lagMinutes / (rel.lagElapsed ? 1440 : dayMinutes)) * 10) / 10;

                return (
                  <tr key={rel.id} className="border-b border-border/60 last:border-b-0">
                    <td className="px-2 py-1 font-mono">
                      {other ? (
                        <button
                          type="button"
                          onClick={() => onJumpToActivity(other.id)}
                          className="text-link hover:underline"
                        >
                          {other.code}
                        </button>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="max-w-44 truncate px-2 py-1" title={other?.name}>
                      {other?.name ?? '—'}
                    </td>
                    <td className="px-2 py-1">
                      {editable ? (
                        <select
                          aria-label={`Link type with ${other?.code ?? rel.id}`}
                          value={rel.type}
                          onChange={(event) => {
                            const res = onDispatch({
                              type: 'updateRelationship',
                              relationshipId: rel.id,
                              changes: { type: event.target.value as RelationshipType },
                            });
                            if (!res.ok) toast.error(res.error);
                          }}
                          className={CONTROL_CLASSES}
                        >
                          {REL_TYPES.map((t) => (
                            <option key={t} value={t}>
                              {t}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="font-mono">{rel.type}</span>
                      )}
                    </td>
                    <td className="px-2 py-1 text-right tabular-nums">
                      {editable ? (
                        <input
                          type="number"
                          step="0.5"
                          aria-label={`Lag days with ${other?.code ?? rel.id}`}
                          value={lagInDays === 0 ? 0 : lagInDays}
                          onChange={(event) => {
                            const num = Number.parseFloat(event.target.value);
                            if (!Number.isFinite(num)) return;
                            const unitMin = rel.lagElapsed ? 1440 : dayMinutes;
                            const res = onDispatch({
                              type: 'updateRelationship',
                              relationshipId: rel.id,
                              changes: { lagMinutes: Math.round(num * unitMin) },
                            });
                            if (!res.ok) toast.error(res.error);
                          }}
                          className={`${CONTROL_CLASSES} w-14 text-right`}
                        />
                      ) : rel.lagElapsed ? (
                        `${lagInDays} ed`
                      ) : (
                        formatWorkingDays(rel.lagMinutes, hoursPerDay, { signed: true })
                      )}
                    </td>
                    <td className="px-2 py-1">
                      {computed?.isDriving ? (
                        <span className="inline-flex rounded-xs bg-gantt-critical/15 px-1.5 py-px text-2xs font-medium text-gantt-critical">
                          Driving
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-2 py-1 text-right tabular-nums">
                      {formatWorkingDays(computed?.freeFloat ?? null, hoursPerDay, {
                        signed: true,
                      })}
                    </td>
                    {editable && (
                      <td className="px-2 py-1 text-right">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          aria-label={`Remove link with ${other?.code ?? rel.id}`}
                          onClick={() => {
                            const res = onDispatch({
                              type: 'deleteRelationship',
                              relationshipId: rel.id,
                            });
                            if (!res.ok) toast.error(res.error);
                          }}
                        >
                          <Trash2 className="size-3.5 text-muted-foreground hover:text-destructive" aria-hidden="true" />
                        </Button>
                      </td>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {editable && (
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <select
              aria-label={`${labelPrefix} activity`}
              value={targetId}
              onChange={(event) => {
                setTargetId(event.target.value);
                setError(null);
              }}
              className={`${CONTROL_CLASSES} min-w-40 flex-1`}
            >
              <option value="">Select activity…</option>
              {allActivities.map((act) => (
                <option key={act.id} value={act.id}>
                  {act.code} · {act.name}
                </option>
              ))}
            </select>
            <select
              aria-label={`${labelPrefix} link type`}
              value={relType}
              onChange={(event) => setRelType(event.target.value as RelationshipType)}
              className={`${CONTROL_CLASSES} w-14`}
            >
              {REL_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <input
              type="number"
              step="0.5"
              aria-label={`${labelPrefix} lag (days)`}
              value={lagDays}
              onChange={(event) => setLagDays(event.target.value)}
              className={`${CONTROL_CLASSES} w-16 text-right`}
              placeholder="0 d"
            />
            <Button
              type="button"
              variant="outline"
              size="xs"
              aria-label={`Add ${direction}`}
              disabled={targetId === ''}
              onClick={handleAdd}
              className="border-input bg-card dark:bg-card"
            >
              <Plus className="size-3" aria-hidden="true" />
              Add
            </Button>
          </div>
          {error !== null && (
            <p role="alert" className="text-2xs text-destructive">
              {error}
            </p>
          )}
        </div>
      )}
    </section>
  );
}

/**
 * Inspector `Relationships` tab showing side-by-side Predecessors and Successors tables with
 * jump-to-activity links, Driving badges, link free float, and inline Edit-mode authoring (spec §7.2).
 */
export function RelationshipsTab({
  document,
  summary,
  activity,
  mode,
  onJumpToActivity,
  onDispatch,
}: RelationshipsTabProps): ReactElement {
  const activitiesById = useMemo(
    () => new Map(document.activities.map((a) => [a.id, a])),
    [document.activities],
  );
  const cal =
    document.calendars.find((c) => c.id === activity.calendarId) ?? document.calendars[0];
  const hoursPerDay = cal?.hoursPerDay ?? 8;

  const predecessors = useMemo(
    () => document.relationships.filter((r) => r.successorId === activity.id),
    [activity.id, document.relationships],
  );
  const successors = useMemo(
    () => document.relationships.filter((r) => r.predecessorId === activity.id),
    [activity.id, document.relationships],
  );

  const editable = mode === 'edit';

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <RelationshipTable
        title="Predecessors"
        direction="predecessor"
        relationships={predecessors}
        activity={activity}
        allActivities={document.activities}
        activitiesById={activitiesById}
        summary={summary}
        hoursPerDay={hoursPerDay}
        editable={editable}
        onJumpToActivity={onJumpToActivity}
        onDispatch={onDispatch}
      />
      <RelationshipTable
        title="Successors"
        direction="successor"
        relationships={successors}
        activity={activity}
        allActivities={document.activities}
        activitiesById={activitiesById}
        summary={summary}
        hoursPerDay={hoursPerDay}
        editable={editable}
        onJumpToActivity={onJumpToActivity}
        onDispatch={onDispatch}
      />
    </div>
  );
}
