import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import { passwordSchema } from '@orbit/shared';
import { api, ApiError } from '../lib/api';
import { Button } from '../components/ui/Button';
import { Field, Input } from '../components/ui/Field';
import { AuthLayout } from '../components/auth/AuthLayout';

export default function ResetPasswordPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const passwordIssue = password.length > 0 ? passwordSchema.safeParse(password) : null;
  const passwordError =
    passwordIssue && !passwordIssue.success ? passwordIssue.error.issues[0]?.message : undefined;
  const mismatch = confirm.length > 0 && confirm !== password ? 'Passwords do not match' : undefined;

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await api.post('/auth/password/reset', { token, password });
      setDone(true);
      window.setTimeout(() => navigate('/login'), 1800);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not reach the API');
    } finally {
      setSubmitting(false);
    }
  };

  if (!token) {
    return (
      <AuthLayout title="Reset link is incomplete" subtitle="This URL is missing its token.">
        <div className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2.5 text-xs text-danger">
          Ask for a new reset link from the sign-in screen.
        </div>
        <Link to="/forgot-password" className="link mt-4 inline-block text-xs">
          Request a new link
        </Link>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Choose a new password"
      subtitle="Signing in everywhere else will be revoked for safety."
      footer={
        <>
          <Link to="/login" className="link">
            Back to sign in
          </Link>
        </>
      }
    >
      {done ? (
        <div className="flex items-start gap-2.5 rounded-lg border border-success/40 bg-success/10 px-3 py-2.5">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-success" />
          <p className="text-xs text-fg">Password updated. Redirecting to sign in…</p>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4">
          <Field
            label="New password"
            required
            error={passwordError}
            hint="At least 8 characters, including a letter and a number."
          >
            {({ id, ...rest }) => (
              <Input
                id={id}
                {...rest}
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="new-password"
                data-testid="reset-password"
                required
              />
            )}
          </Field>

          <Field label="Confirm password" required error={mismatch}>
            {({ id }) => (
              <Input
                id={id}
                type="password"
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
                autoComplete="new-password"
                data-testid="reset-confirm"
                required
              />
            )}
          </Field>

          {error && (
            <div role="alert" className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
              {error}
            </div>
          )}

          <Button
            type="submit"
            variant="primary"
            size="lg"
            className="w-full"
            loading={submitting}
            disabled={Boolean(mismatch) || Boolean(passwordError)}
          >
            Update password
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
