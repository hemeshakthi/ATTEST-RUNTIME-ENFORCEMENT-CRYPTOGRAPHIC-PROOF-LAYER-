/**
 * runtime-proxy.ts
 *
 * The Attest Runtime Enforcement Proxy.
 *
 * Intercepts every tool call BEFORE it reaches the real NitroStack
 * @Tool() handler.  For each call it:
 *
 *   1. Checks Emergency Stop — if active, everything is BLOCKED.
 *   2. Loads the agent's currently-deployed enforcement machine.
 *   3. Calls evaluate(state, proposedAction).
 *   4. If BLOCKED → returns a structured denial (never calls the tool).
 *   5. If ALLOWED → captures pre-state SHA-256 hash, calls the real
 *      tool, captures post-state SHA-256 hash, then updateState().
 *
 * Zero-Trust Mode (default ON): any tool call from an agent that has
 * NO deployed contract is blocked automatically.
 */

import { createHash } from 'crypto';
import {
  compileYamlToIR,
  buildEnforcementMachine,
  EnforcementMachine,
  EnforcementState,
  ProposedAction,
  EvaluationResult,
} from '../compiler';
import { prisma } from '../config/database';
import { generateReceipt } from '../attestation/receipt-generator';

// ── Types ─────────────────────────────────────────────────────────

export interface EnforcementDenial {
  decision: 'BLOCKED';
  ruleId: string | null;
  reason: string;
  agentId: string;
  toolName: string;
  params: Record<string, unknown>;
  timestamp: string;
}

export interface EnforcementAllowance {
  decision: 'ALLOWED';
  agentId: string;
  toolName: string;
  params: Record<string, unknown>;
  preStateHash: string;
  postStateHash: string;
  result: unknown;
  timestamp: string;
}

export type EnforcementOutcome = EnforcementDenial | EnforcementAllowance;

export interface AgentRuntime {
  agentId: string;
  machine: EnforcementMachine;
  state: EnforcementState;
}

// ── Runtime Proxy Singleton ───────────────────────────────────────

class RuntimeProxy {
  /** Registered agent enforcement machines + mutable state */
  private agents = new Map<string, AgentRuntime>();

  /** Zero-Trust Mode: block all calls for agents with no contract */
  private _zeroTrustEnabled = true;

  /** Emergency Stop: override everything, block all calls globally */
  private _emergencyStop = false;

  /** Log of all enforcement outcomes (kept in-memory for dashboard) */
  private _auditLog: EnforcementOutcome[] = [];

  // ── Configuration ─────────────────────────────────────────────

  get zeroTrustEnabled(): boolean {
    return this._zeroTrustEnabled;
  }

  setZeroTrust(enabled: boolean): void {
    this._zeroTrustEnabled = enabled;
  }

  get emergencyStopActive(): boolean {
    return this._emergencyStop;
  }

  /**
   * EMERGENCY STOP — immediately halts ALL execution for ALL agents.
   * Overrides every contract. Must be manually resumed.
   */
  activateEmergencyStop(): void {
    this._emergencyStop = true;
  }

  /**
   * Resume normal operation after an emergency stop.
   */
  deactivateEmergencyStop(): void {
    this._emergencyStop = false;
  }

  get auditLog(): readonly EnforcementOutcome[] {
    return this._auditLog;
  }

  // ── Agent Registration ────────────────────────────────────────

  /**
   * Register (or update) an agent's enforcement contract.
   * Compiles the YAML on the spot and stores the machine + fresh state.
   */
  registerAgent(agentId: string, yamlSource: string): void {
    const ir = compileYamlToIR(yamlSource);
    const machine = buildEnforcementMachine(ir);
    const state = machine.createInitialState();
    this.agents.set(agentId, { agentId, machine, state });
  }

  /**
   * Register with a pre-built machine (useful in tests or when the
   * machine was already compiled by CompilerService).
   */
  registerAgentWithMachine(agentId: string, machine: EnforcementMachine): void {
    this.agents.set(agentId, {
      agentId,
      machine,
      state: machine.createInitialState(),
    });
  }

