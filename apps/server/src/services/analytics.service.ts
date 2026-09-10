import type { IssuePriority, IssueStatus } from '@orbit/shared';
import { ISSUE_PRIORITIES, ISSUE_STATUSES, isCompletedStatus, percent } from '@orbit/shared';
import { prisma } from '../db/client.js';

export interface TrendPoint {
  date: string;
  created: number;
  completed: number;
}

export interface AnalyticsSummary {
  totals: {
    issues: number;
    open: number;
    completed: number;
    cancelled: number;
    overdue: number;
    projects: number;
    cycles: number;
    members: number;
    estimatePoints: number;
    completedPoints: number;
  };
  completionRate: number;
  byStatus: { key: IssueStatus; label: string; count: number }[];
  byPriority: { key: IssuePriority; count: number }[];
  trend: TrendPoint[];
  workload: {
    userId: string;
    name: string;
    avatarUrl: string | null;
    open: number;
    completed: number;
    estimate: number;
  }[];
  projects: {
    id: string;
    name: string;
    color: string;
    icon: string;
    status: string;
    total: number;
    completed: number;
    progress: number;
    leadId: string | null;
    targetDate: string | null;
  }[];
  velocity: {
    cycleId: string;
    name: string;
    number: number;
    status: string;
    startDate: string;
    endDate: string;
    completedPoints: number;
    completedIssues: number;
    totalIssues: number;
    totalPoints: number;
  }[];
  cycleBurndown: { date: string; remaining: number; ideal: number }[];
  throughput: { date: string; completed: number }[];
  labels: { id: string; name: string; color: string; count: number }[];
}

const STATUS_LABELS: Record<IssueStatus, string> = {
  backlog: 'Backlog',
  todo: 'Todo',
  in_progress: 'In Progress',
  in_review: 'In Review',
  done: 'Done',
  cancelled: 'Cancelled',
};

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Builds a dense daily series so charts never show gaps. */
function dailySeries(days: number, end = new Date()): string[] {
  const keys: string[] = [];
  const cursor = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()));
  for (let i = days - 1; i >= 0; i -= 1) {
    const day = new Date(cursor);
    day.setUTCDate(cursor.getUTCDate() - i);
    keys.push(dayKey(day));
  }
  return keys;
}

/**
 * Everything on the analytics page is derived from real rows in the database —
 * no hard-coded chart values. The scan is bounded to the trailing window and a
 * `take` cap so large workspaces stay responsive.
 */
