import { Link } from 'react-router-dom';
import { Compass } from 'lucide-react';
import { Button } from '../components/ui/Button';

export default function NotFoundPage() {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center gap-4 p-8 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-xl border border-line bg-sunken text-subtle">
        <Compass className="h-6 w-6" />
      </span>
      <div className="space-y-1">
        <h1 className="text-xl font-semibold text-fg">This page drifted out of orbit</h1>
        <p className="max-w-md text-sm text-muted">
          The route you requested does not exist. It may have been renamed, or the issue was
          deleted.
        </p>
      </div>
      <div className="flex gap-2">
        <Button variant="primary" size="sm" onClick={() => window.history.back()}>
          Go back
        </Button>
        <Link to="/issues" className="btn btn-secondary btn-sm">
          All issues
        </Link>
      </div>
    </div>
  );
}
