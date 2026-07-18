/**
 * attestation.service.ts
 *
 * Service functions for the attestation proof layer.
 * These are the public API that REST endpoints (Phase 7) and
 * the dashboard will call.
 *
 *   • getReceipts(contractId)     — list receipts for a contract
 *   • getReceipt(receiptId)       — get a single receipt
 *   • verifyReceiptChain(contractId) — walk & verify the hash chain
 *   • tamperReceipt(receiptId, newParams) — deliberately corrupt
 *     a receipt for demo purposes (breaks the chain)
 */

import { prisma } from '../config/database';
import { verifyChain, ChainVerification } from './hash-chain';

// ── Service Functions ─────────────────────────────────────────────

/**
 * Retrieve all execution receipts for a given contract,
 * ordered chronologically.
 */
export async function getReceipts(contractId: string) {
  return prisma.executionReceipt.findMany({
    where: { contractId },
    orderBy: { timestamp: 'asc' },
  });
}

/**
 * Retrieve all execution receipts for a given agent.
 */
export async function getReceiptsByAgent(agentId: string) {
  return prisma.executionReceipt.findMany({
    where: { agentId },
    orderBy: { timestamp: 'asc' },
  });
}

/**
 * Retrieve a single receipt by ID.
 */
export async function getReceipt(receiptId: string) {
  return prisma.executionReceipt.findUnique({
    where: { id: receiptId },
  });
}

/**
 * Verify the cryptographic hash chain for a contract.
 * Walks every receipt, recomputes hashes, checks links,
 * and verifies Ed25519 signatures.
 */
export async function verifyReceiptChain(
  contractId: string,
): Promise<ChainVerification> {
  return verifyChain(contractId);
}

/**
 * TAMPER UTILITY — Demo purposes only.
 *
 * Deliberately modifies a historical receipt's params field in the DB.
 * This will break the hash chain because:
 *   1. The receipt's signature was computed over the original params
 *   2. The next receipt's prevReceiptHash was computed from the
 *      original signed receipt
 *
 * After tampering, calling verifyReceiptChain() will detect the
 * corruption and report exactly which receipt was altered.
 */
export async function tamperReceipt(
  receiptId: string,
  newParams: Record<string, unknown>,
): Promise<{ success: boolean; message: string }> {
  const receipt = await prisma.executionReceipt.findUnique({
    where: { id: receiptId },
  });

  if (!receipt) {
    return { success: false, message: `Receipt ${receiptId} not found` };
  }

  await prisma.executionReceipt.update({
    where: { id: receiptId },
    data: {
      params: JSON.stringify(newParams),
    },
  });

  return {
    success: true,
    message: `Receipt ${receiptId} tampered — params overwritten. Hash chain is now broken.`,
  };
}
