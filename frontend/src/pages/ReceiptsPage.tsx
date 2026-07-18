import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApi } from '../lib/useApi';
import { Badge, Button, Table } from '../components';
import type { Column } from '../components';

/* ── Types ───────────────────────────────────────────────────────── */

interface Receipt {
  id: string;
  contractId: string;
  agentId: string;
  toolName: string;
  params: string;
  decision: string;
  reasonRuleId: string | null;
  reasonText: string | null;
  preStateHash: string | null;
  postStateHash: string | null;
  prevReceiptHash: string | null;
  signature: string | null;
  timestamp: string;
}

type Tab = 'list' | 'chain';

/* ── Page ────────────────────────────────────────────────────────── */

export function ReceiptsPage() {
  const { data, loading, refetch } = useApi<Receipt[]>('/api/receipts');
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('list');
  const [search, setSearch] = useState('');
  const [filterDecision, setFilterDecision] = useState('');
  const [copied, setCopied] = useState<string | null>(null);

  const receipts = data ?? [];

  const filtered = useMemo(() => {
    return receipts.filter(r => {
      if (filterDecision && r.decision !== filterDecision) return false;
      if (search) {
        const q = search.toLowerCase();
        if (
          !r.id.toLowerCase().includes(q) &&
          !r.toolName.toLowerCase().includes(q) &&
          !r.agentId.toLowerCase().includes(q) &&
          !r.contractId.toLowerCase().includes(q)
        ) return false;
      }
      return true;
    });
  }, [receipts, filterDecision, search]);

  const copyHash = (hash: string, id: string) => {
    navigator.clipboard.writeText(hash);
    setCopied(id);
    setTimeout(() => setCopied(null), 1500);
  };

  const exportCSV = () => {
    const headers = ['id', 'contractId', 'agentId', 'toolName', 'decision', 'reasonRuleId', 'timestamp', 'preStateHash', 'postStateHash', 'prevReceiptHash', 'signature'];
    const rows = filtered.map(r => headers.map(h => JSON.stringify((r as any)[h] ?? '')).join(','));
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'receipts.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const columns: Column<Receipt>[] = [
    {
      key: 'id',
      header: 'Receipt ID',
      render: (r) => (
        <span className="font-mono text-xs text-[var(--color-primary)]" title={r.id}>
          {r.id.slice(0, 16)}…
        </span>
      ),
    },
    {
      key: 'contractId',
      header: 'Contract',
      render: (r) => (
        <span className="font-mono text-xs text-[var(--color-secondary)]" title={r.contractId}>
          {r.contractId.slice(0, 12)}…
        </span>
      ),
    },
    {
      key: 'agentId',
      header: 'Agent',
      render: (r) => (
        <span className="font-mono text-xs text-[var(--color-secondary)]" title={r.agentId}>
          {r.agentId.slice(0, 12)}…
        </span>
      ),
    },
    {
      key: 'toolName',
      header: 'Tool',
      sortable: true,
      render: (r) => <span className="font-mono text-xs">{r.toolName}</span>,
    },
    {
      key: 'decision',
      header: 'Decision',
      sortable: true,
      render: (r) => (
        <Badge variant={r.decision === 'allowed' ? 'allowed' : 'blocked'}>
          {r.decision.toUpperCase()}
        </Badge>
      ),
    },
    {
      key: 'timestamp',
      header: 'Time',
      sortable: true,
      render: (r) => (
        <span className="text-xs text-[var(--color-secondary)]">{formatDate(r.timestamp)}</span>
      ),
    },
    {
      key: 'hash',
      header: 'Hash',
      render: (r) => {
        const hash = r.preStateHash ?? '—';
        return hash === '—' ? (
          <span className="text-xs text-[var(--color-secondary)]">—</span>
        ) : (
          <button
            onClick={(e) => { e.stopPropagation(); copyHash(hash, r.id); }}
            className="font-mono text-xs text-[var(--color-accent)] hover:underline cursor-pointer"
            title="Click to copy full hash"
          >
            {copied === r.id ? '✓ Copied' : hash.slice(0, 12) + '…'}
          </button>
        );
      },
    },
  ];

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-lg font-semibold text-[var(--color-primary)]">Receipts &amp; Proofs</h1>
          <p className="text-sm text-[var(--color-secondary)] mt-0.5">
            Cryptographically signed execution receipts and hash-chain verification
          </p>
        </div>
        <Button size="sm" onClick={exportCSV}>Export CSV</Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-0 border-b border-[var(--color-border)] mb-4">
        {[{ key: 'list' as Tab, label: 'Receipt List' }, { key: 'chain' as Tab, label: 'Chain Integrity' }].map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors cursor-pointer ${
              tab === t.key
                ? 'border-[var(--color-accent)] text-[var(--color-primary)]'
                : 'border-transparent text-[var(--color-secondary)] hover:text-[var(--color-primary)]'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'list' && (
        <>
          {/* Filters */}
          <div className="flex items-center gap-3 mb-3">
            <div className="relative flex-1 max-w-xs">
              <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--color-secondary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search ID, tool, agent..."
                className="w-full pl-8 pr-3 py-1.5 text-sm border border-[var(--color-border)] rounded-md outline-none focus:border-[var(--color-accent)] bg-white"
              />
            </div>
            <select
              value={filterDecision}
              onChange={e => setFilterDecision(e.target.value)}
              className="px-2.5 py-1.5 text-sm border border-[var(--color-border)] rounded-md outline-none bg-white"
            >
              <option value="">All Decisions</option>
              <option value="allowed">Allowed</option>
              <option value="blocked">Blocked</option>
            </select>
            <span className="text-xs text-[var(--color-secondary)]">{filtered.length} receipts</span>
          </div>

          <Table
            columns={columns}
            data={filtered}
            loading={loading}
            onRowClick={(r) => navigate(`/receipts/${r.id}`)}
            emptyMessage="No execution receipts"
          />
        </>
      )}

      {tab === 'chain' && (
        <ChainIntegrityView receipts={receipts} onRefetch={refetch} />
      )}
    </div>
  );
}

