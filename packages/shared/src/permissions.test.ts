import { describe, expect, it } from 'vitest';
import { PERMISSIONS, ROLE_PERMISSIONS, can, canAny, outranks } from './permissions';
import { WORKSPACE_ROLES } from './constants';

describe('permission matrix', () => {
  it('viewers can read, export and comment but cannot change issues', () => {
    expect(can('viewer', 'workspace:read')).toBe(true);
    expect(can('viewer', 'issue:comment')).toBe(true);
    expect(can('viewer', 'export:run')).toBe(true);
    expect(can('viewer', 'issue:update')).toBe(false);
    expect(can('viewer', 'issue:create')).toBe(false);
    expect(can('viewer', 'issue:delete')).toBe(false);
    expect(can('viewer', 'member:invite')).toBe(false);
    expect(can('viewer', 'workspace:delete')).toBe(false);
  });

  it('members can work on issues but not manage the workspace', () => {
    expect(can('member', 'issue:create')).toBe(true);
    expect(can('member', 'issue:update')).toBe(true);
    expect(can('member', 'issue:delete')).toBe(true);
    expect(can('member', 'issue:comment')).toBe(true);
    expect(can('member', 'member:invite')).toBe(false);
    expect(can('member', 'project:create')).toBe(false);
    expect(can('member', 'workspace:update')).toBe(false);
    expect(can('member', 'workspace:delete')).toBe(false);
  });

  it('admins can manage members and projects', () => {
    expect(can('admin', 'member:invite')).toBe(true);
    expect(can('admin', 'member:update_role')).toBe(true);
    expect(can('admin', 'member:remove')).toBe(true);
    expect(can('admin', 'project:create')).toBe(true);
    expect(can('admin', 'project:delete')).toBe(true);
    expect(can('admin', 'workspace:update')).toBe(true);
    expect(can('admin', 'workspace:delete')).toBe(false);
  });

  it('only owners can delete the workspace', () => {
    expect(can('owner', 'workspace:delete')).toBe(true);
    expect(can('owner', 'member:invite')).toBe(true);
    expect(can('owner', 'issue:update')).toBe(true);
  });

  it('denies unknown roles and null', () => {
    expect(can(null, 'workspace:read')).toBe(false);
    expect(can(undefined, 'issue:update')).toBe(false);
  });

  it('role permissions are cumulative and use only known permissions', () => {
    for (const role of WORKSPACE_ROLES) {
      for (const permission of ROLE_PERMISSIONS[role]) {
        expect(PERMISSIONS).toContain(permission);
      }
    }
    const viewer = new Set(ROLE_PERMISSIONS.viewer);
    const member = new Set(ROLE_PERMISSIONS.member);
    const admin = new Set(ROLE_PERMISSIONS.admin);
    const owner = new Set(ROLE_PERMISSIONS.owner);
    for (const p of viewer) expect(member.has(p)).toBe(true);
    for (const p of member) expect(admin.has(p)).toBe(true);
    for (const p of admin) expect(owner.has(p)).toBe(true);
    expect(owner.size).toBeGreaterThan(admin.size);
  });

  it('canAny is true when one permission matches', () => {
    expect(canAny('member', ['workspace:delete', 'issue:update'])).toBe(true);
    expect(canAny('viewer', ['workspace:delete', 'issue:update'])).toBe(false);
  });

  it('outranks compares authority', () => {
    expect(outranks('owner', 'admin')).toBe(true);
    expect(outranks('admin', 'admin')).toBe(false);
    expect(outranks('viewer', 'member')).toBe(false);
  });
});