export async function getWorkspaceAnalytics(
  workspaceId: string,
  days = 90,
): Promise<AnalyticsSummary> {
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - days);
  since.setUTCHours(0, 0, 0, 0);

  const [issues, projects, cycles, members, labels] = await Promise.all([
    prisma.issue.findMany({
      where: { workspaceId },
      select: {
        id: true,
        status: true,
        priority: true,
        estimate: true,
        createdAt: true,
        completedAt: true,
        dueDate: true,
        assigneeId: true,
        projectId: true,
        cycleId: true,
      },
      take: 5000,
    }),
    prisma.project.findMany({
      where: { workspaceId, archived: false },
      select: {
        id: true,
        name: true,
        color: true,
        icon: true,
        status: true,
        leadId: true,
        targetDate: true,
      },
    }),
    prisma.cycle.findMany({
      where: { workspaceId },
      orderBy: { startDate: 'asc' },
      select: { id: true, name: true, number: true, status: true, startDate: true, endDate: true },
    }),
    prisma.workspaceMember.findMany({
      where: { workspaceId, status: 'active' },
      select: { user: { select: { id: true, name: true, avatarUrl: true } }, role: true },
    }),
    prisma.label.findMany({
      where: { workspaceId },
      select: { id: true, name: true, color: true },
    }),
  ]);

  const labelCounts = await prisma.issueLabel.groupBy({
    by: ['labelId'],
    where: { issue: { workspaceId } },
    _count: { labelId: true },
  });

  const now = new Date();
  const statuses = ISSUE_STATUSES.map((status) => ({
    key: status,
    label: STATUS_LABELS[status],
    count: issues.filter((issue) => issue.status === status).length,
  }));

  const byPriority = ISSUE_PRIORITIES.map((priority) => ({
    key: priority,
    count: issues.filter((issue) => issue.priority === priority).length,
  }));

  const windowIssues = issues.filter((issue) => issue.createdAt >= since);
  const keys = dailySeries(Math.min(days, 180));
  const trendMap = new Map<string, TrendPoint>(
    keys.map((date) => [date, { date, created: 0, completed: 0 }]),
  );
  for (const issue of windowIssues) {
    const key = dayKey(issue.createdAt);
    const point = trendMap.get(key);
    if (point) point.created += 1;
    if (issue.completedAt) {
      const doneKey = dayKey(issue.completedAt);
      const donePoint = trendMap.get(doneKey);
      if (donePoint) donePoint.completed += 1;
    }
  }

  const memberRows = members.map((membership) => {
    const owned = issues.filter((issue) => issue.assigneeId === membership.user.id);
    return {
      userId: membership.user.id,
      name: membership.user.name,
      avatarUrl: membership.user.avatarUrl,
      open: owned.filter((issue) => !isCompletedStatus(issue.status as IssueStatus)).length,
      completed: owned.filter((issue) => issue.status === 'done').length,
      estimate: owned
        .filter((issue) => issue.status === 'done')
        .reduce((sum, issue) => sum + (issue.estimate ?? 0), 0),
    };
  });

  const projectRows = projects.map((project) => {
    const owned = issues.filter((issue) => issue.projectId === project.id);
    const completed = owned.filter((issue) => issue.status === 'done').length;
    return {
      id: project.id,
      name: project.name,
      color: project.color,
      icon: project.icon,
      status: project.status,
      total: owned.length,
      completed,
      progress: percent(completed, owned.length),
      leadId: project.leadId,
      targetDate: project.targetDate ? project.targetDate.toISOString() : null,
    };
  });

  const velocity = cycles.map((cycle) => {
    const owned = issues.filter((issue) => issue.cycleId === cycle.id);
    const done = owned.filter((issue) => issue.status === 'done');
    return {
      cycleId: cycle.id,
      name: cycle.name,
      number: cycle.number,
      status: cycle.status,
      startDate: cycle.startDate.toISOString(),
      endDate: cycle.endDate.toISOString(),
      completedIssues: done.length,
      totalIssues: owned.length,
      completedPoints: done.reduce((sum, issue) => sum + (issue.estimate ?? 0), 0),
      totalPoints: owned.reduce((sum, issue) => sum + (issue.estimate ?? 0), 0),
    };
  });

  const activeCycle = cycles.find((cycle) => cycle.status === 'active') ?? null;
  const cycleBurndown: AnalyticsSummary['cycleBurndown'] = [];
  if (activeCycle) {
    const cycleIssues = issues.filter((issue) => issue.cycleId === activeCycle.id);
    const totalPoints = cycleIssues.reduce((sum, issue) => sum + (issue.estimate ?? 0), 0);
    const cycleStart = new Date(
      Date.UTC(
        activeCycle.startDate.getUTCFullYear(),
        activeCycle.startDate.getUTCMonth(),
        activeCycle.startDate.getUTCDate(),
      ),
    );
    const cycleEnd = new Date(
      Date.UTC(
        activeCycle.endDate.getUTCFullYear(),
        activeCycle.endDate.getUTCMonth(),
        activeCycle.endDate.getUTCDate(),
      ),
    );
    const totalDays = Math.max(
      1,
      Math.round((cycleEnd.getTime() - cycleStart.getTime()) / 86400000),
    );
    for (let i = 0; i <= totalDays; i += 1) {
      const day = new Date(cycleStart);
      day.setUTCDate(cycleStart.getUTCDate() + i);
      const remaining = cycleIssues
        .filter((issue) => !issue.completedAt || issue.completedAt > day)
        .reduce((sum, issue) => sum + (issue.estimate ?? 0), 0);
      cycleBurndown.push({
        date: dayKey(day),
        remaining,
        ideal: Math.round((totalPoints * (totalDays - i)) / totalDays),
      });
    }
  }

  const completed = issues.filter((issue) => issue.status === 'done').length;
  const cancelled = issues.filter((issue) => issue.status === 'cancelled').length;
  const overdue = issues.filter(
    (issue) =>
      issue.dueDate !== null &&
      issue.dueDate < now &&
      !isCompletedStatus(issue.status as IssueStatus),
  ).length;

  return {
    totals: {
      issues: issues.length,
      open: issues.filter((issue) => !isCompletedStatus(issue.status as IssueStatus)).length,
      completed,
      cancelled,
      overdue,
      projects: projects.length,
      cycles: cycles.length,
      members: members.length,
      estimatePoints: issues.reduce((sum, issue) => sum + (issue.estimate ?? 0), 0),
      completedPoints: issues
        .filter((issue) => issue.status === 'done')
        .reduce((sum, issue) => sum + (issue.estimate ?? 0), 0),
    },
    completionRate: percent(completed, issues.length - cancelled),
    byStatus: statuses,
    byPriority,
    trend: [...trendMap.values()],
    workload: memberRows.sort((a, b) => b.open - a.open),
    projects: projectRows,
    velocity,
    cycleBurndown,
    throughput: keys.map((date) => ({
      date,
      completed: issues.filter((issue) => issue.completedAt && dayKey(issue.completedAt) === date)
        .length,
    })),
    labels: labels
      .map((label) => ({
        ...label,
        count: labelCounts.find((row) => row.labelId === label.id)?._count.labelId ?? 0,
      }))
      .sort((a, b) => b.count - a.count),
  };
}

