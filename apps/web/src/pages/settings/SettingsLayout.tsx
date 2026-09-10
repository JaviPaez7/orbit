import { NavLink, Outlet } from 'react-router-dom';
import { Bell, Settings, Tag, User, Users } from 'lucide-react';
import { usePermissions } from '../../context/AuthContext';
import { cn } from '../../lib/utils';

const SECTIONS = [
  { to: '/settings/profile', label: 'Profile', icon: User, permission: null },
  { to: '/settings/notifications', label: 'Notifications', icon: Bell, permission: null },
  { to: '/settings/workspace', label: 'Workspace', icon: Settings, permission: 'canManageWorkspace' },
  { to: '/settings/members', label: 'Members', icon: Users, permission: 'canManageMembers' },
  { to: '/settings/labels', label: 'Labels', icon: Tag, permission: 'canManageLabels' },
] as const;

/** Settings shell with a secondary nav rail; sections gate on permissions. */
export default function SettingsLayout() {
  const permissions = usePermissions();

  return (
    <div className="flex h-full flex-col lg:flex-row">
      <nav
        className="shrink-0 border-b border-line p-3 lg:w-56 lg:border-b-0 lg:border-r"
        aria-label="Settings sections"
      >
        <h1 className="mb-3 px-2 text-sm font-semibold text-fg">Settings</h1>
        <ul className="flex gap-1 overflow-x-auto lg:flex-col lg:overflow-visible">
          {SECTIONS.filter(
            (section) => section.permission === null || permissions[section.permission],
          ).map((section) => (
            <li key={section.to}>
              <NavLink
                to={section.to}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-2 whitespace-nowrap rounded-md px-2 py-1.5 text-sm transition-colors',
                    isActive ? 'bg-selected text-fg' : 'text-muted hover:bg-hover hover:text-fg',
                  )
                }
              >
                <section.icon className="h-4 w-4 shrink-0" />
                {section.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <div className="flex-1 overflow-y-auto p-4 lg:p-6">
        <div className="mx-auto max-w-3xl">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
