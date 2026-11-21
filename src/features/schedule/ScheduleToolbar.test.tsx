import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { Schedule, WorkspaceSummary } from '@/data/types';
import { makeActivity, makeDocument } from '@/engine/testing';
import { ScheduleToolbar } from '@/features/schedule/ScheduleToolbar';
import type { ScheduleEditorController } from '@/features/schedule/useScheduleEditor';
import { VIEWER_HINT } from '@/features/workspaces/roles';

function makeSchedule(overrides: Partial<Schedule> = {}): Schedule {
  return {
    id: 'sched-1',
    projectId: 'proj-1',
    name: 'Update 2',
    code: 'UP-02',
    isCurrent: true,
    baseline: 'none',
    updateNumber: 2,
    statusDate: '2026-01-12',
    notes: null,
    activityCount: 2,
    source: 'import',
    sourceFormat: 'xer',
    sourceFileName: 'plan.xer',
    hasImportReport: true,
    hasImportMapping: true,
    hasScheduleData: true,
    dataRevision: 1,
    calculationMode: 'as_imported',
    lock: null,
    archivedAt: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-12T00:00:00Z',
    ...overrides,
  };
}

function makeWorkspace(myRole: WorkspaceSummary['myRole'] = 'owner'): WorkspaceSummary {
  return {
    id: 'ws-1',
    name: 'Site Operations',
    kind: 'team',
    myRole,
    projectCount: 2,
    createdAt: '2026-01-01T00:00:00Z',
  };
}

function makeEditor(overrides: Partial<ScheduleEditorController> = {}): ScheduleEditorController {
  const doc = makeDocument({
    activities: [makeActivity({ id: 'a1', code: 'A1010', name: 'Excavation' })],
  });
  return {
    document: doc,
    summary: null,
    rollups: {},
    mode: 'view',
    dirty: false,
    stale: false,
    isCalculating: false,
    isSaving: false,
    cycleError: null,
    selectedKey: 'act:a1',
    selectedActivityId: 'a1',
    collapsedWbsIds: new Set(),
    showCritical: true,
    showLinks: true,
    drivingPath: null,
    canUndo: false,
    canRedo: false,
    lastAnnouncement: '',
    dataRevision: 1,
    lock: {
      lock: null,
      isMine: false,
      lost: false,
      acquire: vi.fn(async () => undefined),
      release: vi.fn(async () => undefined),
      forceRelease: vi.fn(async () => undefined),
    },
    dispatch: vi.fn(() => ({
      ok: true as const,
      document: doc,
      forward: [],
      inverse: [],
      stale: true,
      selectId: 'a2',
    })),
    undo: vi.fn(),
    redo: vi.fn(),
    calculate: vi.fn(async () => ({
      ok: true as const,
      summary: {
        calculatedAt: '2026-01-12T00:00:00Z',
        durationMs: 2,
        projectStart: null,
        projectFinish: null,
        activities: {},
        relationships: {},
        wbsRollups: {},
        warnings: [],
      },
    })),
    enterEdit: vi.fn(async () => true),
    exitEdit: vi.fn(async () => undefined),
    save: vi.fn(async () => true),
    discard: vi.fn(async () => undefined),
    selectKey: vi.fn(),
    jumpToActivity: vi.fn(),
    toggleWbs: vi.fn(),
    setShowCritical: vi.fn(),
    setShowLinks: vi.fn(),
    toggleDrivingPath: vi.fn(async () => undefined),
    ...overrides,
  };
}

function renderToolbar(props: {
  schedule?: Schedule;
  workspace?: WorkspaceSummary;
  editor?: ScheduleEditorController;
}) {
  return render(
    <TooltipProvider delayDuration={0}>
      <ScheduleToolbar
        schedule={props.schedule ?? makeSchedule()}
        workspace={props.workspace ?? makeWorkspace('owner')}
        editor={props.editor ?? makeEditor()}
        zoom="week"
        onZoomChange={vi.fn()}
        onZoomToFit={vi.fn()}
        detailsOpen={false}
        onToggleDetails={vi.fn()}
      />
    </TooltipProvider>,
  );
}

