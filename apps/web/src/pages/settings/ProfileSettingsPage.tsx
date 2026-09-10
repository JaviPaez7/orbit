import { useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Camera, KeyRound, Save, Trash2, UserCircle2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { ApiError, api, apiUpload } from '../../lib/api';
import { Avatar } from '../../components/ui/Avatar';
import { Button } from '../../components/ui/Button';
import { Field, Input } from '../../components/ui/Field';
import { useToast } from '../../components/ui/Toast';

export default function ProfileSettingsPage() {
  const { user, updateUser } = useAuth();
  const toast = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState(user?.name ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [title, setTitle] = useState(user?.title ?? '');
  const [timezone, setTimezone] = useState(user?.timezone ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const profileMutation = useMutation({
    mutationFn: () =>
      api.patch<{ user: typeof user }>('/users/me', {
        name: name.trim() || undefined,
        email: email.trim() || undefined,
        title: title.trim() || null,
        timezone: timezone.trim() || null,
      }),
    onSuccess: (data) => {
      if (data.user) updateUser(data.user);
      setErrors({});
      toast.success('Profile saved');
    },
    onError: (error) => {
      if (error instanceof ApiError) {
        if (error.fields) {
          const flat: Record<string, string> = {};
          for (const [key, messages] of Object.entries(error.fields))
            if (messages[0]) flat[key] = messages[0];
          setErrors(flat);
        }
        toast.error('Could not save your profile', error.message);
      }
    },
  });

  const avatarMutation = useMutation({
    mutationFn: (file: File) => apiUpload<{ user: typeof user }>('/users/me/avatar', file),
    onSuccess: (data) => {
      if (data.user) updateUser(data.user);
      toast.success('Avatar updated');
    },
    onError: (error) =>
      toast.error('Upload failed', error instanceof ApiError ? error.message : undefined),
  });

  const removeAvatarMutation = useMutation({
    mutationFn: () => api.delete<{ user: typeof user }>('/users/me/avatar'),
    onSuccess: (data) => {
      if (data.user) updateUser(data.user);
      toast.success('Avatar removed');
    },
  });

  const passwordMutation = useMutation({
    mutationFn: () => api.post('/users/me/password', { currentPassword, newPassword }),
    onSuccess: () => {
      setCurrentPassword('');
      setNewPassword('');
      setPasswordError(null);
      toast.success('Password changed', 'Other devices were signed out.');
    },
    onError: (error) => {
      const message = error instanceof ApiError ? error.message : 'Could not change the password';
      setPasswordError(message);
      toast.error('Password not changed', message);
    },
  });

  if (!user) return null;

  return (
    <div className="space-y-5">
      <section className="card p-4">
        <h2 className="text-sm font-medium text-fg">Profile</h2>
        <p className="mt-0.5 text-xs text-muted">
          This is how you appear on issues, comments and mentions.
        </p>

        <div className="mt-4 flex items-center gap-4">
          <Avatar name={user.name} src={user.avatarUrl} size="xl" />
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <label className="btn btn-secondary btn-sm cursor-pointer">
                <Camera className="h-3.5 w-3.5" />
                {user.avatarUrl ? 'Replace avatar' : 'Upload avatar'}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) avatarMutation.mutate(file);
                    event.target.value = '';
                  }}
                  data-testid="avatar-input"
                />
              </label>
              {user.avatarUrl && (
                <Button
                  variant="ghost"
                  size="sm"
                  leftIcon={<Trash2 className="h-3.5 w-3.5" />}
                  loading={removeAvatarMutation.isPending}
                  onClick={() => removeAvatarMutation.mutate()}
                >
                  Remove
                </Button>
              )}
            </div>
            <p className="text-2xs text-subtle">PNG, JPEG, WEBP or SVG up to 5MB.</p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Full name" required error={errors.name}>
            {({ id, ...rest }) => (
              <Input
                id={id}
                {...rest}
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            )}
          </Field>
          <Field label="Email" required error={errors.email}>
            {({ id, ...rest }) => (
              <Input
                id={id}
                {...rest}
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            )}
          </Field>
          <Field label="Job title" error={errors.title}>
            {({ id }) => (
              <Input
                id={id}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Engineer"
              />
            )}
          </Field>
          <Field label="Timezone" error={errors.timezone} hint="Used for date formatting hints.">
            {({ id }) => (
              <Input
                id={id}
                value={timezone}
                onChange={(event) => setTimezone(event.target.value)}
                placeholder="Europe/Madrid"
              />
            )}
          </Field>
        </div>

        <div className="mt-4 flex items-center gap-2">
          <Button
            variant="primary"
            size="sm"
            leftIcon={<Save className="h-3.5 w-3.5" />}
            loading={profileMutation.isPending}
            onClick={() => profileMutation.mutate()}
            data-testid="save-profile"
          >
            Save changes
          </Button>
          <span className="text-2xs text-subtle">
            Handle: <span className="font-mono">@{user.handle}</span> (used for @mentions)
          </span>
        </div>
      </section>

      <section className="card p-4">
        <h2 className="flex items-center gap-1.5 text-sm font-medium text-fg">
          <KeyRound className="h-4 w-4" /> Password
        </h2>
        <p className="mt-0.5 text-xs text-muted">
          Changing your password signs out every other device but keeps this session active.
        </p>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Current password" required>
            {({ id }) => (
              <Input
                id={id}
                type="password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                autoComplete="current-password"
                data-testid="current-password"
              />
            )}
          </Field>
          <Field
            label="New password"
            required
            error={passwordError ?? undefined}
            hint="At least 8 characters with a letter and a number."
          >
            {({ id }) => (
              <Input
                id={id}
                type="password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                autoComplete="new-password"
                data-testid="new-password"
              />
            )}
          </Field>
        </div>

        <Button
          variant="secondary"
          size="sm"
          className="mt-4"
          loading={passwordMutation.isPending}
          disabled={!currentPassword || newPassword.length < 8}
          onClick={() => passwordMutation.mutate()}
        >
          Update password
        </Button>
      </section>

      <section className="card p-4">
        <h2 className="flex items-center gap-1.5 text-sm font-medium text-fg">
          <UserCircle2 className="h-4 w-4" /> Account
        </h2>
        <dl className="mt-3 grid grid-cols-2 gap-3 text-xs">
          <div>
            <dt className="text-subtle">User ID</dt>
            <dd className="font-mono text-muted">{user.id}</dd>
          </div>
          <div>
            <dt className="text-subtle">Member since</dt>
            <dd className="text-muted">{new Date(user.createdAt).toLocaleDateString()}</dd>
          </div>
        </dl>
      </section>
    </div>
  );
}
