import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useApi } from '../lib/useApi';
import { Badge, Button, Card } from '../components';

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

interface VerifyResult {
  valid: boolean;
  brokenAtReceiptId?: string;
  chainLength?: number;
}

/* ── Page ────────────────────────────────────────────────────────── */

export function ReceiptDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: receipt, loading } = useApi<Receipt>(`/api/receipts/${id}`);
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<VerifyResult | null>(null);
  const [sigExpanded, setSigExpanded] = useState(false);

  const handleVerify = async () => {
    if (!receipt) return;
    setVerifying(true);
    try {
      const res = await fetch(`http://localhost:3001/api/receipts/verify/${receipt.contractId}`);
      const data = await res.json();
      setVerifyResult(data);
    } catch {
      setVerifyResult({ valid: false, brokenAtReceiptId: 'network-error' });
    } finally {
      setVerifying(false);
    }
  };

  if (loading || !receipt) {
    return (
      <div className="space-y-4">
        <div className="h-6 w-48 bg-slate-100 rounded animate-pulse" />
        <div className="h-64 bg-slate-50 rounded animate-pulse" />
      </div>
    );
  }

  let parsedParams: Record<string, unknown> = {};
  try { parsedParams = JSON.parse(receipt.params); } catch {}

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <Link to="/receipts" className="text-[var(--color-secondary)] hover:text-[var(--color-primary)] text-sm">
            ← Receipts
          </Link>
          <span className="text-[var(--color-border)]">/</span>
          <h1 className="text-lg font-semibold text-[var(--color-primary)]">Receipt Detail</h1>
          <Badge variant={receipt.decision === 'allowed' ? 'allowed' : 'blocked'} dot>
            {receipt.decision.toUpperCase()}
          </Badge>
        </div>
        <Button variant="primary" size="sm" loading={verifying} onClick={handleVerify}>
          Verify Chain
        </Button>
      </div>

      {/* Verification Banner */}
      {verifyResult && (
        <div className={`flex items-center gap-3 px-4 py-3 rounded-md border mb-4 ${
          verifyResult.valid
            ? 'bg-[var(--color-allowed-bg)] border-[var(--color-allowed)]/30'
            : 'bg-[var(--color-blocked-bg)] border-[var(--color-blocked)]/30'
        }`}>
          <span className={`text-3xl ${verifyResult.valid ? 'text-[var(--color-allowed)]' : 'text-[var(--color-blocked)]'}`}>
            {verifyResult.valid ? '✓' : '✗'}
          </span>
          <div>
            <div className={`text-sm font-semibold ${verifyResult.valid ? 'text-[var(--color-allowed)]' : 'text-[var(--color-blocked)]'}`}>
              {verifyResult.valid ? 'Chain Valid' : 'Chain Broken — Integrity Compromised'}
            </div>
            {!verifyResult.valid && verifyResult.brokenAtReceiptId && (
              <div className="text-xs mt-0.5 text-[var(--color-blocked)]">
                Break at <span className="font-mono">{verifyResult.brokenAtReceiptId}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Receipt Fields */}
      <div className="grid grid-cols-2 gap-4">
        {/* Left column */}
        <Card>
          <h2 className="text-sm font-semibold text-[var(--color-primary)] mb-3 pb-2 border-b border-[var(--color-border)]">
            Execution Record
          </h2>
          <div className="space-y-3">
            <Field label="Receipt ID" value={receipt.id} mono />
            <Field label="Contract ID" value={receipt.contractId} mono />
            <Field label="Agent ID" value={receipt.agentId} mono />
            <Field label="Tool" value={receipt.toolName} mono />
            <Field label="Decision" value={receipt.decision.toUpperCase()} />
            {receipt.reasonRuleId && <Field label="Rule ID" value={receipt.reasonRuleId} mono />}
            {receipt.reasonText && <Field label="Reason" value={receipt.reasonText} />}
            <Field label="Timestamp" value={new Date(receipt.timestamp).toISOString()} mono />
          </div>
        </Card>

        {/* Right column — crypto data */}
        <Card>
          <h2 className="text-sm font-semibold text-[var(--color-primary)] mb-3 pb-2 border-b border-[var(--color-border)]">
            Cryptographic Proof
          </h2>
          <div className="space-y-3">
            <Field label="Pre-State Hash" value={receipt.preStateHash ?? 'N/A'} mono copyable />
            <Field label="Post-State Hash" value={receipt.postStateHash ?? 'N/A'} mono copyable />
            <Field label="Prev Receipt Hash" value={receipt.prevReceiptHash ?? 'genesis (first in chain)'} mono copyable />

            {/* Signature with expand */}
            <div>
              <div className="text-xs font-medium text-[var(--color-secondary)] mb-1">Signature</div>
              {receipt.signature ? (
                <div>
                  <div className="font-mono text-xs text-[var(--color-primary)] bg-slate-50 border border-[var(--color-border)] rounded-md px-2.5 py-1.5 break-all">
                    {sigExpanded ? receipt.signature : receipt.signature.slice(0, 48) + '…'}
                  </div>
                  <button
                    onClick={() => setSigExpanded(!sigExpanded)}
                    className="text-[10px] text-[var(--color-accent)] hover:underline mt-1 cursor-pointer"
                  >
                    {sigExpanded ? 'Collapse' : 'Show full signature'}
                  </button>
                </div>
              ) : (
                <span className="text-xs text-[var(--color-secondary)]">N/A</span>
              )}
            </div>
          </div>
        </Card>
      </div>

      {/* Parameters */}
      <Card className="mt-4">
        <h2 className="text-sm font-semibold text-[var(--color-primary)] mb-3 pb-2 border-b border-[var(--color-border)]">
          Call Parameters
        </h2>
        <pre className="text-xs font-mono bg-slate-50 border border-[var(--color-border)] rounded-md p-3 whitespace-pre-wrap">
          {JSON.stringify(parsedParams, null, 2)}
        </pre>
      </Card>

      {/* Decision Explanation */}
      <Card className="mt-4">
        <h2 className="text-sm font-semibold text-[var(--color-primary)] mb-3 pb-2 border-b border-[var(--color-border)]">
          Decision Path
        </h2>
        <div className="space-y-2 text-sm">
          <div className="flex items-start gap-2">
            <span className="w-5 h-5 rounded-full bg-slate-100 flex items-center justify-center text-xs font-medium text-[var(--color-secondary)] shrink-0 mt-0.5">1</span>
            <div>
              <span className="text-[var(--color-primary)]">Agent <span className="font-mono text-xs">{receipt.agentId.slice(0, 12)}…</span> invoked tool </span>
              <span className="font-mono text-xs text-[var(--color-accent)]">{receipt.toolName}</span>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <span className="w-5 h-5 rounded-full bg-slate-100 flex items-center justify-center text-xs font-medium text-[var(--color-secondary)] shrink-0 mt-0.5">2</span>
            <div>
              <span className="text-[var(--color-primary)]">Enforcement runtime evaluated request against contract </span>
              <span className="font-mono text-xs">{receipt.contractId.slice(0, 12)}…</span>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <span className="w-5 h-5 rounded-full bg-slate-100 flex items-center justify-center text-xs font-medium text-[var(--color-secondary)] shrink-0 mt-0.5">3</span>
            <div>
              <span className="text-[var(--color-primary)]">Decision: </span>
              <Badge variant={receipt.decision === 'allowed' ? 'allowed' : 'blocked'}>
                {receipt.decision.toUpperCase()}
              </Badge>
              {receipt.reasonRuleId && (
                <span className="text-[var(--color-secondary)]"> via rule <span className="font-mono text-xs">{receipt.reasonRuleId}</span></span>
              )}
            </div>
          </div>
          <div className="flex items-start gap-2">
            <span className="w-5 h-5 rounded-full bg-slate-100 flex items-center justify-center text-xs font-medium text-[var(--color-secondary)] shrink-0 mt-0.5">4</span>
            <div>
              <span className="text-[var(--color-primary)]">Receipt signed with Ed25519, chained to previous receipt via SHA-256 hash</span>
            </div>
          </div>
          <div className="text-xs text-[var(--color-secondary)] ml-7 mt-1 border-t border-[var(--color-border)] pt-2">
            Confidence: <span className="font-medium text-[var(--color-primary)]">100% (deterministic)</span> — 
            evaluated against compiled state machine, no probabilistic reasoning.
          </div>
        </div>
      </Card>
    </div>
  );
}

/* ── Field sub-component ─────────────────────────────────────────── */

function Field({ label, value, mono, copyable }: { label: string; value: string; mono?: boolean; copyable?: boolean }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div>
      <div className="text-xs font-medium text-[var(--color-secondary)] mb-0.5">{label}</div>
      <div className="flex items-center gap-2">
        <span className={`text-sm text-[var(--color-primary)] break-all ${mono ? 'font-mono text-xs' : ''}`}>
          {value}
        </span>
        {copyable && value !== 'N/A' && (
          <button
            onClick={handleCopy}
            className="text-[10px] text-[var(--color-accent)] hover:underline cursor-pointer shrink-0"
          >
            {copied ? '✓' : 'Copy'}
          </button>
        )}
      </div>
    </div>
  );
}
