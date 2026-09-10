import { useRef, useState } from 'react';
import { useIssueComposer } from '../context/IssueComposerContext';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Upload,
  X,
} from 'lucide-react';
import { CSV_COLUMNS } from '@orbit/shared';
import { useAuth, usePermissions } from '../context/AuthContext';
import { ApiError, api, downloadText } from '../lib/api';
import { cn } from '../lib/utils';
import type { ImportResult } from '../lib/types';
import { Header } from '../components/layout/Header';
import { Button } from '../components/ui/Button';
import { Textarea } from '../components/ui/Field';
import { EmptyState } from '../components/ui/States';
import { useToast } from '../components/ui/Toast';

const SAMPLE = `title,description,status,priority,assignee,project,cycle,labels,estimate,dueDate
Add audit log export,Streaming export for compliance,backlog,medium,,Security Hardening,,security,5,
Checkout retry policy,Retry soft declines three times,in_progress,high,maria@orbit.dev,Payments Platform,,bug|backend,3,2026-03-01
Flaky board drag test,Occasionally drops the card, todo,low,carlos@orbit.dev,,,bug,1,`;

export default function ImportPage() {
  const { openComposer, openSearch } = useIssueComposer();
  const { workspace } = useAuth();
  const { canImport } = usePermissions();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const toast = useToast();
  const workspaceId = workspace?.id ?? '';
  const [csv, setCsv] = useState('');
  const [result, setResult] = useState<ImportResult | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const importMutation = useMutation({
    mutationFn: (dryRun: boolean) =>
      api.post<ImportResult>(`/workspaces/${workspaceId}/import/issues`, { csv, dryRun }),
    onSuccess: (data) => {
      setResult(data);
      if (data.dryRun) {
        toast.info('Validation complete', `${data.imported} row(s) would be imported, ${data.failed} invalid`);
      } else {
        toast.success(`Imported ${data.imported} issue${data.imported === 1 ? '' : 's'}`, `${data.failed} row(s) skipped`);
        void queryClient.invalidateQueries({ queryKey: ['issues'] });
        void queryClient.invalidateQueries({ queryKey: ['projects'] });
      }
    },
    onError: (error) => {
      toast.error('Import failed', error instanceof ApiError ? error.message : undefined);
    },
  });

  const onFile = async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.csv')) {
      toast.error('That is not a CSV file', 'Choose a file ending in .csv');
      return;
    }
    const text = await file.text();
    setCsv(text);
    setFileName(file.name);
    setResult(null);
  };

  return (
    <div className="flex h-full flex-col">
      <Header
        title="Import & export"
        crumbs={[{ label: 'Import & export' }]}
        onCreateIssue={() => openComposer()}
        onOpenSearch={openSearch}
        showPresence={false}
        actions={
          <>
            <Button
              variant="ghost"
              size="sm"
              leftIcon={<Download className="h-3.5 w-3.5" />}
              onClick={() =>
                void downloadText(`/workspaces/${workspaceId}/import/template.csv`, 'orbit-import-template.csv')
              }
            >
              Download template
            </Button>
            <Button
              variant="ghost"
              size="sm"
              leftIcon={<Download className="h-3.5 w-3.5" />}
              onClick={() =>
                void downloadText(
                  `/workspaces/${workspaceId}/export/issues.csv`,
                  `orbit-issues-${new Date().toISOString().slice(0, 10)}.csv`,
                )
              }
            >
              Export issues
            </Button>
          </>
        }
      />

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {!canImport ? (
          <EmptyState
            icon={AlertTriangle}
            title="Your role cannot import issues"
            description="Ask a workspace admin to run the import, or to upgrade your role."
          />
        ) : (
          <>
            <section className="card p-4">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-subtle">
                CSV issue import
              </h2>
              <p className="mt-1 text-xs text-muted">
                Required column: <span className="font-mono text-fg">title</span>. Optional:{' '}
                {CSV_COLUMNS.filter((column) => column !== 'title').map((column, index, all) => (
                  <span key={column}>
                    <span className="font-mono text-fg">{column}</span>
                    {index < all.length - 1 ? ', ' : '.'}
                  </span>
                ))}{' '}
                Status and priority accept either the key (<span className="font-mono">in_progress</span>) or the
                label (<span className="font-mono">In Progress</span>). Assignees match on email, name or
                @handle. Labels are separated with <span className="font-mono">|</span>.
              </p>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <label className="btn btn-secondary btn-sm cursor-pointer">
                  <Upload className="h-3.5 w-3.5" />
                  Choose .csv file
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,text/csv"
                    className="hidden"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) void onFile(file);
                      event.target.value = '';
                    }}
                  />
                </label>
                {fileName && (
                  <span className="flex items-center gap-1.5 rounded-md border border-line px-2 py-1 text-xs text-muted">
                    <FileSpreadsheet className="h-3.5 w-3.5" />
                    {fileName}
                    <button
                      type="button"
                      aria-label="Remove file"
                      onClick={() => {
                        setFileName(null);
                        setCsv('');
                        setResult(null);
                      }}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                )}
                <Button variant="ghost" size="sm" onClick={() => setCsv(SAMPLE)}>
                  Load sample data
                </Button>
              </div>

              <div className="mt-3">
                <label htmlFor="csv-input" className="mb-1.5 block text-xs font-medium text-muted">
                  CSV content
                </label>
                <Textarea
                  id="csv-input"
                  value={csv}
                  onChange={(event) => setCsv(event.target.value)}
                  rows={10}
                  spellCheck={false}
                  placeholder="title,description,status,priority,assignee,project,cycle,labels,estimate,dueDate"
                  className="font-mono text-xs"
                  data-testid="csv-input"
                />
              </div>

              <div className="mt-3 flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  loading={importMutation.isPending && importMutation.variables === true}
                  disabled={!csv.trim()}
                  onClick={() => importMutation.mutate(true)}
                  data-testid="validate-import"
                >
                  Validate only
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  loading={importMutation.isPending && importMutation.variables === false}
                  disabled={!csv.trim()}
                  onClick={() => importMutation.mutate(false)}
                  data-testid="run-import"
                >
                  Import issues
                </Button>
                <span className="text-2xs text-subtle">
                  Rows are validated individually — valid rows import even when others fail.
                </span>
              </div>
            </section>

            {result && (
              <section className="space-y-3" data-testid="import-result">
                <div className="grid grid-cols-3 gap-3">
                  <div className="card p-3">
                    <p className="text-2xs uppercase tracking-wider text-subtle">Rows</p>
                    <p className="mt-1 text-xl font-semibold text-fg">{result.totalRows}</p>
                  </div>
                  <div className="card p-3">
                    <p className="text-2xs uppercase tracking-wider text-subtle">
                      {result.dryRun ? 'Would import' : 'Imported'}
                    </p>
                    <p className="mt-1 flex items-center gap-1.5 text-xl font-semibold text-success">
                      <CheckCircle2 className="h-4 w-4" />
                      {result.imported}
                    </p>
                  </div>
                  <div className="card p-3">
                    <p className="text-2xs uppercase tracking-wider text-subtle">Skipped</p>
                    <p
                      className={cn(
                        'mt-1 flex items-center gap-1.5 text-xl font-semibold',
                        result.failed > 0 ? 'text-danger' : 'text-fg',
                      )}
                    >
                      {result.failed > 0 && <AlertTriangle className="h-4 w-4" />}
                      {result.failed}
                    </p>
                  </div>
                </div>

                {result.errors.length > 0 && (
                  <div className="card overflow-hidden">
                    <h3 className="border-b border-line px-3 py-2 text-xs font-semibold uppercase tracking-wider text-danger">
                      Errors ({result.errors.length})
                    </h3>
                    <ul className="divide-y divide-line">
                      {result.errors.map((error) => (
                        <li key={`${error.row}-${error.message}`} className="px-3 py-2">
                          <p className="text-xs text-fg">
                            <span className="font-mono text-subtle">Line {error.row}</span> · {error.message}
                          </p>
                          {error.fields && (
                            <ul className="mt-1 space-y-0.5">
                              {Object.entries(error.fields).map(([field, message]) => (
                                <li key={field} className="text-2xs text-danger">
                                  {field}: {message}
                                </li>
                              ))}
                            </ul>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {result.warnings.length > 0 && (
                  <div className="card overflow-hidden">
                    <h3 className="border-b border-line px-3 py-2 text-xs font-semibold uppercase tracking-wider text-warning">
                      Warnings ({result.warnings.length})
                    </h3>
                    <ul className="divide-y divide-line">
                      {result.warnings.map((warning) => (
                        <li key={`${warning.row}-${warning.message}`} className="px-3 py-2 text-xs text-muted">
                          <span className="font-mono text-subtle">Line {warning.row}</span> · {warning.message}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {!result.dryRun && result.imported > 0 && (
                  <Button variant="primary" size="sm" onClick={() => navigate('/issues')}>
                    View imported issues
                  </Button>
                )}
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}
