/**
 * delegation.service.ts
 *
 * Capability delegation between agents.
 *
 * An agent with a deployed contract can grant a SCOPED SUBSET of
 * its own capabilities to another agent.  The delegation chain is
 * transitively enforced: a child can never exceed what its parent
 * holds.
 *
 * When compiling a contract for a delegated agent, the compiler
 * intersects the child's requested capabilities with the parent's
 * granted capabilities — the child can only be as permissive as the
 * parent allows, never more.
 *
 * Service functions:
 *   createDelegation(fromAgentId, toAgentId, scopedCapability)
 *   getDelegationGraph()
 *   getDelegationChain(agentId) — walk up the tree
 *   compileDelegatedContract(childYaml, parentContractId)
 */

import { prisma } from '../../config/database';
import {
  compileYamlToIR,
  buildIR,
  buildEnforcementMachine,
} from '../../compiler';
import type {
  CapabilityIR,
  Predicate,
  CapabilityContract,
} from '../../compiler';
import { CapabilityContractSchema, parseRateLimit, parseExpiry } from '../../compiler/contract-schema';
import type { EnforcementMachine } from '../../compiler/state-machine-builder';
import { parse as parseYaml } from 'yaml';

// ── Types ─────────────────────────────────────────────────────────

export interface ScopedCapability {
  /** Tools the child is allowed to use (subset of parent's) */
  allowed_tools: string[];
  /** Additional fields to deny (union with parent's) */
  denied_fields?: string[];
  /** Rate limit override (must be ≤ parent's) */
  rate_limit?: string;
  /** Financial threshold override (must be ≤ parent's) */
  financial_threshold?: number;
  /** Expiry override (must be ≤ parent's) */
  expires?: string;
}

export interface DelegationNode {
  agentId: string;
  agentName: string;
  children: DelegationNode[];
}

export interface DelegationGraphResult {
  roots: DelegationNode[];
  edges: Array<{
    id: string;
    fromAgentId: string;
    fromAgentName: string;
    toAgentId: string;
    toAgentName: string;
    scopedCapability: ScopedCapability;
  }>;
}

export interface IntersectedContract {
  /** The intersected CapabilityContract */
  contract: CapabilityContract;
  /** The compiled IR */
  ir: CapabilityIR;
  /** The compiled enforcement machine */
  machine: EnforcementMachine;
  /** Constraints that were narrowed from the parent */
  narrowedFields: string[];
}

// ── Service Functions ─────────────────────────────────────────────

/**
 * Create a delegation edge from one agent to another.
 *
 * Validates:
 *  1. Both agents exist
 *  2. The delegator has a deployed contract
 *  3. The delegator's contract is not marked non_delegatable
 *  4. The scoped capability is a valid subset of the parent's contract
 */
export async function createDelegation(
  fromAgentId: string,
  toAgentId: string,
  scopedCapability: ScopedCapability,
): Promise<{ id: string; validated: boolean; narrowed: string[] }> {
  // 1. Validate agents exist
  const [fromAgent, toAgent] = await Promise.all([
    prisma.agent.findUnique({ where: { id: fromAgentId } }),
    prisma.agent.findUnique({ where: { id: toAgentId } }),
  ]);
  if (!fromAgent) throw new Error(`Delegator agent "${fromAgentId}" not found`);
  if (!toAgent) throw new Error(`Delegate agent "${toAgentId}" not found`);

  // 2. Validate delegator has a deployed contract
  const parentContract = await prisma.contract.findFirst({
    where: { agentId: fromAgentId, status: 'deployed' },
    orderBy: { version: 'desc' },
  });
  if (!parentContract) {
    throw new Error(`Delegator "${fromAgent.name}" has no deployed contract`);
  }

  // 3. Parse parent contract and check non_delegatable
  const parentIR = compileYamlToIR(parentContract.yamlSource);
  const delegationPred = parentIR.predicates.find(
    p => p.type === 'delegation_restriction',
  );
  if (delegationPred && delegationPred.type === 'delegation_restriction' && delegationPred.nonDelegatable) {
    throw new Error(
      `Contract "${parentContract.name}" is marked non_delegatable — cannot delegate`,
    );
  }

  // 4. Validate scoped capability is a subset
  const narrowed = validateSubset(parentIR, scopedCapability);

  // 5. Persist delegation edge
  const edge = await prisma.delegationEdge.create({
    data: {
      fromAgentId,
      toAgentId,
      scopedCapability: JSON.stringify(scopedCapability),
    },
  });

  return { id: edge.id, validated: true, narrowed };
}

/**
 * Retrieve the full delegation graph for the organisation.
 */
