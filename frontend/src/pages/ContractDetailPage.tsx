import { useState, useEffect, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import Editor from '@monaco-editor/react';
import { useApi } from '../lib/useApi';
import { post } from '../lib/api';
import { Badge, Button, Card, Modal, Table, useToast } from '../components';
import type { Column } from '../components';

/* ── Types ───────────────────────────────────────────────────────── */

interface Contract {
  id: string;
  name: string;
  version: number;
  yamlSource: string;
  compiledStateMachine: string;
  status: string;
  agentId: string;
  agent: { id: string; name: string };
  versions: ContractVersion[];
}

interface ContractVersion {
  id: string;
  version: number;
  yamlSource: string;
  diffFromPrevious: string | null;
  approvedBy: string | null;
  createdAt: string;
}

interface CompileResult {
  contractId: string;
  predicateCount: number;
  predicates: Array<{ id: string; type: string }>;
}

interface SimScenario {
  name: string;
  action: { toolName: string; params: Record<string, unknown> };
  result: { decision: string; matchedRule: string | null; reason: string };
  pass: boolean;
  expectedDecision: string;
}

interface SimulationResult {
  contractId: string;
  simulation: {
    scenarioCount: number;
    passCount: number;
    failCount: number;
    coveragePercent: number;
    deadRules: string[];
    conflictingRules: string[];
    scenarios: SimScenario[];
  };
}

type Tab = 'editor' | 'simulator' | 'versions';

/* ── Page ────────────────────────────────────────────────────────── */

export function ContractDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: contract, loading, refetch } = useApi<Contract>(`/api/contracts/${id}`);
  const { addToast } = useToast();

  const [activeTab, setActiveTab] = useState<Tab>('editor');
  const [yaml, setYaml] = useState('');
  const [dirty, setDirty] = useState(false);
  const [compiling, setCompiling] = useState(false);
  const [compileResult, setCompileResult] = useState<CompileResult | null>(null);
  const [compileError, setCompileError] = useState<string | null>(null);
  const [simulating, setSimulating] = useState(false);
  const [simResult, setSimResult] = useState<SimulationResult | null>(null);
  const [deploying, setDeploying] = useState(false);

  // Sync yaml from fetched contract
  useEffect(() => {
    if (contract?.yamlSource && !dirty) {
      setYaml(contract.yamlSource);
    }
  }, [contract?.yamlSource]);

  // Parse YAML for capability graph
  const parsedCapabilities = useMemo(() => parseYamlForGraph(yaml), [yaml]);

  const handleCompile = async () => {
    setCompiling(true);
    setCompileError(null);
    try {
      const result = await post<CompileResult>(`/api/contracts/${id}/compile`);
      setCompileResult(result);
      addToast('success', `Compiled: ${result.predicateCount} predicates`);
      refetch();
    } catch (e: any) {
      setCompileError(e.message);
      addToast('error', `Compile failed: ${e.message}`);
    } finally {
      setCompiling(false);
    }
  };

  const handleSimulate = async () => {
    setSimulating(true);
    try {
      const result = await post<SimulationResult>(`/api/contracts/${id}/simulate`, {
        scenarioCount: 50,
      });
      setSimResult(result);
      setActiveTab('simulator');
      addToast('success', `Simulation complete: ${result.simulation.passCount}/${result.simulation.scenarioCount} passed`);
      refetch();
    } catch (e: any) {
      addToast('error', `Simulation failed: ${e.message}`);
    } finally {
      setSimulating(false);
    }
  };

  const handleDeploy = async () => {
    setDeploying(true);
    try {
      await post(`/api/contracts/${id}/deploy`);
      addToast('success', 'Contract deployed — enforcement active');
      refetch();
    } catch (e: any) {
      addToast('error', e.message);
    } finally {
      setDeploying(false);
    }
  };

  const handleSaveDraft = async () => {
    try {
      await post('/api/contracts', {
        name: contract?.name,
        agentId: contract?.agentId,
        yamlSource: yaml,
      });
      setDirty(false);
      addToast('success', 'Draft saved');
      refetch();
    } catch (e: any) {
      addToast('error', e.message);
    }
  };

  if (loading || !contract) {
    return (
      <div className="space-y-4">
        <div className="h-6 w-48 bg-slate-100 rounded animate-pulse" />
        <div className="h-[600px] bg-slate-50 rounded animate-pulse" />
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <Link to="/contracts" className="text-[var(--color-secondary)] hover:text-[var(--color-primary)] text-sm">
            ← Contracts
          </Link>
          <span className="text-[var(--color-border)]">/</span>
          <h1 className="text-lg font-semibold text-[var(--color-primary)]">{contract.name}</h1>
          <Badge variant={statusVariant(contract.status)} dot>{contract.status}</Badge>
          <span className="font-mono text-xs text-[var(--color-secondary)]">v{contract.version}</span>
        </div>
        <div className="flex items-center gap-2">
          {dirty && (
            <>
              <Button size="sm" onClick={() => { setYaml(contract.yamlSource); setDirty(false); }}>
                Discard
              </Button>
              <Button size="sm" onClick={handleSaveDraft}>Save Draft</Button>
            </>
          )}
          <Button size="sm" loading={compiling} onClick={handleCompile}>
            Compile
          </Button>
          <Button size="sm" loading={simulating} onClick={handleSimulate}>
            Simulate
          </Button>
          <Button
            variant="primary"
            size="sm"
            loading={deploying}
            onClick={handleDeploy}
            disabled={contract.status === 'draft'}
          >
            Deploy
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-0 border-b border-[var(--color-border)] mb-4">
        {(['editor', 'simulator', 'versions'] as Tab[]).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium capitalize border-b-2 transition-colors cursor-pointer ${
              activeTab === tab
                ? 'border-[var(--color-accent)] text-[var(--color-primary)]'
                : 'border-transparent text-[var(--color-secondary)] hover:text-[var(--color-primary)]'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'editor' && (
        <EditorTab
          yaml={yaml}
          onYamlChange={(v) => { setYaml(v); setDirty(true); }}
          capabilities={parsedCapabilities}
          compileResult={compileResult}
          compileError={compileError}
        />
      )}
      {activeTab === 'simulator' && (
        <SimulatorTab simResult={simResult} onSimulate={handleSimulate} simulating={simulating} />
      )}
      {activeTab === 'versions' && (
        <VersionsTab contractId={contract.id} versions={contract.versions} onRollback={refetch} />
      )}
    </div>
  );
}

/* ── Editor Tab ──────────────────────────────────────────────────── */

interface Capabilities {
  agent: string;
  allowedTools: string[];
  deniedFields: string[];
  rateLimit: string;
  financialThreshold: number | null;
  expires: string;
  nonDelegatable: boolean;
  parseError: string | null;
}

function EditorTab({
  yaml,
  onYamlChange,
  capabilities,
  compileResult,
  compileError,
}: {
  yaml: string;
  onYamlChange: (v: string) => void;
  capabilities: Capabilities;
  compileResult: CompileResult | null;
  compileError: string | null;
}) {
  return (
    <div className="grid grid-cols-2 gap-4" style={{ height: '600px' }}>
      {/* LEFT: YAML Editor */}
      <Card padding="none" className="overflow-hidden flex flex-col">
        <div className="px-3 py-2 border-b border-[var(--color-border)] bg-slate-50 flex items-center justify-between shrink-0">
          <span className="text-xs font-medium text-[var(--color-secondary)]">Capability Contract YAML</span>
          <span className="text-xs text-[var(--color-secondary)] font-mono">.yaml</span>
        </div>
        <div className="flex-1">
          <Editor
            language="yaml"
            value={yaml}
            onChange={(v) => onYamlChange(v ?? '')}
            theme="vs"
            options={{
              minimap: { enabled: false },
              fontSize: 13,
              fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
              lineNumbers: 'on',
              scrollBeyondLastLine: false,
              wordWrap: 'on',
              padding: { top: 8 },
              renderLineHighlight: 'line',
              overviewRulerBorder: false,
            }}
          />
        </div>
      </Card>

      {/* RIGHT: Capability Graph */}
      <Card padding="none" className="overflow-auto flex flex-col">
        <div className="px-3 py-2 border-b border-[var(--color-border)] bg-slate-50 flex items-center justify-between shrink-0">
          <span className="text-xs font-medium text-[var(--color-secondary)]">Capability Graph</span>
          {compileResult && (
            <span className="text-xs text-[var(--color-allowed)]">
              ✓ {compileResult.predicateCount} predicates compiled
            </span>
          )}
        </div>
        <div className="flex-1 p-4 overflow-auto">
          {capabilities.parseError ? (
            <div className="px-3 py-2 bg-[var(--color-blocked-bg)] border border-[var(--color-blocked)]/20 rounded-md text-sm text-[var(--color-blocked)]">
              {capabilities.parseError}
            </div>
          ) : (
            <CapabilityGraph capabilities={capabilities} compileError={compileError} />
          )}
        </div>
      </Card>
    </div>
  );
}

/* ── Capability Graph (SVG-based) ────────────────────────────────── */

function CapabilityGraph({
  capabilities,
  compileError,
}: {
  capabilities: Capabilities;
  compileError: string | null;
}) {
  const { agent, allowedTools, deniedFields, rateLimit, financialThreshold, expires, nonDelegatable } = capabilities;

  return (
    <div className="space-y-4">
      {compileError && (
        <div className="px-3 py-2 bg-[var(--color-blocked-bg)] border border-[var(--color-blocked)]/20 rounded-md text-sm text-[var(--color-blocked)]">
          ⚠ {compileError}
        </div>
      )}

      {/* Agent Node */}
      <div className="flex items-center gap-2 mb-4">
        <div className="px-3 py-1.5 bg-slate-100 border border-[var(--color-border-strong)] rounded-md text-sm font-medium">
          <span className="text-[var(--color-secondary)] text-xs mr-1.5">Agent</span>
          <span className="font-mono text-xs">{agent || '—'}</span>
        </div>
      </div>

      {/* Allowed Tools */}
      <div>
        <h4 className="text-xs font-medium text-[var(--color-secondary)] uppercase tracking-wider mb-2">Allowed Tools</h4>
        <div className="space-y-1.5">
          {allowedTools.length === 0 ? (
            <span className="text-xs text-[var(--color-secondary)]">None specified</span>
          ) : allowedTools.map(tool => (
            <div key={tool} className="flex items-center gap-2">
              <svg width="16" height="16" viewBox="0 0 16 16" className="text-[var(--color-border-strong)] shrink-0">
                <line x1="0" y1="8" x2="12" y2="8" stroke="currentColor" strokeWidth="1.5" />
                <polyline points="8,4 12,8 8,12" stroke="currentColor" strokeWidth="1.5" fill="none" />
              </svg>
              <div className="flex items-center gap-2 px-2.5 py-1 border border-[var(--color-allowed)]/30 bg-[var(--color-allowed-bg)] rounded text-sm">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-allowed)]" />
                <span className="font-mono text-xs">{tool}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Denied Fields */}
      {deniedFields.length > 0 && (
        <div>
          <h4 className="text-xs font-medium text-[var(--color-secondary)] uppercase tracking-wider mb-2">Denied Fields</h4>
          <div className="flex flex-wrap gap-1.5">
            {deniedFields.map(f => (
              <span key={f} className="inline-flex items-center gap-1 px-2 py-0.5 border border-[var(--color-blocked)]/30 bg-[var(--color-blocked-bg)] rounded text-xs font-mono">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-blocked)]" />
                {f}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Constraints */}
      <div>
        <h4 className="text-xs font-medium text-[var(--color-secondary)] uppercase tracking-wider mb-2">Constraints</h4>
        <div className="grid grid-cols-2 gap-2">
          <ConstraintBox label="Rate Limit" value={rateLimit || '—'} />
          <ConstraintBox label="Financial Cap" value={financialThreshold ? `₹${financialThreshold.toLocaleString()}` : 'None'} />
          <ConstraintBox label="Expires" value={expires || '—'} />
          <ConstraintBox label="Delegatable" value={nonDelegatable ? 'No' : 'Yes'} variant={nonDelegatable ? 'blocked' : 'allowed'} />
        </div>
      </div>
    </div>
  );
}

function ConstraintBox({ label, value, variant }: { label: string; value: string; variant?: 'allowed' | 'blocked' }) {
  return (
    <div className="px-2.5 py-2 border border-[var(--color-border)] rounded bg-slate-50">
      <div className="text-[10px] font-medium text-[var(--color-secondary)] uppercase tracking-wider">{label}</div>
      <div className={`text-sm font-mono mt-0.5 ${
        variant === 'allowed' ? 'text-[var(--color-allowed)]'
        : variant === 'blocked' ? 'text-[var(--color-blocked)]'
        : 'text-[var(--color-primary)]'
      }`}>
        {value}
      </div>
    </div>
  );
}

/* ── Simulator Tab ───────────────────────────────────────────────── */

function SimulatorTab({
  simResult,
  onSimulate,
  simulating,
}: {
  simResult: SimulationResult | null;
  onSimulate: () => void;
  simulating: boolean;
}) {
  if (!simResult) {
    return (
      <Card>
        <div className="text-center py-12">
          <h3 className="text-sm font-semibold text-[var(--color-primary)] mb-2">
            Run 1,000 simulated executions before deploying
          </h3>
          <p className="text-sm text-[var(--color-secondary)] mb-4 max-w-md mx-auto">
            The simulator generates synthetic scenarios — valid calls, denied tools, rate-limit
            exhaustion, financial cap breaches, and expired contracts — to verify your rules behave as expected.
          </p>
          <Button variant="primary" loading={simulating} onClick={onSimulate}>
            Run Simulation
          </Button>
        </div>
      </Card>
    );
  }

  const sim = simResult.simulation;
  const allPass = sim.failCount === 0;

  const scenarioColumns: Column<SimScenario>[] = [
    {
      key: 'name',
      header: 'Scenario',
      render: (s) => <span className="font-mono text-xs">{s.name}</span>,
    },
    {
      key: 'toolName',
      header: 'Tool',
      render: (s) => <span className="font-mono text-xs">{s.action.toolName}</span>,
    },
    {
      key: 'expected',
      header: 'Expected',
      render: (s) => (
        <Badge variant={s.expectedDecision === 'ALLOW' ? 'allowed' : 'blocked'}>
          {s.expectedDecision}
        </Badge>
      ),
    },
    {
      key: 'actual',
      header: 'Actual',
      render: (s) => (
        <Badge variant={s.result.decision === 'ALLOW' ? 'allowed' : 'blocked'}>
          {s.result.decision}
        </Badge>
      ),
    },
    {
      key: 'pass',
      header: 'Result',
      render: (s) => (
        <Badge variant={s.pass ? 'allowed' : 'blocked'}>
          {s.pass ? 'PASS' : 'FAIL'}
        </Badge>
      ),
    },
    {
      key: 'rule',
      header: 'Matched Rule',
      render: (s) => (
        <span className="font-mono text-xs text-[var(--color-secondary)]">
          {s.result.matchedRule ?? '—'}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      {/* Summary Stats */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <div className="text-xs font-medium text-[var(--color-secondary)] uppercase tracking-wider">Scenarios</div>
          <div className="text-2xl font-semibold mt-1">{sim.scenarioCount}</div>
        </Card>
        <Card>
          <div className="text-xs font-medium text-[var(--color-secondary)] uppercase tracking-wider">Passed</div>
          <div className="text-2xl font-semibold mt-1 text-[var(--color-allowed)]">{sim.passCount}</div>
        </Card>
        <Card>
          <div className="text-xs font-medium text-[var(--color-secondary)] uppercase tracking-wider">Failed</div>
          <div className={`text-2xl font-semibold mt-1 ${sim.failCount > 0 ? 'text-[var(--color-blocked)]' : 'text-[var(--color-primary)]'}`}>
            {sim.failCount}
          </div>
        </Card>
        <Card>
          <div className="text-xs font-medium text-[var(--color-secondary)] uppercase tracking-wider">Coverage</div>
          <div className="text-2xl font-semibold mt-1">{sim.coveragePercent}%</div>
        </Card>
      </div>

      {/* Dead Rules / Conflicting Rules */}
      {(sim.deadRules.length > 0 || sim.conflictingRules.length > 0) && (
        <div className="grid grid-cols-2 gap-4">
          {sim.deadRules.length > 0 && (
            <Card>
              <h3 className="text-xs font-medium text-[var(--color-pending)] uppercase tracking-wider mb-2">Dead Rules</h3>
              <div className="space-y-1">
                {sim.deadRules.map(r => (
                  <div key={r} className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-pending)]" />
                    <span className="font-mono text-xs text-[var(--color-secondary)]">{r}</span>
                  </div>
                ))}
              </div>
            </Card>
          )}
          {sim.conflictingRules.length > 0 && (
            <Card>
              <h3 className="text-xs font-medium text-[var(--color-blocked)] uppercase tracking-wider mb-2">Conflicting Rules</h3>
              <div className="space-y-1">
                {sim.conflictingRules.map(r => (
                  <div key={r} className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-blocked)]" />
                    <span className="text-xs text-[var(--color-secondary)]">{r}</span>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      )}

      {/* Scenarios Table */}
      <Table columns={scenarioColumns} data={sim.scenarios} emptyMessage="No scenarios" />

      {/* Deploy gate */}
      <div className="flex items-center justify-between pt-2 border-t border-[var(--color-border)]">
        <div className="text-sm text-[var(--color-secondary)]">
          {allPass
            ? <span className="text-[var(--color-allowed)]">✓ All scenarios passed — safe to deploy</span>
            : <span className="text-[var(--color-blocked)]">✗ {sim.failCount} scenario(s) failed — review before deploying</span>
          }
        </div>
        <Button variant="primary" size="sm" onClick={onSimulate} loading={simulating}>
          Re-run Simulation
        </Button>
      </div>
    </div>
  );
}

/* ── Versions Tab ────────────────────────────────────────────────── */

function VersionsTab({
  contractId,
  versions,
  onRollback,
}: {
  contractId: string;
  versions: ContractVersion[];
  onRollback: () => void;
}) {
  const { addToast } = useToast();
  const [diffModal, setDiffModal] = useState<{ a: ContractVersion; b: ContractVersion } | null>(null);
  const [rolling, setRolling] = useState<string | null>(null);

  const handleRollback = async (versionId: string, versionNum: number) => {
    setRolling(versionId);
    try {
      await post(`/api/contracts/${contractId}/rollback/${versionId}`);
      addToast('success', `Rolled back to v${versionNum}`);
      onRollback();
    } catch (e: any) {
      addToast('error', e.message);
    } finally {
      setRolling(null);
    }
  };

  const sorted = [...versions].sort((a, b) => b.version - a.version);

  return (
    <div>
      <Card padding="none">
        <div className="px-4 py-3 border-b border-[var(--color-border)] flex items-center justify-between">
          <h2 className="text-sm font-semibold">Version History</h2>
          <span className="text-xs text-[var(--color-secondary)]">{versions.length} version(s)</span>
        </div>
        <div className="divide-y divide-[var(--color-border)]">
          {sorted.map((v, i) => {
            const prev = sorted[i + 1];
            return (
              <div key={v.id} className="px-4 py-3 flex items-center gap-4">
                {/* Version node */}
                <div className="flex flex-col items-center shrink-0">
                  <div className={`w-3 h-3 rounded-full border-2 ${
                    i === 0 ? 'border-[var(--color-accent)] bg-[var(--color-accent)]' : 'border-[var(--color-border-strong)] bg-white'
                  }`} />
                  {i < sorted.length - 1 && (
                    <div className="w-0.5 h-6 bg-[var(--color-border)]" />
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-[var(--color-primary)]">v{v.version}</span>
                    {i === 0 && <Badge variant="allowed">Current</Badge>}
                  </div>
                  <div className="text-xs text-[var(--color-secondary)] mt-0.5">
                    {v.diffFromPrevious ?? 'Initial version'}
                    {v.approvedBy && <> · Approved by {v.approvedBy}</>}
                    <> · {formatDate(v.createdAt)}</>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 shrink-0">
                  {prev && (
                    <Button size="sm" variant="ghost" onClick={() => setDiffModal({ a: prev, b: v })}>
                      Diff
                    </Button>
                  )}
                  {i > 0 && (
                    <Button
                      size="sm"
                      variant="ghost"
                      loading={rolling === v.id}
                      onClick={() => handleRollback(v.id, v.version)}
                    >
                      Rollback
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Diff Modal */}
      <Modal
        open={!!diffModal}
        onClose={() => setDiffModal(null)}
        title={diffModal ? `Diff: v${diffModal.a.version} → v${diffModal.b.version}` : ''}
        width="lg"
      >
        {diffModal && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-xs font-medium text-[var(--color-secondary)] mb-1">v{diffModal.a.version} (before)</div>
              <pre className="text-xs font-mono bg-[var(--color-blocked-bg)] border border-[var(--color-border)] rounded-md p-3 whitespace-pre-wrap max-h-96 overflow-auto">
                {diffModal.a.yamlSource}
              </pre>
            </div>
            <div>
              <div className="text-xs font-medium text-[var(--color-secondary)] mb-1">v{diffModal.b.version} (after)</div>
              <pre className="text-xs font-mono bg-[var(--color-allowed-bg)] border border-[var(--color-border)] rounded-md p-3 whitespace-pre-wrap max-h-96 overflow-auto">
                {diffModal.b.yamlSource}
              </pre>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

/* ── Helpers ─────────────────────────────────────────────────────── */

function parseYamlForGraph(yaml: string): Capabilities {
  try {
    // Simple line-based parser — no dependency needed for display
    const lines = yaml.split('\n');
    let agent = '';
    const allowedTools: string[] = [];
    const deniedFields: string[] = [];
    let rateLimit = '';
    let financialThreshold: number | null = null;
    let expires = '';
    let nonDelegatable = false;

    let currentArray: string[] | null = null;

    for (const raw of lines) {
      const line = raw.trim();
      if (line.startsWith('agent:')) {
        agent = line.replace('agent:', '').trim().replace(/^["']|["']$/g, '');
      } else if (line.startsWith('rate_limit:')) {
        rateLimit = line.replace('rate_limit:', '').trim().replace(/^["']|["']$/g, '');
      } else if (line.startsWith('financial_threshold:')) {
        financialThreshold = parseFloat(line.replace('financial_threshold:', '').trim());
      } else if (line.startsWith('expires:')) {
        expires = line.replace('expires:', '').trim().replace(/^["']|["']$/g, '');
      } else if (line.startsWith('non_delegatable:')) {
        nonDelegatable = line.replace('non_delegatable:', '').trim() === 'true';
      } else if (line === 'allowed_tools:') {
        currentArray = allowedTools;
      } else if (line === 'denied_fields:') {
        currentArray = deniedFields;
      } else if (line.startsWith('- ') && currentArray) {
        currentArray.push(line.replace('- ', '').trim().replace(/^["']|["']$/g, ''));
      } else if (line.startsWith('denied_fields: [') && line.endsWith(']')) {
        // Inline empty array
        currentArray = null;
      } else if (!line.startsWith('-') && line.includes(':')) {
        currentArray = null;
      }
    }

    return { agent, allowedTools, deniedFields, rateLimit, financialThreshold, expires, nonDelegatable, parseError: null };
  } catch {
    return { agent: '', allowedTools: [], deniedFields: [], rateLimit: '', financialThreshold: null, expires: '', nonDelegatable: false, parseError: 'Invalid YAML' };
  }
}

function statusVariant(status: string) {
  if (status === 'deployed') return 'deployed' as const;
  if (status === 'simulated') return 'pending' as const;
  if (status === 'deprecated') return 'deprecated' as const;
  return 'draft' as const;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}