describe('ScheduleToolbar', () => {
  it('renders Edit for editors, disabled Edit with viewer hint for viewers, and Archived badge for archived schedules', async () => {
    const user = userEvent.setup();

    // Editor sees enabled Edit
    const editor = makeEditor();
    const first = renderToolbar({ workspace: makeWorkspace('editor'), editor });
    const editBtn = screen.getByRole('button', { name: 'Edit' });
    expect(editBtn).not.toHaveAttribute('aria-disabled', 'true');
    await user.click(editBtn);
    expect(editor.enterEdit).toHaveBeenCalledTimes(1);
    first.unmount();

    // Viewer sees disabled Edit with VIEWER_HINT tooltip
    const viewer = renderToolbar({ workspace: makeWorkspace('viewer') });
    const viewerEdit = screen.getByRole('button', { name: 'Edit' });
    expect(viewerEdit).toHaveAttribute('aria-disabled', 'true');
    await user.hover(viewerEdit);
    expect(await screen.findByRole('tooltip')).toHaveTextContent(VIEWER_HINT);
    viewer.unmount();

    // Archived schedule shows Archived · read-only badge and no Edit button
    renderToolbar({ schedule: makeSchedule({ archivedAt: '2026-01-10T00:00:00Z' }) });
    expect(screen.getByText('Archived · read-only')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
  });

  it('shows Locked by pill and owner-only Unlock confirmation AlertDialog', async () => {
    const user = userEvent.setup();
    const forceRelease = vi.fn(async () => undefined);
    const otherLock = {
      userId: 'other-user',
      userName: 'Mert Demir',
      lockedAt: '2026-01-12T10:00:00Z',
      expiresAt: '2099-01-12T10:15:00Z',
    };

    // Non-owner editor sees Locked by pill but no Unlock button
    const nonOwner = renderToolbar({
      workspace: makeWorkspace('editor'),
      editor: makeEditor({
        lock: {
          lock: otherLock,
          isMine: false,
          lost: false,
          acquire: vi.fn(async () => undefined),
          release: vi.fn(async () => undefined),
          forceRelease,
        },
      }),
    });
    expect(screen.getByText('Locked by Mert Demir')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Unlock' })).not.toBeInTheDocument();
    nonOwner.unmount();

    // Owner sees Unlock button opening AlertDialog with exact spec copy
    renderToolbar({
      workspace: makeWorkspace('owner'),
      editor: makeEditor({
        lock: {
          lock: otherLock,
          isMine: false,
          lost: false,
          acquire: vi.fn(async () => undefined),
          release: vi.fn(async () => undefined),
          forceRelease,
        },
      }),
    });
    await user.click(screen.getByRole('button', { name: 'Unlock' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Unlock this schedule?' });
    expect(dialog).toHaveAccessibleDescription(
      'Mert Demir may lose unsaved changes if you unlock it.',
    );
    await user.click(within(dialog).getByRole('button', { name: 'Unlock' }));
    expect(forceRelease).toHaveBeenCalledTimes(1);
  });

  it('wires Edit mode actions: Save, Discard confirmation, Undo/Redo, + Activity, + WBS, Delete, and Recalculate needed', async () => {
    const user = userEvent.setup();
    const editor = makeEditor({
      mode: 'edit',
      dirty: true,
      stale: true,
      canUndo: true,
      canRedo: true,
    });
    renderToolbar({ editor });

    expect(screen.getByText('Recalculate needed')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(editor.save).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(editor.undo).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: 'Redo' }));
    expect(editor.redo).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: '+ Activity' }));
    expect(editor.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'addActivity' }),
    );

    await user.click(screen.getByRole('button', { name: '+ WBS' }));
    expect(editor.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'addWbsNode' }),
    );

    await user.click(screen.getByRole('button', { name: 'Delete' }));
    expect(editor.dispatch).toHaveBeenCalledWith({
      type: 'deleteActivities',
      activityIds: ['a1'],
    });

    // Discard when dirty prompts confirmation
    await user.click(screen.getByRole('button', { name: 'Discard' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Discard unsaved changes?' });
    await user.click(within(dialog).getByRole('button', { name: 'Discard' }));
    expect(editor.discard).toHaveBeenCalledTimes(1);
  });
});
