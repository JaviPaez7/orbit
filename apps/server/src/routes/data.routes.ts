import {
  CSV_COLUMNS,
  ISSUE_PRIORITIES,
  ISSUE_PRIORITY_LABELS,
  ISSUE_STATUSES,
  ISSUE_STATUS_LABELS,
  parseCsv,
  toCsv,
} from '@orbit/shared';
import type { IssuePriority, IssueStatus } from '@orbit/shared';
import type { FastifyInstance } from 'fastify';
import { prisma } from '../db/client.js';
import { requireWorkspace } from '../lib/guards.js';
import { issueListInclude, serializeIssue } from '../lib/serialize.js';
import { createIssue } from '../services/issue.service.js';
import { realtimeHub } from '../services/realtime.service.js';

interface RowError {
  row: number;
  identifier: string;
  message: string;
  fields?: Record<string, string>;
}

/** Accepts either the canonical key (`in_progress`) or the display label. */
function matchStatus(raw: string | undefined): IssueStatus | null {
  if (!raw) return null;
  const value = raw
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
  if ((ISSUE_STATUSES as readonly string[]).includes(value)) return value as IssueStatus;
  const byLabel = ISSUE_STATUSES.find(
    (status) => ISSUE_STATUS_LABELS[status].toLowerCase() === raw.trim().toLowerCase(),
  );
  return byLabel ?? null;
}

function matchPriority(raw: string | undefined): IssuePriority | null {
  if (!raw) return null;
  const value = raw.trim().toLowerCase();
  if ((ISSUE_PRIORITIES as readonly string[]).includes(value)) return value as IssuePriority;
  if (value === '' || value === 'no priority' || value === 'none') return 'none';
  const byLabel = ISSUE_PRIORITIES.find(
    (priority) => ISSUE_PRIORITY_LABELS[priority].toLowerCase() === value,
  );
  return byLabel ?? null;
}

function parseEstimate(raw: string | undefined): { value: number | null; error?: string } {
  if (!raw || raw.trim() === '') return { value: null };
  const value = Number(raw.trim());
  if (!Number.isFinite(value) || value < 0 || !Number.isInteger(value)) {
    return { value: null, error: 'Estimate must be a non-negative whole number' };
  }
  if (value > 1000) return { value: null, error: 'Estimate must be 1000 or less' };
  return { value };
}

function parseDate(raw: string | undefined): { value: Date | null; error?: string } {
  if (!raw || raw.trim() === '') return { value: null };
  const parsed = new Date(raw.trim());
  if (Number.isNaN(parsed.getTime())) return { value: null, error: `"${raw}" is not a valid date` };
  return { value: parsed };
}

