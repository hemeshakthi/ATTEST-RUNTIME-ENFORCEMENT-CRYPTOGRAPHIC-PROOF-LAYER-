import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
}

interface CommandItem {
  id: string;
  label: string;
  category: string;
  path: string;
  icon?: string;
}

const staticCommands: CommandItem[] = [
  { id: 'nav-overview',    label: 'Runtime Overview',    category: 'Navigation', path: '/' },
  { id: 'nav-contracts',   label: 'Contracts',           category: 'Navigation', path: '/contracts' },
  { id: 'nav-execution',   label: 'Execution Monitor',   category: 'Navigation', path: '/execution' },
  { id: 'nav-receipts',    label: 'Receipts & Proofs',   category: 'Navigation', path: '/receipts' },
  { id: 'nav-delegation',  label: 'Delegation Graph',    category: 'Navigation', path: '/delegation' },
  { id: 'nav-violations',  label: 'Violations',          category: 'Navigation', path: '/violations' },
  { id: 'nav-agents',      label: 'Agents',              category: 'Navigation', path: '/agents' },
  { id: 'nav-settings',    label: 'Settings',            category: 'Navigation', path: '/settings' },
];

export function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  const filtered = useMemo(() => {
    if (!query.trim()) return staticCommands;
    const q = query.toLowerCase();
    return staticCommands.filter(
      c => c.label.toLowerCase().includes(q) || c.category.toLowerCase().includes(q),
    );
  }, [query]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(i => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && filtered[selectedIndex]) {
      navigate(filtered[selectedIndex].path);
      onClose();
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center pt-[20vh] bg-black/40"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-lg bg-white border border-[var(--color-border)] rounded-lg shadow-lg animate-fade-in overflow-hidden">
        {/* Search Input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--color-border)]">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-[var(--color-secondary)] shrink-0">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search contracts, agents, receipts..."
            className="flex-1 text-sm bg-transparent outline-none placeholder:text-[var(--color-secondary)]"
          />
          <kbd className="px-1.5 py-0.5 text-[10px] font-mono bg-slate-50 border border-[var(--color-border)] rounded text-[var(--color-secondary)]">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div className="max-h-72 overflow-y-auto py-1">
          {filtered.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-[var(--color-secondary)]">
              No results found
            </div>
          ) : (
            <>
              {groupByCategory(filtered).map(([category, items]) => (
                <div key={category}>
                  <div className="px-4 py-1.5 text-[10px] font-medium uppercase tracking-wider text-[var(--color-secondary)]">
                    {category}
                  </div>
                  {items.map(item => {
                    const globalIdx = filtered.indexOf(item);
                    return (
                      <button
                        key={item.id}
                        className={`w-full flex items-center gap-3 px-4 py-2 text-sm text-left transition-colors cursor-pointer ${
                          globalIdx === selectedIndex
                            ? 'bg-[var(--color-accent)] text-white'
                            : 'text-[var(--color-primary)] hover:bg-slate-50'
                        }`}
                        onClick={() => { navigate(item.path); onClose(); }}
                        onMouseEnter={() => setSelectedIndex(globalIdx)}
                      >
                        <span className="flex-1">{item.label}</span>
                        {globalIdx === selectedIndex && (
                          <span className="text-xs opacity-70">↵</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function groupByCategory(items: CommandItem[]): [string, CommandItem[]][] {
  const map = new Map<string, CommandItem[]>();
  for (const item of items) {
    const group = map.get(item.category) || [];
    group.push(item);
    map.set(item.category, group);
  }
  return [...map.entries()];
}
