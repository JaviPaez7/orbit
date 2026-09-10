import type { IssuePriority, IssueStatus } from '@orbit/shared';
import { deriveWorkspaceKey, percent } from '@orbit/shared';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import {
  BUG_PREFIXES,
  COMMENT_BODIES,
  DEMO_PASSWORD,
  ISSUE_TITLES,
  TECH_DEBT_BODIES,
  USERS,
  WORKSPACES,
  avatarDataUrl,
  daysAgo,
  intBetween,
  pick,
  pickMany,
  rand,
  randomPriority,
  randomStatus,
  type WorkspaceBlueprint,
} from './seed-data.js';

const prisma = new PrismaClient();
const DAY = 86_400_000;

interface SeededIssue {
  id: string;
  workspaceId: string;
  identifier: string;
  title: string;
  status: IssueStatus;
  priority: IssuePriority;
  assigneeId: string | null;
  creatorId: string;
  projectId: string | null;
  cycleId: string | null;
  estimate: number | null;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
  dueDate: Date | null;
}

async function reset(): Promise<void> {
  // Children first; workspaces cascade but being explicit keeps this readable.
  await prisma.notification.deleteMany();
  await prisma.activity.deleteMany();
  await prisma.attachment.deleteMany();
  await prisma.comment.deleteMany();
  await prisma.issueLabel.deleteMany();
  await prisma.issueRelation.deleteMany();
  await prisma.issue.deleteMany();
  await prisma.cycle.deleteMany();
  await prisma.projectMember.deleteMany();
  await prisma.project.deleteMany();
  await prisma.label.deleteMany();
  await prisma.workspaceMember.deleteMany();
  await prisma.workspace.deleteMany();
  await prisma.session.deleteMany();
  await prisma.passwordResetToken.deleteMany();
  await prisma.user.deleteMany();
}

async function createUsers(): Promise<
  Map<string, { id: string; name: string; email: string; handle: string }>
> {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const map = new Map<string, { id: string; name: string; email: string; handle: string }>();

  for (const user of USERS) {
    const created = await prisma.user.create({
      data: {
        email: user.email,
        name: user.name,
        handle: user.handle,
        passwordHash,
        title: user.title,
        timezone: user.timezone,
        avatarUrl: avatarDataUrl(user.name, user.avatarColor),
        createdAt: daysAgo(intBetween(200, 400)),
      },
      select: { id: true, name: true, email: true, handle: true },
    });
    map.set(user.handle, created);
  }
  return map;
}

interface CycleRecord {
  id: string;
  name: string;
  number: number;
  status: string;
  startDate: Date;
  endDate: Date;
}

