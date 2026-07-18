/**
 * hash-chain.ts
 *
 * Cryptographic primitives for the Attest proof layer:
 *
 *   • Ed25519 keypair management (auto-generated on first run,
 *     persisted to keys/ at project root — already gitignored)
 *   • signReceipt()  — Ed25519 signature over receipt hash
 *   • hashReceipt()  — SHA-256 canonical hash of a receipt
 *   • chainReceipt() — link prevReceiptHash into the chain
 *   • verifyChain()  — walk the full chain and verify integrity
 */

import { createHash } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import nacl from 'tweetnacl';
import { prisma } from '../config/database';

// ── Types ─────────────────────────────────────────────────────────

export interface ReceiptData {
  contractId: string;
  agentId: string;
  toolName: string;
  params: Record<string, unknown>;
  decision: string;
  reasonRuleId: string | null;
  reasonText: string | null;
  preStateHash: string | null;
  postStateHash: string | null;
  timestamp: string;
}

export interface SignedReceipt extends ReceiptData {
  prevReceiptHash: string | null;
  signature: string;
  receiptHash: string;
}

export interface ChainVerification {
  valid: boolean;
  brokenAtReceiptId?: string;
  checkedCount: number;
}

// ── Key Management ────────────────────────────────────────────────

const KEYS_DIR = path.resolve(process.cwd(), 'keys');
const PRIVATE_KEY_PATH = path.join(KEYS_DIR, 'ed25519.secret');
const PUBLIC_KEY_PATH = path.join(KEYS_DIR, 'ed25519.public');

let _keyPair: nacl.SignKeyPair | null = null;

/**
 * Load or generate an Ed25519 keypair.
 * Keys are stored in keys/ at the project root (gitignored).
 */
export function getKeyPair(): nacl.SignKeyPair {
  if (_keyPair) return _keyPair;

  if (fs.existsSync(PRIVATE_KEY_PATH) && fs.existsSync(PUBLIC_KEY_PATH)) {
    const secretKey = Buffer.from(
      fs.readFileSync(PRIVATE_KEY_PATH, 'utf-8'),
      'hex',
    );
    const publicKey = Buffer.from(
      fs.readFileSync(PUBLIC_KEY_PATH, 'utf-8'),
      'hex',
    );
    _keyPair = { publicKey, secretKey };
  } else {
    _keyPair = nacl.sign.keyPair();
    fs.mkdirSync(KEYS_DIR, { recursive: true });
    fs.writeFileSync(
      PRIVATE_KEY_PATH,
      Buffer.from(_keyPair.secretKey).toString('hex'),
    );
    fs.writeFileSync(
      PUBLIC_KEY_PATH,
      Buffer.from(_keyPair.publicKey).toString('hex'),
    );
  }

  return _keyPair;
}

/**
 * Get the public key as a hex string.
 */
export function getPublicKeyHex(): string {
  return Buffer.from(getKeyPair().publicKey).toString('hex');
}

// ── Hashing ───────────────────────────────────────────────────────

/**
 * Compute a deterministic SHA-256 hash of a receipt's fields.
 * The hash covers every field EXCEPT prevReceiptHash and signature
 * (which are set after hashing).
 */
export function hashReceipt(receipt: ReceiptData): string {
  const canonical = JSON.stringify({
    contractId: receipt.contractId,
    agentId: receipt.agentId,
    toolName: receipt.toolName,
    params: receipt.params,
    decision: receipt.decision,
    reasonRuleId: receipt.reasonRuleId,
    reasonText: receipt.reasonText,
    preStateHash: receipt.preStateHash,
    postStateHash: receipt.postStateHash,
    timestamp: receipt.timestamp,
  });
  return createHash('sha256').update(canonical).digest('hex');
}

/**
 * Hash an already-signed receipt (includes prevReceiptHash + signature)
 * for use as the next link in the chain.
 */
export function hashSignedReceipt(receipt: SignedReceipt): string {
  const canonical = JSON.stringify({
    contractId: receipt.contractId,
    agentId: receipt.agentId,
    toolName: receipt.toolName,
    params: receipt.params,
    decision: receipt.decision,
    reasonRuleId: receipt.reasonRuleId,
    reasonText: receipt.reasonText,
    preStateHash: receipt.preStateHash,
    postStateHash: receipt.postStateHash,
    prevReceiptHash: receipt.prevReceiptHash,
    signature: receipt.signature,
    timestamp: receipt.timestamp,
  });
  return createHash('sha256').update(canonical).digest('hex');
}

// ── Signing ───────────────────────────────────────────────────────

/**
 * Sign a receipt hash with the Ed25519 private key.
 * Returns the signature as a hex string.
 */
