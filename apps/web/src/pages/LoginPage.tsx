import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, LogIn } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { ApiError } from '../lib/api';
import { Button } from '../components/ui/Button';
import { Field, Input } from '../components/ui/Field';
import { AuthLayout } from '../components/auth/AuthLayout';

const DEMO_ACCOUNTS = [
  { email: 'javi@orbit.dev', label: 'Javi · Owner' },
  { email: 'maria@orbit.dev', label: 'Maria · Admin' },
  { email: 'carlos@orbit.dev', label: 'Carlos · Member' },
  { email: 'nina@orbit.dev', label: 'Nina · Viewer' },
];

export default function LoginPage() {
  const { login, isAuthenticated, isLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('javi@orbit.dev');
  const [password, setPassword] = useState('Orbit1234');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  if (!isLoading && isAuthenticated) {
    const redirectTo = (location.state as { from?: string } | null)?.from ?? '/issues';
    return <Navigate to={redirectTo} replace />;
  }

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setFields({});
    try {
      await login(email, password);
      navigate('/issues', { replace: true });
    } catch (caught) {
      if (caught instanceof ApiError) {
        setError(caught.message);
        if (caught.fields) {
          const flat: Record<string, string> = {};
          for (const [key, messages] of Object.entries(caught.fields)) if (messages[0]) flat[key] = messages[0];
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
      title="Sign in to Orbit"
      subtitle="Use a demo account below or your own credentials."
      footer={
        <>
          New here?{' '}
          <Link to="/register" className="link">
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4" data-testid="login-form">
        <Field label="Email" required error={fields.email}>
          {({ id, ...rest }) => (
            <Input
              id={id}
              {...rest}
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@company.com"
              data-testid="login-email"
              required
            />
          )}
        </Field>

        <Field label="Password" required error={fields.password}>
          {({ id, ...rest }) => (
            <Input
              id={id}
              {...rest}
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="••••••••"
              data-testid="login-password"
              required
              trailing={
                <button
                  type="button"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  onClick={() => setShowPassword((value) => !value)}
                  className="text-subtle transition-colors hover:text-fg"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              }            />
          )}
        </Field>

        {error && (
          <div
            role="alert"
            data-testid="login-error"
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
          leftIcon={<LogIn className="h-4 w-4" />}
          data-testid="login-submit"
        >
          Sign in
        </Button>

        <div className="flex items-center justify-between text-xs">
          <Link to="/forgot-password" className="link">
            Forgot password?
          </Link>
        </div>
      </form>

      <div className="mt-6 rounded-lg border border-line bg-surface p-3">
        <p className="text-2xs font-semibold uppercase tracking-wider text-subtle">Demo accounts</p>
        <p className="mt-1 text-2xs text-muted">
          Password for every account: <span className="font-mono text-fg">Orbit1234</span>
        </p>
        <div className="mt-2 grid grid-cols-2 gap-1.5">
          {DEMO_ACCOUNTS.map((account) => (
            <button
              key={account.email}
              type="button"
              onClick={() => {
                setEmail(account.email);
                setPassword('Orbit1234');
              }}
              className="rounded-md border border-line bg-app px-2 py-1 text-left text-2xs text-muted transition-colors hover:border-line-strong hover:text-fg"
            >
              <span className="block truncate font-medium">{account.label}</span>
              <span className="block truncate text-subtle">{account.email}</span>
            </button>
          ))}
        </div>
      </div>
    </AuthLayout>
  );
}
