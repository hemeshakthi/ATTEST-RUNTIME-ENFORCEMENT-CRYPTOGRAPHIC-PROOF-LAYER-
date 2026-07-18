import { useState, useMemo } from 'react';
import { useApi } from '../lib/useApi';
import { Badge, Card, Drawer } from '../components';

/* ── Types ───────────────────────────────────────────────────────── */

interface ScopedCapability {
  allowed_tools: string[];
  denied_fields?: string[];
  rate_limit?: string;
  financial_threshold?: number;
  expires?: string;
}

interface DelegationNode {
  agentId: string;
  agentName: string;
  children: DelegationNode[];
}

interface DelegationEdge {
  id: string;
  fromAgentId: string;
  fromAgentName: string;
  toAgentId: string;
  toAgentName: string;
  scopedCapability: ScopedCapability;
}

interface DelegationGraph {
  roots: DelegationNode[];
  edges: DelegationEdge[];
}

interface AgentDetail {
  id: string;
  name: string;
  status: string;
  contracts: Array<{ id: string; name: string; version: number; status: string; yamlSource: string }>;
}

/* ── Page ────────────────────────────────────────────────────────── */

export function DelegationPage() {
  const { data, loading } = useApi<DelegationGraph>('/api/delegation/graph');
  const agents = useApi<AgentDetail[]>('/api/agents');
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);

  // Build edge lookup: fromAgentId -> toAgentId -> edge
  const edgeMap = useMemo(() => {
    const map = new Map<string, DelegationEdge>();
    (data?.edges ?? []).forEach(e => map.set(`${e.fromAgentId}->${e.toAgentId}`, e));
    return map;
  }, [data]);

  const agentMap = useMemo(() => {
    const map = new Map<string, AgentDetail>();
    (agents.data ?? []).forEach(a => map.set(a.id, a));
    return map;
  }, [agents.data]);

  const selectedAgent = selectedAgentId ? agentMap.get(selectedAgentId) : null;

  if (loading) {
    return (
      <div>
        <h1 className="text-lg font-semibold text-[var(--color-primary)] mb-4">Delegation Graph</h1>
        <div className="h-96 bg-slate-50 rounded animate-pulse" />
      </div>
    );
  }

  const roots = data?.roots ?? [];

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-lg font-semibold text-[var(--color-primary)]">Delegation Graph</h1>
        <p className="text-sm text-[var(--color-secondary)] mt-0.5">
          Capability delegation chains — scope narrows at each level, never widens
        </p>
      </div>

      {roots.length === 0 ? (
        <Card>
          <div className="py-12 text-center text-sm text-[var(--color-secondary)]">
            No delegation chains configured
          </div>
        </Card>
      ) : (
        <Card padding="none">
          <div className="px-4 py-3 border-b border-[var(--color-border)] bg-slate-50">
            <span className="text-xs font-medium text-[var(--color-secondary)] uppercase tracking-wider">
              Delegation Hierarchy — {data?.edges.length ?? 0} delegation(s)
            </span>
          </div>
          <div className="p-6 overflow-x-auto">
            <div className="flex items-start gap-0">
              {roots.map(root => (
                <DelegationTree
                  key={root.agentId}
                  node={root}
                  edgeMap={edgeMap}
                  parentId={null}
                  depth={0}
                  onSelectAgent={setSelectedAgentId}
                />
              ))}
            </div>
          </div>
        </Card>
      )}

      {/* Agent Detail Drawer */}
      <Drawer
        open={!!selectedAgent}
        onClose={() => setSelectedAgentId(null)}
        title={selectedAgent?.name ?? 'Agent'}
      >
        {selectedAgent && <AgentDrawerContent agent={selectedAgent} />}
      </Drawer>
    </div>
  );
}

/* ── Tree Renderer ───────────────────────────────────────────────── */

