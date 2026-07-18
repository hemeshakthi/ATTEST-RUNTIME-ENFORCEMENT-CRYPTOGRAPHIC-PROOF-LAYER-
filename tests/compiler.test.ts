/**
 * compiler.test.ts
 *
 * Unit tests for the Attest contract compiler pipeline.
 * Covers:
 *   1. Valid contract compiles successfully
 *   2. Invalid YAML rejected with clear error
 *   3. Conflicting rules flagged
 *   4. Rate limiting works correctly across multiple calls
 *   5. Financial cap enforcement
 *   6. Contract expiry
 *   7. Field denial
 *   8. Simulator coverage reporting
 */

import { describe, it, expect } from 'vitest';
import { compileYamlToIR } from '../src/compiler/ir-compiler';
import { buildEnforcementMachine, ProposedAction, EnforcementState } from '../src/compiler/state-machine-builder';
import { runSimulation } from '../src/compiler/simulator';
import { CompilerService } from '../src/compiler/compiler.service';

// ── Fixtures ──────────────────────────────────────────────────────

const VALID_CONTRACT_YAML = `
agent: finance-bot
allowed_tools:
  - readBalance
  - transferMoney
denied_fields:
  - ssn
  - password
rate_limit: "10/min"
financial_threshold: 50000
expires: "24h"
non_delegatable: false
`.trim();

const MINIMAL_CONTRACT_YAML = `
agent: simple-bot
allowed_tools:
  - ping
denied_fields: []
rate_limit: "100/hour"
expires: "7d"
non_delegatable: true
`.trim();

const INVALID_YAML_NO_AGENT = `
allowed_tools:
  - readBalance
rate_limit: "10/min"
expires: "24h"
`.trim();

const INVALID_YAML_BAD_RATE = `
agent: test
allowed_tools:
  - foo
rate_limit: "abc"
expires: "24h"
`.trim();

const INVALID_YAML_SYNTAX = `
agent: test
allowed_tools: [unclosed bracket
`.trim();

// ── Test suites ───────────────────────────────────────────────────

describe('Contract Schema & IR Compiler', () => {

  it('compiles a valid YAML contract into IR', () => {
    const ir = compileYamlToIR(VALID_CONTRACT_YAML);
    expect(ir.agent).toBe('finance-bot');
    expect(ir.predicates.length).toBeGreaterThanOrEqual(5);

    const types = ir.predicates.map(p => p.type);
    expect(types).toContain('tool_allow');
    expect(types).toContain('field_denial');
    expect(types).toContain('rate_limit');
    expect(types).toContain('financial_cap');
    expect(types).toContain('expiry');
    expect(types).toContain('delegation_restriction');
  });

  it('compiles a minimal contract (no financial_threshold, no denied_fields)', () => {
    const ir = compileYamlToIR(MINIMAL_CONTRACT_YAML);
    expect(ir.agent).toBe('simple-bot');

    const types = ir.predicates.map(p => p.type);
    expect(types).not.toContain('field_denial');
    expect(types).not.toContain('financial_cap');
    expect(types).toContain('tool_allow');
    expect(types).toContain('rate_limit');
    expect(types).toContain('expiry');
  });

  it('rejects YAML with missing required fields', () => {
    expect(() => compileYamlToIR(INVALID_YAML_NO_AGENT)).toThrow();
  });

  it('rejects YAML with invalid rate_limit format', () => {
    expect(() => compileYamlToIR(INVALID_YAML_BAD_RATE)).toThrow();
  });

  it('rejects malformed YAML syntax', () => {
    expect(() => compileYamlToIR(INVALID_YAML_SYNTAX)).toThrow();
  });
});

