/**
 * delegation.test.ts
 *
 * Tests for the capability delegation system.
 * Covers:
 *   1. Capability intersection logic (pure, no DB)
 *   2. Tools are intersected (child ∩ parent)
 *   3. Denied fields are unioned (child ∪ parent)
 *   4. Rate limits take the minimum
 *   5. Financial thresholds take the minimum
 *   6. Non-delegatable blocks further delegation
 *   7. Child requesting tools outside parent's grant is rejected
 *   8. Full delegation chain: CEO -> Finance -> Payroll enforcement
 */

import { describe, it, expect } from 'vitest';
import { compileDelegatedContractPure } from '../src/modules/agents/delegation.service';
import { compileYamlToIR, buildEnforcementMachine } from '../src/compiler';
import type { CapabilityIR } from '../src/compiler';

// ── Parent contract (CEO-level: broad permissions) ────────────────

const CEO_CONTRACT_YAML = `
agent: ceo-agent
allowed_tools:
  - readBalance
  - transferMoney
  - closeAccount
  - checkLeaveBalance
  - approveLeave
  - approvePayroll
denied_fields:
  - ssn
rate_limit: "100/min"
financial_threshold: 1000000
expires: "30d"
non_delegatable: false
`.trim();

// ── Finance Agent contract (subset of CEO) ────────────────────────

const FINANCE_CONTRACT_YAML = `
agent: finance-agent
allowed_tools:
  - readBalance
  - transferMoney
  - approvePayroll
denied_fields:
  - password
rate_limit: "50/min"
financial_threshold: 500000
expires: "7d"
non_delegatable: false
`.trim();

// ── Payroll Agent contract (subset of Finance) ────────────────────

const PAYROLL_CONTRACT_YAML = `
agent: payroll-agent
allowed_tools:
  - approvePayroll
denied_fields:
  - bankAccount
rate_limit: "10/min"
financial_threshold: 50000
expires: "1d"
non_delegatable: true
`.trim();

// ── Greedy contract (tries to exceed parent) ──────────────────────

const GREEDY_CONTRACT_YAML = `
agent: greedy-agent
allowed_tools:
  - readBalance
  - transferMoney
  - closeAccount
  - deleteDatabase
denied_fields: []
rate_limit: "50/min"
financial_threshold: 500000
expires: "7d"
non_delegatable: false
`.trim();

// ── No-overlap contract ───────────────────────────────────────────

const NO_OVERLAP_YAML = `
agent: rogue-agent
allowed_tools:
  - deleteDatabase
  - dropTable
denied_fields: []
rate_limit: "5/min"
expires: "1h"
non_delegatable: false
`.trim();

// ── Tests ─────────────────────────────────────────────────────────