export function signReceipt(receiptHash: string): string {
  const kp = getKeyPair();
  const msgBytes = Buffer.from(receiptHash, 'hex');
  const sigBytes = nacl.sign.detached(msgBytes, kp.secretKey);
  return Buffer.from(sigBytes).toString('hex');
}

/**
 * Verify an Ed25519 signature against a receipt hash.
 */
export function verifySignature(
  receiptHash: string,
  signatureHex: string,
): boolean {
  const kp = getKeyPair();
  const msgBytes = Buffer.from(receiptHash, 'hex');
  const sigBytes = Buffer.from(signatureHex, 'hex');
  return nacl.sign.detached.verify(msgBytes, sigBytes, kp.publicKey);
}

// ── Chaining ──────────────────────────────────────────────────────

/**
 * Look up the hash of the most recent receipt for a given contract.
 * Returns null if no prior receipts exist (genesis receipt).
 */
export async function getPrevReceiptHash(
  contractId: string,
): Promise<string | null> {
  const lastReceipt = await prisma.executionReceipt.findFirst({
    where: { contractId },
    orderBy: { timestamp: 'desc' },
  });

  if (!lastReceipt) return null;

  // Reconstruct the signed receipt to compute its hash
  const signed: SignedReceipt = {
    contractId: lastReceipt.contractId,
    agentId: lastReceipt.agentId,
    toolName: lastReceipt.toolName,
    params: JSON.parse(lastReceipt.params),
    decision: lastReceipt.decision,
    reasonRuleId: lastReceipt.reasonRuleId,
    reasonText: lastReceipt.reasonText,
    preStateHash: lastReceipt.preStateHash,
    postStateHash: lastReceipt.postStateHash,
    prevReceiptHash: lastReceipt.prevReceiptHash,
    signature: lastReceipt.signature ?? '',
    receiptHash: '',
    timestamp: lastReceipt.timestamp.toISOString(),
  };
  signed.receiptHash = hashSignedReceipt(signed);

  return signed.receiptHash;
}

/**
 * Build a fully chained and signed receipt from raw data.
 */
export async function chainReceipt(
  data: ReceiptData,
): Promise<SignedReceipt> {
  // 1. Hash the receipt content
  const rHash = hashReceipt(data);

  // 2. Sign the hash
  const signature = signReceipt(rHash);

  // 3. Get the previous receipt's hash for chaining
  const prevReceiptHash = await getPrevReceiptHash(data.contractId);

  const signed: SignedReceipt = {
    ...data,
    prevReceiptHash,
    signature,
    receiptHash: rHash,
  };

  return signed;
}

// ── Chain Verification ────────────────────────────────────────────

/**
 * Walk the full receipt chain for a contract, recompute hashes,
 * and verify that each receipt's prevReceiptHash matches.
 *
 * Also verifies Ed25519 signatures on every receipt.
 */
export async function verifyChain(
  contractId: string,
): Promise<ChainVerification> {
  const receipts = await prisma.executionReceipt.findMany({
    where: { contractId },
    orderBy: { timestamp: 'asc' },
  });

  if (receipts.length === 0) {
    return { valid: true, checkedCount: 0 };
  }

  let prevHash: string | null = null;

  for (let i = 0; i < receipts.length; i++) {
    const r = receipts[i];

    // 1. Verify prevReceiptHash links
    if (r.prevReceiptHash !== prevHash) {
      return {
        valid: false,
        brokenAtReceiptId: r.id,
        checkedCount: i,
      };
    }

    // 2. Recompute the receipt hash from its fields
    const receiptData: ReceiptData = {
      contractId: r.contractId,
      agentId: r.agentId,
      toolName: r.toolName,
      params: JSON.parse(r.params),
      decision: r.decision,
      reasonRuleId: r.reasonRuleId,
      reasonText: r.reasonText,
      preStateHash: r.preStateHash,
      postStateHash: r.postStateHash,
      timestamp: r.timestamp.toISOString(),
    };

    const recomputedHash = hashReceipt(receiptData);

    // 3. Verify the Ed25519 signature against the recomputed hash
    if (r.signature) {
      const sigValid = verifySignature(recomputedHash, r.signature);
      if (!sigValid) {
        return {
          valid: false,
          brokenAtReceiptId: r.id,
          checkedCount: i,
        };
      }
    }

    // 4. Compute the full signed-receipt hash for chaining to the next entry
    const signed: SignedReceipt = {
      ...receiptData,
      prevReceiptHash: r.prevReceiptHash,
      signature: r.signature ?? '',
      receiptHash: recomputedHash,
    };
    prevHash = hashSignedReceipt(signed);
  }

  return { valid: true, checkedCount: receipts.length };
}
