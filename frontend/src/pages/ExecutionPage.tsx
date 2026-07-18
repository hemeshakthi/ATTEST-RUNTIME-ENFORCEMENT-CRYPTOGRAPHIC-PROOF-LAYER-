import { useState, useEffect, useRef, useMemo } from 'react';
import { Badge, Button } from '../components';
import { useApi } from '../lib/useApi';

/* ── Types ───────────────────────────────────────────────────────── */

interface EnforcementEntry {
  decision: 'ALLOWED' | 'BLOCKED';
  agentId: string;
  toolName: string;
  params?: Record<string, unknown>;
  reason?: string;
  ruleId?: string | null;
  timestamp: string;
  // Fields populated for expanded view
  contractId?: string;
  preStateHash?: string;
  postStateHash?: string;
}

interface AgentOption {
  id: string;
  name: string;
}

/* ── SSE Hook ────────────────────────────────────────────────────── */

function useLiveFeed(): { entries: EnforcementEntry[]; connected: boolean } {
  const [entries, setEntries] = useState<EnforcementEntry[]>([]);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const es = new EventSource('http://localhost:3001/api/runtime/live-feed');

    es.onopen = () => setConnected(true);

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'connected') {
          setConnected(true);
          return;
        }
        // It's an enforcement decision
        if (data.decision) {
          setEntries(prev => [data, ...prev]);
        }
      } catch { /* ignore malformed */ }
    };

    es.onerror = () => {
      setConnected(false);
    };

    return () => {
      es.close();
      setConnected(false);
    };
  }, []);

  return { entries, connected };
}

/* ── Polling Fallback Hook ───────────────────────────────────────── */

function usePollingFeed(sseConnected: boolean): EnforcementEntry[] {
  const [entries, setEntries] = useState<EnforcementEntry[]>([]);
  const seenRef = useRef(0);

  useEffect(() => {
    if (sseConnected) return;

    const poll = async () => {
      try {
        const res = await fetch('http://localhost:3001/api/runtime/status');
        const data = await res.json();
        const decisions: EnforcementEntry[] = data.recentDecisions ?? [];
        if (decisions.length > seenRef.current) {
          const newOnes = decisions.slice(seenRef.current);
          setEntries(prev => [...newOnes.reverse(), ...prev]);
          seenRef.current = decisions.length;
        }
      } catch { /* ignore */ }
    };

    poll();
    const interval = setInterval(poll, 1500);
    return () => clearInterval(interval);
  }, [sseConnected]);

  return entries;
}

/* ── Page Component ──────────────────────────────────────────────── */

