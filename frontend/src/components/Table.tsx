import React, { useState, useMemo } from 'react';

export interface Column<T> {
  key: string;
  header: string;
  render?: (item: T) => React.ReactNode;
  sortable?: boolean;
  className?: string;
}

interface TableProps<T> {
  columns: Column<T>[];
  data: T[];
  onRowClick?: (item: T) => void;
  emptyMessage?: string;
  loading?: boolean;
}

export function Table<T extends Record<string, any>>({ columns, data, onRowClick, emptyMessage = 'No data', loading }: TableProps<T>) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const sorted = useMemo(() => {
    if (!sortKey) return data;
    return [...data].sort((a, b) => {
      const aVal = a[sortKey];
      const bVal = b[sortKey];
      if (aVal < bVal) return sortDir === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
  }, [data, sortKey, sortDir]);

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  if (loading) {
    return (
      <div className="border border-[var(--color-border)] rounded-md overflow-hidden">
        <div className="divide-y divide-[var(--color-border)]">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="px-4 py-3 flex gap-4">
              {columns.map((_, j) => (
                <div key={j} className="h-4 bg-slate-100 rounded animate-pulse flex-1" />
              ))}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="border border-[var(--color-border)] rounded-md overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-slate-50 border-b border-[var(--color-border)]">
            {columns.map(col => (
              <th
                key={col.key}
                className={`px-4 py-2 text-left text-xs font-medium text-[var(--color-secondary)] uppercase tracking-wider ${col.sortable ? 'cursor-pointer hover:text-[var(--color-primary)] select-none' : ''} ${col.className || ''}`}
                onClick={() => col.sortable && handleSort(col.key)}
              >
                <span className="inline-flex items-center gap-1">
                  {col.header}
                  {col.sortable && sortKey === col.key && (
                    <span className="text-[10px]">{sortDir === 'asc' ? '▲' : '▼'}</span>
                  )}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--color-border)]">
          {sorted.length === 0 ? (
            <tr><td colSpan={columns.length} className="px-4 py-8 text-center text-[var(--color-secondary)] text-sm">{emptyMessage}</td></tr>
          ) : sorted.map((item, i) => (
            <tr
              key={i}
              className={`${onRowClick ? 'cursor-pointer hover:bg-slate-50' : ''} transition-colors duration-100`}
              onClick={() => onRowClick?.(item)}
            >
              {columns.map(col => (
                <td key={col.key} className={`px-4 py-2.5 text-sm ${col.className || ''}`}>
                  {col.render ? col.render(item) : String(item[col.key] ?? '')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