describe('Capability Delegation', () => {
  let ceoIR: CapabilityIR;
  let financeIR: CapabilityIR;

  // Compile parent IRs once
  ceoIR = compileYamlToIR(CEO_CONTRACT_YAML);
  financeIR = compileYamlToIR(FINANCE_CONTRACT_YAML);

  describe('Tool Intersection', () => {
    it('intersects child tools with parent tools', () => {
      const result = compileDelegatedContractPure(ceoIR, FINANCE_CONTRACT_YAML);
      expect(result.contract.allowed_tools).toEqual([
        'readBalance', 'transferMoney', 'approvePayroll',
      ]);
    });

    it('removes tools not in parent\'s allow list', () => {
      const result = compileDelegatedContractPure(ceoIR, GREEDY_CONTRACT_YAML);
      // deleteDatabase is not in CEO's list, should be removed
      expect(result.contract.allowed_tools).not.toContain('deleteDatabase');
      expect(result.contract.allowed_tools).toEqual([
        'readBalance', 'transferMoney', 'closeAccount',
      ]);
      expect(result.narrowedFields).toContainEqual(
        expect.stringContaining('deleteDatabase'),
      );
    });

    it('throws when no tools overlap', () => {
      expect(() =>
        compileDelegatedContractPure(ceoIR, NO_OVERLAP_YAML),
      ).toThrow(/no overlap/i);
    });
  });

  describe('Denied Fields Union', () => {
    it('unions parent and child denied fields', () => {
      const result = compileDelegatedContractPure(ceoIR, FINANCE_CONTRACT_YAML);
      // CEO denies: ssn, Finance denies: password → union
      expect(result.contract.denied_fields).toContain('ssn');
      expect(result.contract.denied_fields).toContain('password');
    });
  });

  describe('Rate Limit Minimum', () => {
    it('takes the stricter (lower) rate limit', () => {
      const result = compileDelegatedContractPure(ceoIR, FINANCE_CONTRACT_YAML);
      // CEO: 100/min, Finance: 50/min → 50/min
      expect(result.contract.rate_limit).toBe('50/min');
    });

    it('narrows child rate limit to parent when parent is stricter', () => {
      // Finance: 50/min, Payroll requests 10/min → 10/min (already stricter)
      const result = compileDelegatedContractPure(financeIR, PAYROLL_CONTRACT_YAML);
      expect(result.contract.rate_limit).toBe('10/min');
    });
  });

  describe('Financial Threshold Minimum', () => {
    it('takes the lower financial threshold', () => {
      const result = compileDelegatedContractPure(ceoIR, FINANCE_CONTRACT_YAML);
      // CEO: 1000000, Finance: 500000 → 500000
      expect(result.contract.financial_threshold).toBe(500000);
    });

    it('narrows to parent threshold when child exceeds it', () => {
      // Finance: 500000, Payroll: 50000 → 50000
      const result = compileDelegatedContractPure(financeIR, PAYROLL_CONTRACT_YAML);
      expect(result.contract.financial_threshold).toBe(50000);
    });
  });

  describe('Non-Delegatable Flag', () => {
    it('propagates non_delegatable=true from child', () => {
      const result = compileDelegatedContractPure(financeIR, PAYROLL_CONTRACT_YAML);
      expect(result.contract.non_delegatable).toBe(true);
    });

    it('allows delegation when both parent and child say false', () => {
      const result = compileDelegatedContractPure(ceoIR, FINANCE_CONTRACT_YAML);
      expect(result.contract.non_delegatable).toBe(false);
    });
  });

  describe('Full Delegation Chain Enforcement', () => {
    it('CEO -> Finance -> Payroll: payroll agent can only approvePayroll', () => {
      // Step 1: CEO delegates to Finance
      const finResult = compileDelegatedContractPure(ceoIR, FINANCE_CONTRACT_YAML);
      
      // Step 2: Finance delegates to Payroll
      const payResult = compileDelegatedContractPure(finResult.ir, PAYROLL_CONTRACT_YAML);

      // Payroll's final contract should ONLY have approvePayroll
      expect(payResult.contract.allowed_tools).toEqual(['approvePayroll']);
      
      // Payroll should inherit ALL denied fields from the chain
      expect(payResult.contract.denied_fields).toContain('ssn');
      expect(payResult.contract.denied_fields).toContain('password');
      expect(payResult.contract.denied_fields).toContain('bankAccount');

      // Financial threshold should be 50000
      expect(payResult.contract.financial_threshold).toBe(50000);

      // Should be non-delegatable
      expect(payResult.contract.non_delegatable).toBe(true);
    });

    it('payroll agent is BLOCKED from transferMoney', () => {
      // Build the full chain
      const finResult = compileDelegatedContractPure(ceoIR, FINANCE_CONTRACT_YAML);
      const payResult = compileDelegatedContractPure(finResult.ir, PAYROLL_CONTRACT_YAML);

      // Build the enforcement machine
      const machine = buildEnforcementMachine(payResult.ir);
      const state = machine.createInitialState();

      // Try transferMoney — should be BLOCKED
      const evalResult = machine.evaluate(state, {
        toolName: 'transferMoney',
        params: { amount: 1000 },
      });
      expect(evalResult.decision).toBe('BLOCK');
      expect(evalResult.reason).toContain('transferMoney');
      expect(evalResult.reason).toContain('not in the allowed list');
    });

    it('payroll agent is BLOCKED from closeAccount', () => {
      const finResult = compileDelegatedContractPure(ceoIR, FINANCE_CONTRACT_YAML);
      const payResult = compileDelegatedContractPure(finResult.ir, PAYROLL_CONTRACT_YAML);
      const machine = buildEnforcementMachine(payResult.ir);
      const state = machine.createInitialState();

      const evalResult = machine.evaluate(state, {
        toolName: 'closeAccount',
        params: { accountId: 'acc-1' },
      });
      expect(evalResult.decision).toBe('BLOCK');
    });

    it('payroll agent is ALLOWED approvePayroll under threshold', () => {
      const finResult = compileDelegatedContractPure(ceoIR, FINANCE_CONTRACT_YAML);
      const payResult = compileDelegatedContractPure(finResult.ir, PAYROLL_CONTRACT_YAML);
      const machine = buildEnforcementMachine(payResult.ir);
      const state = machine.createInitialState();

      const evalResult = machine.evaluate(state, {
        toolName: 'approvePayroll',
        params: { amount: 30000 },
      });
      expect(evalResult.decision).toBe('ALLOW');
    });

    it('payroll agent is BLOCKED from approvePayroll exceeding ₹50,000', () => {
      const finResult = compileDelegatedContractPure(ceoIR, FINANCE_CONTRACT_YAML);
      const payResult = compileDelegatedContractPure(finResult.ir, PAYROLL_CONTRACT_YAML);
      const machine = buildEnforcementMachine(payResult.ir);
      const state = machine.createInitialState();

      const evalResult = machine.evaluate(state, {
        toolName: 'approvePayroll',
        params: { amount: 60000 },
      });
      expect(evalResult.decision).toBe('BLOCK');
      expect(evalResult.matchedRule).toBe('rule_financial_cap');
    });

    it('payroll agent is BLOCKED from accessing denied fields', () => {
      const finResult = compileDelegatedContractPure(ceoIR, FINANCE_CONTRACT_YAML);
      const payResult = compileDelegatedContractPure(finResult.ir, PAYROLL_CONTRACT_YAML);
      const machine = buildEnforcementMachine(payResult.ir);
      const state = machine.createInitialState();

      const evalResult = machine.evaluate(state, {
        toolName: 'approvePayroll',
        params: { amount: 1000, ssn: '123-45-6789' },
      });
      expect(evalResult.decision).toBe('BLOCK');
      expect(evalResult.matchedRule).toBe('rule_field_denial');
    });
  });
});
