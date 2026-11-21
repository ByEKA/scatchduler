import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import type {
  ComputedScheduleSummary,
  ComputedWbsRollup,
  DrivingPath,
  ScheduleDocument,
  SolveResult,
  SolverError,
} from '@/data/schedule-types';
import type { Schedule, ScheduleLock } from '@/data/types';
import {
  applyCommand,
  emptyHistory,
  record,
  redo as redoHistory,
  undo as undoHistory,
  type CommandResult,
  type EditHistory,
  type ScheduleCommand,
} from '@/features/schedule/commands';
import { useSaveScheduleDocument } from '@/hooks/useScheduleDocument';
import { useScheduleEngine } from '@/hooks/useScheduleEngine';
import { useScheduleLock } from '@/hooks/useScheduleLock';
import { errorMessage } from '@/lib/format';

export interface ScheduleEditorState {
  document: ScheduleDocument;
  summary: ComputedScheduleSummary | null;
  rollups: Record<string, ComputedWbsRollup>;
  mode: 'view' | 'edit';
  dirty: boolean;
  stale: boolean;
  isCalculating: boolean;
  isSaving: boolean;
  cycleError: SolverError | null;
  selectedKey: string | null; // 'wbs:{id}' | 'act:{id}'
  selectedActivityId: string | null;
  collapsedWbsIds: ReadonlySet<string>;
  showCritical: boolean;
  showLinks: boolean;
  drivingPath: DrivingPath | null;
  canUndo: boolean;
  canRedo: boolean;
  lastAnnouncement: string; // fed to aria-live="polite"
  dispatch(command: ScheduleCommand): CommandResult;
  undo(): void;
  redo(): void;
  calculate(): Promise<SolveResult>;
  enterEdit(): Promise<boolean>;
  exitEdit(): Promise<void>; // only when clean
  save(): Promise<boolean>;
  discard(): Promise<void>;
  selectKey(key: string | null): void;
  jumpToActivity(activityId: string): void;
  toggleWbs(wbsId: string): void;
  setShowCritical(value: boolean): void;
  setShowLinks(value: boolean): void;
  toggleDrivingPath(): Promise<void>;
}

export interface ScheduleEditorController extends ScheduleEditorState {
  dataRevision: number;
  lock: {
    lock: ScheduleLock | null;
    isMine: boolean;
    lost: boolean;
    acquire(): Promise<void>;
    release(): Promise<void>;
    forceRelease(): Promise<void>;
  };
}

export interface UseScheduleEditorParams {
  schedule: Schedule;
  initialDocument: ScheduleDocument;
  initialRevision: number;
}

const EMPTY_ROLLUPS: Record<string, ComputedWbsRollup> = {};

function selectedActivityFromKey(key: string | null): string | null {
  if (key === null || !key.startsWith('act:')) return null;
  return key.slice(4);
}

/**
 * Coordinates the interactive schedule document, 100-step Undo/Redo history, Web Worker CPM
 * calculation, WBS rollups, edit lock lifecycle and explicit Save/Discard (spec §6, §7.2).
 */
