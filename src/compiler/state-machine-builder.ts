/**
 * state-machine-builder.ts
 *
 * Compiles a CapabilityIR into a deterministic finite-state
 * enforcement machine.  Zero LLM calls — every decision is
 * 100 % explainable and reproducible.
 *
 * Runtime state tracks mutable counters (rate-limit windows,
 * cumulative financial amounts).  The state machine itself
 * is a pure function: (state, action) -> decision.
 */

import { CapabilityIR, Predicate } from './ir-compiler';

// ── Public types ──────────────────────────────────────────────────

export type Decision = 'ALLOW' | 'BLOCK';

export interface EvaluationResult {
  decision: Decision;
  matchedRule: string | null;
  reason: string;
}

/**
 * A proposed action the runtime wants to check against the contract.
 */
export interface ProposedAction {
  toolName: string;
  params: Record<string, unknown>;
  /** ISO-8601 timestamp or epoch ms — defaults to now */
  timestamp?: number;
}

/**
 * Mutable runtime state tracked across calls.
 */
export interface EnforcementState {
  /** Contract activation timestamp (epoch ms) */
  activatedAt: number;
  /** Sliding-window call log: timestamps of prior calls */
  callTimestamps: number[];
  /** Cumulative financial amount processed */
  cumulativeFinancial: number;
}

/**
 * The compiled enforcement machine.
 */
export interface EnforcementMachine {
  /** The agent this machine is bound to */
  agent: string;
  /** Ordered predicates (for inspection / serialisation) */
  predicates: Predicate[];
  /** Create a fresh runtime state */
  createInitialState: () => EnforcementState;
  /** Pure decision function — does NOT mutate state */
  evaluate: (state: EnforcementState, action: ProposedAction) => EvaluationResult;
  /** Produce a new state reflecting an ALLOWED action */
  updateState: (state: EnforcementState, action: ProposedAction) => EnforcementState;
  /** JSON-serialisable representation for Prisma storage */
  toJSON: () => object;
}

// ── Builder ───────────────────────────────────────────────────────

export function buildEnforcementMachine(ir: CapabilityIR): EnforcementMachine {
  const predicates = ir.predicates;

  function createInitialState(): EnforcementState {
    return {
      activatedAt: Date.now(),
      callTimestamps: [],
      cumulativeFinancial: 0,
    };
  }

  function evaluate(state: EnforcementState, action: ProposedAction): EvaluationResult {
    const now = action.timestamp ?? Date.now();

    for (const pred of predicates) {
      switch (pred.type) {

        // ── 1. Tool allow-list ────────────────────────────────
        case 'tool_allow': {
          if (!pred.tools.includes(action.toolName)) {
            return {
              decision: 'BLOCK',
              matchedRule: pred.id,
              reason: `Tool "${action.toolName}" is not in the allowed list [${pred.tools.join(', ')}]`,
            };
          }
          break;
        }

        // ── 2. Field denial ───────────────────────────────────
        case 'field_denial': {
          const paramKeys = Object.keys(action.params);
          const denied = pred.fields.filter(f => paramKeys.includes(f));
          if (denied.length > 0) {
            return {
              decision: 'BLOCK',
              matchedRule: pred.id,
              reason: `Denied field(s) present in params: [${denied.join(', ')}]`,
            };
          }
          break;
        }

        // ── 3. Rate limit ─────────────────────────────────────
        case 'rate_limit': {
          const windowStart = now - pred.windowMs;
          const recentCalls = state.callTimestamps.filter(t => t > windowStart);
          if (recentCalls.length >= pred.value) {
            return {
              decision: 'BLOCK',
              matchedRule: pred.id,
              reason: `Rate limit exceeded: ${recentCalls.length}/${pred.value} calls in ${pred.window}`,
            };
          }
          break;
        }

        // ── 4. Financial cap ──────────────────────────────────
        case 'financial_cap': {
          const amount = extractFinancialAmount(action.params);
          if (amount !== null && (state.cumulativeFinancial + amount) > pred.max) {
            return {
              decision: 'BLOCK',
              matchedRule: pred.id,
              reason: `Financial cap exceeded: cumulative ${state.cumulativeFinancial} + ${amount} > ${pred.max}`,
            };
          }
          break;
        }

        // ── 5. Expiry ─────────────────────────────────────────
        case 'expiry': {
          if (now > state.activatedAt + pred.durationMs) {
            return {
              decision: 'BLOCK',
              matchedRule: pred.id,
              reason: `Contract expired: activated at ${state.activatedAt}, duration ${pred.durationMs}ms, now ${now}`,
            };
          }
          break;
        }

        // ── 6. Delegation restriction (informational — not a block rule on its own) ──
        case 'delegation_restriction': {
          // Delegation restrictions are enforced at the delegation layer,
          // not at tool-call time. This predicate exists in the IR for
          // completeness and serialisation; the runtime enforcement engine
          // simply acknowledges it.
          break;
        }
      }
    }

    return { decision: 'ALLOW', matchedRule: null, reason: 'All predicates passed' };
  }

  function updateState(state: EnforcementState, action: ProposedAction): EnforcementState {
    const now = action.timestamp ?? Date.now();
    const amount = extractFinancialAmount(action.params);
    return {
      ...state,
      callTimestamps: [...state.callTimestamps, now],
      cumulativeFinancial: state.cumulativeFinancial + (amount ?? 0),
    };
  }

  function toJSON(): object {
    return {
      agent: ir.agent,
      predicates: predicates.map(p => ({ ...p })),
      version: '1.0',
      compiledAt: new Date().toISOString(),
    };
  }

  return {
    agent: ir.agent,
    predicates,
    createInitialState,
    evaluate,
    updateState,
    toJSON,
  };
}

// ── Helpers ───────────────────────────────────────────────────────

/**
 * Attempt to extract a financial amount from action params.
 * Looks for common field names: "amount", "value", "total".
 */
function extractFinancialAmount(params: Record<string, unknown>): number | null {
  for (const key of ['amount', 'value', 'total']) {
    if (typeof params[key] === 'number') {
      return params[key] as number;
    }
  }
  return null;
}