export async function getDelegationGraph(): Promise<DelegationGraphResult> {
  const edges = await prisma.delegationEdge.findMany({
    include: { fromAgent: true, toAgent: true },
  });

  const agents = await prisma.agent.findMany();
  const agentMap = new Map(agents.map(a => [a.id, a]));

  // Build adjacency list
  const childrenOf = new Map<string, string[]>();
  const hasParent = new Set<string>();

  for (const e of edges) {
    const kids = childrenOf.get(e.fromAgentId) || [];
    kids.push(e.toAgentId);
    childrenOf.set(e.fromAgentId, kids);
    hasParent.add(e.toAgentId);
  }

  // Find roots (agents that delegate but have no parent delegation)
  const allDelegators = new Set(edges.map(e => e.fromAgentId));
  const roots = [...allDelegators].filter(id => !hasParent.has(id));

  function buildTree(agentId: string): DelegationNode {
    const agent = agentMap.get(agentId);
    const children = (childrenOf.get(agentId) || []).map(buildTree);
    return {
      agentId,
      agentName: agent?.name ?? 'Unknown',
      children,
    };
  }

  return {
    roots: roots.map(buildTree),
    edges: edges.map(e => ({
      id: e.id,
      fromAgentId: e.fromAgentId,
      fromAgentName: e.fromAgent.name,
      toAgentId: e.toAgentId,
      toAgentName: e.toAgent.name,
      scopedCapability: JSON.parse(e.scopedCapability) as ScopedCapability,
    })),
  };
}

/**
 * Walk up the delegation chain from a child agent to find all
 * ancestor delegations.
 */
export async function getDelegationChain(
  agentId: string,
): Promise<Array<{ agentId: string; agentName: string; scopedCapability: ScopedCapability | null }>> {
  const chain: Array<{ agentId: string; agentName: string; scopedCapability: ScopedCapability | null }> = [];
  let currentId = agentId;
  const visited = new Set<string>();

  while (true) {
    if (visited.has(currentId)) break; // cycle guard
    visited.add(currentId);

    const edge = await prisma.delegationEdge.findFirst({
      where: { toAgentId: currentId },
      include: { fromAgent: true },
    });

    if (!edge) break;

    chain.unshift({
      agentId: edge.fromAgentId,
      agentName: edge.fromAgent.name,
      scopedCapability: JSON.parse(edge.scopedCapability) as ScopedCapability,
    });

    currentId = edge.fromAgentId;
  }

  return chain;
}

/**
 * Compile a capability contract for a delegated agent.
 *
 * This is the key innovation: the child's requested contract is
 * INTERSECTED with the parent's granted capabilities.  The child
 * can never exceed what its parent allows.
 *
 * @param childYaml   The child agent's requested contract YAML
 * @param parentAgentId  The parent agent's ID (to look up its contract)
 * @returns The intersected contract, IR, and machine
 */
export async function compileDelegatedContract(
  childYaml: string,
  parentAgentId: string,
): Promise<IntersectedContract> {
  // 1. Get parent's deployed contract
  const parentContract = await prisma.contract.findFirst({
    where: { agentId: parentAgentId, status: 'deployed' },
    orderBy: { version: 'desc' },
  });
  if (!parentContract) {
    throw new Error(`Parent agent "${parentAgentId}" has no deployed contract`);
  }

  // 2. Parse both contracts
  const parentIR = compileYamlToIR(parentContract.yamlSource);
  const childIR = compileYamlToIR(childYaml);

  // 3. Intersect capabilities
  const intersected = intersectCapabilities(parentIR, childIR);

  // 4. Build enforcement machine from intersected IR
  const machine = buildEnforcementMachine(intersected.ir);

  return intersected;
}

/**
 * Pure function: compile a delegated contract from two parsed IRs.
 * Useful for testing without DB access.
 */
export function compileDelegatedContractPure(
  parentIR: CapabilityIR,
  childYaml: string,
): IntersectedContract {
  const childIR = compileYamlToIR(childYaml);
  return intersectCapabilities(parentIR, childIR);
}

// ── Intersection Logic ────────────────────────────────────────────

/**
 * Intersect a child's capabilities with its parent's.
 * Rules:
 *   • allowed_tools: intersection (child ∩ parent)
 *   • denied_fields: union (child ∪ parent) — more restrictive
 *   • rate_limit: min(child, parent)
 *   • financial_threshold: min(child, parent)
 *   • expires: min(child, parent)
 *   • non_delegatable: OR (if either says true, result is true)
 */
