import { useState } from 'react';
import { Link } from 'react-router-dom';
import { KeyRound, MailCheck } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { Button } from '../components/ui/Button';
import { Field, Input } from '../components/ui/Field';
import { AuthLayout } from '../components/auth/AuthLayout';

/**
 * Realistic reset flow: the request endpoint never reveals whether the email
 * exists. In development it also returns the token (no mail server in the
 * sandbox), which is rendered as a working link below the form.
 */
export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('javi@orbit.dev');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [message, setMessage] = useState<string>('');
  const [resetUrl, setResetUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const response = await api.post<{ message: string; resetUrl?: string }>(
        '/auth/password/request',
        { email },
      );
      setSent(true);
      setMessage(response.message);
      setResetUrl(response.resetUrl ?? null);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not reach the API');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout
      title="Reset your password"
      subtitle="We will email you a single-use link that expires in 60 minutes."
      footer={
        <>
          Remembered it?{' '}
          <Link to="/login" className="link">
            Back to sign in
          </Link>
        </>
      }
    >
      {sent ? (
        <div className="space-y-4" data-testid="reset-sent">
          <div className="flex items-start gap-2.5 rounded-lg border border-success/40 bg-success/10 px-3 py-2.5">
            <MailCheck className="mt-0.5 h-4 w-4 shrink-0 text-success" />
            <p className="text-xs text-fg">{message}</p>
          </div>
          {resetUrl && (
            <div className="rounded-lg border border-line bg-surface p-3">
              <p className="text-2xs font-semibold uppercase tracking-wider text-subtle">
                Development mode
              </p>
              <p className="mt-1 text-xs text-muted">
                No mail transport is configured, so the reset link is returned directly:
              </p>
              <Link
                to={resetUrl.replace(/^https?:\/\/[^/]+/, '')}
                className="link mt-2 block break-all text-xs"
              >
                {resetUrl}
              </Link>
            </div>
          )}
          <Button variant="secondary" className="w-full" onClick={() => setSent(false)}>
            Use a different email
          </Button>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4">
          <Field label="Email" required error={error ?? undefined}>
            {({ id, ...rest }) => (
              <Input
                id={id}
                {...rest}
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@company.com"
                data-testid="forgot-email"
                required
              />
            )}
          </Field>
          <Button
            type="submit"
            variant="primary"
            size="lg"
            className="w-full"
            loading={submitting}
            leftIcon={<KeyRound className="h-4 w-4" />}
            data-testid="forgot-submit"
          >
            Send reset link
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
