import { useState, useMemo } from 'react';
import { useApi } from '../lib/useApi';
import { post } from '../lib/api';
import { Badge, Button, Drawer, Table, useToast } from '../components';
import type { Column } from '../components';

/* ── Types ───────────────────────────────────────────────────────── */

interface Violation {
  id: string;
  description: string;
  status: 'open' | 'dismissed' | 'escalated';
  createdAt: string;
  receiptId: string;
  agentId: string;
  contractId: string;
  agent: { id: string; name: string; status: string };
  contract: { id: string; name: string };
  receipt: { id: string; toolName: string; params: string; decision: string; reasonText: string | null; reasonRuleId: string | null };
}

/* ── Page ────────────────────────────────────────────────────────── */

export function ViolationsPage() {
  const { data, loading, refetch } = useApi<Violation[]>('/api/violations');
  const { addToast } = useToast();
  
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('open');
  const [selectedViolationId, setSelectedViolationId] = useState<string | null>(null);

  const violations = data ?? [];

  const filtered = useMemo(() => {
    return violations.filter(v => {
      if (filterStatus && v.status !== filterStatus) return false;
      if (search) {
        const q = search.toLowerCase();
        if (
          !v.description.toLowerCase().includes(q) &&
          !v.agent.name.toLowerCase().includes(q) &&
          !v.contract.name.toLowerCase().includes(q)
        ) return false;
      }
      return true;
    });
  }, [violations, filterStatus, search]);

  const selectedViolation = violations.find(v => v.id === selectedViolationId) ?? null;

  const handleAction = async (action: 'suspend' | 'dismiss') => {
    if (!selectedViolation) return;
    try {
      if (action === 'suspend') {
        await post(`/api/violations/${selectedViolation.id}/suspend-agent`, {});
        addToast('success', `Agent ${selectedViolation.agent.name} suspended.`);
      } else {
        await post(`/api/violations/${selectedViolation.id}/dismiss`, {});
        addToast('info', 'Violation dismissed.');
      }
      setSelectedViolationId(null);
      refetch();
    } catch (err: any) {
      addToast('error', err.message);
    }
  };

  const columns: Column<Violation>[] = [
    {
      key: 'description',
      header: 'Violation',
      render: (v) => <span className="font-medium text-[var(--color-primary)]">{v.description}</span>,
    },
    {
      key: 'agentId',
      header: 'Agent',
      render: (v) => <span>{v.agent.name}</span>,
    },
    {
      key: 'contractId',
      header: 'Contract',
      render: (v) => <span>{v.contract.name}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (v) => {
        let variant: 'blocked' | 'neutral' | 'pending' = 'neutral';
        if (v.status === 'open') variant = 'blocked';
        if (v.status === 'escalated') variant = 'pending';
        return <Badge variant={variant}>{v.status.toUpperCase()}</Badge>;
      },
    },
    {
      key: 'createdAt',
      header: 'Time',
      sortable: true,
      render: (v) => <span className="text-xs text-[var(--color-secondary)]">{new Date(v.createdAt).toLocaleString()}</span>,
    },
  ];

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-lg font-semibold text-[var(--color-primary)]">Violations &amp; Investigations</h1>
        <p className="text-sm text-[var(--color-secondary)] mt-0.5">
          Review blocked or anomalous execution attempts
        </p>
      </div>

      <div className="flex items-center gap-3 mb-3">
        <div className="relative flex-1 max-w-xs">
          <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--color-secondary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search description, agent..."
            className="w-full pl-8 pr-3 py-1.5 text-sm border border-[var(--color-border)] rounded-md outline-none focus:border-[var(--color-accent)] bg-white"
          />
        </div>
        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
          className="px-2.5 py-1.5 text-sm border border-[var(--color-border)] rounded-md outline-none bg-white"
        >
          <option value="">All Statuses</option>
          <option value="open">Open</option>
          <option value="dismissed">Dismissed</option>
          <option value="escalated">Escalated</option>
        </select>
        <span className="text-xs text-[var(--color-secondary)]">{filtered.length} violations</span>
      </div>

      <Table
        columns={columns}
        data={filtered}
        loading={loading}
        onRowClick={(v) => setSelectedViolationId(v.id)}
        emptyMessage="No violations to investigate."
      />

      <Drawer
        open={!!selectedViolation}
        onClose={() => setSelectedViolationId(null)}
        title="Investigation"
        width="w-[500px]"
      >
        {selectedViolation && (
          <div className="flex flex-col h-full">
            <div className="flex-1 space-y-6">
              
              <div>
                <div className="flex justify-between items-start mb-2">
                  <h3 className="text-sm font-semibold text-[var(--color-primary)]">{selectedViolation.description}</h3>
                  <Badge variant={selectedViolation.status === 'open' ? 'blocked' : 'neutral'}>
                    {selectedViolation.status}
                  </Badge>
                </div>
                <div className="text-xs text-[var(--color-secondary)]">
                  Created: {new Date(selectedViolation.createdAt).toLocaleString()}
                </div>
              </div>

              <div className="space-y-3 p-4 bg-slate-50 border border-[var(--color-border)] rounded-md">
                <h4 className="text-xs font-semibold text-[var(--color-primary)] uppercase tracking-wider mb-2">Attempt Details</h4>
                <DetailRow label="Agent" value={selectedViolation.agent.name} />
                <DetailRow label="Contract" value={selectedViolation.contract.name} />
                <DetailRow label="Tool Invoked" value={selectedViolation.receipt.toolName} mono />
                <div>
                  <div className="text-xs font-medium text-[var(--color-secondary)] mb-1">Parameters</div>
                  <pre className="text-xs font-mono bg-white border border-[var(--color-border)] rounded-md p-2 whitespace-pre-wrap max-h-32 overflow-y-auto">
                    {formatParams(selectedViolation.receipt.params)}
                  </pre>
                </div>
              </div>

              <div className="space-y-3 p-4 border border-[var(--color-blocked)]/30 bg-[var(--color-blocked-bg)]/30 rounded-md">
                <h4 className="text-xs font-semibold text-[var(--color-blocked)] uppercase tracking-wider mb-2">Enforcement Block</h4>
                <DetailRow label="Rule Matched" value={selectedViolation.receipt.reasonRuleId ?? 'N/A'} mono />
                <DetailRow label="Reason" value={selectedViolation.receipt.reasonText ?? 'N/A'} />
              </div>

              <div>
                <h4 className="text-xs font-semibold text-[var(--color-primary)] uppercase tracking-wider mb-2">Agent Status</h4>
                <DetailRow label="Name" value={selectedViolation.agent.name} />
                <DetailRow label="ID" value={selectedViolation.agent.id} mono />
                <DetailRow label="Status" value={selectedViolation.agent.status} />
              </div>

            </div>

            {/* Actions */}
            {selectedViolation.status === 'open' && (
              <div className="shrink-0 pt-4 border-t border-[var(--color-border)] flex gap-3 mt-6">
                <Button variant="destructive" onClick={() => handleAction('suspend')} className="flex-1">
                  Suspend Agent
                </Button>
                <Button variant="secondary" onClick={() => handleAction('dismiss')} className="flex-1">
                  Dismiss as expected
                </Button>
              </div>
            )}
          </div>
        )}
      </Drawer>
    </div>
  );
}

function DetailRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex gap-2 text-sm">
      <span className="w-24 shrink-0 text-[var(--color-secondary)]">{label}</span>
      <span className={`text-[var(--color-primary)] ${mono ? 'font-mono text-xs' : ''}`}>{value}</span>
    </div>
  );
}

function formatParams(params: string) {
  try {
    return JSON.stringify(JSON.parse(params), null, 2);
  } catch {
    return params;
  }
}