export async function getProjectAnalytics(projectId: string, workspaceId: string) {
  const issues = await prisma.issue.findMany({
    where: { projectId, workspaceId },
    select: {
      id: true,
      status: true,
      priority: true,
      estimate: true,
      createdAt: true,
      completedAt: true,
      assigneeId: true,
      assignee: { select: { id: true, name: true, avatarUrl: true } },
      cycleId: true,
    },
    take: 3000,
  });

  const keys = dailySeries(42);
  const trendMap = new Map(keys.map((date) => [date, { date, created: 0, completed: 0 }]));
  for (const issue of issues) {
    const created = trendMap.get(dayKey(issue.createdAt));
    if (created) created.created += 1;
    if (issue.completedAt) {
      const done = trendMap.get(dayKey(issue.completedAt));
      if (done) done.completed += 1;
    }
  }

  const byAssignee = new Map<
    string,
    { userId: string; name: string; avatarUrl: string | null; open: number; completed: number }
  >();
  for (const issue of issues) {
    const key = issue.assignee?.id ?? 'unassigned';
    const entry = byAssignee.get(key) ?? {
      userId: key,
      name: issue.assignee?.name ?? 'Unassigned',
      avatarUrl: issue.assignee?.avatarUrl ?? null,
      open: 0,
      completed: 0,
    };
    if (issue.status === 'done') entry.completed += 1;
    else if (!isCompletedStatus(issue.status as IssueStatus)) entry.open += 1;
    byAssignee.set(key, entry);
  }

  const completed = issues.filter((issue) => issue.status === 'done').length;
  return {
    total: issues.length,
    completed,
    open: issues.filter((issue) => !isCompletedStatus(issue.status as IssueStatus)).length,
    progress: percent(completed, issues.length),
    estimateTotal: issues.reduce((sum, issue) => sum + (issue.estimate ?? 0), 0),
    estimateCompleted: issues
      .filter((issue) => issue.status === 'done')
      .reduce((sum, issue) => sum + (issue.estimate ?? 0), 0),
    byStatus: ISSUE_STATUSES.map((status) => ({
      key: status,
      label: STATUS_LABELS[status],
      count: issues.filter((issue) => issue.status === status).length,
    })),
    byPriority: ISSUE_PRIORITIES.map((priority) => ({
      key: priority,
      count: issues.filter((issue) => issue.priority === priority).length,
    })),
    trend: [...trendMap.values()],
    byAssignee: [...byAssignee.values()].sort(
      (a, b) => b.open + b.completed - (a.open + a.completed),
    ),
  };
}
