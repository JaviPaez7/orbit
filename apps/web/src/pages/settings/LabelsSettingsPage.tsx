import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Pencil, Plus, Tag, Trash2, X } from 'lucide-react';
import { LABEL_COLORS } from '@orbit/shared';
import { useAuth, usePermissions } from '../../context/AuthContext';
import { ApiError, api } from '../../lib/api';
import { queryKeys } from '../../lib/query-client';
import { cn } from '../../lib/utils';
import type { Label } from '../../lib/types';
import { Button } from '../../components/ui/Button';
import { Field, Input } from '../../components/ui/Field';
import { Skeleton } from '../../components/ui/Skeleton';
import { EmptyState, ErrorState } from '../../components/ui/States';
import { useToast } from '../../components/ui/Toast';

export default function LabelsSettingsPage() {
  const { workspace } = useAuth();
  const { canManageLabels } = usePermissions();
  const queryClient = useQueryClient();
  const toast = useToast();
  const workspaceId = workspace?.id ?? '';
  const [newLabel, setNewLabel] = useState('');
  const [newColor, setNewColor] = useState<string>(LABEL_COLORS[11]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState<string>('#6366f1');

  const labelsQuery = useQuery({
    queryKey: queryKeys.labels(workspaceId),
    queryFn: () => api.get<{ labels: Label[] }>(`/workspaces/${workspaceId}/labels`),
    enabled: Boolean(workspaceId),
    select: (data) => data.labels,
  });

  const createMutation = useMutation({
    mutationFn: () =>
      api.post<{ label: Label }>(`/workspaces/${workspaceId}/labels`, {
        name: newLabel.trim(),
        color: newColor,
      }),
    onSuccess: (data) => {
      setNewLabel('');
      toast.success('Label created', data.label.name);
      void queryClient.invalidateQueries({ queryKey: ['labels'] });
    },
    onError: (error) =>
      toast.error('Could not create the label', error instanceof ApiError ? error.message : undefined),
  });

  const updateMutation = useMutation({
    mutationFn: ({ labelId, name, color }: { labelId: string; name: string; color: string }) =>
      api.patch(`/workspaces/${workspaceId}/labels/${labelId}`, { name, color }),
    onSuccess: () => {
      setEditingId(null);
      toast.success('Label updated');
      void queryClient.invalidateQueries({ queryKey: ['labels'] });
      void queryClient.invalidateQueries({ queryKey: ['issues'] });
    },
    onError: (error) =>
      toast.error('Could not update the label', error instanceof ApiError ? error.message : undefined),
  });

  const deleteMutation = useMutation({
    mutationFn: (labelId: string) => api.delete(`/workspaces/${workspaceId}/labels/${labelId}`),
    onSuccess: () => {
      toast.success('Label deleted', 'It was removed from every issue that used it.');
      void queryClient.invalidateQueries({ queryKey: ['labels'] });
      void queryClient.invalidateQueries({ queryKey: ['issues'] });
    },
    onError: (error) =>
      toast.error('Could not delete the label', error instanceof ApiError ? error.message : undefined),
  });

  const labels = labelsQuery.data ?? [];

  return (
    <div className="space-y-5">
      <section className="card p-4">
        <h2 className="flex items-center gap-1.5 text-sm font-medium text-fg">
          <Tag className="h-4 w-4" /> Labels
        </h2>
        <p className="mt-0.5 text-xs text-muted">
          Labels categorise issues across projects. Deleting a label removes it from every issue.
        </p>

        {canManageLabels && (
          <div className="mt-4 flex flex-wrap items-end gap-2">
            <Field label="New label" className="min-w-[12rem] flex-1">
              {({ id }) => (
                <Input
                  id={id}
                  value={newLabel}
                  onChange={(event) => setNewLabel(event.target.value)}
                  placeholder="e.g. performance"
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && newLabel.trim()) createMutation.mutate();
                  }}
                  data-autofocus
                  data-testid="new-label-name"
                />
              )}
            </Field>
            <div className="flex items-center gap-1 pb-1">
              {LABEL_COLORS.slice(0, 10).map((color) => (
                <button
                  key={color}
                  type="button"
                  aria-label={`Color ${color}`}
                  onClick={() => setNewColor(color)}
                  className={cn(
                    'h-5 w-5 rounded-full border-2 transition-transform',
                    newColor === color ? 'scale-110 border-fg' : 'border-transparent',
                  )}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
            <Button
              variant="primary"
              size="sm"
              leftIcon={<Plus className="h-3.5 w-3.5" />}
              disabled={!newLabel.trim()}
              loading={createMutation.isPending}
              onClick={() => createMutation.mutate()}
              data-testid="create-label"
            >
              Add label
            </Button>
          </div>
        )}

        <div className="mt-4 overflow-hidden rounded-lg border border-line">
          {labelsQuery.isLoading && <Skeleton className="h-28" />}
          {labelsQuery.isError && (
            <ErrorState
              title="Could not load labels"
              error={labelsQuery.error}
              onRetry={() => void labelsQuery.refetch()}
            />
          )}
          {!labelsQuery.isLoading && labels.length === 0 && (
            <EmptyState compact title="No labels yet" description="Labels help filter issues across projects." />
          )}
          <ul className="divide-y divide-line">
            {labels.map((label) => (
              <li key={label.id} className="flex items-center gap-3 px-3 py-2">
                {editingId === label.id ? (
                  <>
                    <span
                      className="h-3 w-3 shrink-0 rounded-full"
                      style={{ backgroundColor: editColor }}
                    />
                    <Input
                      value={editName}
                      onChange={(event) => setEditName(event.target.value)}
                      className="max-w-[14rem]"
                      aria-label={`Rename ${label.name}`}
                    />
                    <div className="flex items-center gap-1">
                      {LABEL_COLORS.slice(0, 10).map((color) => (
                        <button
                          key={color}
                          type="button"
                          aria-label={`Color ${color}`}
                          onClick={() => setEditColor(color)}
                          className={cn(
                            'h-4 w-4 rounded-full border-2',
                            editColor === color ? 'border-fg' : 'border-transparent',
                          )}
                          style={{ backgroundColor: color }}
                        />
                      ))}
                    </div>
                    <div className="ml-auto flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Save label"
                        onClick={() =>
                          updateMutation.mutate({ labelId: label.id, name: editName.trim(), color: editColor })
                        }
                      >
                        <Check className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Cancel edit"
                        onClick={() => setEditingId(null)}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    <span
                      className="rounded px-1.5 py-0.5 text-xs"
                      style={{ backgroundColor: `${label.color}22`, color: label.color }}
                    >
                      {label.name}
                    </span>
                    <span className="text-2xs text-subtle">{label.issueCount ?? 0} issues</span>
                    {canManageLabels && (
                      <div className="ml-auto flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Edit ${label.name}`}
                          onClick={() => {
                            setEditingId(label.id);
                            setEditName(label.name);
                            setEditColor(label.color);
                          }}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Delete ${label.name}`}
                          className="text-danger hover:bg-danger/10"
                          onClick={() => {
                            if (window.confirm(`Delete the "${label.name}" label?`)) {
                              deleteMutation.mutate(label.id);
                            }
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    )}
                  </>
                )}
              </li>
            ))}
          </ul>
        </div>

        {!canManageLabels && (
          <p className="mt-3 text-2xs text-subtle">You need a member role or higher to manage labels.</p>
        )}
      </section>
    </div>
  );
}