describe('Enforcement State Machine', () => {

  function createMachine() {
    const ir = compileYamlToIR(VALID_CONTRACT_YAML);
    return buildEnforcementMachine(ir);
  }

  it('ALLOWS a valid tool call', () => {
    const machine = createMachine();
    const state = machine.createInitialState();
    const result = machine.evaluate(state, {
      toolName: 'readBalance',
      params: { accountId: 'acc-1' },
      timestamp: state.activatedAt + 1000,
    });
    expect(result.decision).toBe('ALLOW');
  });

  it('BLOCKS a tool not in the allow-list', () => {
    const machine = createMachine();
    const state = machine.createInitialState();
    const result = machine.evaluate(state, {
      toolName: 'deleteEverything',
      params: {},
      timestamp: state.activatedAt + 1000,
    });
    expect(result.decision).toBe('BLOCK');
    expect(result.matchedRule).toBe('rule_tool_allow');
  });

  it('BLOCKS when a denied field is present in params', () => {
    const machine = createMachine();
    const state = machine.createInitialState();
    const result = machine.evaluate(state, {
      toolName: 'transferMoney',
      params: { ssn: '123-45-6789', amount: 100 },
      timestamp: state.activatedAt + 1000,
    });
    expect(result.decision).toBe('BLOCK');
    expect(result.matchedRule).toBe('rule_field_denial');
  });

  it('BLOCKS when rate limit is exceeded', () => {
    const machine = createMachine();
    let state = machine.createInitialState();
    const baseTime = state.activatedAt;

    // Make 10 calls (the limit)
    for (let i = 0; i < 10; i++) {
      const action: ProposedAction = {
        toolName: 'readBalance',
        params: { accountId: 'acc-1' },
        timestamp: baseTime + i * 100,
      };
      const res = machine.evaluate(state, action);
      expect(res.decision).toBe('ALLOW');
      state = machine.updateState(state, action);
    }

    // The 11th call should be BLOCKED
    const overflow: ProposedAction = {
      toolName: 'readBalance',
      params: { accountId: 'acc-1' },
      timestamp: baseTime + 10 * 100 + 1,
    };
    const result = machine.evaluate(state, overflow);
    expect(result.decision).toBe('BLOCK');
    expect(result.matchedRule).toBe('rule_rate_limit');
    expect(result.reason).toContain('Rate limit exceeded');
  });

  it('ALLOWS again after the rate-limit window expires', () => {
    const machine = createMachine();
    let state = machine.createInitialState();
    const baseTime = state.activatedAt;

    // Fill the rate-limit window
    for (let i = 0; i < 10; i++) {
      const action: ProposedAction = {
        toolName: 'readBalance',
        params: {},
        timestamp: baseTime + i * 100,
      };
      state = machine.updateState(state, action);
    }

    // Wait for the window to expire (1 minute = 60000ms)
    const afterWindow: ProposedAction = {
      toolName: 'readBalance',
      params: {},
      timestamp: baseTime + 61_000,
    };
    const result = machine.evaluate(state, afterWindow);
    expect(result.decision).toBe('ALLOW');
  });

  it('BLOCKS when financial cap is exceeded', () => {
    const machine = createMachine();
    let state = machine.createInitialState();
    const baseTime = state.activatedAt;

    // Transfer $49,000 (under the $50,000 cap)
    const action1: ProposedAction = {
      toolName: 'transferMoney',
      params: { amount: 49_000 },
      timestamp: baseTime + 1000,
    };
    const res1 = machine.evaluate(state, action1);
    expect(res1.decision).toBe('ALLOW');
    state = machine.updateState(state, action1);

    // Transfer another $2,000 (would exceed $50,000)
    const action2: ProposedAction = {
      toolName: 'transferMoney',
      params: { amount: 2_000 },
      timestamp: baseTime + 2000,
    };
    const res2 = machine.evaluate(state, action2);
    expect(res2.decision).toBe('BLOCK');
    expect(res2.matchedRule).toBe('rule_financial_cap');
  });

  it('BLOCKS after contract expires', () => {
    const machine = createMachine();
    const state = machine.createInitialState();

    // 24h = 86,400,000ms. Try calling after 25h.
    const expired: ProposedAction = {
      toolName: 'readBalance',
      params: {},
      timestamp: state.activatedAt + 90_000_000,
    };
    const result = machine.evaluate(state, expired);
    expect(result.decision).toBe('BLOCK');
    expect(result.matchedRule).toBe('rule_expiry');
  });

  it('serializes to JSON for Prisma storage', () => {
    const machine = createMachine();
    const json = machine.toJSON();
    expect(json).toHaveProperty('agent', 'finance-bot');
    expect(json).toHaveProperty('predicates');
    expect(json).toHaveProperty('version', '1.0');
    expect(json).toHaveProperty('compiledAt');

    // Ensure it round-trips through JSON
    const str = JSON.stringify(json);
    const parsed = JSON.parse(str);
    expect(parsed.predicates.length).toBeGreaterThanOrEqual(5);
  });
});

