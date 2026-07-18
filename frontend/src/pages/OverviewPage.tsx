import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useApi } from '../lib/useApi';
import { post } from '../lib/api';
import { Badge, Button, Card, Modal } from '../components';

/* ── API Response Types ──────────────────────────────────────────── */

interface RuntimeStatus {
  emergencyStopActive: boolean;
  zeroTrustEnabled: boolean;
  registeredAgents: number;
  agents: Array<{
    agentId: string;
    callCount: number;
    cumulativeFinancial: number;
    activatedAt: string | null;
  }>;
  auditLogSize: number;
  recentDecisions: Array<{
    decision: 'ALLOWED' | 'BLOCKED';
    agentId: string;
    toolName: string;
    reason?: string;
    ruleId?: string | null;
    timestamp: string;
  }>;
}

interface AgentRow {
  id: string;
  name: string;
  status: string;
  contracts: Array<{ id: string; name: string; status: string }>;
}

interface ContractRow {
  id: string;
  name: string;
  status: string;
}

interface ViolationRow {
  id: string;
  description: string;
  status: string;
  createdAt: string;
  agent: { name: string };
  contract: { name: string };
}

/* ── Page Component ──────────────────────────────────────────────── */

export function OverviewPage() {
  const runtime = useApi<RuntimeStatus>('/api/runtime/status', 3000);
  const agents = useApi<AgentRow[]>('/api/agents');
  const contracts = useApi<ContractRow[]>('/api/contracts');
  const violations = useApi<ViolationRow[]>('/api/violations');

  const [stopModalOpen, setStopModalOpen] = useState(false);
  const [stopConfirm, setStopConfirm] = useState('');
  const [stopping, setStopping] = useState(false);

  const rd = runtime.data;

  // Compute stats from audit log
  const allowedCount = rd?.recentDecisions.filter(d => d.decision === 'ALLOWED').length ?? 0;
  const blockedCount = rd?.recentDecisions.filter(d => d.decision === 'BLOCKED').length ?? 0;

  // Agent counts by status
  const agentList = agents.data ?? [];
  const activeAgents = agentList.filter(a => a.status === 'active').length;
  const suspendedAgents = agentList.filter(a => a.status === 'suspended').length;

  // Deployed contracts count
  const deployedContracts = (contracts.data ?? []).filter(c => c.status === 'deployed').length;

  const handleEmergencyStop = async () => {
    setStopping(true);
    try {
      await post('/api/runtime/emergency-stop');
      runtime.refetch();
    } finally {
      setStopping(false);
      setStopModalOpen(false);
      setStopConfirm('');
    }
  };

  const handleResume = async () => {
    await post('/api/runtime/resume');
    runtime.refetch();
  };

  return (
    <div>
      {/* ── Header Row ───────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-semibold text-[var(--color-primary)]">Runtime Overview</h1>
          <p className="text-sm text-[var(--color-secondary)] mt-0.5">
            Enforcement status and system health
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Enforcement Mode Badge */}
          {rd && (
            <Badge variant={rd.emergencyStopActive ? 'blocked' : 'allowed'} dot>
              {rd.emergencyStopActive
                ? 'EMERGENCY STOP ACTIVE'
                : rd.zeroTrustEnabled
                  ? 'Zero-Trust: DENY by default'
                  : 'Permissive Mode'}
            </Badge>
          )}

          {/* Emergency Stop / Resume */}
          {rd?.emergencyStopActive ? (
            <Button variant="primary" size="sm" onClick={handleResume}>
              Resume Operations
            </Button>
          ) : (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setStopModalOpen(true)}
            >
              Emergency Stop
            </Button>
          )}
        </div>
      </div>

      {/* ── Key Metrics Row ──────────────────────────────────── */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <MetricCard
          label="Active Contracts"
          value={deployedContracts}
          loading={contracts.loading}
          linkTo="/contracts"
          sublabel={`${(contracts.data ?? []).length} total`}
        />
        <MetricCard
          label="Agents Connected"
          value={agentList.length}
          loading={agents.loading}
          linkTo="/agents"
          sublabel={`${activeAgents} active · ${suspendedAgents} suspended`}
        />
        <MetricCard
          label="Recent Allowed"
          value={allowedCount}
          loading={runtime.loading}
          variant="allowed"
        />
        <MetricCard
          label="Recent Blocked"
          value={blockedCount}
          loading={runtime.loading}
          variant="blocked"
        />
      </div>

      {/* ── Two-Column Body ──────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-4">

        {/* Left: Recent Enforcement Decisions (2 cols wide) */}
        <div className="col-span-2">
          <Card padding="none">
            <div className="px-4 py-3 border-b border-[var(--color-border)] flex items-center justify-between">
              <h2 className="text-sm font-semibold text-[var(--color-primary)]">
                Recent Enforcement Decisions
              </h2>
              <Link to="/execution" className="text-xs text-[var(--color-accent)] hover:underline">
                View all →
              </Link>
            </div>

            {runtime.loading ? (
              <div className="p-4 space-y-3">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="flex gap-4">
                    <div className="h-4 bg-slate-100 rounded animate-pulse w-16" />
                    <div className="h-4 bg-slate-100 rounded animate-pulse flex-1" />
                    <div className="h-4 bg-slate-50 rounded animate-pulse w-32" />
                  </div>
                ))}
              </div>
            ) : rd && rd.recentDecisions.length > 0 ? (
              <div className="divide-y divide-[var(--color-border)]">
                {rd.recentDecisions.map((d, i) => (
                  <div key={i} className="px-4 py-2.5 flex items-center gap-3 text-sm">
                    <Badge variant={d.decision === 'ALLOWED' ? 'allowed' : 'blocked'}>
                      {d.decision}
                    </Badge>
                    <span className="font-mono text-xs text-[var(--color-secondary)] truncate max-w-[140px]" title={d.agentId}>
                      {d.agentId.slice(0, 12)}…
                    </span>
                    <span className="text-[var(--color-primary)]">{d.toolName}</span>
                    {d.decision === 'BLOCKED' && d.reason && (
                      <span className="text-xs text-[var(--color-secondary)] truncate flex-1" title={d.reason}>
                        {d.reason.length > 60 ? d.reason.slice(0, 60) + '…' : d.reason}
                      </span>
                    )}
                    <span className="text-xs text-[var(--color-secondary)] ml-auto shrink-0">
                      {formatTime(d.timestamp)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="px-4 py-8 text-center text-sm text-[var(--color-secondary)]">
                No enforcement decisions recorded yet
              </div>
            )}
          </Card>
        </div>

        {/* Right Column */}
        <div className="space-y-4">

          {/* Runtime Health */}
          <Card>
            <h2 className="text-sm font-semibold text-[var(--color-primary)] mb-3">Runtime Health</h2>
            <div className="space-y-2.5">
              <HealthRow label="Audit log entries" value={String(rd?.auditLogSize ?? '—')} />
              <HealthRow label="Registered agents" value={String(rd?.registeredAgents ?? '—')} />
              <HealthRow
                label="Enforcement mode"
                value={rd?.emergencyStopActive ? 'Stopped' : rd?.zeroTrustEnabled ? 'Zero-Trust' : 'Permissive'}
                variant={rd?.emergencyStopActive ? 'blocked' : 'allowed'}
              />
            </div>
          </Card>

          {/* Latest Violations */}
          <Card padding="none">
            <div className="px-4 py-3 border-b border-[var(--color-border)] flex items-center justify-between">
              <h2 className="text-sm font-semibold text-[var(--color-primary)]">Latest Violations</h2>
              <Link to="/violations" className="text-xs text-[var(--color-accent)] hover:underline">
                View all →
              </Link>
            </div>
            {violations.loading ? (
              <div className="p-4 space-y-2">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="h-4 bg-slate-100 rounded animate-pulse" />
                ))}
              </div>
            ) : (violations.data ?? []).length === 0 ? (
              <div className="px-4 py-6 text-center text-sm text-[var(--color-secondary)]">
                No violations
              </div>
            ) : (
              <div className="divide-y divide-[var(--color-border)]">
                {(violations.data ?? []).slice(0, 5).map(v => (
                  <Link
                    key={v.id}
                    to="/violations"
                    className="block px-4 py-2.5 hover:bg-slate-50 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <Badge variant={v.status === 'open' ? 'blocked' : 'neutral'} dot>
                        {v.status}
                      </Badge>
                      <span className="text-sm text-[var(--color-primary)] truncate">{v.description}</span>
                    </div>
                    <div className="text-xs text-[var(--color-secondary)] mt-0.5">
                      {v.agent.name} · {formatTime(v.createdAt)}
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </Card>

          {/* Agents Status */}
          <Card padding="none">
            <div className="px-4 py-3 border-b border-[var(--color-border)]">
              <h2 className="text-sm font-semibold text-[var(--color-primary)]">Agents</h2>
            </div>
            {agents.loading ? (
              <div className="p-4 space-y-2">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="h-4 bg-slate-100 rounded animate-pulse" />
                ))}
              </div>
            ) : (
              <div className="divide-y divide-[var(--color-border)]">
                {agentList.map(a => (
                  <Link
                    key={a.id}
                    to="/agents"
                    className="flex items-center justify-between px-4 py-2.5 hover:bg-slate-50 transition-colors"
                  >
                    <span className="text-sm text-[var(--color-primary)]">{a.name}</span>
                    <Badge variant={a.status === 'active' ? 'allowed' : a.status === 'suspended' ? 'blocked' : 'pending'} dot>
                      {a.status}
                    </Badge>
                  </Link>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* ── Emergency Stop Modal ─────────────────────────────── */}
      <Modal open={stopModalOpen} onClose={() => { setStopModalOpen(false); setStopConfirm(''); }} title="Emergency Stop" width="sm">
        <div className="space-y-4">
          <p className="text-sm text-[var(--color-secondary)]">
            This will <span className="font-semibold text-[var(--color-blocked)]">immediately halt ALL agent execution</span> across
            every contract. No tool calls will be processed until you manually resume.
          </p>
          <div>
            <label className="block text-xs font-medium text-[var(--color-primary)] mb-1.5">
              Type <span className="font-mono bg-slate-100 px-1 py-0.5 rounded">STOP</span> to confirm
            </label>
            <input
              type="text"
              value={stopConfirm}
              onChange={e => setStopConfirm(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-[var(--color-border)] rounded-md outline-none focus:border-[var(--color-blocked)] font-mono"
              placeholder="STOP"
              autoFocus
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" size="sm" onClick={() => { setStopModalOpen(false); setStopConfirm(''); }}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={stopConfirm !== 'STOP'}
              loading={stopping}
              onClick={handleEmergencyStop}
            >
              Activate Emergency Stop
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

/* ── Sub-components ──────────────────────────────────────────────── */

function MetricCard({
  label,
  value,
  loading,
  linkTo,
  sublabel,
  variant,
}: {
  label: string;
  value: number;
  loading: boolean;
  linkTo?: string;
  sublabel?: string;
  variant?: 'allowed' | 'blocked';
}) {
  const valueColor = variant === 'allowed'
    ? 'text-[var(--color-allowed)]'
    : variant === 'blocked'
      ? 'text-[var(--color-blocked)]'
      : 'text-[var(--color-primary)]';

  const inner = (
    <Card className={linkTo ? 'hover:border-[var(--color-border-strong)] transition-colors' : ''}>
      <p className="text-xs font-medium text-[var(--color-secondary)] uppercase tracking-wider">{label}</p>
      {loading ? (
        <div className="h-8 w-16 bg-slate-100 rounded animate-pulse mt-1" />
      ) : (
        <p className={`text-2xl font-semibold ${valueColor} mt-1`}>{value}</p>
      )}
      {sublabel && (
        <p className="text-xs text-[var(--color-secondary)] mt-1">{sublabel}</p>
      )}
    </Card>
  );

  if (linkTo) {
    return <Link to={linkTo} className="block">{inner}</Link>;
  }
  return inner;
}

function HealthRow({
  label,
  value,
  variant,
}: {
  label: string;
  value: string;
  variant?: 'allowed' | 'blocked';
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-[var(--color-secondary)]">{label}</span>
      <span className={`text-sm font-medium ${
        variant === 'allowed'
          ? 'text-[var(--color-allowed)]'
          : variant === 'blocked'
            ? 'text-[var(--color-blocked)]'
            : 'text-[var(--color-primary)]'
      }`}>
        {value}
      </span>
    </div>
  );
}

/* ── Helpers ─────────────────────────────────────────────────────── */

function formatTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  if (diffMs < 60_000) return `${Math.floor(diffMs / 1000)}s ago`;
  if (diffMs < 3_600_000) return `${Math.floor(diffMs / 60_000)}m ago`;
  if (diffMs < 86_400_000) return `${Math.floor(diffMs / 3_600_000)}h ago`;
  return d.toLocaleDateString();
}
