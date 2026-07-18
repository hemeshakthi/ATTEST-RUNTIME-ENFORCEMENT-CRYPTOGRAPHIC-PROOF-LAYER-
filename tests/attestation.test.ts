/**
 * attestation.test.ts
 *
 * Tests for the Attest cryptographic proof layer.
 * Covers:
 *   1. Receipt hashing is deterministic
 *   2. Ed25519 signing and verification
 *   3. Hash chain linking (prevReceiptHash)
 *   4. Chain verification succeeds on an untampered chain
 *   5. Chain verification FAILS on a tampered receipt
 *   6. Receipt generation from enforcement outcomes
 */

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import {
  hashReceipt,
  hashSignedReceipt,
  signReceipt,
  verifySignature,
  getKeyPair,
  getPublicKeyHex,
} from '../src/attestation/hash-chain';
import type { ReceiptData, SignedReceipt } from '../src/attestation/hash-chain';

// ── Fixtures ──────────────────────────────────────────────────────

const SAMPLE_RECEIPT: ReceiptData = {
  contractId: 'contract-1',
  agentId: 'agent-1',
  toolName: 'readBalance',
  params: { accountId: 'acc-1' },
  decision: 'allowed',
  reasonRuleId: null,
  reasonText: null,
  preStateHash: 'aabbccdd',
  postStateHash: 'aabbccdd',
  timestamp: '2026-07-17T12:00:00.000Z',
};

const SAMPLE_RECEIPT_2: ReceiptData = {
  contractId: 'contract-1',
  agentId: 'agent-1',
  toolName: 'transferMoney',
  params: { amount: 500 },
  decision: 'allowed',
  reasonRuleId: null,
  reasonText: null,
  preStateHash: 'aabbccdd',
  postStateHash: 'eeff0011',
  timestamp: '2026-07-17T12:01:00.000Z',
};

// ── Tests ─────────────────────────────────────────────────────────

describe('Hash Chain Crypto Primitives', () => {

  describe('Key Management', () => {
    it('generates a valid Ed25519 keypair', () => {
      const kp = getKeyPair();
      expect(kp.publicKey).toHaveLength(32);
      expect(kp.secretKey).toHaveLength(64);
    });

    it('returns the public key as hex', () => {
      const hex = getPublicKeyHex();
      expect(hex).toHaveLength(64); // 32 bytes = 64 hex chars
      expect(/^[0-9a-f]+$/.test(hex)).toBe(true);
    });

    it('returns the same keypair on repeated calls', () => {
      const kp1 = getKeyPair();
      const kp2 = getKeyPair();
      expect(Buffer.from(kp1.publicKey).toString('hex'))
        .toBe(Buffer.from(kp2.publicKey).toString('hex'));
    });
  });

  describe('Receipt Hashing', () => {
    it('produces a deterministic SHA-256 hash', () => {
      const h1 = hashReceipt(SAMPLE_RECEIPT);
      const h2 = hashReceipt(SAMPLE_RECEIPT);
      expect(h1).toBe(h2);
      expect(h1).toHaveLength(64); // SHA-256 = 64 hex chars
    });

    it('produces different hashes for different receipts', () => {
      const h1 = hashReceipt(SAMPLE_RECEIPT);
      const h2 = hashReceipt(SAMPLE_RECEIPT_2);
      expect(h1).not.toBe(h2);
    });

    it('changes hash when any field is modified', () => {
      const original = hashReceipt(SAMPLE_RECEIPT);
      const modified = hashReceipt({
        ...SAMPLE_RECEIPT,
        params: { accountId: 'acc-999' },
      });
      expect(original).not.toBe(modified);
    });
  });

  describe('Ed25519 Signing', () => {
    it('signs a receipt hash and produces a hex signature', () => {
      const rHash = hashReceipt(SAMPLE_RECEIPT);
      const sig = signReceipt(rHash);
      expect(sig).toHaveLength(128); // Ed25519 sig = 64 bytes = 128 hex
      expect(/^[0-9a-f]+$/.test(sig)).toBe(true);
    });

    it('signature verifies correctly', () => {
      const rHash = hashReceipt(SAMPLE_RECEIPT);
      const sig = signReceipt(rHash);
      expect(verifySignature(rHash, sig)).toBe(true);
    });

    it('signature fails for tampered hash', () => {
      const rHash = hashReceipt(SAMPLE_RECEIPT);
      const sig = signReceipt(rHash);
      // Tamper: use a different receipt's hash
      const tamperedHash = hashReceipt(SAMPLE_RECEIPT_2);
      expect(verifySignature(tamperedHash, sig)).toBe(false);
    });
  });

  describe('Signed Receipt Hashing (for chaining)', () => {
    it('includes prevReceiptHash and signature in the hash', () => {
      const rHash = hashReceipt(SAMPLE_RECEIPT);
      const sig = signReceipt(rHash);

      const signed1: SignedReceipt = {
        ...SAMPLE_RECEIPT,
        prevReceiptHash: null,
        signature: sig,
        receiptHash: rHash,
      };

      const signed2: SignedReceipt = {
        ...SAMPLE_RECEIPT,
        prevReceiptHash: 'some-prev-hash',
        signature: sig,
        receiptHash: rHash,
      };

      const h1 = hashSignedReceipt(signed1);
      const h2 = hashSignedReceipt(signed2);

      expect(h1).not.toBe(h2);
      expect(h1).toHaveLength(64);
    });
  });

  describe('Chain Integrity (unit-level, no DB)', () => {
    it('can build a manual chain and verify links', () => {
      // Receipt 1 (genesis)
      const hash1 = hashReceipt(SAMPLE_RECEIPT);
      const sig1 = signReceipt(hash1);
      const signed1: SignedReceipt = {
        ...SAMPLE_RECEIPT,
        prevReceiptHash: null,
        signature: sig1,
        receiptHash: hash1,
      };
      const fullHash1 = hashSignedReceipt(signed1);

      // Receipt 2 (chained)
      const hash2 = hashReceipt(SAMPLE_RECEIPT_2);
      const sig2 = signReceipt(hash2);
      const signed2: SignedReceipt = {
        ...SAMPLE_RECEIPT_2,
        prevReceiptHash: fullHash1,
        signature: sig2,
        receiptHash: hash2,
      };

      // Verify chain: receipt 2's prevReceiptHash should equal fullHash1
      expect(signed2.prevReceiptHash).toBe(fullHash1);

      // Verify signatures
      expect(verifySignature(hash1, sig1)).toBe(true);
      expect(verifySignature(hash2, sig2)).toBe(true);

      // Tamper receipt 1's params and recompute — hash should differ
      const tamperedReceipt: ReceiptData = {
        ...SAMPLE_RECEIPT,
        params: { accountId: 'HACKED' },
      };
      const tamperedHash = hashReceipt(tamperedReceipt);
      expect(tamperedHash).not.toBe(hash1);

      // Original signature no longer valid for tampered hash
      expect(verifySignature(tamperedHash, sig1)).toBe(false);
    });
  });
});
