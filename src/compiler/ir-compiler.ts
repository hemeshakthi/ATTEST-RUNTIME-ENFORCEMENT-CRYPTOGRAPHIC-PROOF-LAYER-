/**
 * ir-compiler.ts
 *
 * Parses a validated CapabilityContract into a Capability IR —
 * a structured, ordered list of typed enforcement predicates.
 *
 * The IR is the canonical intermediate representation that the
 * state-machine builder consumes. Each predicate maps 1:1 to a
 * rule the runtime will evaluate deterministically.
 */

import { parse as parseYaml } from 'yaml';
import {
  CapabilityContractSchema,
  CapabilityContract,
  parseRateLimit,
  parseExpiry,
} from './contract-schema';

// ── Predicate Types ───────────────────────────────────────────────

export type Predicate =
  | ToolAllowPredicate
  | FieldDenialPredicate
  | RateLimitPredicate
  | FinancialCapPredicate
  | ExpiryPredicate
  | DelegationRestrictionPredicate;

export interface ToolAllowPredicate {
  id: string;
  type: 'tool_allow';
  tools: string[];
}

export interface FieldDenialPredicate {
  id: string;
  type: 'field_denial';
  fields: string[];
}

export interface RateLimitPredicate {
  id: string;
  type: 'rate_limit';
  value: number;
  window: string;
  windowMs: number;
}

export interface FinancialCapPredicate {
  id: string;
  type: 'financial_cap';
  max: number;
}

export interface ExpiryPredicate {
  id: string;
  type: 'expiry';
  durationMs: number;
}

export interface DelegationRestrictionPredicate {
  id: string;
  type: 'delegation_restriction';
  nonDelegatable: boolean;
}

export interface CapabilityIR {
  agent: string;
  predicates: Predicate[];
  /** Source contract used to generate this IR */
  sourceContract: CapabilityContract;
}

// ── Compiler ──────────────────────────────────────────────────────

/**
 * Compile a raw YAML string into a validated CapabilityIR.
 * Throws on invalid YAML or schema violations.
 */
export function compileYamlToIR(yamlSource: string): CapabilityIR {
  // 1. Parse YAML into a plain object
  let raw: unknown;
  try {
    raw = parseYaml(yamlSource);
  } catch (e: any) {
    throw new Error(`YAML parse error: ${e.message}`);
  }

  // 2. Validate against Zod schema
  const parsed = CapabilityContractSchema.parse(raw);

  // 3. Build ordered predicate list
  return buildIR(parsed);
}

/**
 * Build a CapabilityIR from an already-validated contract.
 */
export function buildIR(contract: CapabilityContract): CapabilityIR {
  const predicates: Predicate[] = [];

  // Rule 1: Tool allow-list (always first — fast-reject path)
  predicates.push({
    id: 'rule_tool_allow',
    type: 'tool_allow',
    tools: contract.allowed_tools,
  });

  // Rule 2: Field denial (checked before params reach the tool)
  if (contract.denied_fields.length > 0) {
    predicates.push({
      id: 'rule_field_denial',
      type: 'field_denial',
      fields: contract.denied_fields,
    });
  }

  // Rule 3: Rate limit
  const rl = parseRateLimit(contract.rate_limit);
  predicates.push({
    id: 'rule_rate_limit',
    type: 'rate_limit',
    value: rl.count,
    window: rl.window,
    windowMs: rl.windowMs,
  });

  // Rule 4: Financial cap (optional)
  if (contract.financial_threshold !== undefined) {
    predicates.push({
      id: 'rule_financial_cap',
      type: 'financial_cap',
      max: contract.financial_threshold,
    });
  }

  // Rule 5: Expiry
  const expiryMs = parseExpiry(contract.expires);
  predicates.push({
    id: 'rule_expiry',
    type: 'expiry',
    durationMs: expiryMs,
  });

  // Rule 6: Delegation restriction
  predicates.push({
    id: 'rule_delegation',
    type: 'delegation_restriction',
    nonDelegatable: contract.non_delegatable,
  });

  return {
    agent: contract.agent,
    predicates,
    sourceContract: contract,
  };
}
