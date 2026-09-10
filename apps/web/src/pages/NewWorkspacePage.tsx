import { useState } from 'react';
import { useIssueComposer } from '../context/IssueComposerContext';
import { useNavigate } from 'react-router-dom';
import { Building2 } from 'lucide-react';
import { slugify } from '@orbit/shared';
import { useAuth } from '../context/AuthContext';
import { ApiError, api } from '../lib/api';
import { Button } from '../components/ui/Button';
import { Field, Input, Textarea } from '../components/ui/Field';
import { Header } from '../components/layout/Header';
import { useToast } from '../components/ui/Toast';

/** Creates an additional workspace and switches to it on success. */
export default function NewWorkspacePage() {
  const { openComposer, openSearch } = useIssueComposer();
  const { refresh, setWorkspaceId } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [description, setDescription] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setErrors({});
    try {
      const response = await api.post<{ workspace: { id: string; name: string } }>('/workspaces', {
        name: name.trim(),
        slug: slug.trim() || undefined,
        description: description.trim() || null,
      });
      await refresh();
      setWorkspaceId(response.workspace.id);
      toast.success('Workspace created', response.workspace.name);
      navigate('/issues');
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.fields) {
          const flat: Record<string, string> = {};
          for (const [key, messages] of Object.entries(error.fields))
            if (messages[0]) flat[key] = messages[0];
          setErrors(flat);
        }
        toast.error('Could not create the workspace', error.message);
      } else {
        toast.error('Unexpected error');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <Header
        title="New workspace"
        crumbs={[{ label: 'Workspaces' }, { label: 'New' }]}
        onCreateIssue={() => openComposer()}
        onOpenSearch={openSearch}
        showPresence={false}
      />

      <div className="flex-1 overflow-y-auto p-4">
        <form onSubmit={submit} className="mx-auto max-w-lg space-y-4">
          <div className="card p-4">
            <div className="mb-4 flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/15 text-accent">
                <Building2 className="h-4 w-4" />
              </span>
              <div>
                <h2 className="text-sm font-medium text-fg">Workspace details</h2>
                <p className="text-2xs text-subtle">
                  You become the owner. Invite the rest of the team afterwards.
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <Field label="Name" required error={errors.name}>
                {({ id, ...rest }) => (
                  <Input
                    id={id}
                    {...rest}
                    value={name}
                    onChange={(event) => {
                      setName(event.target.value);
                      if (!slug) setSlug(slugify(event.target.value));
                    }}
                    placeholder="Acme Engineering"
                    data-autofocus
                    data-testid="workspace-name"
                    required
                  />
                )}
              </Field>

              <Field
                label="URL slug"
                error={errors.slug}
                hint="Lowercase letters, numbers and dashes. Used in deep links."
              >
                {({ id }) => (
                  <Input
                    id={id}
                    value={slug}
                    onChange={(event) => setSlug(event.target.value)}
                    placeholder="acme-engineering"
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
                    placeholder="What does this workspace cover?"
                  />
                )}
              </Field>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="submit"
              variant="primary"
              loading={submitting}
              data-testid="create-workspace-submit"
            >
              Create workspace
            </Button>
            <Button variant="ghost" onClick={() => navigate(-1)}>
              Cancel
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