async function buildWorkspace(
  blueprint: WorkspaceBlueprint,
  users: Map<string, { id: string; name: string; email: string; handle: string }>,
): Promise<{ issues: SeededIssue[]; workspaceId: string; activityCount: number }> {
  const owner = users.get(blueprint.ownerHandle)!;
  const createdAt = daysAgo(intBetween(180, 320));

  const workspace = await prisma.workspace.create({
    data: {
      name: blueprint.name,
      slug: blueprint.slug,
      key: deriveWorkspaceKey(blueprint.name),
      description: blueprint.description,
      logoColor: blueprint.logoColor,
      ownerId: owner.id,
      createdAt,
    },
  });

  // ---- members ------------------------------------------------------------
  for (const member of blueprint.members) {
    const user = users.get(member.handle)!;
    await prisma.workspaceMember.create({
      data: {
        workspaceId: workspace.id,
        userId: user.id,
        role: member.role,
        joinedAt: daysAgo(intBetween(30, 170)),
      },
    });
  }
  const memberIds = blueprint.members.map((member) => users.get(member.handle)!.id);
  const assignableIds = blueprint.members
    .filter((member) => member.role !== 'viewer')
    .map((member) => users.get(member.handle)!.id);

  // ---- labels -------------------------------------------------------------
  const labels = new Map<string, string>();
  for (const label of blueprint.labels) {
    const created = await prisma.label.create({
      data: { workspaceId: workspace.id, name: label.name, color: label.color },
      select: { id: true },
    });
    labels.set(label.name, created.id);
  }
  const labelNames = blueprint.labels.map((label) => label.name);

  // ---- projects -----------------------------------------------------------
  const projects = new Map<
    string,
    { id: string; blueprint: (typeof blueprint.projects)[number] }
  >();
  for (const project of blueprint.projects) {
    const lead = users.get(project.leadHandle);
    const created = await prisma.project.create({
      data: {
        workspaceId: workspace.id,
        name: project.name,
        description: project.description,
        icon: project.icon,
        color: project.color,
        status: project.status,
        leadId: lead?.id ?? null,
        startDate: daysAgo(project.startOffsetDays),
        targetDate: new Date(Date.now() - project.targetOffsetDays * DAY),
        createdAt: daysAgo(project.startOffsetDays + intBetween(0, 5)),
      },
      select: { id: true },
    });
    projects.set(project.name, { id: created.id, blueprint: project });

    const projectMembers = pickMany(memberIds, 2, Math.min(5, memberIds.length));
    for (const userId of new Set([...projectMembers, ...(lead ? [lead.id] : [])])) {
      await prisma.projectMember.create({ data: { projectId: created.id, userId } });
    }
  }

  // ---- cycles -------------------------------------------------------------
  const cycles: CycleRecord[] = [];
  const anchorEnd = new Date(Date.now() + 4 * DAY);
  for (let index = blueprint.cyclesBack; index >= -blueprint.cyclesForward; index -= 1) {
    const number = blueprint.cyclesBack - index + 1; // 1..N, increasing with time
    const endDate = new Date(anchorEnd.getTime() - index * blueprint.cycleLengthDays * DAY);
    const startDate = new Date(endDate.getTime() - blueprint.cycleLengthDays * DAY);
    const status = index > 0 ? 'completed' : index === 0 ? 'active' : 'upcoming';

    const created = await prisma.cycle.create({
      data: {
        workspaceId: workspace.id,
        number,
        name: `Cycle ${number}`,
        startDate,
        endDate,
        status,
        createdAt: startDate,
      },
      select: { id: true, name: true, number: true, status: true, startDate: true, endDate: true },
    });
    cycles.push(created);
  }
  const activeCycle =
    cycles.find((cycle) => cycle.status === 'active') ?? cycles[cycles.length - 1]!;
  const pastCycles = cycles.filter((cycle) => cycle.status !== 'upcoming');

  // ---- issues -------------------------------------------------------------
  const issues: SeededIssue[] = [];
  let issueCounter = 0;
  const totalTarget = 96;

  for (const [projectName, entry] of projects) {
    const blueprintProject = entry.blueprint;
    const pool = ISSUE_TITLES[projectName] ?? [];
    const count = Math.max(pool.length, Math.round(totalTarget * (blueprintProject.weight / 8)));

    for (let i = 0; i < count; i += 1) {
      issueCounter += 1;
      const template = pool[i % pool.length]!;
      const isExtraPass = i >= pool.length;

      // Give later passes believable variations of the same backlog.
      const chosenLabels = pickMany(labelNames, 1, 3);
      const priority = randomPriority(chosenLabels);

      let title = template.title;
      let description = template.body;
      if (isExtraPass) {
        if (chosenLabels.includes('bug')) {
          title = `${pick(BUG_PREFIXES)} ${template.title.toLowerCase()}`;
        } else if (chosenLabels.includes('tech-debt')) {
          title = `Refactor: ${template.title.toLowerCase()}`;
          description = `${template.body}\n\n${pick(TECH_DEBT_BODIES)}`;
        } else {
          title = `${template.title} (follow-up)`;
        }
      }

      const cycle =
        blueprintProject.status === 'completed'
          ? pick(pastCycles)
          : rand() < 0.72
            ? activeCycle
            : rand() < 0.5
              ? pick(pastCycles)
              : null;

      const ageDays =
        blueprintProject.status === 'completed'
          ? intBetween(
              projectAgeFloor(blueprintProject.startOffsetDays),
              blueprintProject.startOffsetDays,
            )
          : intBetween(1, Math.max(3, Math.min(110, blueprintProject.startOffsetDays)));

      const createdAt = daysAgo(ageDays);
      const status = randomStatus(blueprintProject.status, ageDays);
      const updatedAt = new Date(
        Math.min(Date.now(), createdAt.getTime() + intBetween(1, Math.max(1, ageDays)) * DAY),
      );
      const completedAt =
        status === 'done'
          ? new Date(Math.min(Date.now(), createdAt.getTime() + intBetween(1, 12) * DAY))
          : null;

      const assigneeId = rand() < 0.86 ? pick(assignableIds) : null;
      const creatorId =
        rand() < 0.4 ? (users.get(blueprint.ownerHandle)!.id as string) : pick(memberIds);

      const dueDate =
        rand() < 0.55 ? new Date(createdAt.getTime() + intBetween(7, 60) * DAY) : null;
      const estimate = rand() < 0.72 ? pick([0, 1, 2, 3, 5, 8, 13] as const) : null;

      const created = await prisma.issue.create({
        data: {
          workspaceId: workspace.id,
          number: issueCounter,
          identifier: `${workspace.key}-${issueCounter}`,
          title,
          description,
          status,
          priority,
          boardOrder: 1000 + i * 100 + issueCounter,
          projectId: entry.id,
          cycleId: cycle?.id ?? null,
          assigneeId,
          creatorId,
          estimate,
          dueDate,
          completedAt,
          createdAt,
          updatedAt,
          labels: {
            create: chosenLabels
              .map((name) => labels.get(name))
              .filter((id): id is string => Boolean(id))
              .map((labelId) => ({ labelId })),
          },
        },
        select: {
          id: true,
          workspaceId: true,
          identifier: true,
          title: true,
          status: true,
          priority: true,
          assigneeId: true,
          creatorId: true,
          projectId: true,
          cycleId: true,
          estimate: true,
          createdAt: true,
          updatedAt: true,
          completedAt: true,
          dueDate: true,
        },
      });
      issues.push(created as SeededIssue);

      await prisma.activity.create({
        data: {
          workspaceId: workspace.id,
          actorId: creatorId,
          entityType: 'issue',
          entityId: created.id,
          action: 'created',
          entityLabel: created.identifier,
          issueId: created.id,
          projectId: entry.id,
          cycleId: cycle?.id ?? null,
          changes: '{}',
          createdAt,
        },
      });
    }
  }

  // ---- issues that belong to no project (triage backlog) -------------------
  for (let i = 0; i < 8; i += 1) {
    issueCounter += 1;
    const chosenLabels = pickMany(labelNames, 0, 2);
    const priority = randomPriority(chosenLabels);
    const createdAt = daysAgo(intBetween(2, 90));
    const status = randomStatus('in_progress', intBetween(2, 90));
    const assigneeId = rand() < 0.6 ? pick(assignableIds) : null;
    const created = await prisma.issue.create({
      data: {
        workspaceId: workspace.id,
        number: issueCounter,
        identifier: `${workspace.key}-${issueCounter}`,
        title: `Triage: ${pick([
          'customer report from support',
          'error budget burn from last week',
          'incoming request from sales',
          'unexpected spike in queue depth',
          'follow-up from the incident review',
        ])}`,
        description:
          'Raised outside the normal planning flow — needs scoping before it can be scheduled.',
        status,
        priority,
        boardOrder: 900_000 + i,
        projectId: null,
        cycleId: null,
        assigneeId,
        creatorId: pick(memberIds),
        estimate: null,
        dueDate: null,
        completedAt:
          status === 'done' ? new Date(Math.min(Date.now(), createdAt.getTime() + 3 * DAY)) : null,
        createdAt,
        updatedAt: createdAt,
        labels: {
          create: chosenLabels
            .map((name) => labels.get(name))
            .filter((id): id is string => Boolean(id))
            .map((labelId) => ({ labelId })),
        },
      },
      select: {
        id: true,
        workspaceId: true,
        identifier: true,
        title: true,
        status: true,
        priority: true,
        assigneeId: true,
        creatorId: true,
        projectId: true,
        cycleId: true,
        estimate: true,
        createdAt: true,
        updatedAt: true,
        completedAt: true,
        dueDate: true,
      },
    });
    issues.push(created as SeededIssue);
  }

  // ---- sub-issues ---------------------------------------------------------
  const parents = issues.filter((issue) => issue.status !== 'done' && issue.status !== 'cancelled');
  for (let i = 0; i < 12 && parents.length > 1; i += 1) {
    const parent = pick(parents);
    const child = issues[(i * 7 + 3) % issues.length]!;
    if (child.id === parent.id || child.projectId !== parent.projectId) continue;
    await prisma.issue.update({
      where: { id: child.id },
      data: { parentId: parent.id, updatedAt: child.updatedAt },
    });
  }

  // ---- issue relations ----------------------------------------------------
  const relationTypes = ['related', 'blocks', 'blocked_by', 'duplicate'] as const;
  for (let i = 0; i < 14; i += 1) {
    const a = pick(issues);
    const b = pick(issues);
    if (a.id === b.id) continue;
    try {
      await prisma.issueRelation.create({
        data: { issueId: a.id, relatedIssueId: b.id, type: pick(relationTypes) },
      });
    } catch {
      // Unique constraint — an equivalent relation already exists.
    }
  }

  // ---- status transitions + activity history ------------------------------
  let activityCount = 0;
  const statusFlow: IssueStatus[] = ['backlog', 'todo', 'in_progress', 'in_review', 'done'];
  for (const issue of issues) {
    const targetIndex = statusFlow.indexOf(issue.status === 'cancelled' ? 'todo' : issue.status);
    if (targetIndex <= 0) continue;
    if (rand() < 0.45) continue; // not every issue has a full trail

    const actorId = pick(memberIds);
    const path = statusFlow.slice(0, targetIndex + 1);
    const first = path[0]!;
    const second = path[1] ?? first;
    await prisma.activity.create({
      data: {
        workspaceId: workspace.id,
        actorId,
        entityType: 'issue',
        entityId: issue.id,
        action: 'status_changed',
        entityLabel: issue.identifier,
        issueId: issue.id,
        projectId: issue.projectId,
        cycleId: issue.cycleId,
        changes: JSON.stringify({ status: { from: first, to: second } }),
        createdAt: new Date(issue.createdAt.getTime() + 4 * 3_600_000),
      },
    });
    activityCount += 1;

    if (path.length > 2) {
      const from = path[path.length - 2]!;
      await prisma.activity.create({
        data: {
          workspaceId: workspace.id,
          actorId: pick(memberIds),
          entityType: 'issue',
          entityId: issue.id,
          action: 'status_changed',
          entityLabel: issue.identifier,
          issueId: issue.id,
          projectId: issue.projectId,
          cycleId: issue.cycleId,
          changes: JSON.stringify({ status: { from, to: issue.status } }),
          createdAt: new Date(issue.updatedAt.getTime() - 2 * 3_600_000),
        },
      });
      activityCount += 1;
    }

    if (rand() < 0.35) {
      const other = users.get(pick(blueprint.members).handle)!;
      await prisma.activity.create({
        data: {
          workspaceId: workspace.id,
          actorId,
          entityType: 'issue',
          entityId: issue.id,
          action: 'assignee_changed',
          entityLabel: issue.identifier,
          issueId: issue.id,
          projectId: issue.projectId,
          cycleId: issue.cycleId,
          changes: JSON.stringify({
            assignee: { from: null, to: { id: other.id, name: other.name } },
          }),
          createdAt: new Date(issue.createdAt.getTime() + 9 * 3_600_000),
        },
      });
      activityCount += 1;
    }

    if (rand() < 0.25) {
      const priorities: IssuePriority[] = ['none', 'low', 'medium', 'high', 'urgent'];
      await prisma.activity.create({
        data: {
          workspaceId: workspace.id,
          actorId,
          entityType: 'issue',
          entityId: issue.id,
          action: 'priority_changed',
          entityLabel: issue.identifier,
          issueId: issue.id,
          projectId: issue.projectId,
          cycleId: issue.cycleId,
          changes: JSON.stringify({
            priority: { from: pick(priorities), to: issue.priority },
          }),
          createdAt: new Date(issue.createdAt.getTime() + 12 * 3_600_000),
        },
      });
      activityCount += 1;
    }
  }

  // ---- comments -----------------------------------------------------------
  const commentable = pickMany(issues, 40, Math.min(70, issues.length));
  for (const issue of commentable) {
    const commentCount = intBetween(0, 4);
    let previousAt = issue.createdAt.getTime() + 2 * 3_600_000;
    for (let i = 0; i < commentCount; i += 1) {
      const author = users.get(pick(blueprint.members).handle)!;
      const createdAt = new Date(previousAt + intBetween(1, 20) * 3_600_000);
      previousAt = createdAt.getTime();
      if (createdAt.getTime() > Date.now()) continue;

      const created = await prisma.comment.create({
        data: {
          issueId: issue.id,
          authorId: author.id,
          body: pick(COMMENT_BODIES),
          createdAt,
          updatedAt: createdAt,
        },
        select: { id: true },
      });

      await prisma.activity.create({
        data: {
          workspaceId: workspace.id,
          actorId: author.id,
          entityType: 'comment',
          entityId: created.id,
          action: 'commented',
          entityLabel: issue.identifier,
          issueId: issue.id,
          projectId: issue.projectId,
          cycleId: issue.cycleId,
          changes: '{}',
          createdAt,
        },
      });
      activityCount += 1;
    }
  }

  // ---- attachments --------------------------------------------------------
  for (const issue of pickMany(issues, 3, 6)) {
    await prisma.attachment.create({
      data: {
        issueId: issue.id,
        uploaderId: pick(memberIds),
        filename: pick([
          'trace.log',
          'screenshot.png',
          'query-plan.txt',
          'flamegraph.svg',
          'repro.mp4',
        ]),
        url: 'https://example.com/orbit-demo-attachment',
        mimeType: 'text/plain',
        size: intBetween(2048, 900_000),
        createdAt: issue.createdAt,
      },
    });
  }

  // ---- notifications for the seeded demo user (the workspace owner) --------
  const ownerIssues = issues.filter((issue) => issue.assigneeId === owner.id);
  const maria = users.get('maria')!;
  const ana = users.get('ana')!;
  const notificationSeeds: {
    type: string;
    title: string;
    body: string;
    issue: SeededIssue;
    actor: { id: string; name: string; avatarUrl: string | null };
    createdAt: Date;
    read: boolean;
  }[] = [];

  const actorOf = (handle: string) => {
    const record = users.get(handle)!;
    const seed = USERS.find((user) => user.handle === handle)!;
    return {
      id: record.id,
      name: record.name,
      avatarUrl: avatarDataUrl(seed.name, seed.avatarColor),
    };
  };

  for (const issue of ownerIssues.slice(0, 12)) {
    notificationSeeds.push({
      type: 'issue_assigned',
      title: `${maria.name} assigned you ${issue.identifier}`,
      body: issue.title,
      issue,
      actor: actorOf('maria'),
      createdAt: new Date(Math.min(Date.now(), issue.updatedAt.getTime())),
      read: rand() < 0.4,
    });
  }
  for (const issue of issues.filter((i) => i.priority === 'urgent').slice(0, 6)) {
    notificationSeeds.push({
      type: 'comment_mention',
      title: `${ana.name} mentioned you on ${issue.identifier}`,
      body: 'Can you confirm the rollout plan before we ship this?',
      issue,
      actor: actorOf('ana'),
      createdAt: new Date(Math.min(Date.now(), issue.updatedAt.getTime() - 3_600_000)),
      read: false,
    });
  }
  for (const issue of issues.filter((i) => i.status === 'done').slice(0, 8)) {
    notificationSeeds.push({
      type: 'issue_status_changed',
      title: `${issue.identifier} moved to Done`,
      body: issue.title,
      issue,
      actor: actorOf('carlos'),
      createdAt: new Date(Math.min(Date.now(), (issue.completedAt ?? issue.updatedAt).getTime())),
      read: rand() < 0.7,
    });
  }

  for (const seed of notificationSeeds) {
    await prisma.notification.create({
      data: {
        workspaceId: workspace.id,
        userId: owner.id,
        type: seed.type,
        title: seed.title,
        body: seed.body,
        issueId: seed.issue.id,
        actorId: seed.actor.id,
        actorName: seed.actor.name,
        actorAvatar: seed.actor.avatarUrl,
        data: JSON.stringify({
          issueId: seed.issue.id,
          identifier: seed.issue.identifier,
          workspaceId: workspace.id,
        }),
        readAt: seed.read ? new Date(seed.createdAt.getTime() + 3_600_000) : null,
        createdAt: seed.createdAt,
      },
    });
  }

  // ---- workspace + project activity ---------------------------------------
  await prisma.activity.create({
    data: {
      workspaceId: workspace.id,
      actorId: owner.id,
      entityType: 'workspace',
      entityId: workspace.id,
      action: 'created',
      entityLabel: workspace.name,
      changes: '{}',
      createdAt,
    },
  });

  await prisma.workspace.update({
    where: { id: workspace.id },
    data: { issueCounter },
  });

  return { issues, workspaceId: workspace.id, activityCount };
}

