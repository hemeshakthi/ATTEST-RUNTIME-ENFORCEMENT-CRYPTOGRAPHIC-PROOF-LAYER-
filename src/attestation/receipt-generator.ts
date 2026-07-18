/**
 * receipt-generator.ts
 *
 * Constructs and persists ExecutionReceipts after every enforcement
 * decision from the runtime proxy (Phase 4).
 *
 * Each receipt is:
 *   1. Built from the enforcement outcome
 *   2. Chained via hash-chain.ts (prevReceiptHash linking)
 *   3. Signed via Ed25519
 *   4. Persisted to the ExecutionReceipt table via Prisma
 */

import { prisma } from '../config/database';
import {
  ReceiptData,
  SignedReceipt,
  chainReceipt,
} from './hash-chain';
import {
  EnforcementOutcome,
  EnforcementAllowance,
  EnforcementDenial,
} from '../enforcement';

// ── Types ─────────────────────────────────────────────────────────

export interface PersistedReceipt {
  id: string;
  signedReceipt: SignedReceipt;
}

// ── Generator ─────────────────────────────────────────────────────

/**
 * Generate, chain, sign, and persist an ExecutionReceipt from an
 * enforcement outcome.
 *
 * @param outcome   The result from runtimeProxy.enforce()
 * @param contractId  The contract ID that was evaluated against
 *                    (may be null if zero-trust blocked it)
 */
export async function generateReceipt(
  outcome: EnforcementOutcome,
  contractId: string,
): Promise<PersistedReceipt> {
  // Build the raw receipt data from the enforcement outcome
  const receiptData: ReceiptData = buildReceiptData(outcome, contractId);

  // Chain + sign
  const signed = await chainReceipt(receiptData);

  // Persist to Prisma
  const persisted = await prisma.executionReceipt.create({
    data: {
      contractId: signed.contractId,
      agentId: signed.agentId,
      toolName: signed.toolName,
      params: JSON.stringify(signed.params),
      decision: signed.decision,
      reasonRuleId: signed.reasonRuleId,
      reasonText: signed.reasonText,
      preStateHash: signed.preStateHash,
      postStateHash: signed.postStateHash,
      prevReceiptHash: signed.prevReceiptHash,
      signature: signed.signature,
      timestamp: signed.timestamp,
    },
  });

  return {
    id: persisted.id,
    signedReceipt: signed,
  };
}

// ── Helpers ───────────────────────────────────────────────────────

function buildReceiptData(
  outcome: EnforcementOutcome,
  contractId: string,
): ReceiptData {
  if (outcome.decision === 'BLOCKED') {
    const o = outcome as EnforcementDenial;
    return {
      contractId,
      agentId: o.agentId,
      toolName: o.toolName,
      params: o.params,
      decision: 'blocked',
      reasonRuleId: o.ruleId,
      reasonText: o.reason,
      preStateHash: null,
      postStateHash: null,
      timestamp: o.timestamp,
    };
  }

  const o = outcome as EnforcementAllowance;
  return {
    contractId,
    agentId: o.agentId,
    toolName: o.toolName,
    params: o.params,
    decision: 'allowed',
    reasonRuleId: null,
    reasonText: null,
    preStateHash: o.preStateHash,
    postStateHash: o.postStateHash,
    timestamp: o.timestamp,
  };
}
