import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2, UserMinus } from 'lucide-react';
import { Select as SelectPrimitive } from 'radix-ui';
import { useId, useRef, useState } from 'react';
import type { FormEvent, ReactElement } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { ConfirmDialog, DialogShell } from '@/components/common/FormDialog';
import {
  POPOVER_SHELL_CLASSES,
  SELECT_ITEM_HIGHLIGHT_CLASSES,
} from '@/components/common/popover-classes';
import { SectionError } from '@/components/common/SectionError';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import type { ID, Role, WorkspaceInvitation, WorkspaceMember } from '@/data/types';
import { useDialogs } from '@/features/dialogs/DialogsProvider';
import {
  INVITE_DEFAULTS,
  inviteSchema,
  type InviteValues,
} from '@/features/workspaces/member-schema';
import { isOwner, ROLE_DESCRIPTIONS, ROLE_LABELS, ROLES } from '@/features/workspaces/roles';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import {
  useInviteMember,
  useRemoveMember,
  useRevokeInvitation,
  useUpdateMemberRole,
  useWorkspaceInvitations,
  useWorkspaceMembers,
} from '@/hooks/useMembers';
import { useNow } from '@/hooks/useNow';
import { useWorkspaces } from '@/hooks/useWorkspaces';
import { errorMessage, fullName, initials, relativeTime } from '@/lib/format';
import { cn } from '@/lib/utils';

const ROW_CLASSES = 'flex min-h-12 items-center gap-3 py-2';

function isRole(value: string): value is Role {
  return ROLES.some((role) => role === value);
}

function inviteToast(email: string, status: 'added' | 'invited'): string {
  return status === 'added' ? `${email} was added to the workspace` : `Invitation sent to ${email}`;
}

/** The trigger shows the role's label; each option adds its description (P2 spec §5.8). */
function RoleOptions(): ReactElement {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        position="popper"
        side="bottom"
        align="start"
        sideOffset={6}
        className={cn(
          POPOVER_SHELL_CLASSES,
          'max-h-(--radix-select-content-available-height) w-72 min-w-(--radix-select-trigger-width) origin-(--radix-select-content-transform-origin) overflow-y-auto',
        )}
      >
        <SelectPrimitive.Viewport>
          {ROLES.map((role) => (
            <SelectItem
              key={role}
              value={role}
              className={cn('py-1.5', SELECT_ITEM_HIGHLIGHT_CLASSES)}
            >
              <span className="flex flex-col items-start gap-0.5">
                <span>{ROLE_LABELS[role]}</span>
                <span className="text-xs text-muted-foreground">{ROLE_DESCRIPTIONS[role]}</span>
              </span>
            </SelectItem>
          ))}
        </SelectPrimitive.Viewport>
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  );
}

function SkeletonRows(): ReactElement {
  return (
    <>
      {[0, 1, 2].map((index) => (
        <div
          key={index}
          data-testid="member-row-skeleton"
          aria-hidden="true"
          className={ROW_CLASSES}
        >
          <Skeleton className="size-7 shrink-0 rounded-full" />
          <Skeleton className="h-3.5 w-2/5" />
          <Skeleton className="ml-auto h-3 w-16" />
        </div>
      ))}
    </>
  );
}

function InviteForm({ workspaceId }: { workspaceId: ID }): ReactElement {
  const invite = useInviteMember(workspaceId);
  const emailId = useId();
  const roleId = useId();
  const errorId = useId();
  // Drops a second submit that arrives before the pending state has rendered.
  const submittingRef = useRef(false);
  const {
    register,
    control,
    handleSubmit,
    resetField,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(inviteSchema), defaultValues: INVITE_DEFAULTS });

  async function send(values: InviteValues): Promise<void> {
    if (submittingRef.current) return;
    submittingRef.current = true;
    const email = values.email.trim().toLowerCase();
    try {
      const result = await invite.mutateAsync({ email, role: values.role });
      toast.success(inviteToast(email, result.status));
      resetField('email');
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      submittingRef.current = false;
    }
  }

  function onSubmit(event: FormEvent<HTMLFormElement>): void {
    void handleSubmit(send)(event);
  }

  const pending = isSubmitting || invite.isPending;
  const emailError = errors.email?.message;

  return (
    <form
      noValidate
      aria-label="Invite people"
      onSubmit={onSubmit}
      className="flex flex-col gap-1.5"
    >
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex min-w-48 flex-1 flex-col gap-1.5">
          <Label htmlFor={emailId} className="text-xs font-semibold">
            Email
          </Label>
          <Input
            id={emailId}
            type="email"
            autoComplete="off"
            aria-required="true"
            aria-invalid={emailError ? true : undefined}
            aria-describedby={emailError ? errorId : undefined}
            {...register('email')}
          />
        </div>
        <div className="flex w-32 flex-col gap-1.5">
          <Label htmlFor={roleId} className="text-xs font-semibold">
            Role
          </Label>
          <Controller
            control={control}
            name="role"
            render={({ field }) => (
              <Select
                value={field.value}
                onValueChange={(value) => {
                  if (isRole(value)) field.onChange(value);
                }}
              >
                <SelectTrigger ref={field.ref} id={roleId} onBlur={field.onBlur} className="w-full">
                  <SelectValue>{ROLE_LABELS[field.value]}</SelectValue>
                </SelectTrigger>
                <RoleOptions />
              </Select>
            )}
          />
        </div>
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 className="animate-spin" aria-hidden="true" />}
          {pending ? 'Sending…' : 'Send invite'}
        </Button>
      </div>
      {emailError && (
        <p id={errorId} className="text-xs text-destructive">
          {emailError}
        </p>
      )}
    </form>
  );
}

