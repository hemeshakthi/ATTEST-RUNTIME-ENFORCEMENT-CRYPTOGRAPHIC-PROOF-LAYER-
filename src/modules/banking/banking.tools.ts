/**
 * banking.tools.ts
 *
 * Banking MCP tools — every handler is wrapped through the Attest
 * runtime-proxy so no call bypasses enforcement.
 *
 * The in-memory bankDb is the mock data store; the runtime captures
 * SHA-256 snapshots of it before and after each allowed call.
 */

import { ToolDecorator as Tool, Module, z } from '@nitrostack/core';
import { runtimeProxy, EnforcementOutcome } from '../../enforcement';

// ── Mock Banking Database ─────────────────────────────────────────

export const bankDb: Record<string, number> = {
  'acc-1': 1000,
  'acc-2': 500,
  'acc-3': 25000,
};

/** Return a deep-clone snapshot for SHA-256 hashing */
function snapshot() {
  return { ...bankDb };
}

// ── Default agent ID (can be overridden at call time) ─────────────
const DEFAULT_AGENT = 'finance-agent';

// ── Controller ────────────────────────────────────────────────────

export class BankingController {

  @Tool({
    name: 'readBalance',
    description: 'Read account balance (Attest-enforced)',
    inputSchema: z.object({
      accountId: z.string(),
      agentId: z.string().optional(),
    }),
  })
  async readBalance(input: { accountId: string; agentId?: string }): Promise<EnforcementOutcome> {
    const agentId = input.agentId ?? DEFAULT_AGENT;
    const params = { accountId: input.accountId };

    return runtimeProxy.enforce(
      agentId,
      'readBalance',
      params,
      snapshot,
      async () => {
        if (bankDb[input.accountId] === undefined) {
          throw new Error('Account not found');
        }
        return { balance: bankDb[input.accountId] };
      },
    );
  }

  @Tool({
    name: 'transferMoney',
    description: 'Transfer money between accounts (Attest-enforced)',
    inputSchema: z.object({
      fromAccount: z.string(),
      toAccount: z.string(),
      amount: z.number(),
      agentId: z.string().optional(),
    }),
  })
  async transferMoney(input: {
    fromAccount: string;
    toAccount: string;
    amount: number;
    agentId?: string;
  }): Promise<EnforcementOutcome> {
    const agentId = input.agentId ?? DEFAULT_AGENT;
    const params = {
      fromAccount: input.fromAccount,
      toAccount: input.toAccount,
      amount: input.amount,
    };

    return runtimeProxy.enforce(
      agentId,
      'transferMoney',
      params,
      snapshot,
      async () => {
        if (bankDb[input.fromAccount] === undefined || bankDb[input.toAccount] === undefined) {
          throw new Error('Account not found');
        }
        if (bankDb[input.fromAccount] < input.amount) {
          throw new Error('Insufficient funds');
        }
        bankDb[input.fromAccount] -= input.amount;
        bankDb[input.toAccount] += input.amount;
        return { success: true, newBalance: bankDb[input.fromAccount] };
      },
    );
  }

  @Tool({
    name: 'closeAccount',
    description: 'Close an account (Attest-enforced)',
    inputSchema: z.object({
      accountId: z.string(),
      agentId: z.string().optional(),
    }),
  })
  async closeAccount(input: { accountId: string; agentId?: string }): Promise<EnforcementOutcome> {
    const agentId = input.agentId ?? DEFAULT_AGENT;
    const params = { accountId: input.accountId };

    return runtimeProxy.enforce(
      agentId,
      'closeAccount',
      params,
      snapshot,
      async () => {
        delete bankDb[input.accountId];
        return { success: true };
      },
    );
  }
}

@Module({
  name: 'banking',
  description: 'Banking mock tools (Attest-enforced)',
  controllers: [BankingController],
})
export class BankingModule {}