export async function dataRoutes(app: FastifyInstance): Promise<void> {
  /**
   * CSV import. Validation is per-row: valid rows are imported and invalid rows
   * come back with actionable messages so a user can fix and re-upload.
   */
  app.post('/workspaces/:workspaceId/import/issues', {
    config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
    handler: async (request, reply) => {
      const { workspaceId } = request.params as { workspaceId: string };
      const ctx = await requireWorkspace(request, workspaceId, 'import:run');

      const body = (request.body ?? {}) as { csv?: unknown; dryRun?: unknown };
      const csv = typeof body.csv === 'string' ? body.csv : '';
      const dryRun = body.dryRun === true;

      if (!csv.trim()) {
        return reply.status(422).send({
          error: {
            code: 'validation_error',
            message: 'Paste CSV content or choose a .csv file to upload',
            fields: { csv: ['CSV content is required'] },
          },
        });
      }

      const rows = parseCsv(csv);
      if (rows.length === 0) {
        return reply.status(422).send({
          error: { code: 'validation_error', message: 'That file looks empty' },
        });
      }

      const header = rows[0]!.map((cell) => cell.trim().toLowerCase());
      if (!header.includes('title')) {
        return reply.status(422).send({
          error: {
            code: 'validation_error',
            message: `Missing required "title" column. Expected columns: ${CSV_COLUMNS.join(', ')}`,
            fields: { header: [`Found: ${header.join(', ') || 'nothing'}`] },
          },
        });
      }
      const col = (name: string) => header.indexOf(name);

      const [projects, cycles, labels, members] = await Promise.all([
        prisma.project.findMany({ where: { workspaceId }, select: { id: true, name: true } }),
        prisma.cycle.findMany({
          where: { workspaceId },
          select: { id: true, name: true, number: true },
        }),
        prisma.label.findMany({ where: { workspaceId }, select: { id: true, name: true } }),
        prisma.workspaceMember.findMany({
          where: { workspaceId, status: 'active' },
          select: {
            role: true,
            user: { select: { id: true, name: true, email: true, handle: true } },
          },
        }),
      ]);

      const errors: RowError[] = [];
      const created: Record<string, unknown>[] = [];
      const warnings: RowError[] = [];

      for (let index = 1; index < rows.length; index += 1) {
        const row = rows[index]!;
        const lineNumber = index + 1;
        const get = (name: string) => {
          const position = col(name);
          return position >= 0 ? (row[position] ?? '').trim() : '';
        };

        const title = get('title');
        const fields: Record<string, string> = {};
        if (!title) fields.title = 'Title is required';
        if (title.length > 280) fields.title = 'Title must be 280 characters or fewer';

        const status = matchStatus(get('status'));
        if (get('status') && !status) {
          fields.status = `Unknown status "${get('status')}" — use ${ISSUE_STATUSES.join(', ')}`;
        }

        const priority = matchPriority(get('priority'));
        if (get('priority') && !priority) {
          fields.priority = `Unknown priority "${get('priority')}" — use ${ISSUE_PRIORITIES.join(', ')}`;
        }

        const estimate = parseEstimate(get('estimate'));
        if (estimate.error) fields.estimate = estimate.error;

        const dueDate = parseDate(get('dueDate'));
        if (dueDate.error) fields.dueDate = dueDate.error;

        let assigneeId: string | null = null;
        const assigneeRaw = get('assignee');
        if (assigneeRaw) {
          const match = members.find(
            (member) =>
              member.user.email.toLowerCase() === assigneeRaw.toLowerCase() ||
              member.user.name.toLowerCase() === assigneeRaw.toLowerCase() ||
              member.user.handle.toLowerCase() === assigneeRaw.replace(/^@/, '').toLowerCase(),
          );
          if (!match) fields.assignee = `No workspace member matches "${assigneeRaw}"`;
          else if (match.role === 'viewer') fields.assignee = 'Viewers cannot be assigned issues';
          else assigneeId = match.user.id;
        }

        let projectId: string | null = null;
        const projectRaw = get('project');
        if (projectRaw) {
          const match = projects.find(
            (project) => project.name.toLowerCase() === projectRaw.toLowerCase(),
          );
          if (!match) {
            warnings.push({
              row: lineNumber,
              identifier: title || `row ${lineNumber}`,
              message: `Project "${projectRaw}" not found — issue imported without a project`,
            });
          } else projectId = match.id;
        }

        let cycleId: string | null = null;
        const cycleRaw = get('cycle');
        if (cycleRaw) {
          const match = cycles.find(
            (cycle) =>
              cycle.name.toLowerCase() === cycleRaw.toLowerCase() ||
              String(cycle.number) === cycleRaw,
          );
          if (!match) {
            warnings.push({
              row: lineNumber,
              identifier: title || `row ${lineNumber}`,
              message: `Cycle "${cycleRaw}" not found — issue imported without a cycle`,
            });
          } else cycleId = match.id;
        }

        const labelNames = get('labels')
          .split(/[|,]/)
          .map((name) => name.trim())
          .filter(Boolean);
        const labelIds: string[] = [];
        for (const name of labelNames) {
          const match = labels.find((label) => label.name.toLowerCase() === name.toLowerCase());
          if (!match) {
            warnings.push({
              row: lineNumber,
              identifier: title || `row ${lineNumber}`,
              message: `Label "${name}" does not exist and was skipped`,
            });
            continue;
          }
          labelIds.push(match.id);
        }

        if (Object.keys(fields).length > 0) {
          errors.push({
            row: lineNumber,
            identifier: title || `row ${lineNumber}`,
            message: 'Row skipped',
            fields,
          });
          continue;
        }

        if (dryRun) {
          created.push({ row: lineNumber, title, status, priority });
          continue;
        }

        try {
          const issue = await createIssue(workspaceId, ctx.user.id, {
            title,
            description: get('description') || null,
            status: status ?? 'todo',
            priority: priority ?? 'none',
            assigneeId,
            projectId,
            cycleId,
            labelIds,
            estimate: estimate.value,
            dueDate: dueDate.value,
          });
          created.push(issue);
        } catch (error) {
          errors.push({
            row: lineNumber,
            identifier: title || `row ${lineNumber}`,
            message: error instanceof Error ? error.message : 'Import failed for this row',
          });
        }
      }

      if (!dryRun && created.length > 0) {
        realtimeHub.broadcast({
          type: 'issue.bulk_updated',
          workspaceId,
          actorId: ctx.user.id,
          payload: { imported: created.length, issues: created },
        });
      }

      return reply.send({
        dryRun,
        imported: created.length,
        failed: errors.length,
        totalRows: rows.length - 1,
        errors: errors.slice(0, 100),
        warnings: warnings.slice(0, 100),
        issues: dryRun ? created : created.slice(0, 50),
      });
    },
  });

  /** CSV export of every issue matching the current filters. */
  app.get('/workspaces/:workspaceId/export/issues.csv', async (request, reply) => {
    const { workspaceId } = request.params as { workspaceId: string };
    await requireWorkspace(request, workspaceId, 'export:run');

    const query = request.query as Record<string, string | undefined>;
    const where: Record<string, unknown> = { workspaceId };
    if (query.projectId) where.projectId = query.projectId;
    if (query.cycleId) where.cycleId = query.cycleId;
    if (query.status) where.status = { in: query.status.split(',') };
    if (query.assigneeId) where.assigneeId = query.assigneeId;

    const issues = await prisma.issue.findMany({
      where,
      include: issueListInclude,
      orderBy: { number: 'asc' },
      take: 5000,
    });

    const rows = issues.map((issue) => {
      const serialized = serializeIssue(issue as never);
      return {
        identifier: serialized.identifier,
        title: serialized.title,
        description: serialized.description ?? '',
        status: serialized.status,
        priority: serialized.priority,
        assignee: (serialized.assignee as { name?: string } | null)?.name ?? '',
        creator: (serialized.creator as { name?: string } | null)?.name ?? '',
        project: (serialized.project as { name?: string } | null)?.name ?? '',
        cycle: (serialized.cycle as { name?: string } | null)?.name ?? '',
        labels: ((serialized.labels as { name: string }[]) ?? [])
          .map((label) => label.name)
          .join('|'),
        estimate: serialized.estimate ?? '',
        dueDate: serialized.dueDate
          ? new Date(String(serialized.dueDate)).toISOString().slice(0, 10)
          : '',
        createdAt: new Date(String(serialized.createdAt)).toISOString(),
        updatedAt: new Date(String(serialized.updatedAt)).toISOString(),
      };
    });

    const csv = toCsv(rows, [
      'identifier',
      'title',
      'description',
      'status',
      'priority',
      'assignee',
      'creator',
      'project',
      'cycle',
      'labels',
      'estimate',
      'dueDate',
      'createdAt',
      'updatedAt',
    ]);

    const filename = `orbit-issues-${new Date().toISOString().slice(0, 10)}.csv`;
    return reply
      .header('Content-Type', 'text/csv; charset=utf-8')
      .header('Content-Disposition', `attachment; filename="${filename}"`)
      .send(csv);
  });

  /** Template users can download before their first import. */
  app.get('/workspaces/:workspaceId/import/template.csv', async (request, reply) => {
    const { workspaceId } = request.params as { workspaceId: string };
    await requireWorkspace(request, workspaceId);
    const sample = [
      {
        title: 'Add SSO login for enterprise customers',
        description: 'Support SAML and OIDC providers.',
        status: 'todo',
        priority: 'high',
        assignee: 'javi@orbit.dev',
        project: 'Payments Platform',
        cycle: 'Cycle 12',
        labels: 'security|backend',
        estimate: '5',
        dueDate: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
      },
      {
        title: 'Fix flaky checkout test',
        description: 'Fails roughly 1 in 20 runs on CI.',
        status: 'in_progress',
        priority: 'medium',
        assignee: 'maria@orbit.dev',
        project: '',
        cycle: '',
        labels: 'bug',
        estimate: '2',
        dueDate: '',
      },
    ];
    const csv = toCsv(sample, CSV_COLUMNS as unknown as string[]);
    return reply
      .header('Content-Type', 'text/csv; charset=utf-8')
      .header('Content-Disposition', 'attachment; filename="orbit-import-template.csv"')
      .send(csv);
  });
}