function projectAgeFloor(startOffsetDays: number): number {
  return Math.max(20, startOffsetDays - 120);
}

async function main(): Promise<void> {
  const startedAt = Date.now();
  console.log('↻ Seeding Orbit demo data…');
  await reset();

  const users = await createUsers();
  console.log(`  ✔ ${users.size} users`);

  let totalIssues = 0;
  let totalActivity = 0;
  const summary: {
    name: string;
    key: string;
    projects: number;
    issues: number;
    cycles: number;
    members: number;
  }[] = [];

  for (const blueprint of WORKSPACES) {
    const result = await buildWorkspace(blueprint, users);
    const [issueCount, projectCount, cycleCount, memberCount] = await Promise.all([
      prisma.issue.count({ where: { workspaceId: result.workspaceId } }),
      prisma.project.count({ where: { workspaceId: result.workspaceId } }),
      prisma.cycle.count({ where: { workspaceId: result.workspaceId } }),
      prisma.workspaceMember.count({ where: { workspaceId: result.workspaceId } }),
    ]);
    totalIssues += issueCount;
    totalActivity += result.activityCount;
    summary.push({
      name: blueprint.name,
      key: deriveWorkspaceKey(blueprint.name),
      projects: projectCount,
      issues: issueCount,
      cycles: cycleCount,
      members: memberCount,
    });
  }

  const [comments, activities, notifications, labels, sessions] = await Promise.all([
    prisma.comment.count(),
    prisma.activity.count(),
    prisma.notification.count(),
    prisma.label.count(),
    prisma.session.count(),
  ]);

  console.log('');
  for (const row of summary) {
    const completed = await prisma.issue.count({
      where: { workspace: { key: row.key }, status: 'done' },
    });
    console.log(
      `  ✔ ${row.name} (${row.key}) — ${row.projects} projects, ${row.issues} issues ` +
        `(${percent(completed, row.issues)}% done), ${row.cycles} cycles, ${row.members} members`,
    );
  }
  console.log('');
  console.log(
    `  labels: ${labels}   comments: ${comments}   activity: ${activities}   notifications: ${notifications}`,
  );
  console.log(`  active sessions: ${sessions} (cleared — sign in to create one)`);
  console.log(`  total issues: ${totalIssues}   tracked activity events: ${totalActivity}`);
  console.log('');
  console.log('Demo accounts (password for all):', DEMO_PASSWORD);
  for (const user of USERS) {
    console.log(`  • ${user.email.padEnd(20)} ${user.name.padEnd(20)} ${user.title}`);
  }
  console.log(`\n✔ Seed finished in ${((Date.now() - startedAt) / 1000).toFixed(1)}s`);
}

main()
  .catch((error) => {
    console.error('✖ Seed failed');
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