  /**
   * Remove an agent's contract (effectively disabling enforcement
   * for that agent; in zero-trust mode this means all their calls
   * will be blocked).
   */
  unregisterAgent(agentId: string): void {
    this.agents.delete(agentId);
  }

  getAgentRuntime(agentId: string): AgentRuntime | undefined {
    return this.agents.get(agentId);
  }

  getRegisteredAgentIds(): string[] {
    return Array.from(this.agents.keys());
  }

  /**
   * Load all deployed contracts from the database at startup.
   */
  async initializeFromDb(): Promise<void> {
    const deployedContracts = await prisma.contract.findMany({
      where: { status: 'deployed' },
      orderBy: { version: 'desc' }
    });
    
    let loaded = 0;
    for (const contract of deployedContracts) {
      // Only load the latest version per agent
      if (!this.agents.has(contract.agentId)) {
        this.registerAgent(contract.agentId, contract.yamlSource);
        loaded++;
      }
    }
    console.log(`[Runtime Proxy] Initialized ${loaded} deployed capability contracts from database.`);
  }

  private async saveOutcomeToDb(outcome: EnforcementOutcome): Promise<void> {
    try {
      const contract = await prisma.contract.findFirst({
        where: { agentId: outcome.agentId },
        orderBy: { version: 'desc' },
      });

      if (!contract) {
        console.warn(`[Runtime Proxy] No contract found for agent "${outcome.agentId}" — skipping DB receipt generation.`);
        return;
      }

      const persisted = await generateReceipt(outcome, contract.id);

      if (outcome.decision === 'BLOCKED') {
        await prisma.violation.create({
          data: {
            receiptId: persisted.id,
            agentId: outcome.agentId,
            contractId: contract.id,
            description: `Policy breach: ${outcome.reason} (Rule: ${outcome.ruleId || 'N/A'})`,
            status: 'open',
          },
        });
        console.log(`[Runtime Proxy] 🛑 Violation logged in database for agent "${outcome.agentId}"`);
      }
    } catch (err) {
      console.error('[Runtime Proxy] Failed to save outcome to database:', err);
    }
  }

  /**
   * Helper to resolve various forms of agent IDs (human-readable names, CUIDs, 
   * or client-defined aliases like "default-agent") to the correct database-seeded Agent ID.
   */
  async resolveAgentId(inputAgentId: string): Promise<string> {
    if (this.agents.has(inputAgentId)) {
      return inputAgentId;
    }

    try {
      const normalizedInput = inputAgentId.toLowerCase().replace(/[^a-z0-9]/g, '');
      const targetInput = (normalizedInput === 'defaultagent' || normalizedInput === 'unknownagent') 
        ? 'financeagent' 
        : normalizedInput;

      const allAgents = await prisma.agent.findMany();

      // 1. Try matching CUID exactly
      const exactMatch = allAgents.find(a => a.id === inputAgentId);
      if (exactMatch) return exactMatch.id;

      // 2. Try matching normalized names (e.g. "Finance Agent" matches "finance-agent")
      const nameMatch = allAgents.find(a => {
        const normName = a.name.toLowerCase().replace(/[^a-z0-9]/g, '');
        return normName === targetInput || normName.includes(targetInput) || targetInput.includes(normName);
      });
      if (nameMatch) return nameMatch.id;

      // 3. Fallback to first loaded agent or "finance" agent
      if (allAgents.length > 0) {
        const fin = allAgents.find(a => a.name.toLowerCase().includes('finance'));
        if (fin) return fin.id;
        return allAgents[0].id;
      }
    } catch (err) {
      console.error('[Runtime Proxy] Error resolving agent ID:', err);
    }

    return inputAgentId;
  }

  // ── Core Enforcement ──────────────────────────────────────────