export function ExecutionPage() {
  const { entries: sseEntries, connected } = useLiveFeed();
  const pollingEntries = usePollingFeed(connected);
  const agents = useApi<AgentOption[]>('/api/agents');

  // Merge: SSE takes priority, fallback to polling
  const allEntries = connected ? sseEntries : pollingEntries;

  // Filters
  const [filterAgent, setFilterAgent] = useState<string>('');
  const [filterDecision, setFilterDecision] = useState<string>('');
  const [search, setSearch] = useState('');
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

  // Build agent name map
  const agentMap = useMemo(() => {
    const map = new Map<string, string>();
    (agents.data ?? []).forEach(a => map.set(a.id, a.name));
    return map;
  }, [agents.data]);

  // Filter
  const filtered = useMemo(() => {
    return allEntries.filter(e => {
      if (filterAgent && e.agentId !== filterAgent) return false;
      if (filterDecision && e.decision !== filterDecision) return false;
      if (search) {
        const q = search.toLowerCase();
        const name = agentMap.get(e.agentId) ?? e.agentId;
        if (
          !e.toolName.toLowerCase().includes(q) &&
          !name.toLowerCase().includes(q) &&
          !(e.reason ?? '').toLowerCase().includes(q) &&
          !(e.ruleId ?? '').toLowerCase().includes(q)
        ) return false;
      }
      return true;
    });
  }, [allEntries, filterAgent, filterDecision, search, agentMap]);

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-lg font-semibold text-[var(--color-primary)]">Execution Monitor</h1>
          <p className="text-sm text-[var(--color-secondary)] mt-0.5">
            Live enforcement decisions — real-time audit trail
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center gap-1.5 text-xs ${connected ? 'text-[var(--color-allowed)]' : 'text-[var(--color-pending)]'}`}>
            <span className={`w-2 h-2 rounded-full ${connected ? 'bg-[var(--color-allowed)] animate-pulse' : 'bg-[var(--color-pending)]'}`} />
            {connected ? 'SSE Connected' : 'Polling'}
          </span>
          <span className="text-xs text-[var(--color-secondary)] border-l border-[var(--color-border)] pl-2">
            {allEntries.length} events
          </span>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="flex items-center gap-3 mb-3 pb-3 border-b border-[var(--color-border)]">
        {/* Search */}
        <div className="relative flex-1 max-w-xs">
          <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--color-secondary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search tool, agent, rule..."
            className="w-full pl-8 pr-3 py-1.5 text-sm border border-[var(--color-border)] rounded-md outline-none focus:border-[var(--color-accent)] bg-white"
          />
        </div>

        {/* Agent Filter */}
        <select
          value={filterAgent}
          onChange={e => setFilterAgent(e.target.value)}
          className="px-2.5 py-1.5 text-sm border border-[var(--color-border)] rounded-md outline-none bg-white text-[var(--color-primary)]"
        >
          <option value="">All Agents</option>
          {(agents.data ?? []).map(a => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>

        {/* Decision Filter */}
        <select
          value={filterDecision}
          onChange={e => setFilterDecision(e.target.value)}
          className="px-2.5 py-1.5 text-sm border border-[var(--color-border)] rounded-md outline-none bg-white text-[var(--color-primary)]"
        >
          <option value="">All Decisions</option>
          <option value="ALLOWED">Allowed</option>
          <option value="BLOCKED">Blocked</option>
        </select>

        {/* Clear */}
        {(filterAgent || filterDecision || search) && (
          <Button size="sm" variant="ghost" onClick={() => { setFilterAgent(''); setFilterDecision(''); setSearch(''); }}>
            Clear
          </Button>
        )}
      </div>

      {/* Ledger */}
      <div className="border border-[var(--color-border)] rounded-md bg-[var(--color-surface)] overflow-hidden font-mono text-[13px]">
        {/* Header row */}
        <div className="flex items-center gap-0 px-4 py-2 bg-slate-50 border-b border-[var(--color-border)] text-[10px] font-medium uppercase tracking-wider text-[var(--color-secondary)] font-sans">
          <span className="w-[140px] shrink-0">Timestamp</span>
          <span className="w-[140px] shrink-0">Agent</span>
          <span className="flex-1">Invocation</span>
          <span className="w-[90px] shrink-0 text-right">Decision</span>
        </div>

        {/* Entries */}
        {filtered.length === 0 ? (
          <div className="px-4 py-12 text-center text-sm text-[var(--color-secondary)] font-sans">
            {allEntries.length === 0
              ? 'Waiting for enforcement decisions...'
              : 'No entries match the current filters'
            }
          </div>
        ) : (
          <div className="divide-y divide-[var(--color-border)]">
            {filtered.map((entry, i) => (
              <LedgerRow
                key={`${entry.timestamp}-${i}`}
                entry={entry}
                agentName={agentMap.get(entry.agentId)}
                expanded={expandedIdx === i}
                onToggle={() => setExpandedIdx(expandedIdx === i ? null : i)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Ledger Row ──────────────────────────────────────────────────── */

function LedgerRow({
  entry,
  agentName,
  expanded,
  onToggle,
}: {
  entry: EnforcementEntry;
  agentName?: string;
  expanded: boolean;
  onToggle: () => void;
}) {
  const isBlocked = entry.decision === 'BLOCKED';

  // Format params for display
  const paramsStr = entry.params
    ? Object.entries(entry.params).map(([k, v]) => `${k}: ${formatValue(v)}`).join(', ')
    : '';

  return (
    <div>
      {/* Main Row */}
      <div
        className={`flex items-start gap-0 px-4 py-2 cursor-pointer hover:bg-slate-50 transition-colors duration-75 ${
          isBlocked ? 'bg-[var(--color-blocked-bg)]/40' : ''
        }`}
        onClick={onToggle}
      >
        {/* Timestamp */}
        <span className="w-[140px] shrink-0 text-[var(--color-secondary)] text-xs tabular-nums">
          {formatTimestamp(entry.timestamp)}
        </span>

        {/* Agent */}
        <span className="w-[140px] shrink-0 text-[var(--color-primary)] text-xs truncate" title={entry.agentId}>
          {agentName ?? entry.agentId.slice(0, 12) + '…'}
        </span>

        {/* Invocation + inline reason */}
        <div className="flex-1 min-w-0">
          <span className="text-[var(--color-primary)]">
            tools/call(<span className="text-[var(--color-accent)]">{entry.toolName}</span>
            {paramsStr && <span className="text-[var(--color-secondary)]">, {paramsStr}</span>})
          </span>
          {isBlocked && entry.reason && (
            <div className="text-xs text-[var(--color-blocked)] mt-0.5">
              {entry.ruleId && <span className="font-semibold">{entry.ruleId}</span>}
              {entry.ruleId && ' — '}
              {entry.reason}
            </div>
          )}
        </div>

        {/* Decision Badge */}
        <span className="w-[90px] shrink-0 text-right">
          <Badge variant={isBlocked ? 'blocked' : 'allowed'}>
            {entry.decision}
          </Badge>
        </span>
      </div>

      {/* Expanded Detail (inline, not modal) */}
      {expanded && (
        <div className="px-4 pb-3 pt-1 bg-slate-50 border-t border-dashed border-[var(--color-border)]">
          <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-xs font-sans">
            <DetailRow label="Decision" value={entry.decision} mono />
            <DetailRow label="Confidence" value="100% (deterministic)" />
            <DetailRow label="Tool" value={entry.toolName} mono />
            <DetailRow label="Rule Matched" value={entry.ruleId ?? 'N/A'} mono />
            <DetailRow label="Agent ID" value={entry.agentId} mono />
            <DetailRow label="Timestamp" value={new Date(entry.timestamp).toISOString()} mono />
            {entry.reason && (
              <div className="col-span-2">
                <span className="text-[var(--color-secondary)]">Reason: </span>
                <span className={`${isBlocked ? 'text-[var(--color-blocked)]' : 'text-[var(--color-primary)]'}`}>
                  {entry.reason}
                </span>
              </div>
            )}
            {entry.params && Object.keys(entry.params).length > 0 && (
              <div className="col-span-2">
                <span className="text-[var(--color-secondary)]">Parameters: </span>
                <pre className="inline font-mono text-[var(--color-primary)] bg-white px-2 py-1 rounded border border-[var(--color-border)] mt-0.5 block whitespace-pre-wrap">
                  {JSON.stringify(entry.params, null, 2)}
                </pre>
              </div>
            )}
            {entry.contractId && (
              <DetailRow label="Contract ID" value={entry.contractId} mono />
            )}
            {entry.preStateHash && (
              <DetailRow label="Pre-State Hash" value={entry.preStateHash} mono />
            )}
            {entry.postStateHash && (
              <DetailRow label="Post-State Hash" value={entry.postStateHash} mono />
            )}
            <div className="col-span-2 pt-1 border-t border-[var(--color-border)] text-[var(--color-secondary)]">
              Evidence chain: enforcement evaluated deterministically against the compiled state machine.
              All decisions are cryptographically receipted and hash-chained for audit.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Small helpers ───────────────────────────────────────────────── */

function DetailRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-[var(--color-secondary)] shrink-0">{label}:</span>
      <span className={`text-[var(--color-primary)] truncate ${mono ? 'font-mono' : ''}`} title={value}>
        {value}
      </span>
    </div>
  );
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }) + '.' + String(d.getMilliseconds()).padStart(3, '0');
}

function formatValue(v: unknown): string {
  if (typeof v === 'number') {
    return v >= 1000 ? `₹${v.toLocaleString()}` : String(v);
  }
  return String(v);
}
