import { useState } from 'react';
import { Badge, Card, CardHeader, CardTitle, Table } from '../components';
import type { Column } from '../components';

/* ── Static mock data ────────────────────────────────────────────── */

interface RBACEntry {
  role: string;
  authorContracts: boolean;
  approveContracts: boolean;
  deployContracts: boolean;
  viewReceipts: boolean;
  manageAgents: boolean;
  emergencyStop: boolean;
}

const rbacData: RBACEntry[] = [
  { role: 'Admin',           authorContracts: true,  approveContracts: true,  deployContracts: true,  viewReceipts: true,  manageAgents: true,  emergencyStop: true },
  { role: 'Contract Author', authorContracts: true,  approveContracts: false, deployContracts: false, viewReceipts: true,  manageAgents: false, emergencyStop: false },
  { role: 'Reviewer',        authorContracts: false, approveContracts: true,  deployContracts: false, viewReceipts: true,  manageAgents: false, emergencyStop: false },
  { role: 'Deployer',        authorContracts: false, approveContracts: false, deployContracts: true,  viewReceipts: true,  manageAgents: false, emergencyStop: true },
  { role: 'Auditor',         authorContracts: false, approveContracts: false, deployContracts: false, viewReceipts: true,  manageAgents: false, emergencyStop: false },
];

type Environment = 'production' | 'staging' | 'simulation';

/* ── Page ────────────────────────────────────────────────────────── */

export function SettingsPage() {
  const [env, setEnv] = useState<Environment>('production');

  const rbacColumns: Column<RBACEntry>[] = [
    { key: 'role', header: 'Role', render: (r) => <span className="font-medium text-[var(--color-primary)]">{r.role}</span> },
    { key: 'authorContracts', header: 'Author', render: (r) => <PermCell allowed={r.authorContracts} /> },
    { key: 'approveContracts', header: 'Approve', render: (r) => <PermCell allowed={r.approveContracts} /> },
    { key: 'deployContracts', header: 'Deploy', render: (r) => <PermCell allowed={r.deployContracts} /> },
    { key: 'viewReceipts', header: 'View Receipts', render: (r) => <PermCell allowed={r.viewReceipts} /> },
    { key: 'manageAgents', header: 'Manage Agents', render: (r) => <PermCell allowed={r.manageAgents} /> },
    { key: 'emergencyStop', header: 'Emergency Stop', render: (r) => <PermCell allowed={r.emergencyStop} /> },
  ];

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-lg font-semibold text-[var(--color-primary)]">Settings</h1>
        <p className="text-sm text-[var(--color-secondary)] mt-0.5">System configuration and identity</p>
      </div>

      <div className="space-y-6">

        {/* Organization Identity */}
        <Card>
          <CardHeader>
            <CardTitle>Organization Identity</CardTitle>
          </CardHeader>
          <div className="grid grid-cols-2 gap-4">
            <SettingField label="Organization" value="Org-1" />
            <SettingField label="Organization ID" value="org-1" mono />
            <SettingField label="Platform" value="Attest — Runtime Enforcement & Cryptographic Proof Layer" />
            <SettingField label="MCP Server" value="NitroStack v1.0.0" mono />
          </div>
        </Card>

        {/* Signing Key */}
        <Card>
          <CardHeader>
            <CardTitle>Ed25519 Signing Key</CardTitle>
            <Badge variant="allowed" dot>Active</Badge>
          </CardHeader>
          <div className="grid grid-cols-2 gap-4">
            <SettingField label="Algorithm" value="Ed25519 (RFC 8032)" />
            <SettingField label="Key Location" value="keys/ed25519.key" mono />
            <div className="col-span-2">
              <div className="text-xs font-medium text-[var(--color-secondary)] mb-1">Public Key Fingerprint</div>
              <div className="font-mono text-xs text-[var(--color-primary)] bg-slate-50 border border-[var(--color-border)] rounded-md px-3 py-2">
                SHA256:xK9m2R7vQz...auto-generated-on-first-run
              </div>
              <div className="text-[10px] text-[var(--color-secondary)] mt-1">
                Generated automatically on first enforcement decision. Used to sign all execution receipts.
              </div>
            </div>
          </div>
        </Card>

        {/* Environment */}
        <Card>
          <CardHeader>
            <CardTitle>Environment</CardTitle>
          </CardHeader>
          <div className="space-y-3">
            <div className="text-xs font-medium text-[var(--color-secondary)] mb-1">Active Environment</div>
            <div className="flex items-center bg-slate-50 border border-[var(--color-border)] rounded-md overflow-hidden w-fit">
              {(['production', 'staging', 'simulation'] as Environment[]).map(e => (
                <button
                  key={e}
                  onClick={() => setEnv(e)}
                  className={`px-4 py-2 text-sm font-medium capitalize transition-colors cursor-pointer ${
                    env === e
                      ? 'bg-white text-[var(--color-primary)] border-x border-[var(--color-border)] shadow-sm'
                      : 'text-[var(--color-secondary)] hover:text-[var(--color-primary)]'
                  }`}
                >
                  {e}
                </button>
              ))}
            </div>
            <div className="text-xs text-[var(--color-secondary)]">
              {env === 'production' && 'All enforcement decisions are real and cryptographically receipted.'}
              {env === 'staging' && 'Enforcement is active but receipts are marked as staging — not included in production audit trail.'}
              {env === 'simulation' && 'Dry-run mode — decisions are logged but tools execute against mock data only.'}
            </div>
          </div>
        </Card>

        {/* RBAC */}
        <div>
          <div className="mb-3">
            <h2 className="text-sm font-semibold text-[var(--color-primary)]">Role-Based Access Control</h2>
            <p className="text-xs text-[var(--color-secondary)] mt-0.5">
              Permission matrix for contract lifecycle management
            </p>
          </div>
          <Table columns={rbacColumns} data={rbacData} />
        </div>

        {/* Runtime Config */}
        <Card>
          <CardHeader>
            <CardTitle>Runtime Configuration</CardTitle>
          </CardHeader>
          <div className="grid grid-cols-2 gap-4">
            <SettingField label="Enforcement Mode" value="Zero-Trust: DENY by default" />
            <SettingField label="Hash Algorithm" value="SHA-256" mono />
            <SettingField label="Chain Type" value="Linear hash chain (Certificate Transparency-style)" />
            <SettingField label="Receipt Storage" value="SQLite via Prisma ORM" mono />
            <SettingField label="API Port" value="3001" mono />
            <SettingField label="MCP Transport" value="stdio" mono />
          </div>
        </Card>
      </div>
    </div>
  );
}

/* ── Sub-components ──────────────────────────────────────────────── */

function SettingField({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="text-xs font-medium text-[var(--color-secondary)] mb-0.5">{label}</div>
      <div className={`text-sm text-[var(--color-primary)] ${mono ? 'font-mono text-xs' : ''}`}>{value}</div>
    </div>
  );
}

function PermCell({ allowed }: { allowed: boolean }) {
  return allowed ? (
    <span className="text-[var(--color-allowed)] text-sm">✓</span>
  ) : (
    <span className="text-[var(--color-border-strong)] text-sm">—</span>
  );
}
