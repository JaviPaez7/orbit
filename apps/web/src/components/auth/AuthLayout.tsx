import { Link } from 'react-router-dom';
import { Orbit } from 'lucide-react';

/**
 * Split auth screen: a quiet product panel on the left (form) and a dark
 * marketing-ish panel on the right with real product framing — no stock art.
 */
export function AuthLayout({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen bg-app">
      <div className="flex w-full flex-col justify-center px-5 py-10 sm:px-12 lg:w-[46%]">
        <div className="mx-auto w-full max-w-sm">
          <Link to="/" className="mb-8 inline-flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent text-accent-fg">
              <Orbit className="h-4 w-4" />
            </span>
            <span className="text-lg font-semibold tracking-tight text-fg">Orbit</span>
          </Link>

          <h1 className="text-2xl font-semibold tracking-tight text-fg">{title}</h1>
          {subtitle && <p className="mt-1.5 text-sm text-muted">{subtitle}</p>}

          <div className="mt-6">{children}</div>
          {footer && <div className="mt-6 text-xs text-muted">{footer}</div>}
        </div>
      </div>

      <div className="relative hidden flex-1 overflow-hidden border-l border-line bg-sunken lg:block">
        <div className="grid-lines absolute inset-0 opacity-[0.35]" aria-hidden />
        <div className="relative flex h-full flex-col justify-center gap-6 p-12">
          <div className="max-w-md">
            <p className="text-2xs font-semibold uppercase tracking-widest text-subtle">
              Issue tracking that keeps up
            </p>
            <p className="mt-3 text-2xl font-medium leading-snug text-fg">
              Plan cycles, run the board, and ship — with every change synced live across your team.
            </p>
          </div>

          <div className="max-w-md space-y-3 rounded-xl border border-line bg-surface p-4 shadow-panel">
            <div className="flex items-center justify-between text-2xs uppercase tracking-wider text-subtle">
              <span>Cycle 14 · Orbit Labs</span>
              <span>Live</span>
            </div>
            {[
              { id: 'OLX-142', title: 'Retry failed invoice charges', status: 'In Progress', color: '#e2a83e' },
              { id: 'OLX-151', title: 'Offline queue drops writes', status: 'In Review', color: '#6c7df6' },
              { id: 'OLX-128', title: 'Cohort retention view', status: 'Done', color: '#42c284' },
            ].map((row) => (
              <div key={row.id} className="flex items-center gap-3 rounded-lg border border-line bg-app px-3 py-2">
                <span className="font-mono text-2xs text-subtle">{row.id}</span>
                <span className="flex-1 truncate text-xs text-fg">{row.title}</span>
                <span
                  className="rounded-md px-1.5 py-0.5 text-2xs"
                  style={{ backgroundColor: `${row.color}22`, color: row.color }}
                >
                  {row.status}
                </span>
              </div>
            ))}
          </div>

          <div className="flex gap-6 text-xs text-subtle">
            <span>Kanban with persistence</span>
            <span>Realtime everywhere</span>
            <span>Role-based access</span>
          </div>
        </div>
      </div>
    </div>
  );
}