export function useScheduleEditor({
  schedule,
  initialDocument,
  initialRevision,
}: UseScheduleEditorParams): ScheduleEditorController {
  const {
    solve: engineSolve,
    rollup: engineRollup,
    traceDrivingPath: engineTraceDrivingPath,
    isCalculating,
  } = useScheduleEngine();
  const lock = useScheduleLock(schedule);
  const { acquire: lockAcquire, release: lockRelease } = lock;
  const { mutateAsync: saveScheduleAsync } = useSaveScheduleDocument();

  const [document, setDocument] = useState<ScheduleDocument>(initialDocument);
  const [summary, setSummary] = useState<ComputedScheduleSummary | null>(initialDocument.computed);
  const [rollups, setRollups] = useState<Record<string, ComputedWbsRollup>>(
    initialDocument.computed?.wbsRollups ?? EMPTY_ROLLUPS,
  );
  const [dataRevision, setDataRevision] = useState<number>(initialRevision);
  const [mode, setMode] = useState<'view' | 'edit'>('view');
  const [dirty, setDirty] = useState(false);
  const [stale, setStale] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [cycleError, setCycleError] = useState<SolverError | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [collapsedWbsIds, setCollapsedWbsIds] = useState<ReadonlySet<string>>(() => new Set());
  const [showCritical, setShowCritical] = useState(true);
  const [showLinks, setShowLinks] = useState(true);
  const [drivingPath, setDrivingPath] = useState<DrivingPath | null>(null);
  const [history, setHistory] = useState<EditHistory>(emptyHistory);
  const [lastAnnouncement, setLastAnnouncement] = useState('');

  // Refs keep synchronous snapshots accessible across async handlers and rapid command batches.
  const docRef = useRef<ScheduleDocument>(initialDocument);
  const savedDocRef = useRef<ScheduleDocument>(initialDocument);
  const summaryRef = useRef<ComputedScheduleSummary | null>(initialDocument.computed);
  const revisionRef = useRef<number>(initialRevision);
  const historyRef = useRef<EditHistory>(history);
  const modeRef = useRef<'view' | 'edit'>('view');
  const dirtyRef = useRef(false);
  const staleRef = useRef(false);
  const enteringRef = useRef(false);
  const savingRef = useRef(false);
  const rollupSeqRef = useRef(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const refreshRollups = useCallback(
    async (targetDoc: ScheduleDocument, targetSummary: ComputedScheduleSummary | null) => {
      const seq = ++rollupSeqRef.current;
      try {
        const next = await engineRollup(targetDoc, targetSummary);
        if (mountedRef.current && seq === rollupSeqRef.current) {
          setRollups(next);
        }
      } catch {
        // Ignore superseded/canceled rollup requests.
      }
    },
    [engineRollup],
  );

  // Compute initial rollups immediately so "As imported" schedules show WBS summary dates on open.
  useEffect(() => {
    let cancelled = false;
    const seq = ++rollupSeqRef.current;
    void engineRollup(initialDocument, initialDocument.computed)
      .then((next) => {
        if (!cancelled && mountedRef.current && seq === rollupSeqRef.current) {
          setRollups(next);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [engineRollup, initialDocument]);

  const runCalculate = useCallback(
    async (targetDoc: ScheduleDocument): Promise<SolveResult> => {
      const result = await engineSolve(targetDoc);
      if (!mountedRef.current) return result;
      if (result.ok) {
        const nextSummary = result.summary;
        const nextDoc: ScheduleDocument = {
          ...docRef.current,
          computed: nextSummary,
          settings: {
            ...docRef.current.settings,
            displayMode: 'calculated',
          },
        };
        docRef.current = nextDoc;
        summaryRef.current = nextSummary;
        staleRef.current = false;
        setDocument(nextDoc);
        setSummary(nextSummary);
        setRollups(nextSummary.wbsRollups);
        setStale(false);
        setCycleError(null);
        setDrivingPath(null);
        if (modeRef.current === 'edit') {
          dirtyRef.current = true;
          setDirty(true);
        }
        setLastAnnouncement(`Calculated in ${Math.round(nextSummary.durationMs)} ms`);
      } else {
        setCycleError(result.error);
        setLastAnnouncement(result.error.message);
      }
      return result;
    },
    [engineSolve],
  );

  const calculate = useCallback(() => runCalculate(docRef.current), [runCalculate]);

  const dispatch = useCallback(
    (command: ScheduleCommand): CommandResult => {
      const result = applyCommand(docRef.current, command);
      if (!result.ok) return result;

      const nextHistory = record(historyRef.current, {
        command,
        forward: result.forward,
        inverse: result.inverse,
      });
      const nextStale = staleRef.current || result.stale;

      docRef.current = result.document;
      historyRef.current = nextHistory;
      dirtyRef.current = true;
      staleRef.current = nextStale;

      setDocument(result.document);
      setHistory(nextHistory);
      setDirty(true);
      setStale(nextStale);

      if (result.stale) {
        setDrivingPath(null);
      }

      if (result.selectId !== null) {
        if (command.type === 'addWbsNode' || command.type === 'updateWbsNode') {
          setSelectedKey(`wbs:${result.selectId}`);
        } else {
          setSelectedKey(`act:${result.selectId}`);
        }
      } else if (command.type === 'deleteActivities' || command.type === 'deleteWbsNode') {
        setSelectedKey(null);
        setDrivingPath(null);
      }

      void refreshRollups(result.document, summaryRef.current);

      if (result.document.settings.autoCalculate && result.stale) {
        void runCalculate(result.document);
      }

      return result;
    },
    [refreshRollups, runCalculate],
  );

  const undo = useCallback(() => {
    const step = undoHistory(docRef.current, historyRef.current);
    if (step === null) return;
    docRef.current = step.document;
    historyRef.current = step.history;
    dirtyRef.current = true;
    staleRef.current = true;
    setDocument(step.document);
    setHistory(step.history);
    setDirty(true);
    setStale(true);
    setDrivingPath(null);
    void refreshRollups(step.document, summaryRef.current);
  }, [refreshRollups]);

  const redo = useCallback(() => {
    const step = redoHistory(docRef.current, historyRef.current);
    if (step === null) return;
    docRef.current = step.document;
    historyRef.current = step.history;
    dirtyRef.current = true;
    staleRef.current = true;
    setDocument(step.document);
    setHistory(step.history);
    setDirty(true);
    setStale(true);
    setDrivingPath(null);
    void refreshRollups(step.document, summaryRef.current);
  }, [refreshRollups]);

  const enterEdit = useCallback(async (): Promise<boolean> => {
    if (modeRef.current === 'edit') return true;
    if (enteringRef.current) return false;
    enteringRef.current = true;
    try {
      await lockAcquire();
      if (!mountedRef.current) return false;
      modeRef.current = 'edit';
      setMode('edit');
      setLastAnnouncement('Entered edit mode');
      return true;
    } catch (error) {
      toast.error(errorMessage(error));
      return false;
    } finally {
      enteringRef.current = false;
    }
  }, [lockAcquire]);

  const exitEdit = useCallback(async (): Promise<void> => {
    if (dirtyRef.current) return;
    try {
      await lockRelease();
    } catch {
      // Best-effort release when exiting clean edit mode.
    }
    if (!mountedRef.current) return;
    modeRef.current = 'view';
    setMode('view');
    setLastAnnouncement('Exited edit mode');
  }, [lockRelease]);

  const save = useCallback(async (): Promise<boolean> => {
    if (savingRef.current || !dirtyRef.current) return false;
    savingRef.current = true;
    setIsSaving(true);
    try {
      const saved = await saveScheduleAsync({
        scheduleId: schedule.id,
        expectedRevision: revisionRef.current,
        document: docRef.current,
      });
      if (!mountedRef.current) return true;
      revisionRef.current = saved.dataRevision;
      savedDocRef.current = docRef.current;
      historyRef.current = emptyHistory();
      dirtyRef.current = false;
      setDataRevision(saved.dataRevision);
      setHistory(historyRef.current);
      setDirty(false);
      toast.success('Schedule saved');
      setLastAnnouncement('Schedule saved');
      return true;
    } catch (error) {
      toast.error(errorMessage(error));
      return false;
    } finally {
      savingRef.current = false;
      if (mountedRef.current) {
        setIsSaving(false);
      }
    }
  }, [saveScheduleAsync, schedule.id]);

  const discard = useCallback(async (): Promise<void> => {
    const baseline = savedDocRef.current;
    docRef.current = baseline;
    summaryRef.current = baseline.computed;
    historyRef.current = emptyHistory();
    dirtyRef.current = false;
    staleRef.current = false;
    setDocument(baseline);
    setSummary(baseline.computed);
    setHistory(historyRef.current);
    setDirty(false);
    setStale(false);
    setCycleError(null);
    setDrivingPath(null);
    void refreshRollups(baseline, baseline.computed);
    try {
      await lockRelease();
    } catch {
      // Best-effort release on discard.
    }
    if (!mountedRef.current) return;
    modeRef.current = 'view';
    setMode('view');
    setLastAnnouncement('Discarded unsaved changes');
  }, [lockRelease, refreshRollups]);

  const selectKey = useCallback((key: string | null) => {
    setSelectedKey(key);
    setDrivingPath(null);
  }, []);

  const jumpToActivity = useCallback((activityId: string) => {
    const currentDoc = docRef.current;
    const act = currentDoc.activities.find((a) => a.id === activityId);
    if (!act) return;

    if (act.wbsId !== null) {
      const wbsById = new Map(currentDoc.wbs.map((w) => [w.id, w]));
      const ancestors: string[] = [];
      let cursor: string | null = act.wbsId;
      while (cursor !== null) {
        ancestors.push(cursor);
        cursor = wbsById.get(cursor)?.parentId ?? null;
      }
      setCollapsedWbsIds((prev) => {
        if (!ancestors.some((id) => prev.has(id))) return prev;
        const next = new Set(prev);
        for (const id of ancestors) next.delete(id);
        return next;
      });
    }

    setSelectedKey(`act:${activityId}`);
  }, []);

  const toggleWbs = useCallback((wbsId: string) => {
    setCollapsedWbsIds((prev) => {
      const next = new Set(prev);
      if (next.has(wbsId)) next.delete(wbsId);
      else next.add(wbsId);
      return next;
    });
  }, []);

  const selectedActivityId = selectedActivityFromKey(selectedKey);

  const toggleDrivingPath = useCallback(async (): Promise<void> => {
    if (drivingPath !== null) {
      setDrivingPath(null);
      return;
    }
    if (selectedActivityId === null || summaryRef.current === null) return;
    try {
      const path = await engineTraceDrivingPath(selectedActivityId);
      if (mountedRef.current) setDrivingPath(path);
    } catch {
      // If loaded from a cached snapshot before any solve in this session, prime the worker cache.
      const solved = await engineSolve(docRef.current);
      if (!mountedRef.current || !solved.ok) return;
      try {
        const path = await engineTraceDrivingPath(selectedActivityId);
        if (mountedRef.current) setDrivingPath(path);
      } catch {
        // Ignore if activity cannot be traced.
      }
    }
  }, [drivingPath, engineSolve, engineTraceDrivingPath, selectedActivityId]);

  return {
    document,
    summary,
    rollups,
    mode,
    dirty,
    stale,
    isCalculating,
    isSaving,
    cycleError,
    selectedKey,
    selectedActivityId,
    collapsedWbsIds,
    showCritical,
    showLinks,
    drivingPath,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
    lastAnnouncement,
    dataRevision,
    lock,
    dispatch,
    undo,
    redo,
    calculate,
    enterEdit,
    exitEdit,
    save,
    discard,
    selectKey,
    jumpToActivity,
    toggleWbs,
    setShowCritical,
    setShowLinks,
    toggleDrivingPath,
  };
}