describe('Simulator', () => {

  it('produces a full simulation report', () => {
    const ir = compileYamlToIR(VALID_CONTRACT_YAML);
    const machine = buildEnforcementMachine(ir);
    const report = runSimulation(machine, 20);

    expect(report.scenarioCount).toBeGreaterThanOrEqual(10);
    expect(report.passCount + report.failCount).toBe(report.scenarioCount);
    expect(report.coveragePercent).toBeGreaterThanOrEqual(50);
    expect(Array.isArray(report.deadRules)).toBe(true);
    expect(Array.isArray(report.conflictingRules)).toBe(true);
  });

  it('detects rate-limit exhaustion scenario', () => {
    const ir = compileYamlToIR(VALID_CONTRACT_YAML);
    const machine = buildEnforcementMachine(ir);
    const report = runSimulation(machine, 20);

    const rlScenario = report.scenarios.find(s => s.name === 'rate_limit_exhausted');
    expect(rlScenario).toBeDefined();
    expect(rlScenario!.result.decision).toBe('BLOCK');
    expect(rlScenario!.pass).toBe(true);
  });

  it('detects financial cap violation', () => {
    const ir = compileYamlToIR(VALID_CONTRACT_YAML);
    const machine = buildEnforcementMachine(ir);
    const report = runSimulation(machine, 20);

    const fcScenario = report.scenarios.find(s => s.name === 'financial_cap_exceeded');
    expect(fcScenario).toBeDefined();
    expect(fcScenario!.result.decision).toBe('BLOCK');
    expect(fcScenario!.pass).toBe(true);
  });

  it('detects contract expiry scenario', () => {
    const ir = compileYamlToIR(VALID_CONTRACT_YAML);
    const machine = buildEnforcementMachine(ir);
    const report = runSimulation(machine, 20);

    const expiryScenario = report.scenarios.find(s => s.name === 'contract_expired');
    expect(expiryScenario).toBeDefined();
    expect(expiryScenario!.result.decision).toBe('BLOCK');
    expect(expiryScenario!.pass).toBe(true);
  });
});

describe('CompilerService (validate only, no DB)', () => {

  const service = new CompilerService();

  it('validate() returns valid for a correct contract', () => {
    const result = service.validate(VALID_CONTRACT_YAML);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('validate() returns errors for invalid contract', () => {
    const result = service.validate(INVALID_YAML_NO_AGENT);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('validate() returns errors for bad YAML syntax', () => {
    const result = service.validate(INVALID_YAML_SYNTAX);
    expect(result.valid).toBe(false);
  });

  it('compile() produces IR + machine without DB', () => {
    const result = service.compile(VALID_CONTRACT_YAML);
    expect(result.ir.agent).toBe('finance-bot');
    expect(result.machine.agent).toBe('finance-bot');
    expect(result.simulation).toBeNull();
  });

  it('compile() with simulation produces a report', () => {
    const result = service.compile(VALID_CONTRACT_YAML, { simulate: true, scenarioCount: 10 });
    expect(result.simulation).not.toBeNull();
    expect(result.simulation!.scenarioCount).toBeGreaterThanOrEqual(5);
  });
});