/* ── Chain Integrity View ────────────────────────────────────────── */

interface VerifyResult {
  valid: boolean;
  brokenAtReceiptId?: string;
  chainLength?: number;
}

function ChainIntegrityView({ receipts, onRefetch }: { receipts: Receipt[]; onRefetch: () => void }) {
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<VerifyResult | null>(null);
  const [verifiedContractId, setVerifiedContractId] = useState<string | null>(null);
  const [tampering, setTampering] = useState<string | null>(null);
  const [tamperDone, setTamperDone] = useState(false);

  // Get unique contract IDs
  const contractIds = [...new Set(receipts.map(r => r.contractId))];

  // Group receipts by contract for chain display
  const selectedContractId = verifiedContractId ?? contractIds[0] ?? null;
  const chainReceipts = receipts
    .filter(r => r.contractId === selectedContractId)
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  const handleVerify = async (contractId: string) => {
    setVerifying(true);
    setVerifiedContractId(contractId);
    setTamperDone(false);
    try {
      const res = await fetch(`http://localhost:3001/api/receipts/verify/${contractId}`);
      const data = await res.json();
      setVerifyResult(data);
    } catch {
      setVerifyResult({ valid: false, brokenAtReceiptId: 'network-error' });
    } finally {
      setVerifying(false);
    }
  };

  const handleTamper = async (receiptId: string) => {
    setTampering(receiptId);
    try {
      await fetch(`http://localhost:3001/api/demo/tamper/${receiptId}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      setTamperDone(true);
      onRefetch();
      // Re-verify to show the break
      if (selectedContractId) {
        const res = await fetch(`http://localhost:3001/api/receipts/verify/${selectedContractId}`);
        const data = await res.json();
        setVerifyResult(data);
      }
    } finally {
      setTampering(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* Contract selector + Verify */}
      <div className="flex items-center gap-3">
        <select
          value={selectedContractId ?? ''}
          onChange={e => { setVerifiedContractId(e.target.value); setVerifyResult(null); setTamperDone(false); }}
          className="px-2.5 py-1.5 text-sm border border-[var(--color-border)] rounded-md outline-none bg-white font-mono"
        >
          {contractIds.map(id => (
            <option key={id} value={id}>{id.slice(0, 20)}…</option>
          ))}
        </select>
        <Button
          variant="primary"
          size="sm"
          loading={verifying}
          onClick={() => selectedContractId && handleVerify(selectedContractId)}
        >
          Verify Chain
        </Button>
      </div>

      {/* Verification Result Banner */}
      {verifyResult && (
        <div className={`flex items-center gap-3 px-4 py-3 rounded-md border ${
          verifyResult.valid
            ? 'bg-[var(--color-allowed-bg)] border-[var(--color-allowed)]/30'
            : 'bg-[var(--color-blocked-bg)] border-[var(--color-blocked)]/30'
        }`}>
          <span className={`text-2xl ${verifyResult.valid ? 'text-[var(--color-allowed)]' : 'text-[var(--color-blocked)]'}`}>
            {verifyResult.valid ? '✓' : '✗'}
          </span>
          <div>
            <div className={`text-sm font-semibold ${verifyResult.valid ? 'text-[var(--color-allowed)]' : 'text-[var(--color-blocked)]'}`}>
              {verifyResult.valid ? 'Chain Valid — All receipts verified' : 'Chain Broken — Integrity compromised'}
            </div>
            {!verifyResult.valid && verifyResult.brokenAtReceiptId && (
              <div className="text-xs text-[var(--color-blocked)] mt-0.5">
                Break detected at receipt <span className="font-mono">{verifyResult.brokenAtReceiptId}</span>
              </div>
            )}
            {verifyResult.chainLength !== undefined && (
              <div className="text-xs text-[var(--color-secondary)] mt-0.5">
                {verifyResult.chainLength} receipts in chain
              </div>
            )}
          </div>
        </div>
      )}

      {/* Chain Visualization */}
      <div className="border border-[var(--color-border)] rounded-md bg-[var(--color-surface)] overflow-x-auto">
        <div className="px-4 py-3 border-b border-[var(--color-border)] flex items-center justify-between bg-slate-50">
          <span className="text-xs font-medium text-[var(--color-secondary)] uppercase tracking-wider">
            Hash Chain — {chainReceipts.length} receipts
          </span>
          {tamperDone && (
            <span className="text-xs text-[var(--color-blocked)] font-medium">
              ⚠ Receipt tampered — re-verify to see the break
            </span>
          )}
        </div>

        {chainReceipts.length === 0 ? (
          <div className="px-4 py-12 text-center text-sm text-[var(--color-secondary)]">
            No receipts for this contract
          </div>
        ) : (
          <div className="p-4 flex items-start gap-0 overflow-x-auto">
            {chainReceipts.map((r, i) => {
              const isBroken = verifyResult && !verifyResult.valid && verifyResult.brokenAtReceiptId === r.id;
              const isAfterBreak = verifyResult && !verifyResult.valid && verifyResult.brokenAtReceiptId
                ? chainReceipts.findIndex(cr => cr.id === verifyResult.brokenAtReceiptId) <= i
                  && chainReceipts.findIndex(cr => cr.id === verifyResult.brokenAtReceiptId) !== -1
                : false;

              return (
                <div key={r.id} className="flex items-center shrink-0">
                  {/* Block */}
                  <div className={`relative w-[160px] border rounded-md p-2.5 transition-all ${
                    isBroken
                      ? 'border-[var(--color-blocked)] bg-[var(--color-blocked-bg)] ring-2 ring-[var(--color-blocked)]/30'
                      : isAfterBreak
                        ? 'border-[var(--color-blocked)]/50 bg-[var(--color-blocked-bg)]/50'
                        : 'border-[var(--color-border)] bg-white'
                  }`}>
                    {/* Receipt number */}
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[10px] font-medium text-[var(--color-secondary)] uppercase">
                        #{i + 1}
                      </span>
                      <Badge variant={r.decision === 'allowed' ? 'allowed' : 'blocked'}>
                        {r.decision.slice(0, 3).toUpperCase()}
                      </Badge>
                    </div>

                    {/* ID */}
                    <div className="font-mono text-[10px] text-[var(--color-primary)] truncate" title={r.id}>
                      {r.id.slice(0, 14)}…
                    </div>

                    {/* Tool */}
                    <div className="text-[10px] text-[var(--color-secondary)] truncate mt-0.5">
                      {r.toolName}
                    </div>

                    {/* Hash link */}
                    <div className="font-mono text-[9px] text-[var(--color-secondary)] truncate mt-1 border-t border-[var(--color-border)] pt-1" title={r.prevReceiptHash ?? 'genesis'}>
                      ← {r.prevReceiptHash ? r.prevReceiptHash.slice(0, 10) + '…' : 'genesis'}
                    </div>

                    {/* Tamper indicator */}
                    {isBroken && (
                      <div className="absolute -top-2 -right-2 w-5 h-5 bg-[var(--color-blocked)] rounded-full flex items-center justify-center">
                        <span className="text-white text-[10px] font-bold">!</span>
                      </div>
                    )}

                    {/* Tamper button */}
                    <button
                      onClick={() => handleTamper(r.id)}
                      disabled={!!tampering}
                      className="mt-2 w-full text-[10px] text-[var(--color-blocked)] hover:bg-[var(--color-blocked-bg)] border border-[var(--color-blocked)]/20 rounded py-0.5 cursor-pointer disabled:opacity-40 transition-colors"
                    >
                      {tampering === r.id ? 'Tampering…' : 'Simulate Tamper'}
                    </button>
                  </div>

                  {/* Connector line */}
                  {i < chainReceipts.length - 1 && (
                    <div className="flex items-center mx-0.5 shrink-0">
                      <div className={`w-6 h-0.5 ${
                        isAfterBreak ? 'bg-[var(--color-blocked)]' : 'bg-[var(--color-border-strong)]'
                      }`} />
                      <svg width="6" height="10" viewBox="0 0 6 10" className={isAfterBreak ? 'text-[var(--color-blocked)]' : 'text-[var(--color-border-strong)]'}>
                        <polyline points="0,0 6,5 0,10" fill="none" stroke="currentColor" strokeWidth="1.5" />
                      </svg>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Helpers ─────────────────────────────────────────────────────── */

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}