  /**
   * Enforce a tool call.  This is the single choke-point that every
   * tool handler must pass through.
   *
   * @param inputAgentId Which agent is making the call
   * @param toolName  The @Tool name being invoked
   * @param params    The tool's input params
   * @param stateSnapshot  JSON-serialisable snapshot of the mock-DB
   *                       state BEFORE the call (for hashing)
   * @param realHandler    The actual tool handler function
   */
  async enforce<T>(
    inputAgentId: string,
    toolName: string,
    params: Record<string, unknown>,
    stateSnapshot: () => unknown,
    realHandler: () => Promise<T>,
  ): Promise<EnforcementOutcome> {
    const now = new Date();
    const agentId = await this.resolveAgentId(inputAgentId);

    // ── 1. Emergency Stop ─────────────────────────────────────
    if (this._emergencyStop) {
      const denial: EnforcementDenial = {
        decision: 'BLOCKED',
        ruleId: 'EMERGENCY_STOP',
        reason: 'Emergency stop is active — all execution halted',
        agentId,
        toolName,
        params,
        timestamp: now.toISOString(),
      };
      this._auditLog.push(denial);
      this.saveOutcomeToDb(denial);
      return denial;
    }

    // ── 2. Look up agent runtime ──────────────────────────────
    const runtime = this.agents.get(agentId);

    if (!runtime) {
      if (this._zeroTrustEnabled) {
        const denial: EnforcementDenial = {
          decision: 'BLOCKED',
          ruleId: 'ZERO_TRUST',
          reason: `Zero-Trust Mode: agent "${agentId}" has no deployed contract`,
          agentId,
          toolName,
          params,
          timestamp: now.toISOString(),
        };
        this._auditLog.push(denial);
        this.saveOutcomeToDb(denial);
        return denial;
      }

      // If zero-trust is off and no contract, allow through (unsafe mode)
      const preHash = sha256(stateSnapshot());
      const result = await realHandler();
      const postHash = sha256(stateSnapshot());
      const allowance: EnforcementAllowance = {
        decision: 'ALLOWED',
        agentId,
        toolName,
        params,
        preStateHash: preHash,
        postStateHash: postHash,
        result,
        timestamp: now.toISOString(),
      };
      this._auditLog.push(allowance);
      this.saveOutcomeToDb(allowance);
      return allowance;
    }

    // ── 3. Evaluate against the compiled state machine ────────
    const action: ProposedAction = {
      toolName,
      params,
      timestamp: now.getTime(),
    };

    const evalResult: EvaluationResult = runtime.machine.evaluate(
      runtime.state,
      action,
    );

    if (evalResult.decision === 'BLOCK') {
      const denial: EnforcementDenial = {
        decision: 'BLOCKED',
        ruleId: evalResult.matchedRule,
        reason: evalResult.reason,
        agentId,
        toolName,
        params,
        timestamp: now.toISOString(),
      };
      this._auditLog.push(denial);
      this.saveOutcomeToDb(denial);
      return denial;
    }

    // ── 4. ALLOWED — capture pre-state, call handler, capture post-state
    const preHash = sha256(stateSnapshot());
    const result = await realHandler();
    const postHash = sha256(stateSnapshot());

    // ── 5. Update runtime state ───────────────────────────────
    runtime.state = runtime.machine.updateState(runtime.state, action);

    const allowance: EnforcementAllowance = {
      decision: 'ALLOWED',
      agentId,
      toolName,
      params,
      preStateHash: preHash,
      postStateHash: postHash,
      result,
      timestamp: now.toISOString(),
    };
    this._auditLog.push(allowance);
    this.saveOutcomeToDb(allowance);
    return allowance;
  }

  /**
   * Reset audit log (useful in tests).
   */
  clearAuditLog(): void {
    this._auditLog = [];
  }

  /**
   * Reset all agent registrations and state.
   */
  reset(): void {
    this.agents.clear();
    this._auditLog = [];
    this._emergencyStop = false;
    this._zeroTrustEnabled = true;
  }
}

// ── Helpers ───────────────────────────────────────────────────────

function sha256(data: unknown): string {
  const json = JSON.stringify(data);
  return createHash('sha256').update(json).digest('hex');
}

// ── Singleton export ──────────────────────────────────────────────

export const runtimeProxy = new RuntimeProxy();
