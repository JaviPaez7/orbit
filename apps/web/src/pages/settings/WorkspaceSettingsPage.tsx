import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Save, ShieldAlert, Trash2 } from 'lucide-react';
import { useAuth, usePermissions } from '../../context/AuthContext';
import { ApiError, api } from '../../lib/api';
import { queryKeys } from '../../lib/query-client';
import type { Workspace } from '../../lib/types';
import { Button } from '../../components/ui/Button';
import { Field, Input, Textarea } from '../../components/ui/Field';
import { Modal } from '../../components/ui/Modal';
import { Skeleton } from '../../components/ui/Skeleton';
import { ErrorState } from '../../components/ui/States';
import { useToast } from '../../components/ui/Toast';

const LOGO_COLORS = [
  '#6366f1',
  '#8b5cf6',
  '#ec4899',
  '#ef4444',
  '#f59e0b',
  '#22c55e',
  '#14b8a6',
  '#0ea5e9',
];

export default function WorkspaceSettingsPage() {
  const { workspace, workspaces, setWorkspaceId, refresh } = useAuth();
  const { canDeleteWorkspace, canManageWorkspace, role } = usePermissions();
  const queryClient = useQueryClient();
  const toast = useToast();
  const workspaceId = workspace?.id ?? '';

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [logoColor, setLogoColor] = useState('#6366f1');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmText, setConfirmText] = useState('');

  const workspaceQuery = useQuery({
    queryKey: queryKeys.workspace(workspaceId),
    queryFn: () =>
      api.get<{ workspace: Workspace & { counts: Record<string, number> }; role: string }>(
        `/workspaces/${workspaceId}`,
      ),
    enabled: Boolean(workspaceId),
  });

  useEffect(() => {
    const data = workspaceQuery.data?.workspace;
    if (data) {
      setName(data.name);
      setDescription(data.description ?? '');
      setLogoColor(data.logoColor ?? '#6366f1');
    }
  }, [workspaceQuery.data]);

  const saveMutation = useMutation({
    mutationFn: () =>
      api.patch(`/workspaces/${workspaceId}`, {
        name: name.trim(),
        description: description.trim() || null,
        logoColor,
      }),
    onSuccess: () => {
      toast.success('Workspace updated');
      void queryClient.invalidateQueries({ queryKey: ['workspace'] });
      void queryClient.invalidateQueries({ queryKey: ['workspaces'] });
      void refresh();
    },
    onError: (error) => {
      if (error instanceof ApiError && error.fields) {
        const flat: Record<string, string> = {};
        for (const [key, messages] of Object.entries(error.fields))
          if (messages[0]) flat[key] = messages[0];
        setErrors(flat);
      }
      toast.error(
        'Could not update the workspace',
        error instanceof ApiError ? error.message : undefined,
      );
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.delete<{ deletedWorkspaceId: string }>(`/workspaces/${workspaceId}`),
    onSuccess: async () => {
      toast.success('Workspace deleted');
      await refresh();
      const next = workspaces.find((entry) => entry.id !== workspaceId);
      if (next) {
        setWorkspaceId(next.id);
        window.location.assign('/issues');
      } else {
        window.location.assign('/workspaces/new');
      }
    },
    onError: (error) =>
      toast.error(
        'Could not delete the workspace',
        error instanceof ApiError ? error.message : undefined,
      ),
  });

  const counts = workspaceQuery.data?.workspace.counts;

  // Renaming the workspace requires admin or owner; the API enforces it too.
  if (!canManageWorkspace) {
    return (
      <div className="space-y-5">
        <section className="card p-4" data-testid="workspace-settings-forbidden">
          <h2 className="flex items-center gap-1.5 text-sm font-medium text-fg">
            <ShieldAlert className="h-4 w-4 text-warning" /> Workspace settings are restricted
          </h2>
          <p className="mt-1 text-xs text-muted">
            Your role in this workspace is <span className="font-medium text-fg">{role}</span>.
            Changing workspace settings requires the{' '}
            <span className="font-medium text-fg">admin</span> or{' '}
            <span className="font-medium text-fg">owner</span> role (HTTP 403).
          </p>
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <section className="card p-4">
        <h2 className="text-sm font-medium text-fg">Workspace</h2>
        <p className="mt-0.5 text-xs text-muted">
          Visible to every member. The key is used to build issue identifiers such as{' '}
          <span className="font-mono">{workspace?.key}-123</span>.
        </p>

        {workspaceQuery.isLoading ? (
          <Skeleton className="mt-4 h-32" />
        ) : workspaceQuery.isError ? (
          <ErrorState
            title="Could not load workspace settings"
            error={workspaceQuery.error}
            onRetry={() => void workspaceQuery.refetch()}
          />
        ) : (
          <div className="mt-4 space-y-3">
            <Field label="Name" required error={errors.name}>
              {({ id, ...rest }) => (
                <Input
                  id={id}
                  {...rest}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  data-testid="workspace-name-input"
                />
              )}
            </Field>

            <Field label="Description" error={errors.description}>
              {({ id }) => (
                <Textarea
                  id={id}
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  rows={3}
                />
              )}
            </Field>

            <Field label="Logo color">
              {() => (
                <div className="flex flex-wrap gap-1.5">
                  {LOGO_COLORS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      aria-label={`Logo color ${color}`}
                      onClick={() => setLogoColor(color)}
                      className={
                        logoColor === color
                          ? 'h-6 w-6 scale-110 rounded-md border-2 border-fg'
                          : 'h-6 w-6 rounded-md border-2 border-transparent'
                      }
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              )}
            </Field>

            <div className="flex items-center gap-2">
              <Button
                variant="primary"
                size="sm"
                leftIcon={<Save className="h-3.5 w-3.5" />}
                loading={saveMutation.isPending}
                onClick={() => saveMutation.mutate()}
                data-testid="save-workspace"
              >
                Save changes
              </Button>
              <span className="text-2xs text-subtle">
                Slug: <span className="font-mono">{workspace?.slug}</span>
              </span>
            </div>
          </div>
        )}

        {counts && (
          <dl className="mt-5 grid grid-cols-2 gap-3 border-t border-line pt-4 text-xs sm:grid-cols-4">
            {[
              ['Members', counts.members],
              ['Projects', counts.projects],
              ['Issues', counts.issues],
              ['Cycles', counts.cycles],
            ].map(([label, value]) => (
              <div key={String(label)}>
                <dt className="text-subtle">{label}</dt>
                <dd className="text-lg font-semibold text-fg">{value}</dd>
              </div>
            ))}
          </dl>
        )}
      </section>

      {canDeleteWorkspace && (
        <section className="card border-danger/40 p-4">
          <h2 className="flex items-center gap-1.5 text-sm font-medium text-danger">
            <AlertTriangle className="h-4 w-4" /> Delete workspace
          </h2>
          <p className="mt-1 text-xs text-muted">
            Permanently deletes every project, issue, cycle, comment and attachment in this
            workspace. Only the owner can do this, and it cannot be undone.
          </p>
          <Button
            variant="danger"
            size="sm"
            className="mt-3"
            leftIcon={<Trash2 className="h-3.5 w-3.5" />}
            onClick={() => setConfirmDelete(true)}
            data-testid="delete-workspace"
          >
            Delete this workspace
          </Button>
        </section>
      )}

      <Modal
        open={confirmDelete}
        onClose={() => {
          setConfirmDelete(false);
          setConfirmText('');
        }}
        title="Delete this workspace?"
        description="This removes all of its data for every member."
        size="sm"
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => {
                setConfirmDelete(false);
                setConfirmText('');
              }}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={deleteMutation.isPending}
              disabled={confirmText !== workspace?.name}
              onClick={() => deleteMutation.mutate()}
              data-testid="confirm-delete-workspace"
            >
              Delete permanently
            </Button>
          </>
        }
      >
        <Field label={`Type "${workspace?.name}" to confirm`} required>
          {({ id }) => (
            <Input
              id={id}
              value={confirmText}
              onChange={(event) => setConfirmText(event.target.value)}
              placeholder={workspace?.name}
              data-autofocus
            />
          )}
        </Field>
      </Modal>
    </div>
  );
}
