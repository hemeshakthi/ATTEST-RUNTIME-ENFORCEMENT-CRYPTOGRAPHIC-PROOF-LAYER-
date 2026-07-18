import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApi } from '../lib/useApi';
import { post } from '../lib/api';
import { Badge, Button, Modal, Table } from '../components';
import type { Column } from '../components';
import { useToast } from '../components';

interface ContractRow {
  id: string;
  name: string;
  status: string;
  version: number;
  updatedAt: string;
  agent: { id: string; name: string };
}

export function ContractsPage() {
  const { data, loading, refetch } = useApi<ContractRow[]>('/api/contracts');
  const navigate = useNavigate();
  const { addToast } = useToast();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [newModalOpen, setNewModalOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newAgentId, setNewAgentId] = useState('');
  const [creating, setCreating] = useState(false);

  const agents = useApi<Array<{ id: string; name: string }>>('/api/agents');

  const contracts = data ?? [];

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleBulkDeploy = async () => {
    for (const id of selected) {
      try {
        await post(`/api/contracts/${id}/deploy`);
      } catch (e: any) {
        addToast('error', `Deploy failed for ${id}: ${e.message}`);
      }
    }
    addToast('success', `Deployed ${selected.size} contract(s)`);
    setSelected(new Set());
    refetch();
  };

  const handleCreateDraft = async () => {
    if (!newName || !newAgentId) return;
    setCreating(true);
    try {
      const defaultYaml = `agent: ${newAgentId}\nallowed_tools:\n  - readBalance\ndenied_fields: []\nrate_limit: "10/min"\nexpires: "24h"\nnon_delegatable: false`;
      const result = await post<{ id: string }>('/api/contracts', {
        name: newName,
        agentId: newAgentId,
        yamlSource: defaultYaml,
      });
      addToast('success', `Contract "${newName}" created`);
      setNewModalOpen(false);
      setNewName('');
      setNewAgentId('');
      navigate(`/contracts/${result.id}`);
    } catch (e: any) {
      addToast('error', e.message);
    } finally {
      setCreating(false);
    }
  };

  const columns: Column<ContractRow>[] = [
    {
      key: 'select',
      header: '',
      className: 'w-10',
      render: (item) => (
        <input
          type="checkbox"
          checked={selected.has(item.id)}
          onChange={() => toggleSelect(item.id)}
          onClick={e => e.stopPropagation()}
          className="rounded border-[var(--color-border)]"
        />
      ),
    },
    {
      key: 'name',
      header: 'Name',
      sortable: true,
      render: (item) => (
        <span className="font-medium text-[var(--color-primary)]">{item.name}</span>
      ),
    },
    {
      key: 'agent',
      header: 'Agent',
      render: (item) => (
        <span className="text-[var(--color-secondary)]">{item.agent?.name ?? '—'}</span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      render: (item) => {
        const variant = item.status === 'deployed' ? 'deployed'
          : item.status === 'simulated' ? 'pending'
          : item.status === 'deprecated' ? 'deprecated'
          : 'draft';
        return <Badge variant={variant} dot>{item.status}</Badge>;
      },
    },
    {
      key: 'version',
      header: 'Version',
      sortable: true,
      className: 'w-20',
      render: (item) => (
        <span className="font-mono text-xs text-[var(--color-secondary)]">v{item.version}</span>
      ),
    },
    {
      key: 'updatedAt',
      header: 'Last Modified',
      sortable: true,
      render: (item) => (
        <span className="text-xs text-[var(--color-secondary)]">{formatDate(item.updatedAt)}</span>
      ),
    },
  ];

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-lg font-semibold text-[var(--color-primary)]">Contracts</h1>
          <p className="text-sm text-[var(--color-secondary)] mt-0.5">
            Manage capability contracts — draft, compile, simulate, and deploy.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {selected.size > 0 && (
            <>
              <span className="text-xs text-[var(--color-secondary)]">{selected.size} selected</span>
              <Button size="sm" onClick={handleBulkDeploy}>Deploy Selected</Button>
            </>
          )}
          <Button variant="primary" size="sm" onClick={() => setNewModalOpen(true)}>
            New Contract
          </Button>
        </div>
      </div>

      {/* Table */}
      <Table
        columns={columns}
        data={contracts}
        loading={loading}
        onRowClick={(item) => navigate(`/contracts/${item.id}`)}
        emptyMessage="No contracts created yet"
      />

      {/* New Contract Modal */}
      <Modal open={newModalOpen} onClose={() => setNewModalOpen(false)} title="New Contract" width="sm">
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-[var(--color-primary)] mb-1">Contract Name</label>
            <input
              value={newName}
              onChange={e => setNewName(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-[var(--color-border)] rounded-md outline-none focus:border-[var(--color-accent)]"
              placeholder="e.g. Finance Operations Contract"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--color-primary)] mb-1">Bind to Agent</label>
            <select
              value={newAgentId}
              onChange={e => setNewAgentId(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-[var(--color-border)] rounded-md outline-none focus:border-[var(--color-accent)] bg-white"
            >
              <option value="">Select agent...</option>
              {(agents.data ?? []).map(a => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button size="sm" onClick={() => setNewModalOpen(false)}>Cancel</Button>
            <Button variant="primary" size="sm" disabled={!newName || !newAgentId} loading={creating} onClick={handleCreateDraft}>
              Create Draft
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}
