/**
 * enforcement.test.ts
 *
 * Tests for the Attest Runtime Enforcement Proxy.
 * Covers:
 *   1. Zero-Trust Mode blocks unregistered agents
 *   2. Registered agent with valid contract → ALLOWED
 *   3. Registered agent calling disallowed tool → BLOCKED
 *   4. Emergency Stop overrides everything
 *   5. Emergency Stop resume restores normal operation
 *   6. SHA-256 pre/post state hashes are captured
 *   7. Rate limiting propagates through the proxy
 *   8. Audit log records all outcomes
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { runtimeProxy } from '../src/enforcement/runtime-proxy';

// ── Fixtures ──────────────────────────────────────────────────────

const BANKING_CONTRACT_YAML = `
agent: finance-agent
allowed_tools:
  - readBalance
  - transferMoney
denied_fields:
  - ssn
rate_limit: "5/min"
financial_threshold: 10000
expires: "24h"
non_delegatable: false
`.trim();

// Simple in-memory mock data for snapshot hashing
let mockDb: Record<string, number> = {};

function resetMockDb() {
  mockDb = { 'acc-1': 1000, 'acc-2': 500 };
}

function snapshot() {
  return { ...mockDb };
}

// ── Tests ─────────────────────────────────────────────────────────

describe('RuntimeProxy', () => {

  beforeEach(() => {
    runtimeProxy.reset();
    resetMockDb();
  });

  describe('Zero-Trust Mode', () => {
    it('blocks calls from unregistered agents when zero-trust is ON', async () => {
      const result = await runtimeProxy.enforce(
        'unknown-agent',
        'readBalance',
        { accountId: 'acc-1' },
        snapshot,
        async () => ({ balance: 1000 }),
      );
      expect(result.decision).toBe('BLOCKED');
      if (result.decision === 'BLOCKED') {
        expect(result.ruleId).toBe('ZERO_TRUST');
      }
    });

    it('allows calls from unregistered agents when zero-trust is OFF', async () => {
      runtimeProxy.setZeroTrust(false);
      const result = await runtimeProxy.enforce(
        'unknown-agent',
        'readBalance',
        { accountId: 'acc-1' },
        snapshot,
        async () => ({ balance: 1000 }),
      );
      expect(result.decision).toBe('ALLOWED');
    });
  });

  describe('Registered Agent — Contract Enforcement', () => {
    beforeEach(() => {
      runtimeProxy.registerAgent('finance-agent', BANKING_CONTRACT_YAML);
    });

    it('ALLOWS a permitted tool call', async () => {
      const result = await runtimeProxy.enforce(
        'finance-agent',
        'readBalance',
        { accountId: 'acc-1' },
        snapshot,
        async () => ({ balance: mockDb['acc-1'] }),
      );
      expect(result.decision).toBe('ALLOWED');
    });

    it('BLOCKS a tool not in the allow-list', async () => {
      const result = await runtimeProxy.enforce(
        'finance-agent',
        'closeAccount',
        { accountId: 'acc-1' },
        snapshot,
        async () => ({ success: true }),
      );
      expect(result.decision).toBe('BLOCKED');
      if (result.decision === 'BLOCKED') {
        expect(result.ruleId).toBe('rule_tool_allow');
        expect(result.reason).toContain('closeAccount');
      }
    });

    it('BLOCKS when a denied field is present', async () => {
      const result = await runtimeProxy.enforce(
        'finance-agent',
        'readBalance',
        { accountId: 'acc-1', ssn: '123-45-6789' },
        snapshot,
        async () => ({ balance: 1000 }),
      );
      expect(result.decision).toBe('BLOCKED');
      if (result.decision === 'BLOCKED') {
        expect(result.ruleId).toBe('rule_field_denial');
      }
    });

    it('captures different pre/post state hashes when data changes', async () => {
      const result = await runtimeProxy.enforce(
        'finance-agent',
        'transferMoney',
        { fromAccount: 'acc-1', toAccount: 'acc-2', amount: 100 },
        snapshot,
        async () => {
          mockDb['acc-1'] -= 100;
          mockDb['acc-2'] += 100;
          return { success: true };
        },
      );
      expect(result.decision).toBe('ALLOWED');
      if (result.decision === 'ALLOWED') {
        expect(result.preStateHash).not.toBe(result.postStateHash);
        expect(result.preStateHash).toHaveLength(64); // SHA-256
        expect(result.postStateHash).toHaveLength(64);
      }
    });

    it('captures identical pre/post state hashes on read-only calls', async () => {
      const result = await runtimeProxy.enforce(
        'finance-agent',
        'readBalance',
        { accountId: 'acc-1' },
        snapshot,
        async () => ({ balance: mockDb['acc-1'] }),
      );
      expect(result.decision).toBe('ALLOWED');
      if (result.decision === 'ALLOWED') {
        expect(result.preStateHash).toBe(result.postStateHash);
      }
    });
  });

  describe('Rate Limiting through proxy', () => {
    beforeEach(() => {
      runtimeProxy.registerAgent('finance-agent', BANKING_CONTRACT_YAML);
    });

    it('blocks after exceeding the rate limit', async () => {
      // Contract allows 5 calls/min
      for (let i = 0; i < 5; i++) {
        const result = await runtimeProxy.enforce(
          'finance-agent',
          'readBalance',
          { accountId: 'acc-1' },
          snapshot,
          async () => ({ balance: 1000 }),
        );
        expect(result.decision).toBe('ALLOWED');
      }

      // 6th call should be blocked
      const result = await runtimeProxy.enforce(
        'finance-agent',
        'readBalance',
        { accountId: 'acc-1' },
        snapshot,
        async () => ({ balance: 1000 }),
      );
      expect(result.decision).toBe('BLOCKED');
      if (result.decision === 'BLOCKED') {
        expect(result.ruleId).toBe('rule_rate_limit');
      }
    });
  });

  describe('Emergency Stop', () => {
    beforeEach(() => {
      runtimeProxy.registerAgent('finance-agent', BANKING_CONTRACT_YAML);
    });

    it('blocks ALL calls when emergency stop is active', async () => {
      runtimeProxy.activateEmergencyStop();

      const result = await runtimeProxy.enforce(
        'finance-agent',
        'readBalance',
        { accountId: 'acc-1' },
        snapshot,
        async () => ({ balance: 1000 }),
      );
      expect(result.decision).toBe('BLOCKED');
      if (result.decision === 'BLOCKED') {
        expect(result.ruleId).toBe('EMERGENCY_STOP');
      }
    });

    it('resumes normal operation after deactivating emergency stop', async () => {
      runtimeProxy.activateEmergencyStop();
      runtimeProxy.deactivateEmergencyStop();

      const result = await runtimeProxy.enforce(
        'finance-agent',
        'readBalance',
        { accountId: 'acc-1' },
        snapshot,
        async () => ({ balance: 1000 }),
      );
      expect(result.decision).toBe('ALLOWED');
    });

    it('blocks even unregistered agents during emergency stop', async () => {
      runtimeProxy.setZeroTrust(false);
      runtimeProxy.activateEmergencyStop();

      const result = await runtimeProxy.enforce(
        'random-agent',
        'whatever',
        {},
        snapshot,
        async () => ({}),
      );
      expect(result.decision).toBe('BLOCKED');
      if (result.decision === 'BLOCKED') {
        expect(result.ruleId).toBe('EMERGENCY_STOP');
      }
    });
  });

  describe('Audit Log', () => {
    it('records all enforcement outcomes', async () => {
      runtimeProxy.registerAgent('finance-agent', BANKING_CONTRACT_YAML);

      await runtimeProxy.enforce(
        'finance-agent',
        'readBalance',
        { accountId: 'acc-1' },
        snapshot,
        async () => ({ balance: 1000 }),
      );

      await runtimeProxy.enforce(
        'finance-agent',
        'closeAccount',
        { accountId: 'acc-1' },
        snapshot,
        async () => ({ success: true }),
      );

      expect(runtimeProxy.auditLog).toHaveLength(2);
      expect(runtimeProxy.auditLog[0].decision).toBe('ALLOWED');
      expect(runtimeProxy.auditLog[1].decision).toBe('BLOCKED');
    });
  });
});
