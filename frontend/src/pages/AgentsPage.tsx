import { useState } from 'react';
import { useApi } from '../lib/useApi';
import { Badge, Card, CardHeader, CardTitle, Table } from '../components';
import type { Column } from '../components';

/* ── Types ───────────────────────────────────────────────────────── */

interface Agent {
  id: string;
  name: string;
  orgId: string;
  status: 'active' | 'suspended';
  createdAt: string;
  contracts: Array<{ id: string; name: string; version: number; status: string }>;
  delegationsFrom: Array<{ toAgent: { id: string; name: string }; scopedCapability: string }>;
  delegationsTo: Array<{ fromAgent: { id: string; name: string }; scopedCapability: string }>;
}

/* ── Page ────────────────────────────────────────────────────────── */

export function AgentsPage() {
  const { data, loading } = useApi<Agent[]>('/api/agents');
  const [expandedAgentId, setExpandedAgentId] = useState<string | null>(null);

  const agents = data ?? [];

  const columns: Column<Agent>[] = [
    {
      key: 'name',
      header: 'Agent Name',
      render: (a) => <span className="font-medium text-[var(--color-primary)]">{a.name}</span>,
    },
    {
      key: 'orgId',
      header: 'Org ID',
      render: (a) => <span className="font-mono text-xs">{a.orgId}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (a) => (
        <Badge variant={a.status === 'active' ? 'allowed' : 'blocked'} dot>
          {a.status}
        </Badge>
      ),
    },
    {
      key: 'contract',
      header: 'Active Contract',
      render: (a) => (
        <span className="text-sm">
          {a.contracts.length > 0 ? a.contracts[0].name : <span className="text-[var(--color-secondary)]">None</span>}
        </span>
      ),
    },
    {
      key: 'createdAt',
      header: 'Created',
      render: (a) => <span className="text-xs text-[var(--color-secondary)]">{new Date(a.createdAt).toLocaleDateString()}</span>,
    },
  ];

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-lg font-semibold text-[var(--color-primary)]">Agents &amp; Connections</h1>
        <p className="text-sm text-[var(--color-secondary)] mt-0.5">
          Manage AI agents and introspect connected MCP tool servers
        </p>
      </div>

      <div className="space-y-6">
        
        {/* Section 1: Agents */}
        <Card padding="none">
          <CardHeader className="px-4 pt-4 mb-0 pb-4">
            <CardTitle>Registered Agents</CardTitle>
          </CardHeader>
          <Table
            columns={columns}
            data={agents}
            loading={loading}
            onRowClick={(a) => setExpandedAgentId(expandedAgentId === a.id ? null : a.id)}
            emptyMessage="No agents registered"
          />
          
          {/* Inline expansion handler */}
          {expandedAgentId && (
            <div className="bg-slate-50 border-t border-[var(--color-border)] p-4">
              <AgentDetailInline agent={agents.find(a => a.id === expandedAgentId)!} />
            </div>
          )}
        </Card>

        {/* Section 2: MCP Tool Servers (Mock for demo) */}
        <Card padding="none">
          <CardHeader className="px-4 pt-4 border-b border-[var(--color-border)] mb-0">
            <CardTitle>Connected MCP Tool Servers</CardTitle>
          </CardHeader>
          <div className="divide-y divide-[var(--color-border)]">
            <McpServerRow
              name="Banking MCP Server"
              status="Connected"
              tools={[
                { name: 'readBalance', fields: [{ name: 'accountId', type: 'public' }] },
                { name: 'transferMoney', fields: [{ name: 'fromAccount', type: 'public' }, { name: 'toAccount', type: 'public' }, { name: 'amount', type: 'sensitive' }] },
                { name: 'closeAccount', fields: [{ name: 'accountId', type: 'public' }] },
              ]}
            />
            <McpServerRow
              name="HR MCP Server"
              status="Connected"
              tools={[
                { name: 'checkLeaveBalance', fields: [{ name: 'employeeId', type: 'public' }] },
                { name: 'approveLeave', fields: [{ name: 'employeeId', type: 'public' }, { name: 'days', type: 'public' }] },
                { name: 'approvePayroll', fields: [{ name: 'employeeId', type: 'public' }, { name: 'amount', type: 'sensitive' }] },
              ]}
            />
          </div>
        </Card>

      </div>
    </div>
  );
}

/* ── Inline Agent Detail ─────────────────────────────────────────── */

function AgentDetailInline({ agent }: { agent: Agent }) {
  return (
    <div className="grid grid-cols-2 gap-8 text-sm">
      {/* Delegations From */}
      <div>
        <h4 className="font-semibold text-[var(--color-primary)] mb-2 uppercase text-xs tracking-wider">Delegates Capabilities To</h4>
        {agent.delegationsFrom.length === 0 ? (
          <div className="text-[var(--color-secondary)] text-xs">None</div>
        ) : (
          <ul className="space-y-2">
            {agent.delegationsFrom.map((d, i) => (
              <li key={i} className="bg-white border border-[var(--color-border)] rounded px-3 py-2">
                <div className="font-medium">{d.toAgent.name}</div>
                <div className="text-xs font-mono mt-1 text-[var(--color-secondary)]">
                  {d.scopedCapability}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Delegations To */}
      <div>
        <h4 className="font-semibold text-[var(--color-primary)] mb-2 uppercase text-xs tracking-wider">Receives Capabilities From</h4>
        {agent.delegationsTo.length === 0 ? (
          <div className="text-[var(--color-secondary)] text-xs">None (Root level)</div>
        ) : (
          <ul className="space-y-2">
            {agent.delegationsTo.map((d, i) => (
              <li key={i} className="bg-white border border-[var(--color-border)] rounded px-3 py-2">
                <div className="font-medium">{d.fromAgent.name}</div>
                <div className="text-xs font-mono mt-1 text-[var(--color-secondary)]">
                  {d.scopedCapability}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/* ── MCP Server Row ──────────────────────────────────────────────── */

function McpServerRow({ name, status, tools }: { name: string; status: string; tools: Array<{ name: string; fields: Array<{ name: string; type: 'public' | 'sensitive' | 'restricted' }> }> }) {
  return (
    <div className="p-4">
      <div className="flex items-center gap-3 mb-3">
        <h3 className="font-semibold text-[var(--color-primary)]">{name}</h3>
        <Badge variant="allowed" dot>{status}</Badge>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {tools.map(t => (
          <div key={t.name} className="border border-[var(--color-border)] rounded-md bg-slate-50 p-3">
            <div className="font-mono text-xs font-semibold text-[var(--color-primary)] mb-2">{t.name}</div>
            <div className="space-y-1.5">
              {t.fields.map(f => (
                <div key={f.name} className="flex items-center justify-between text-xs">
                  <span className="font-mono text-[var(--color-secondary)]">{f.name}</span>
                  <Badge variant={f.type === 'sensitive' ? 'pending' : f.type === 'restricted' ? 'blocked' : 'neutral'}>
                    {f.type}
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
