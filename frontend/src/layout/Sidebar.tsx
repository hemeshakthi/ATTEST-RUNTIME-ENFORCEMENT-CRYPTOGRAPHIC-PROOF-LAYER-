import { NavLink, useLocation } from 'react-router-dom';

const navItems = [
  { path: '/',           label: 'Runtime Overview', icon: ActivityIcon,   hasStatus: true },
  { path: '/contracts',  label: 'Contracts',        icon: FileTextIcon,   hasStatus: false },
  { path: '/execution',  label: 'Execution Monitor',icon: MonitorIcon,    hasStatus: true },
  { path: '/receipts',   label: 'Receipts & Proofs',icon: ShieldIcon,     hasStatus: false },
  { path: '/delegation', label: 'Delegation Graph', icon: GitBranchIcon,  hasStatus: false },
  { path: '/violations', label: 'Violations',       icon: AlertIcon,      hasStatus: true },
  { path: '/agents',     label: 'Agents',           icon: UsersIcon,      hasStatus: false },
  { path: '/settings',   label: 'Settings',         icon: SettingsIcon,   hasStatus: false },
];

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  return (
    <aside
      className={`fixed top-0 left-0 h-screen bg-[var(--color-surface)] border-r border-[var(--color-border)] z-40 flex flex-col transition-all duration-200 ${
        collapsed ? 'w-[var(--sidebar-collapsed-width)]' : 'w-[var(--sidebar-width)]'
      }`}
    >
      {/* Logo / Brand */}
      <div className="h-[var(--topbar-height)] flex items-center px-4 border-b border-[var(--color-border)] shrink-0">
        <div className="flex items-center gap-2 overflow-hidden">
          <div className="w-6 h-6 bg-[var(--color-accent)] rounded flex items-center justify-center shrink-0">
            <span className="text-white text-xs font-bold">A</span>
          </div>
          {!collapsed && (
            <span className="text-sm font-semibold text-[var(--color-primary)] whitespace-nowrap">
              Attest
            </span>
          )}
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-2 overflow-y-auto">
        {navItems.map(item => (
          <SidebarLink key={item.path} item={item} collapsed={collapsed} />
        ))}
      </nav>

      {/* Collapse Toggle */}
      <div className="border-t border-[var(--color-border)] p-2 shrink-0">
        <button
          onClick={onToggle}
          className="w-full flex items-center justify-center p-2 rounded-md text-[var(--color-secondary)] hover:bg-slate-50 hover:text-[var(--color-primary)] transition-colors cursor-pointer"
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <svg className={`w-4 h-4 transition-transform ${collapsed ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
          </svg>
        </button>
      </div>
    </aside>
  );
}

function SidebarLink({ item, collapsed }: { item: typeof navItems[0]; collapsed: boolean }) {
  const location = useLocation();
  const isActive = item.path === '/' ? location.pathname === '/' : location.pathname.startsWith(item.path);
  const Icon = item.icon;

  return (
    <NavLink
      to={item.path}
      className={`flex items-center gap-3 mx-2 px-2.5 py-1.5 rounded-md text-sm transition-colors duration-100 group ${
        isActive
          ? 'bg-slate-100 text-[var(--color-primary)] font-medium'
          : 'text-[var(--color-secondary)] hover:bg-slate-50 hover:text-[var(--color-primary)]'
      }`}
      title={collapsed ? item.label : undefined}
    >
      <span className="shrink-0 w-4 h-4 flex items-center justify-center">
        <Icon />
      </span>
      {!collapsed && (
        <>
          <span className="flex-1 truncate">{item.label}</span>
          {item.hasStatus && (
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-allowed)] shrink-0" />
          )}
        </>
      )}
    </NavLink>
  );
}

/* ── Icons (inline SVG, 16×16) ───────────────────────────────────── */

function ActivityIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  );
}

function FileTextIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10 9 9 9 8 9" />
    </svg>
  );
}

function MonitorIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
      <line x1="8" y1="21" x2="16" y2="21" />
      <line x1="12" y1="17" x2="12" y2="21" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

function GitBranchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="6" y1="3" x2="6" y2="15" />
      <circle cx="18" cy="6" r="3" />
      <circle cx="6" cy="18" r="3" />
      <path d="M18 9a9 9 0 01-9 9" />
    </svg>
  );
}

function AlertIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

function UsersIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 00-3-3.87" />
      <path d="M16 3.13a4 4 0 010 7.75" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
    </svg>
  );
}
