/**
 * Barrel export for the attestation module.
 */
export {
  hashReceipt,
  hashSignedReceipt,
  signReceipt,
  verifySignature,
  chainReceipt,
  getPrevReceiptHash,
  verifyChain,
  getKeyPair,
  getPublicKeyHex,
} from './hash-chain';
export type {
  ReceiptData,
  SignedReceipt,
  ChainVerification,
} from './hash-chain';

export { generateReceipt } from './receipt-generator';
export type { PersistedReceipt } from './receipt-generator';

export {
  getReceipts,
  getReceiptsByAgent,
  getReceipt,
  verifyReceiptChain,
  tamperReceipt,
} from './attestation.service';