function DelegationTree({
  node,
  edgeMap,
  parentId,
  depth,
  onSelectAgent,
}: {
  node: DelegationNode;
  edgeMap: Map<string, DelegationEdge>;
  parentId: string | null;
  depth: number;
  onSelectAgent: (id: string) => void;
}) {
  const edge = parentId ? edgeMap.get(`${parentId}->${node.agentId}`) : null;
  const cap = edge?.scopedCapability;

  return (
    <div className="flex items-start">
      {/* Connector from parent */}
      {parentId && (
        <div className="flex items-center shrink-0 pt-4">
          {/* Edge line */}
          <div className="flex flex-col items-center">
            <div className="w-12 h-0.5 bg-[var(--color-border-strong)]" />
          </div>
          {/* Capability label on edge */}
          {cap && (
            <div className="absolute mt-8 -ml-2 max-w-[120px]">
            </div>
          )}
        </div>
      )}

      <div className="flex flex-col items-center">
        {/* Agent Node */}
        <button
          onClick={() => onSelectAgent(node.agentId)}
          className="relative border border-[var(--color-border)] bg-white rounded-md px-4 py-3 hover:border-[var(--color-accent)] hover:shadow-sm transition-all cursor-pointer min-w-[180px] text-left"
        >
          {/* Status dot */}
          <div className="absolute -top-1.5 -right-1.5 w-3 h-3 rounded-full bg-[var(--color-allowed)] border-2 border-white" />

          <div className="text-sm font-medium text-[var(--color-primary)]">{node.agentName}</div>
          <div className="font-mono text-[10px] text-[var(--color-secondary)] mt-0.5 truncate">
            {node.agentId.slice(0, 16)}…
          </div>

          {/* Edge label showing capability scope */}
          {cap && (
            <div className="mt-2 pt-2 border-t border-[var(--color-border)] space-y-1">
              <div className="text-[10px] font-medium text-[var(--color-secondary)] uppercase tracking-wider">
                Delegated Scope
              </div>
              <div className="flex flex-wrap gap-1">
                {cap.allowed_tools.map(t => (
                  <span key={t} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-[var(--color-allowed-bg)] border border-[var(--color-allowed)]/20 rounded text-[10px] font-mono text-[var(--color-allowed)]">
                    {t}
                  </span>
                ))}
              </div>
              {(cap.denied_fields ?? []).length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {(cap.denied_fields ?? []).map(f => (
                    <span key={f} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-[var(--color-blocked-bg)] border border-[var(--color-blocked)]/20 rounded text-[10px] font-mono text-[var(--color-blocked)]">
                      ✗ {f}
                    </span>
                  ))}
                </div>
              )}
              <div className="flex gap-2 text-[10px] text-[var(--color-secondary)]">
                {cap.rate_limit && <span>Rate: {cap.rate_limit}</span>}
                {cap.financial_threshold && <span>Cap: ₹{cap.financial_threshold.toLocaleString()}</span>}
              </div>
            </div>
          )}
        </button>

        {/* Children */}
        {node.children.length > 0 && (
          <div className="flex flex-col items-center">
            {/* Vertical connector */}
            <div className="w-0.5 h-6 bg-[var(--color-border-strong)]" />
            {/* Arrow */}
            <svg width="10" height="6" viewBox="0 0 10 6" className="text-[var(--color-border-strong)] -mt-0.5">
              <polyline points="0,0 5,6 10,0" fill="none" stroke="currentColor" strokeWidth="1.5" />
            </svg>

            <div className="flex items-start gap-6 mt-1">
              {node.children.map(child => (
                <DelegationTree
                  key={child.agentId}
                  node={child}
                  edgeMap={edgeMap}
                  parentId={node.agentId}
                  depth={depth + 1}
                  onSelectAgent={onSelectAgent}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Agent Drawer Content ────────────────────────────────────────── */

function AgentDrawerContent({ agent }: { agent: AgentDetail }) {
  return (
    <div className="space-y-4">
      {/* Identity */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <h3 className="text-sm font-semibold">{agent.name}</h3>
          <Badge variant={agent.status === 'active' ? 'allowed' : 'blocked'} dot>
            {agent.status}
          </Badge>
        </div>
        <div className="text-xs text-[var(--color-secondary)]">
          <span className="font-mono">{agent.id}</span>
        </div>
      </div>

      {/* Active Contract */}
      {agent.contracts.length > 0 && (
        <div>
          <h4 className="text-xs font-medium text-[var(--color-secondary)] uppercase tracking-wider mb-2">Active Contract</h4>
          {agent.contracts.map(c => (
            <Card key={c.id} className="text-sm">
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium">{c.name}</span>
                <Badge variant={c.status === 'deployed' ? 'deployed' : 'draft'} dot>{c.status}</Badge>
              </div>
              <pre className="text-xs font-mono bg-slate-50 border border-[var(--color-border)] rounded p-2 whitespace-pre-wrap max-h-48 overflow-auto">
                {c.yamlSource}
              </pre>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
