/**
 * simulator.ts
 *
 * Given a compiled contract (enforcement machine), runs N synthetic
 * scenarios — a mix of realistic valid calls and deliberately
 * violating edge cases — then reports:
 *   • pass / fail per scenario
 *   • coverage %  (which predicates were exercised)
 *   • dead rules  (predicates never triggered a BLOCK)
 *   • conflicting rules (predicates that both ALLOW and BLOCK for
 *     seemingly-similar inputs — heuristic detection)
 */

import {
  EnforcementMachine,
  EnforcementState,
  ProposedAction,
  EvaluationResult,
} from './state-machine-builder';
import { Predicate } from './ir-compiler';

// ── Public types ──────────────────────────────────────────────────

export interface ScenarioResult {
  name: string;
  action: ProposedAction;
  result: EvaluationResult;
  /** true if the result matched what we expected */
  pass: boolean;
  expectedDecision: 'ALLOW' | 'BLOCK';
}

export interface SimulationReport {
  scenarioCount: number;
  passCount: number;
  failCount: number;
  coveragePercent: number;
  deadRules: string[];
  conflictingRules: string[];
  scenarios: ScenarioResult[];
}

// ── Simulator ─────────────────────────────────────────────────────

export function runSimulation(
  machine: EnforcementMachine,
  scenarioCount: number = 20,
): SimulationReport {
  const scenarios: ScenarioResult[] = [];
  const predicates = machine.predicates;

  // Track which rules ever produced a BLOCK
  const blockedByRule = new Set<string>();
  // Track which rules were evaluated (all predicates up to the
  // first BLOCK are "exercised" on each call)
  const exercisedRules = new Set<string>();

  let state = machine.createInitialState();

  // ── Generate scenarios ────────────────────────────────────────

  // Category 1: Valid calls that should be ALLOWED
  const allowedTools = getToolAllowList(predicates);
  for (let i = 0; i < Math.ceil(scenarioCount * 0.4); i++) {
    const tool = allowedTools[i % allowedTools.length] ?? 'unknownTool';
    const action: ProposedAction = {
      toolName: tool,
      params: { data: `scenario-${i}` },
      timestamp: state.activatedAt + i * 1000,
    };
    const expected: 'ALLOW' | 'BLOCK' = 'ALLOW';
    const result = machine.evaluate(state, action);
    recordExercised(predicates, result, exercisedRules, blockedByRule);
    if (result.decision === 'ALLOW') {
      state = machine.updateState(state, action);
    }
    scenarios.push({
      name: `valid_call_${i}`,
      action,
      result,
      pass: result.decision === expected,
      expectedDecision: expected,
    });
  }

  // Category 2: Denied tool calls (should be BLOCKED)
  for (let i = 0; i < Math.ceil(scenarioCount * 0.15); i++) {
    const action: ProposedAction = {
      toolName: `__forbidden_tool_${i}`,
      params: {},
      timestamp: state.activatedAt + i * 1000,
    };
    const result = machine.evaluate(state, action);
    recordExercised(predicates, result, exercisedRules, blockedByRule);
    scenarios.push({
      name: `denied_tool_${i}`,
      action,
      result,
      pass: result.decision === 'BLOCK',
      expectedDecision: 'BLOCK',
    });
  }

  // Category 3: Denied fields (should be BLOCKED if field_denial exists)
  const deniedFields = getDeniedFields(predicates);
  if (deniedFields.length > 0) {
    for (let i = 0; i < Math.ceil(scenarioCount * 0.1); i++) {
      const tool = allowedTools[0] ?? 'someTool';
      const params: Record<string, unknown> = {};
      params[deniedFields[i % deniedFields.length]] = 'sensitive-value';
      const action: ProposedAction = {
        toolName: tool,
        params,
        timestamp: state.activatedAt + i * 1000,
      };
      const result = machine.evaluate(state, action);
      recordExercised(predicates, result, exercisedRules, blockedByRule);
      scenarios.push({
        name: `denied_field_${i}`,
        action,
        result,
        pass: result.decision === 'BLOCK',
        expectedDecision: 'BLOCK',
      });
    }
  }

  // Category 4: Financial cap exceeded (should be BLOCKED)
  const financialCap = getFinancialCap(predicates);
  if (financialCap !== null) {
    // Reset state so cumulative is 0, then attempt one big tx
    const freshState = machine.createInitialState();
    const action: ProposedAction = {
      toolName: allowedTools[0] ?? 'someTool',
      params: { amount: financialCap + 1 },
      timestamp: freshState.activatedAt + 100,
    };
    const result = machine.evaluate(freshState, action);
    recordExercised(predicates, result, exercisedRules, blockedByRule);
    scenarios.push({
      name: 'financial_cap_exceeded',
      action,
      result,
      pass: result.decision === 'BLOCK',
      expectedDecision: 'BLOCK',
    });
  }

  // Category 5: Expired contract (should be BLOCKED)
  {
    const expiryPred = predicates.find(p => p.type === 'expiry');
    if (expiryPred && expiryPred.type === 'expiry') {
      const expiredState = machine.createInitialState();
      const action: ProposedAction = {
        toolName: allowedTools[0] ?? 'someTool',
        params: {},
        timestamp: expiredState.activatedAt + expiryPred.durationMs + 1000,
      };
      const result = machine.evaluate(expiredState, action);
      recordExercised(predicates, result, exercisedRules, blockedByRule);
      scenarios.push({
        name: 'contract_expired',
        action,
        result,
        pass: result.decision === 'BLOCK',
        expectedDecision: 'BLOCK',
      });
    }
  }

  // Category 6: Rate-limit exhaustion (rapid-fire calls)
  {
    const rlPred = predicates.find(p => p.type === 'rate_limit');
    if (rlPred && rlPred.type === 'rate_limit') {
      let rlState = machine.createInitialState();
      const tool = allowedTools[0] ?? 'someTool';
      // Fill up the window
      for (let i = 0; i < rlPred.value; i++) {
        const action: ProposedAction = {
          toolName: tool,
          params: {},
          timestamp: rlState.activatedAt + i * 10,
        };
        const res = machine.evaluate(rlState, action);
        if (res.decision === 'ALLOW') {
          rlState = machine.updateState(rlState, action);
        }
      }
      // The next call should be blocked
      const overflowAction: ProposedAction = {
        toolName: tool,
        params: {},
        timestamp: rlState.activatedAt + rlPred.value * 10 + 1,
      };
      const result = machine.evaluate(rlState, overflowAction);
      recordExercised(predicates, result, exercisedRules, blockedByRule);
      scenarios.push({
        name: 'rate_limit_exhausted',
        action: overflowAction,
        result,
        pass: result.decision === 'BLOCK',
        expectedDecision: 'BLOCK',
      });
    }
  }

  // ── Compute report ────────────────────────────────────────────

  const passCount = scenarios.filter(s => s.pass).length;
  const failCount = scenarios.length - passCount;

  // Coverage: fraction of predicate IDs that were exercised
  const allRuleIds = predicates.map(p => p.id);
  const coveragePercent = allRuleIds.length > 0
    ? Math.round((exercisedRules.size / allRuleIds.length) * 100)
    : 100;

  // Dead rules: predicates that never triggered a BLOCK in any scenario
  // (delegation_restriction is excluded since it doesn't block at tool-call time)
  const deadRules = allRuleIds.filter(
    id => !blockedByRule.has(id) && !id.includes('delegation'),
  );

  // Conflicting rules: heuristic — if the same tool was both
  // ALLOWED and BLOCKED (by different predicates) that's a signal
  const toolDecisions = new Map<string, Set<string>>();
  for (const s of scenarios) {
    const tool = s.action.toolName;
    if (!toolDecisions.has(tool)) toolDecisions.set(tool, new Set());
    toolDecisions.get(tool)!.add(s.result.decision);
  }
  const conflictingRules: string[] = [];
  for (const [tool, decisions] of toolDecisions) {
    if (decisions.has('ALLOW') && decisions.has('BLOCK')) {
      // This is expected for tools that get rate-limited or hit
      // financial caps. Only flag if the BLOCK came from tool_allow
      // (actual allow-list conflict).
      const toolBlocked = scenarios.find(
        s => s.action.toolName === tool && s.result.decision === 'BLOCK'
          && s.result.matchedRule === 'rule_tool_allow',
      );
      if (toolBlocked) {
        conflictingRules.push(`Tool "${tool}" is both allowed and denied by tool_allow rule`);
      }
    }
  }

  return {
    scenarioCount: scenarios.length,
    passCount,
    failCount,
    coveragePercent,
    deadRules,
    conflictingRules,
    scenarios,
  };
}

// ── Internal helpers ──────────────────────────────────────────────

function recordExercised(
  predicates: Predicate[],
  result: EvaluationResult,
  exercised: Set<string>,
  blocked: Set<string>,
): void {
  // All predicates up to (and including) the matched one were exercised
  for (const p of predicates) {
    exercised.add(p.id);
    if (result.matchedRule === p.id) {
      blocked.add(p.id);
      break;
    }
  }
}

function getToolAllowList(predicates: Predicate[]): string[] {
  const pred = predicates.find(p => p.type === 'tool_allow');
  return pred && pred.type === 'tool_allow' ? pred.tools : [];
}

function getDeniedFields(predicates: Predicate[]): string[] {
  const pred = predicates.find(p => p.type === 'field_denial');
  return pred && pred.type === 'field_denial' ? pred.fields : [];
}

function getFinancialCap(predicates: Predicate[]): number | null {
  const pred = predicates.find(p => p.type === 'financial_cap');
  return pred && pred.type === 'financial_cap' ? pred.max : null;
}
