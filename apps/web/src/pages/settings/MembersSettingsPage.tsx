import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Mail, ShieldCheck, Trash2, UserPlus, Users } from 'lucide-react';
import { WORKSPACE_ROLES, WORKSPACE_ROLE_LABELS, type WorkspaceRole } from '@orbit/shared';
import { useAuth, usePermissions } from '../../context/AuthContext';
import { ApiError, api } from '../../lib/api';
import { queryKeys } from '../../lib/query-client';
import { cn, formatDate } from '../../lib/utils';
import type { WorkspaceMember } from '../../lib/types';
import { Avatar } from '../../components/ui/Avatar';
import { Button } from '../../components/ui/Button';
import { Field, Input } from '../../components/ui/Field';
import { Menu, MenuItem, MenuLabel, MenuSeparator } from '../../components/ui/Menu';
import { Modal } from '../../components/ui/Modal';
import { Select } from '../../components/ui/Select';
import { Skeleton } from '../../components/ui/Skeleton';
import { EmptyState, ErrorState } from '../../components/ui/States';
import { useToast } from '../../components/ui/Toast';

export default function MembersSettingsPage() {
  const { workspace, user, refresh } = useAuth();
  const { canManageMembers, role } = usePermissions();
  const queryClient = useQueryClient();
  const toast = useToast();
  const workspaceId = workspace?.id ?? '';
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<WorkspaceRole>('member');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [inviteLink, setInviteLink] = useState<string | null>(null);

  const membersQuery = useQuery({
    queryKey: queryKeys.members(workspaceId),
    queryFn: () =>
      api.get<{
        members: WorkspaceMember[];
        role: WorkspaceRole;
        pendingInvites: { email: string; role: WorkspaceRole }[];
      }>(`/workspaces/${workspaceId}/members`),
    enabled: Boolean(workspaceId),
  });

  const inviteMutation = useMutation({
    mutationFn: () =>
      api.post<{
        member?: WorkspaceMember;
        pending?: boolean;
        invite?: { inviteUrl: string };
        message?: string;
      }>(`/workspaces/${workspaceId}/members`, { email: inviteEmail.trim(), role: inviteRole }),
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: ['members'] });
      void refresh();
      if (data.pending && data.invite) {
        setInviteLink(`${window.location.origin}${data.invite.inviteUrl}`);
        toast.info('Invite created', data.message);
        return;
      }
      toast.success('Member added', inviteEmail);
      setInviteOpen(false);
      setInviteEmail('');
      setInviteLink(null);
    },
    onError: (error) => {
      if (error instanceof ApiError && error.fields) {
        const flat: Record<string, string> = {};
        for (const [key, messages] of Object.entries(error.fields)) if (messages[0]) flat[key] = messages[0];
        setErrors(flat);
      }
      toast.error('Could not add the member', error instanceof ApiError ? error.message : undefined);
    },
  });

  const roleMutation = useMutation({
    mutationFn: ({ memberId, nextRole }: { memberId: string; nextRole: WorkspaceRole }) =>
      api.patch(`/workspaces/${workspaceId}/members/${memberId}`, { role: nextRole }),
    onSuccess: () => {
      toast.success('Role updated');
      void queryClient.invalidateQueries({ queryKey: ['members'] });
      void refresh();
    },
    onError: (error) =>
      toast.error('Could not change the role', error instanceof ApiError ? error.message : undefined),
  });

  const removeMutation = useMutation({
    mutationFn: (memberId: string) => api.delete(`/workspaces/${workspaceId}/members/${memberId}`),
    onSuccess: () => {
      toast.success('Member removed', 'Their issues were unassigned.');
      void queryClient.invalidateQueries({ queryKey: ['members'] });
      void refresh();
    },
    onError: (error) =>
      toast.error('Could not remove the member', error instanceof ApiError ? error.message : undefined),
  });

  const members = membersQuery.data?.members ?? [];
  const pendingInvites = membersQuery.data?.pendingInvites ?? [];

  return (
    <div className="space-y-5">
      <section className="card p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-1.5 text-sm font-medium text-fg">
              <Users className="h-4 w-4" /> Members
            </h2>
            <p className="mt-0.5 text-xs text-muted">
              {members.length} member{members.length === 1 ? '' : 's'} · your role is{' '}
              <span className="font-medium text-fg">{role}</span>
            </p>
          </div>
          {canManageMembers && (
            <Button
              variant="primary"
              size="sm"
              leftIcon={<UserPlus className="h-3.5 w-3.5" />}
              onClick={() => setInviteOpen(true)}
              data-testid="invite-member"
            >
              Add member
            </Button>
          )}
        </div>

        <div className="mt-4 overflow-hidden rounded-lg border border-line">
          {membersQuery.isLoading && <Skeleton className="h-32" />}
          {membersQuery.isError && (
            <ErrorState
              title="Could not load members"
              error={membersQuery.error}
              onRetry={() => void membersQuery.refetch()}
            />
          )}
          {!membersQuery.isLoading && members.length === 0 && (
            <EmptyState compact title="No members" description="Invite your teammates to collaborate." />
          )}
          <ul className="divide-y divide-line">
            {members.map((member) => {
              const isSelf = member.user.id === user?.id;
              return (
                <li
                  key={member.id}
                  className="flex items-center gap-3 px-3 py-2.5"
                  data-testid={`member-row-${member.user.email}`}
                >
                  <Avatar name={member.user.name} src={member.user.avatarUrl} size="lg" />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 truncate text-sm text-fg">
                      {member.user.name}
                      {isSelf && <span className="chip">you</span>}
                    </p>
                    <p className="truncate text-2xs text-subtle">{member.user.email}</p>
                  </div>
                  <span className="hidden text-2xs text-subtle sm:block">
                    joined {formatDate(member.joinedAt)}
                  </span>
                  <span className="hidden text-2xs text-subtle md:block">
                    {member.user.assignedIssueCount ?? 0} issues
                  </span>

                  {canManageMembers && member.role !== 'owner' && !isSelf ? (
                    <Menu
                      align="end"
                      width={180}
                      trigger={(triggerProps) => (
                        <button
                          type="button"
                          className="chip cursor-pointer hover:text-fg"
                          aria-label={`Change role for ${member.user.name}`}
                          {...triggerProps}
                        >
                          {WORKSPACE_ROLE_LABELS[member.role]}
                        </button>
                      )}
                    >
                      <MenuLabel>Change role</MenuLabel>
                      {WORKSPACE_ROLES.map((entry) => (
                        <MenuItem
                          key={entry}
                          selected={entry === member.role}
                          disabled={entry === 'owner'}
                          onClick={() => roleMutation.mutate({ memberId: member.id, nextRole: entry })}
                          icon={entry === member.role ? <Check className="h-3.5 w-3.5" /> : undefined}
                        >
                          {WORKSPACE_ROLE_LABELS[entry]}
                        </MenuItem>
                      ))}
                      <MenuSeparator />
                      <MenuItem
                        danger
                        icon={<Trash2 className="h-3.5 w-3.5" />}
                        onClick={() => {
                          if (window.confirm(`Remove ${member.user.name} from this workspace?`)) {
                            removeMutation.mutate(member.id);
                          }
                        }}
                      >
                        Remove from workspace
                      </MenuItem>
                    </Menu>
                  ) : (
                    <span className="chip">
                      {member.role === 'owner' && <ShieldCheck className="h-3 w-3" />}
                      {WORKSPACE_ROLE_LABELS[member.role]}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>

        {pendingInvites.length > 0 && (
          <div className="mt-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-subtle">
              Pending invites
            </h3>
            <ul className="mt-2 divide-y divide-line overflow-hidden rounded-lg border border-line">
              {pendingInvites.map((invite) => (
                <li key={invite.email} className="flex items-center gap-2 px-3 py-2">
                  <Mail className="h-3.5 w-3.5 text-subtle" />
                  <span className="min-w-0 flex-1 truncate text-xs text-fg">{invite.email}</span>
                  <span className="chip">{WORKSPACE_ROLE_LABELS[invite.role]}</span>
                  <span className="text-2xs text-subtle">awaiting signup</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-4 rounded-lg border border-line bg-sunken p-3">
          <h3 className="text-2xs font-semibold uppercase tracking-wider text-subtle">
            What each role can do
          </h3>
          <ul className="mt-2 space-y-1 text-xs text-muted">
            <li>
              <span className="font-medium text-fg">Viewer</span> — read issues, export CSV, comment. Cannot
              edit.
            </li>
            <li>
              <span className="font-medium text-fg">Member</span> — create, edit, move, assign and delete
              issues.
            </li>
            <li>
              <span className="font-medium text-fg">Admin</span> — everything a member can do, plus manage
              projects, cycles, labels and members.
            </li>
            <li>
              <span className="font-medium text-fg">Owner</span> — full control, including deleting the
              workspace.
            </li>
          </ul>
          <p className="mt-2 text-2xs text-subtle">
            The API enforces these rules on every request; the UI only reflects them.
          </p>
        </div>
      </section>

      <Modal
        open={inviteOpen}
        onClose={() => {
          setInviteOpen(false);
          setInviteLink(null);
          setErrors({});
        }}
        title="Add a member"
        size="sm"
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => {
                setInviteOpen(false);
                setInviteLink(null);
              }}
            >
              Close
            </Button>
            <Button
              variant="primary"
              loading={inviteMutation.isPending}
              disabled={!inviteEmail.trim()}
              onClick={() => inviteMutation.mutate()}
              data-testid="invite-submit"
            >
              Add member
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Email" required error={errors.email}>
            {({ id, ...rest }) => (
              <Input
                id={id}
                {...rest}
                type="email"
                value={inviteEmail}
                onChange={(event) => setInviteEmail(event.target.value)}
                placeholder="teammate@company.com"
                data-autofocus
                data-testid="invite-email"
              />
            )}
          </Field>
          <Field label="Role" error={errors.role}>
            {() => (
              <Select
                options={WORKSPACE_ROLES.filter((entry) => entry !== 'owner').map((entry) => ({
                  value: entry,
                  label: WORKSPACE_ROLE_LABELS[entry],
                }))}
                value={inviteRole}
                onChange={(value) => setInviteRole(value as WorkspaceRole)}
                width={220}
                ariaLabel="Role"
              />
            )}
          </Field>
          <p className="text-2xs text-subtle">
            If the email has no Orbit account yet, a single-use invite link is generated instead.
          </p>

          {inviteLink && (
            <div className="rounded-lg border border-accent/40 bg-accent/5 p-3">
              <p className="text-2xs font-semibold uppercase tracking-wider text-accent">
                Invite link
              </p>
              <p className="mt-1 break-all font-mono text-2xs text-muted">{inviteLink}</p>
              <Button
                variant="ghost"
                size="sm"
                className="mt-2"
                onClick={() => {
                  void navigator.clipboard?.writeText(inviteLink);
                  toast.success('Invite link copied');
                }}
              >
                Copy link
              </Button>
            </div>
          )}
        </div>
      </Modal>

      <div className={cn('text-2xs text-subtle', !canManageMembers && 'opacity-70')}>
        {canManageMembers
          ? 'Only the owner can change an admin’s role, and the owner cannot be removed.'
          : 'You need an admin or owner role to manage members.'}
      </div>
    </div>
  );
}
