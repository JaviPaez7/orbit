import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { UserPlus } from 'lucide-react';
import { passwordSchema } from '@orbit/shared';
import { useAuth } from '../context/AuthContext';
import { ApiError } from '../lib/api';
import { Button } from '../components/ui/Button';
import { Field, Input } from '../components/ui/Field';
import { AuthLayout } from '../components/auth/AuthLayout';

export default function RegisterPage() {
  const { register, isAuthenticated, isLoading } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [workspaceName, setWorkspaceName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  if (!isLoading && isAuthenticated) return <Navigate to="/issues" replace />;

  // Client-side pre-validation mirrors the API's Zod rules for instant feedback.
  const passwordIssue = password.length > 0 ? passwordSchema.safeParse(password) : null;
  const passwordError =
    fields.password ??
    (passwordIssue && !passwordIssue.success ? passwordIssue.error.issues[0]?.message : undefined);

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setFields({});
    try {
      await register({
        name: name.trim(),
        email: email.trim(),
        password,
        workspaceName: workspaceName.trim() || undefined,
      });
      navigate('/issues', { replace: true });
    } catch (caught) {
      if (caught instanceof ApiError) {
        setError(caught.message);
        if (caught.fields) {
          const flat: Record<string, string> = {};
          for (const [key, messages] of Object.entries(caught.fields))
            if (messages[0]) flat[key] = messages[0];
          setFields(flat);
        }
      } else {
        setError('Could not reach the Orbit API. Is the server running?');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout
      title="Create your Orbit account"
      subtitle="You will get your own workspace with projects, cycles and a board."
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" className="link">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4" data-testid="register-form">
        <Field label="Full name" required error={fields.name}>
          {({ id, ...rest }) => (
            <Input
              id={id}
              {...rest}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Ada Lovelace"
              autoComplete="name"
              data-testid="register-name"
              required
            />
          )}
        </Field>

        <Field label="Work email" required error={fields.email}>
          {({ id, ...rest }) => (
            <Input
              id={id}
              {...rest}
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@company.com"
              autoComplete="email"
              data-testid="register-email"
              required
            />
          )}
        </Field>

        <Field
          label="Password"
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
              placeholder="••••••••"
              autoComplete="new-password"
              data-testid="register-password"
              required
            />
          )}
        </Field>

        <Field label="Workspace name" hint="Optional — defaults to “<your name>'s Workspace”.">
          {({ id }) => (
            <Input
              id={id}
              value={workspaceName}
              onChange={(event) => setWorkspaceName(event.target.value)}
              placeholder="Acme Engineering"
            />
          )}
        </Field>

        {error && (
          <div
            role="alert"
            data-testid="register-error"
            className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger"
          >
            {error}
          </div>
        )}

        <Button
          type="submit"
          variant="primary"
          size="lg"
          className="w-full"
          loading={submitting}
          leftIcon={<UserPlus className="h-4 w-4" />}
          data-testid="register-submit"
        >
          Create account
        </Button>
      </form>
    </AuthLayout>
  );
}
