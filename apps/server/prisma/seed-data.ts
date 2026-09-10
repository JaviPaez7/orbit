/**
 * Deterministic demo seed for Orbit.
 *
 * Output: 8 users, 2 workspaces, 5+ projects, 10 cycles, ~150 issues,
 * comments, activity history, notifications and label assignments — enough that
 * every page (analytics, cycles, inbox, kanban) looks alive immediately.
 *
 * Run:  pnpm db:seed   (or `pnpm db:reset` for a clean rebuild)
 *
 * IMPORTANT: `createIssue` is not used here on purpose — it enforces
 * "now"-based timestamps and emits notifications. The seed writes rows
 * directly so history can be back-dated for realistic charts.
 */
import type { IssuePriority, IssueStatus, ProjectStatus, WorkspaceRole } from '@orbit/shared';
import { deriveWorkspaceKey } from '@orbit/shared';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

/** Deterministic RNG (mulberry32) so reseeding produces the same demo data. */
function createRandom(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = createRandom(20260214);
const pick = <T>(items: readonly T[]): T => items[Math.floor(rand() * items.length)]!;
const pickMany = <T>(items: readonly T[], min: number, max: number): T[] => {
  const count = min + Math.floor(rand() * (max - min + 1));
  const copy = [...items];
  const out: T[] = [];
  for (let i = 0; i < count && copy.length > 0; i += 1) {
    out.push(...copy.splice(Math.floor(rand() * copy.length), 1));
  }
  return out;
};
const intBetween = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1));

const DAY = 86_400_000;
const now = Date.now();
const daysAgo = (days: number, hourOffset = 9) => {
  const date = new Date(now - days * DAY);
  date.setUTCHours(hourOffset, intBetween(0, 59), 0, 0);
  return date;
};

// ---------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------

interface SeedUser {
  email: string;
  name: string;
  handle: string;
  title: string;
  timezone: string;
  avatarColor: string;
}

const USERS: SeedUser[] = [
  { email: 'javi@orbit.dev', name: 'Javi Rodriguez', handle: 'javi', title: 'Engineering Lead', timezone: 'Europe/Madrid', avatarColor: '#6366f1' },
  { email: 'maria@orbit.dev', name: 'Maria Lopez', handle: 'maria', title: 'Staff Engineer', timezone: 'Europe/Madrid', avatarColor: '#ec4899' },
  { email: 'carlos@orbit.dev', name: 'Carlos Mendez', handle: 'carlos', title: 'Backend Engineer', timezone: 'Europe/Lisbon', avatarColor: '#14b8a6' },
  { email: 'ana@orbit.dev', name: 'Ana Beltran', handle: 'ana', title: 'Product Designer', timezone: 'Europe/Paris', avatarColor: '#f59e0b' },
  { email: 'diego@orbit.dev', name: 'Diego Fernandez', handle: 'diego', title: 'Platform Engineer', timezone: 'America/New_York', avatarColor: '#8b5cf6' },
  { email: 'lucia@orbit.dev', name: 'Lucia Navarro', handle: 'lucia', title: 'QA Engineer', timezone: 'Europe/Madrid', avatarColor: '#22c55e' },
  { email: 'sam@orbit.dev', name: 'Sam Whitaker', handle: 'sam', title: 'Engineering Manager', timezone: 'Europe/London', avatarColor: '#0ea5e9' },
  { email: 'nina@orbit.dev', name: 'Nina Petrova', handle: 'nina', title: 'Security Engineer', timezone: 'Europe/Berlin', avatarColor: '#ef4444' },
];

const DEMO_PASSWORD = 'Orbit1234';

