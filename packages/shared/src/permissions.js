/**
 * Central permission map. This is the *only* place authorization rules live and
 * it is imported by both the API (hard enforcement) and the web client (so the
 * UI can disable actions that would be rejected anyway).
 *
 * The client is never trusted: every mutating route re-checks with `can()`.
 */
export const PERMISSIONS = [
    'workspace:read',
    'workspace:update',
    'workspace:delete',
    'member:invite',
    'member:update_role',
    'member:remove',
    'project:create',
    'project:update',
    'project:delete',
    'issue:create',
    'issue:update',
    'issue:delete',
    'issue:comment',
    'label:manage',
    'cycle:manage',
    'import:run',
    'export:run',
];
/** Higher number = more authority. */
export const ROLE_RANK = {
    viewer: 1,
    member: 2,
    admin: 3,
    owner: 4,
};
const VIEWER = ['workspace:read', 'export:run', 'issue:comment'];
const MEMBER = [
    ...VIEWER,
    'issue:create',
    'issue:update',
    'issue:delete',
    'issue:comment',
    'label:manage',
    'import:run',
];
const ADMIN = [
    ...MEMBER,
    'workspace:update',
    'member:invite',
    'member:update_role',
    'member:remove',
    'project:create',
    'project:update',
    'project:delete',
    'cycle:manage',
];
const OWNER = [...ADMIN, 'workspace:delete'];
export const ROLE_PERMISSIONS = {
    viewer: VIEWER,
    member: MEMBER,
    admin: ADMIN,
    owner: OWNER,
};
export function can(role, permission) {
    if (!role)
        return false;
    return ROLE_PERMISSIONS[role].includes(permission);
}
export function canAny(role, permissions) {
    return permissions.some((p) => can(role, p));
}
/** True when `actor` may act on a target holding `target` (e.g. owner editing an admin). */
export function outranks(actor, target) {
    return ROLE_RANK[actor] > ROLE_RANK[target];
}
/** Only members and above may be assigned issues. */
export function canBeAssigned(role) {
    return role !== 'viewer';
}
/** Statuses a viewer is allowed to see (all of them) — kept explicit for clarity. */
export function visibleStatuses(_role) {
    return ['backlog', 'todo', 'in_progress', 'in_review', 'done', 'cancelled'];
}
/** Priority ordering helper shared by list sorting on client and server. */
export function comparePriority(a, b, weights) {
    return weights[b] - weights[a];
}
//# sourceMappingURL=permissions.js.map