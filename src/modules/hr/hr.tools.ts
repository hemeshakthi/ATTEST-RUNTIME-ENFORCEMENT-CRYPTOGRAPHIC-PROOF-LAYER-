/**
 * hr.tools.ts
 *
 * HR MCP tools — every handler is wrapped through the Attest
 * runtime-proxy so no call bypasses enforcement.
 *
 * The in-memory hrDb is the mock data store; the runtime captures
 * SHA-256 snapshots of it before and after each allowed call.
 */

import { ToolDecorator as Tool, Module, z } from '@nitrostack/core';
import { runtimeProxy, EnforcementOutcome } from '../../enforcement';

// ── Mock HR Database ──────────────────────────────────────────────

export const hrDb: Record<string, { leaveBalance: number; payroll: number }> = {
  'emp-1': { leaveBalance: 14, payroll: 5000 },
  'emp-2': { leaveBalance: 2, payroll: 3000 },
  'emp-3': { leaveBalance: 21, payroll: 8000 },
};

/** Return a deep-clone snapshot for SHA-256 hashing */
function snapshot() {
  return JSON.parse(JSON.stringify(hrDb));
}

// ── Default agent ID ──────────────────────────────────────────────
const DEFAULT_AGENT = 'hr-agent';

// ── Controller ────────────────────────────────────────────────────

export class HRController {

  @Tool({
    name: 'checkLeaveBalance',
    description: 'Check leave balance (Attest-enforced)',
    inputSchema: z.object({
      employeeId: z.string(),
      agentId: z.string().optional(),
    }),
  })
  async checkLeaveBalance(input: {
    employeeId: string;
    agentId?: string;
  }): Promise<EnforcementOutcome> {
    const agentId = input.agentId ?? DEFAULT_AGENT;
    const params = { employeeId: input.employeeId };

    return runtimeProxy.enforce(
      agentId,
      'checkLeaveBalance',
      params,
      snapshot,
      async () => {
        if (!hrDb[input.employeeId]) throw new Error('Employee not found');
        return { leaveBalance: hrDb[input.employeeId].leaveBalance };
      },
    );
  }

  @Tool({
    name: 'approveLeave',
    description: 'Approve leave days (Attest-enforced)',
    inputSchema: z.object({
      employeeId: z.string(),
      days: z.number(),
      agentId: z.string().optional(),
    }),
  })
  async approveLeave(input: {
    employeeId: string;
    days: number;
    agentId?: string;
  }): Promise<EnforcementOutcome> {
    const agentId = input.agentId ?? DEFAULT_AGENT;
    const params = { employeeId: input.employeeId, days: input.days };

    return runtimeProxy.enforce(
      agentId,
      'approveLeave',
      params,
      snapshot,
      async () => {
        if (!hrDb[input.employeeId]) throw new Error('Employee not found');
        hrDb[input.employeeId].leaveBalance -= input.days;
        return { success: true, newBalance: hrDb[input.employeeId].leaveBalance };
      },
    );
  }

  @Tool({
    name: 'approvePayroll',
    description: 'Approve payroll amount (Attest-enforced)',
    inputSchema: z.object({
      employeeId: z.string(),
      amount: z.number(),
      agentId: z.string().optional(),
    }),
  })
  async approvePayroll(input: {
    employeeId: string;
    amount: number;
    agentId?: string;
  }): Promise<EnforcementOutcome> {
    const agentId = input.agentId ?? DEFAULT_AGENT;
    const params = { employeeId: input.employeeId, amount: input.amount };

    return runtimeProxy.enforce(
      agentId,
      'approvePayroll',
      params,
      snapshot,
      async () => {
        if (!hrDb[input.employeeId]) throw new Error('Employee not found');
        hrDb[input.employeeId].payroll += input.amount;
        return { success: true, newPayroll: hrDb[input.employeeId].payroll };
      },
    );
  }
}

@Module({
  name: 'hr',
  description: 'HR mock tools (Attest-enforced)',
  controllers: [HRController],
})
export class HRModule {}