function MemberAvatar({ member }: { member: WorkspaceMember }): ReactElement {
  return (
    <span
      aria-hidden="true"
      className="flex size-7 shrink-0 items-center justify-center rounded-full bg-secondary text-2xs leading-none font-medium text-muted-foreground"
    >
      {initials(member)}
    </span>
  );
}

function MemberRow({
  member,
  workspaceId,
  manage,
  onRemove,
}: {
  member: WorkspaceMember;
  workspaceId: ID;
  /** The viewer is an owner and this row isn't their own. */
  manage: boolean;
  onRemove(member: WorkspaceMember, name: string): void;
}): ReactElement {
  const updateRole = useUpdateMemberRole(workspaceId);
  const name = fullName(member) || member.email;

  function changeRole(value: string): void {
    if (!isRole(value) || value === member.role) return;
    updateRole.mutate(
      { userId: member.userId, role: value },
      {
        onSuccess: () => toast.success('Role updated'),
        onError: (error) => toast.error(errorMessage(error)),
      },
    );
  }

  return (
    <li className={ROW_CLASSES}>
      <MemberAvatar member={member} />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-medium" title={name}>
          {name}
        </span>
        <span className="truncate text-xs text-muted-foreground" title={member.email}>
          {member.email}
        </span>
      </div>
      {manage ? (
        <>
          <Select value={member.role} onValueChange={changeRole} disabled={updateRole.isPending}>
            <SelectTrigger aria-label={`Role for ${name}`} size="sm" className="w-28">
              <SelectValue>{ROLE_LABELS[member.role]}</SelectValue>
            </SelectTrigger>
            <RoleOptions />
          </Select>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Remove ${name}`}
            onClick={() => onRemove(member, name)}
            className="text-muted-foreground hover:text-foreground"
          >
            <UserMinus aria-hidden="true" />
          </Button>
        </>
      ) : (
        <span className="shrink-0 text-xs text-muted-foreground">{ROLE_LABELS[member.role]}</span>
      )}
    </li>
  );
}

function MembersList({
  workspaceId,
  workspaceName,
  owner,
}: {
  workspaceId: ID;
  workspaceName: string;
  owner: boolean;
}): ReactElement {
  const members = useWorkspaceMembers(workspaceId);
  const me = useCurrentUser();
  const removeMember = useRemoveMember(workspaceId);
  // The member being confirmed; it stays set while the confirmation closes, so its title holds.
  const [removing, setRemoving] = useState<{
    member: WorkspaceMember;
    name: string;
    open: boolean;
  } | null>(null);

  function remove(): void {
    if (removing === null || !removing.open) return;
    const { member, name } = removing;
    setRemoving({ ...removing, open: false });
    removeMember.mutate(
      { userId: member.userId },
      {
        onSuccess: () => toast.success(`${name} was removed`),
        onError: (error) => toast.error(errorMessage(error)),
      },
    );
  }

  let content: ReactElement;
  if (members.isPending) {
    content = <SkeletonRows />;
  } else if (members.isError) {
    content = <SectionError error={members.error} onRetry={() => void members.refetch()} />;
  } else {
    // The repository orders members (owners, editors, viewers; then by name), so they render as
    // they come.
    content = (
      <ul aria-label="Members" className="divide-y">
        {members.data.map((member) => (
          <MemberRow
            key={member.userId}
            member={member}
            workspaceId={workspaceId}
            manage={owner && me.data !== undefined && member.userId !== me.data.id}
            onRemove={(target, name) => setRemoving({ member: target, name, open: true })}
          />
        ))}
      </ul>
    );
  }

  return (
    <section className="flex flex-col gap-1">
      <h3 className="text-sm font-bold">Members</h3>
      {content}
      <ConfirmDialog
        open={removing?.open ?? false}
        title={removing ? `Remove ${removing.name} from ${workspaceName}?` : ''}
        description="They lose access to its projects and schedules."
        cancelLabel="Cancel"
        actionLabel="Remove"
        onAction={remove}
        onCancel={() => setRemoving((current) => current && { ...current, open: false })}
      />
    </section>
  );
}

function InvitationRow({
  invitation,
  workspaceId,
  now,
}: {
  invitation: WorkspaceInvitation;
  workspaceId: ID;
  now: Date;
}): ReactElement {
  const resend = useInviteMember(workspaceId);
  const revoke = useRevokeInvitation(workspaceId);
  const busy = resend.isPending || revoke.isPending;

  function onResend(): void {
    resend.mutate(
      { email: invitation.email, role: invitation.role },
      {
        onSuccess: (result) => toast.success(inviteToast(invitation.email, result.status)),
        onError: (error) => toast.error(errorMessage(error)),
      },
    );
  }

  function onRevoke(): void {
    revoke.mutate(invitation.id, {
      onSuccess: () => toast.success('Invitation revoked'),
      onError: (error) => toast.error(errorMessage(error)),
    });
  }

  return (
    <li className={ROW_CLASSES}>
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-medium" title={invitation.email}>
          {invitation.email}
        </span>
        <span className="truncate text-xs text-muted-foreground">
          {ROLE_LABELS[invitation.role]} · Invited {relativeTime(invitation.invitedAt, now)}
        </span>
      </div>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        aria-label={`Resend invitation to ${invitation.email}`}
        disabled={busy}
        onClick={onResend}
      >
        Resend
      </Button>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        aria-label={`Revoke invitation to ${invitation.email}`}
        disabled={busy}
        onClick={onRevoke}
      >
        Revoke
      </Button>
    </li>
  );
}

function PendingInvitations({ workspaceId }: { workspaceId: ID }): ReactElement | null {
  const invitations = useWorkspaceInvitations(workspaceId, true);
  const now = useNow();

  let content: ReactElement;
  if (invitations.isPending) {
    content = <SkeletonRows />;
  } else if (invitations.isError) {
    content = <SectionError error={invitations.error} onRetry={() => void invitations.refetch()} />;
  } else if (invitations.data.length === 0) {
    return null;
  } else {
    content = (
      <ul aria-label="Pending invitations" className="divide-y">
        {invitations.data.map((invitation) => (
          <InvitationRow
            key={invitation.id}
            invitation={invitation}
            workspaceId={workspaceId}
            now={now}
          />
        ))}
      </ul>
    );
  }

  return (
    <section className="flex flex-col gap-1">
      <h3 className="text-sm font-bold">Pending invitations</h3>
      {content}
    </section>
  );
}

/**
 * The members of a team workspace (P2 spec §5.8). Owners invite people, change roles, remove
 * members and manage pending invitations; everyone else sees the list. It isn't a FormDialog:
 * it holds a small form and two lists, and closing it never asks to discard anything.
 */
export function WorkspaceMembersDialog({ workspaceId }: { workspaceId: ID }): ReactElement {
  const { closeDialog } = useDialogs();
  const workspaces = useWorkspaces();
  const workspace = workspaces.data?.find((item) => item.id === workspaceId);
  const owner = isOwner(workspace);
  const name = workspace?.name ?? '';

  return (
    <DialogShell
      title={`Members of ${name}`}
      description={
        owner ? 'Invite people and choose what they can do.' : 'People who can open this workspace.'
      }
      width="xl"
      onCloseRequest={closeDialog}
    >
      {/* The negative margins give focus rings room inside the scroll container. */}
      <div className="-mx-6 -my-1 flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-6 py-1">
        {owner && <InviteForm workspaceId={workspaceId} />}
        <MembersList workspaceId={workspaceId} workspaceName={name} owner={owner} />
        {owner && <PendingInvitations workspaceId={workspaceId} />}
      </div>
    </DialogShell>
  );
}