/** Inline SVG avatar so the seed has no network dependency. */
function avatarDataUrl(name: string, color: string): string {
  const initials = name
    .split(' ')
    .map((part) => part[0]!.toUpperCase())
    .slice(0, 2)
    .join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128"><rect width="128" height="128" rx="28" fill="${color}"/><text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle" font-family="Inter,Segoe UI,sans-serif" font-size="52" font-weight="600" fill="#ffffff">${initials}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

// ---------------------------------------------------------------------------
// Workspace blueprints
// ---------------------------------------------------------------------------

interface ProjectBlueprint {
  name: string;
  description: string;
  icon: string;
  color: string;
  status: ProjectStatus;
  leadHandle: string;
  startOffsetDays: number;
  targetOffsetDays: number;
  weight: number;
}

interface LabelBlueprint {
  name: string;
  color: string;
}

interface WorkspaceBlueprint {
  name: string;
  slug: string;
  description: string;
  logoColor: string;
  ownerHandle: string;
  members: { handle: string; role: WorkspaceRole }[];
  labels: LabelBlueprint[];
  projects: ProjectBlueprint[];
  cycleLengthDays: number;
  cyclesBack: number;
  cyclesForward: number;
}

const WORKSPACES: WorkspaceBlueprint[] = [
  {
    name: 'Orbit Labs',
    slug: 'orbit-labs',
    description: 'Core product engineering for the Orbit platform.',
    logoColor: '#6366f1',
    ownerHandle: 'javi',
    members: [
      { handle: 'javi', role: 'owner' },
      { handle: 'maria', role: 'admin' },
      { handle: 'carlos', role: 'member' },
      { handle: 'ana', role: 'member' },
      { handle: 'lucia', role: 'member' },
      { handle: 'nina', role: 'viewer' },
    ],
    labels: [
      { name: 'bug', color: '#ef4444' },
      { name: 'feature', color: '#6366f1' },
      { name: 'improvement', color: '#22c55e' },
      { name: 'tech-debt', color: '#f59e0b' },
      { name: 'security', color: '#d946ef' },
      { name: 'design', color: '#ec4899' },
      { name: 'performance', color: '#0ea5e9' },
      { name: 'docs', color: '#84cc16' },
      { name: 'blocked', color: '#f97316' },
      { name: 'good-first-issue', color: '#14b8a6' },
    ],
    projects: [
      {
        name: 'Payments Platform',
        description: 'Checkout, billing, invoicing and the subscription ledger.',
        icon: 'rocket',
        color: '#6366f1',
        status: 'in_progress',
        leadHandle: 'maria',
        startOffsetDays: 120,
        targetOffsetDays: 45,
        weight: 1.5,
      },
      {
        name: 'Mobile App v2',
        description: 'Rebuilt React Native client with offline-first sync.',
        icon: 'zap',
        color: '#ec4899',
        status: 'in_progress',
        leadHandle: 'ana',
        startOffsetDays: 90,
        targetOffsetDays: 30,
        weight: 1.2,
      },
      {
        name: 'Analytics Engine',
        description: 'Event pipeline, warehouse sync and reporting APIs.',
        icon: 'gauge',
        color: '#0ea5e9',
        status: 'in_progress',
        leadHandle: 'carlos',
        startOffsetDays: 75,
        targetOffsetDays: 60,
        weight: 1.1,
      },
      {
        name: 'Security Hardening',
        description: 'SSO, audit logging, secret rotation and pen-test follow-ups.',
        icon: 'shield',
        color: '#d946ef',
        status: 'planned',
        leadHandle: 'nina',
        startOffsetDays: 10,
        targetOffsetDays: 100,
        weight: 0.8,
      },
      {
        name: 'Public API',
        description: 'Versioned REST + webhook surface for integrations.',
        icon: 'globe',
        color: '#22c55e',
        status: 'completed',
        leadHandle: 'diego',
        startOffsetDays: 200,
        targetOffsetDays: 20,
        weight: 0.7,
      },
    ],
    cycleLengthDays: 14,
    cyclesBack: 4,
    cyclesForward: 2,
  },
  {
    name: 'Northwind Studio',
    slug: 'northwind-studio',
    description: 'Client delivery studio — web builds and design systems.',
    logoColor: '#f59e0b',
    ownerHandle: 'sam',
    members: [
      { handle: 'sam', role: 'owner' },
      { handle: 'ana', role: 'admin' },
      { handle: 'diego', role: 'member' },
      { handle: 'lucia', role: 'member' },
      { handle: 'javi', role: 'member' },
    ],
    labels: [
      { name: 'client', color: '#f59e0b' },
      { name: 'bug', color: '#ef4444' },
      { name: 'design', color: '#ec4899' },
      { name: 'content', color: '#84cc16' },
      { name: 'urgent', color: '#f97316' },
    ],
    projects: [
      {
        name: 'Aurora Marketing Site',
        description: 'Marketing site rebuild with CMS-driven case studies.',
        icon: 'palette',
        color: '#f59e0b',
        status: 'in_progress',
        leadHandle: 'ana',
        startOffsetDays: 60,
        targetOffsetDays: 14,
        weight: 1.3,
      },
      {
        name: 'Design System 2.0',
        description: 'Tokens, primitives and docs for all client builds.',
        icon: 'layers',
        color: '#8b5cf6',
        status: 'in_progress',
        leadHandle: 'sam',
        startOffsetDays: 100,
        targetOffsetDays: 40,
        weight: 1.0,
      },
      {
        name: 'Legacy Migration',
        description: 'Move remaining client sites off the old CMS.',
        icon: 'box',
        color: '#14b8a6',
        status: 'paused',
        leadHandle: 'diego',
        startOffsetDays: 150,
        targetOffsetDays: 90,
        weight: 0.9,
      },
    ],
    cycleLengthDays: 21,
    cyclesBack: 3,
    cyclesForward: 1,
  },
];

// ---------------------------------------------------------------------------
// Issue copy — realistic engineering work, no lorem ipsum
// ---------------------------------------------------------------------------

const ISSUE_TITLES: Record<string, { title: string; body: string }[]> = {
  'Payments Platform': [
    { title: 'Retry failed invoice charges with exponential backoff', body: 'Charges that fail with a `card_declined` soft decline should be retried 3 times over 72 hours.\n\nAcceptance criteria:\n- Retry schedule is configurable per plan\n- Failures surface in the billing timeline\n- No duplicate charges when the retry succeeds' },
    { title: 'Proration is wrong when upgrading mid-cycle', body: 'Upgrading from Pro to Scale on day 12 of a 30 day cycle charges the full amount instead of the prorated difference.\n\nSteps to reproduce:\n1. Subscribe to Pro\n2. Wait until mid-cycle\n3. Upgrade to Scale\n\nExpected: a credit for unused Pro time is applied.' },
    { title: 'Add Stripe tax calculation to checkout', body: 'Stripe Tax should be enabled for EU and US customers. The tax line must be visible before the customer confirms.' },
    { title: 'Invoice PDF shows the wrong currency symbol', body: 'GBP invoices render with `$` in the line-item table. The `currency` field is present in the payload, so this is a formatting bug.' },
    { title: 'Ledger reconciliation job drifts by a few cents', body: 'The nightly reconciliation reports a mismatch for annual subscriptions with mid-term seat changes. Investigate rounding in the \u00d7 100 conversion.' },
    { title: 'Support SEPA direct debit', body: 'Add SEPA as a payment method for EU customers, including the mandate flow and failed-payment handling.' },
    { title: 'Backfill subscription events into the warehouse', body: 'One-off backfill of `subscription.*` events from the last 18 months so the finance dashboard has full history.' },
    { title: 'Expose usage-based billing meters', body: 'Customers on usage plans need a meter per product area with a hard cap and an alert at 80%.' },
    { title: 'Checkout abandons are not tracked', body: 'We lose the funnel at the payment step. Emit `checkout.abandoned` with the last completed step.' },
    { title: 'Add idempotency keys to the payment intent endpoint', body: 'Double submits from the mobile client create two payment intents. Require an `Idempotency-Key` header and store it for 24h.' },
    { title: 'Dunning emails fire twice for the same failure', body: 'Both the webhook handler and the scheduled job send the dunning email. Deduplicate by `invoice.id`.' },
    { title: 'Subscription cancellation survey is unskippable', body: 'The survey blocks cancellation when the request fails. It should be best-effort and never block the user.' },
  ],
  'Mobile App v2': [
    { title: 'Offline queue drops writes when the app is killed', body: 'Pending mutations live in memory only. Persist them to SQLite so a force-quit does not lose work.' },
    { title: 'Push notifications arrive twice on Android 14', body: 'Both FCM and our in-app poller deliver the same notification. Add a dedupe key on `notification.id`.' },
    { title: 'Cold start regression: 3.4s to first paint', body: 'Sentry shows p75 cold start increased after the navigation rewrite. Profile the release build and find the blocking work.' },
    { title: 'Biometric unlock should be opt-in per device', body: 'Currently enabling Face ID applies to the account. Scope it to the device keychain entry.' },
    { title: 'Pull-to-refresh flickers on the issue list', body: 'The spinner jumps when the list has fewer than 10 items.' },
    { title: 'Deep links to issues open the wrong workspace', body: 'If the user has multiple workspaces, `/issues/ORB-12` resolves against the last active one instead of the issue owner.' },
    { title: 'Add a share sheet for issue links', body: 'Sharing should copy a canonical URL and offer Slack/email targets.' },
    { title: 'Dark mode contrast fails on the priority badges', body: 'Urgent priority is 2.9:1 against the card background. Needs to be at least 4.5:1.' },
    { title: 'Crash on rotate while the comment composer is open', body: 'Reported 41 times in the last release. Stack trace points at the mention autocomplete popover.' },
    { title: 'Reduce the app bundle below 30MB', body: 'The release APK is 38MB. Audit unused font weights and the bundled emoji set.' },
    { title: 'Sync conflicts overwrite newer server data', body: 'Last-write-wins is applied by client clock. Use the server `updatedAt` and surface a conflict state.' },
  ],
  'Analytics Engine': [
    { title: 'Event ingestion drops batches over 500KB', body: 'The collector rejects large batches with a silent 413. Chunk client-side and log a warning.' },
    { title: 'Add a 30-day cohort retention view', body: 'Group users by first-seen week and plot returning users per week for the first 30 days.' },
    { title: 'Warehouse sync takes 40 minutes for large workspaces', body: 'Switch from row-by-row upserts to a staging table plus a merge.' },
    { title: 'Metric definitions drift between API and dashboard', body: 'One place computes `active users` from events, the other from sessions. Extract a shared definition.' },
    { title: 'Timezone bugs in the daily rollup', body: 'Days are bucketed in UTC but shown in workspace time. Customers in UTC+13 see the previous day.' },
    { title: 'Add percentile aggregations to the query API', body: 'Support p50/p90/p99 for duration metrics with a bounded cardinality guard.' },
    { title: 'Reporting queries can exceed the statement timeout', body: 'Add a query budget, cancellation on timeout and a clear error the UI can show.' },
    { title: 'Improve funnel step attribution', body: 'Steps completed out of order are attributed to the first occurrence. Use the first *valid* sequence instead.' },
    { title: 'Backfill missing `project.viewed` events', body: 'The tracker missed events for 6 hours during the deploy on the 14th.' },
    { title: 'Expose a CSV download for any saved report', body: 'Streaming download so large reports do not buffer in memory.' },
  ],
  'Security Hardening': [
    { title: 'Enforce 2FA for workspace owners', body: 'Owners must have a second factor. Add a grace period with an in-app warning banner.' },
    { title: 'Rotate webhook signing secrets automatically', body: 'Every 90 days with a 7-day overlap where both secrets verify.' },
    { title: 'Audit log export for compliance', body: 'Signed, tamper-evident export of the activity log for a date range.' },
    { title: 'Session tokens are not bound to a user agent', body: 'Bind the session to a coarse fingerprint and invalidate on mismatch.' },
    { title: 'Pen test: SSRF in the webhook tester', body: 'The tester follows redirects to internal addresses. Block private ranges and disable redirects.' },
    { title: 'Add rate limiting to password reset', body: 'Currently unlimited. Cap per email and per IP.' },
    { title: 'Secrets in CI logs', body: 'Mask environment variables in the deploy job output.' },
    { title: 'Document the incident response runbook', body: 'Include severity levels, paging rotation and the post-mortem template.' },
  ],
  'Public API': [
    { title: 'Publish OpenAPI schema for v1', body: 'Generate the schema from the route definitions and publish it at `/api/v1/openapi.json`.' },
    { title: 'Webhook retries should use a jittered schedule', body: 'Thundering herd when a customer endpoint recovers.' },
    { title: 'Add pagination cursors to the issues endpoint', body: 'Offset pagination drifts while new issues are created. Move to opaque cursors.' },
    { title: 'Deprecate the `status_id` field', body: 'Announce the deprecation, add a sunset header and keep it working for 90 days.' },
    { title: 'Document rate limit headers', body: 'Expose `X-RateLimit-Remaining` and `Retry-After` in the docs and the SDK.' },
    { title: 'SDK: typed errors', body: 'Wrap HTTP errors in typed classes so callers can branch on `code`.' },
  ],
  'Aurora Marketing Site': [
    { title: 'Case study pages need a table of contents', body: 'Long case studies benefit from a sticky ToC generated from the headings.' },
    { title: 'Hero image is 4MB on mobile', body: 'Serve responsive AVIF/WebP variants and set explicit dimensions to avoid layout shift.' },
    { title: 'Cookie banner blocks the primary CTA', body: 'On short viewports the banner overlaps the signup button.' },
    { title: 'Lighthouse accessibility score is 82', body: 'Fix colour contrast on the secondary buttons and the missing form labels.' },
    { title: 'Add structured data for articles', body: 'JSON-LD `Article` + `Organization` so search results show rich snippets.' },
    { title: 'Content editors cannot preview unpublished pages', body: 'Draft preview links should bypass the CDN cache with a signed token.' },
    { title: 'Newsletter form drops submissions on slow networks', body: 'The form submits before hydration completes. Handle the pre-hydration submit.' },
    { title: 'Footer links point to staging', body: 'Two legal links still reference the staging domain.' },
    { title: 'Translate the pricing page to German', body: 'Copy is ready in the CMS; needs a layout pass for longer strings.' },
  ],
  'Design System 2.0': [
    { title: 'Tokens: split semantic from primitive colours', body: 'Consumers should reference `surface.default`, never `gray.900`.' },
    { title: 'Add a focus-visible ring primitive', body: 'One implementation used by every interactive component.' },
    { title: 'Document the motion guidelines', body: 'Durations, easing curves and when not to animate.' },
    { title: 'Table component: sticky header + column resizing', body: 'Needed by three client builds.' },
    { title: 'Storybook a11y addon reports contrast failures', body: 'Fix the badge and tooltip stories.' },
    { title: 'Ship a Figma-to-code token sync script', body: 'One command to regenerate tokens from the Figma variables export.' },
    { title: 'Remove deprecated `Button.legacy`', body: 'No remaining usages in client repos after the last migration.' },
    { title: 'Add visual regression tests', body: 'Playwright screenshots per component story on CI.' },
  ],
  'Legacy Migration': [
    { title: 'Map old CMS page types to the new schema', body: '22 page types, 6 of which have no direct equivalent.' },
    { title: 'Redirect map for 480 legacy URLs', body: 'Generate from the sitemap and verify no chains longer than one hop.' },
    { title: 'Assets still referenced from the old CDN', body: 'Copy remaining assets and rewrite the references before shutdown.' },
    { title: 'Migrate inline HTML blocks to rich text', body: 'Preserve headings, lists and links; drop presentational markup.' },
    { title: 'Verify SEO metadata parity', body: 'Compare titles, descriptions and canonical URLs for the top 100 pages.' },
    { title: 'Decommission the old hosting plan', body: 'Confirm zero traffic for 14 days before cancelling.' },
  ],
};

const COMMENT_BODIES = [
  'Reproduced on staging — the retry fires before the transaction commits.',
  'I think we should split this into two issues: the data fix and the UI change.',
  'Nice catch. I added a regression test so this cannot come back.',
  'Blocked on the design decision for the empty state. @ana can you take a look?',
  'Deployed to staging, will watch the error rate for an hour before merging.',
  'Updated the acceptance criteria to include the cancellation path.',
  'This needs a database index — the query scans the whole table right now.',
  'Agreed, let us keep the scope tight and ship the smallest useful slice.',
  'I left inline comments on the PR about the naming, everything else looks good.',
  'The flaky test was a timing issue. Added an explicit wait for the network idle state.',
  'Can we add telemetry here? It would help confirm the fix in production.',
  'Reverted the earlier change — it caused a regression in the mobile client.',
  'Good point about accessibility. I will add the aria-live region.',
  'Pushed a fix for the rounding bug, please re-review when you have a moment.',
  '@carlos this is related to the ledger drift you were investigating last week.',
  'Ran the load test again with 10k concurrent users — p99 stayed under 300ms.',
];

const BUG_PREFIXES = ['Fix', 'Regression:', 'Crash when', 'Memory leak in', 'Flaky test:'];
const TECH_DEBT_BODIES = [
  'Extract the duplicated logic into a shared module and add unit tests.',
  'The current implementation relies on implicit ordering; make it explicit.',
  'Add types, remove the `any` casts and enable the strict lint rule.',
  'This has been patched three times. Time to rewrite it properly.',
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ROLE_POOL: { role: WorkspaceRole; weight: number }[] = [
  { role: 'member', weight: 0.72 },
  { role: 'admin', weight: 0.16 },
  { role: 'viewer', weight: 0.12 },
];

function randomRole(): WorkspaceRole {
  const roll = rand();
  let acc = 0;
  for (const entry of ROLE_POOL) {
    acc += entry.weight;
    if (roll <= acc) return entry.role;
  }
  return 'member';
}

/** Skewed status distribution so the board has realistic depth per column. */
function randomStatus(projectStatus: ProjectStatus, ageDays: number): IssueStatus {
  const roll = rand();
  if (projectStatus === 'completed') {
    if (roll < 0.86) return 'done';
    if (roll < 0.92) return 'cancelled';
    return 'in_review';
  }
  if (ageDays < 3) {
    if (roll < 0.4) return 'todo';
    if (roll < 0.62) return 'in_progress';
    if (roll < 0.72) return 'backlog';
    if (roll < 0.82) return 'in_review';
    if (roll < 0.94) return 'done';
    return 'cancelled';
  }
  if (roll < 0.14) return 'backlog';
  if (roll < 0.32) return 'todo';
  if (roll < 0.52) return 'in_progress';
  if (roll < 0.6) return 'in_review';
  if (roll < 0.92) return 'done';
  return 'cancelled';
}

function randomPriority(labelNames: string[]): IssuePriority {
  if (labelNames.includes('urgent')) return pick(['urgent', 'high'] as const);
  if (labelNames.includes('bug')) return pick(['high', 'medium', 'urgent', 'low'] as const);
  const roll = rand();
  if (roll < 0.05) return 'urgent';
  if (roll < 0.24) return 'high';
  if (roll < 0.58) return 'medium';
  if (roll < 0.84) return 'low';
  return 'none';
}

export {
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
  randomRole,
  randomStatus,
  BUG_PREFIXES,
};
export type { LabelBlueprint, ProjectBlueprint, SeedUser, WorkspaceBlueprint };
