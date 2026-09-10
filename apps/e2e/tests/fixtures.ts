/** Seeded demo accounts (see apps/server/prisma/seed.ts). */
export const DEMO_PASSWORD = 'Orbit1234';

export const DEMO_USERS = {
  owner: { email: 'javi@orbit.dev', name: 'Javi Rodriguez', role: 'owner' },
  admin: { email: 'maria@orbit.dev', name: 'Maria Lopez', role: 'admin' },
  member: { email: 'carlos@orbit.dev', name: 'Carlos Mendez', role: 'member' },
  viewer: { email: 'nina@orbit.dev', name: 'Nina Petrova', role: 'viewer' },
  otherMember: { email: 'lucia@orbit.dev', name: 'Lucia Navarro', role: 'member' },
} as const;

export const WORKSPACE_NAME = 'Orbit Labs';

/** Generates a unique suffix so repeated runs never collide on names. */
export function unique(prefix: string): string {
  return `${prefix} ${Date.now().toString(36).slice(-5)}${Math.random().toString(36).slice(2, 5)}`;
}
