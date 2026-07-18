import { useState } from 'react';

interface TopbarProps {
  sidebarCollapsed: boolean;
  onOpenCommandPalette: () => void;
}

type Environment = 'production' | 'staging' | 'simulation';

export function Topbar({ sidebarCollapsed, onOpenCommandPalette }: TopbarProps) {
  const [env, setEnv] = useState<Environment>('production');

  return (
    <header
      className={`fixed top-0 right-0 h-[var(--topbar-height)] bg-[var(--color-surface)] border-b border-[var(--color-border)] z-30 flex items-center justify-between px-4 transition-all duration-200`}
      style={{
        left: sidebarCollapsed
          ? 'var(--sidebar-collapsed-width)'
          : 'var(--sidebar-width)',
      }}
    >
      {/* Left: Environment Switcher */}
      <div className="flex items-center gap-3">
        <div className="flex items-center bg-slate-50 border border-[var(--color-border)] rounded-md overflow-hidden">
          {(['production', 'staging', 'simulation'] as Environment[]).map(e => (
            <button
              key={e}
              onClick={() => setEnv(e)}
              className={`px-2.5 py-1 text-xs font-medium capitalize transition-colors cursor-pointer ${
                env === e
                  ? 'bg-white text-[var(--color-primary)] border-x border-[var(--color-border)] shadow-sm'
                  : 'text-[var(--color-secondary)] hover:text-[var(--color-primary)]'
              }`}
            >
              {e}
            </button>
          ))}
        </div>
      </div>

      {/* Center: Command Palette Trigger */}
      <button
        onClick={onOpenCommandPalette}
        className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 border border-[var(--color-border)] rounded-md text-sm text-[var(--color-secondary)] hover:border-[var(--color-border-strong)] hover:text-[var(--color-primary)] transition-colors cursor-pointer"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <span>Search...</span>
        <kbd className="hidden sm:inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-mono bg-white border border-[var(--color-border)] rounded text-[var(--color-secondary)]">
          ⌘K
        </kbd>
      </button>

      {/* Right: Status + Org */}
      <div className="flex items-center gap-4">
        {/* Runtime Health */}
        <div className="flex items-center gap-1.5 text-xs text-[var(--color-secondary)]">
          <span className="w-2 h-2 rounded-full bg-[var(--color-allowed)]" />
          <span>Healthy</span>
        </div>

        {/* Org */}
        <div className="flex items-center gap-2 pl-3 border-l border-[var(--color-border)]">
          <div className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center text-xs font-medium text-slate-600">
            O
          </div>
          <span className="text-xs font-medium text-[var(--color-primary)] hidden md:block">
            Org-1
          </span>
        </div>
      </div>
    </header>
  );
}