function intersectCapabilities(
  parentIR: CapabilityIR,
  childIR: CapabilityIR,
): IntersectedContract {
  const parentContract = parentIR.sourceContract;
  const childContract = childIR.sourceContract;
  const narrowed: string[] = [];

  // 1. Tools: intersection
  const parentTools = new Set(parentContract.allowed_tools);
  const intersectedTools = childContract.allowed_tools.filter(t => parentTools.has(t));
  if (intersectedTools.length === 0) {
    throw new Error(
      `Delegation error: child requests tools [${childContract.allowed_tools.join(', ')}] ` +
      `but parent only allows [${parentContract.allowed_tools.join(', ')}] — no overlap`,
    );
  }
  if (intersectedTools.length < childContract.allowed_tools.length) {
    const removed = childContract.allowed_tools.filter(t => !parentTools.has(t));
    narrowed.push(`tools removed: [${removed.join(', ')}]`);
  }

  // 2. Denied fields: union (more restrictive)
  const allDenied = [...new Set([
    ...parentContract.denied_fields,
    ...childContract.denied_fields,
  ])];
  if (allDenied.length > childContract.denied_fields.length) {
    narrowed.push(`denied fields inherited from parent: [${parentContract.denied_fields.join(', ')}]`);
  }

  // 3. Rate limit: min
  const parentRL = parseRateLimit(parentContract.rate_limit);
  const childRL = parseRateLimit(childContract.rate_limit);
  const effectiveRLCount = Math.min(parentRL.count, childRL.count);
  // Use the stricter window (smaller windowMs means stricter)
  const effectiveRLWindow = parentRL.windowMs <= childRL.windowMs ? parentRL.window : childRL.window;
  const effectiveRL = `${effectiveRLCount}/${effectiveRLWindow}`;
  if (effectiveRLCount < childRL.count) {
    narrowed.push(`rate limit narrowed from ${childContract.rate_limit} to ${effectiveRL}`);
  }

  // 4. Financial threshold: min
  let effectiveFinancial = childContract.financial_threshold;
  if (parentContract.financial_threshold !== undefined) {
    if (effectiveFinancial === undefined) {
      effectiveFinancial = parentContract.financial_threshold;
      narrowed.push(`financial threshold inherited from parent: ${effectiveFinancial}`);
    } else {
      effectiveFinancial = Math.min(effectiveFinancial, parentContract.financial_threshold);
      if (effectiveFinancial < childContract.financial_threshold!) {
        narrowed.push(`financial threshold narrowed from ${childContract.financial_threshold} to ${effectiveFinancial}`);
      }
    }
  }

  // 5. Expiry: min
  const parentExpiryMs = parseExpiry(parentContract.expires);
  const childExpiryMs = parseExpiry(childContract.expires);
  const effectiveExpiryMs = Math.min(parentExpiryMs, childExpiryMs);
  // Convert back to human-readable
  const effectiveExpiry = effectiveExpiryMs === parentExpiryMs
    ? parentContract.expires
    : childContract.expires;
  if (effectiveExpiryMs < childExpiryMs) {
    narrowed.push(`expiry narrowed from ${childContract.expires} to ${effectiveExpiry}`);
  }

  // 6. Non-delegatable: OR
  const effectiveNonDelegatable = parentContract.non_delegatable || childContract.non_delegatable;

  // Build the intersected contract
  const intersectedContract: CapabilityContract = {
    agent: childContract.agent,
    allowed_tools: intersectedTools,
    denied_fields: allDenied,
    rate_limit: effectiveRL,
    financial_threshold: effectiveFinancial,
    expires: effectiveExpiry,
    non_delegatable: effectiveNonDelegatable,
  };

  // Build IR and machine from the intersected contract
  const ir = buildIR(intersectedContract);
  const machine = buildEnforcementMachine(ir);

  return {
    contract: intersectedContract,
    ir,
    machine,
    narrowedFields: narrowed,
  };
}

// ── Validation ────────────────────────────────────────────────────

/**
 * Validate that a ScopedCapability is a valid subset of the parent's
 * contract.  Returns a list of fields that were narrowed.
 */
function validateSubset(
  parentIR: CapabilityIR,
  scoped: ScopedCapability,
): string[] {
  const narrowed: string[] = [];
  const parentContract = parentIR.sourceContract;

  // Tools must be a subset
  const parentTools = new Set(parentContract.allowed_tools);
  const invalidTools = scoped.allowed_tools.filter(t => !parentTools.has(t));
  if (invalidTools.length > 0) {
    throw new Error(
      `Delegation error: tools [${invalidTools.join(', ')}] not in parent's allowed list [${parentContract.allowed_tools.join(', ')}]`,
    );
  }

  // Rate limit must be ≤ parent's
  if (scoped.rate_limit) {
    const parentRL = parseRateLimit(parentContract.rate_limit);
    const childRL = parseRateLimit(scoped.rate_limit);
    if (childRL.count > parentRL.count) {
      throw new Error(
        `Delegation error: rate limit ${scoped.rate_limit} exceeds parent's ${parentContract.rate_limit}`,
      );
    }
  }

  // Financial threshold must be ≤ parent's
  if (scoped.financial_threshold !== undefined && parentContract.financial_threshold !== undefined) {
    if (scoped.financial_threshold > parentContract.financial_threshold) {
      throw new Error(
        `Delegation error: financial threshold ${scoped.financial_threshold} exceeds parent's ${parentContract.financial_threshold}`,
      );
    }
  }

  return narrowed;
}
