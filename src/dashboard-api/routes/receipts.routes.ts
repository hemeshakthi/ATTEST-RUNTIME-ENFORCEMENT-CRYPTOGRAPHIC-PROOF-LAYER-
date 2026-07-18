/**
 * receipts.routes.ts
 *
 * REST endpoints for Execution Receipts and chain verification.
 *
 *   GET    /api/receipts
 *   GET    /api/receipts/:id
 *   GET    /api/receipts/verify/:contractId
 *   POST   /api/demo/tamper/:receiptId
 */

import { Router, Request, Response } from 'express';
import {
  getReceipts,
  getReceiptsByAgent,
  getReceipt,
  verifyReceiptChain,
  tamperReceipt,
} from '../../attestation';

const router = Router();

// ── GET /api/receipts ─────────────────────────────────────────────
//    Query: ?contractId=... or ?agentId=...

router.get('/', async (req: Request, res: Response) => {
  const { contractId, agentId } = req.query;

  if (contractId) {
    const receipts = await getReceipts(contractId as string);
    res.json(receipts);
    return;
  }

  if (agentId) {
    const receipts = await getReceiptsByAgent(agentId as string);
    res.json(receipts);
    return;
  }

  // Default: return recent receipts
  const { prisma } = await import('../../config/database');
  const receipts = await prisma.executionReceipt.findMany({
    orderBy: { timestamp: 'desc' },
    take: 100,
  });
  res.json(receipts);
});

// ── GET /api/receipts/verify/:contractId ──────────────────────────
//    Must be defined BEFORE /:id to avoid route conflict

router.get('/verify/:contractId', async (req: Request, res: Response) => {
  const verification = await verifyReceiptChain(req.params.contractId as string);
  res.json(verification);
});

// ── GET /api/receipts/:id ─────────────────────────────────────────

router.get('/:id', async (req: Request, res: Response) => {
  const receipt = await getReceipt(req.params.id as string);
  if (!receipt) {
    res.status(404).json({ error: 'Receipt not found' });
    return;
  }
  res.json(receipt);
});

export default router;

// ── Demo tamper route (exported separately so the main server can
//    mount it at /api/demo/) ───────────────────────────────────────

export const demoRouter = Router();

demoRouter.post('/tamper/:receiptId', async (req: Request, res: Response) => {
  const newParams = req.body.params ?? { tampered: true, by: 'demo-endpoint' };
  const result = await tamperReceipt(req.params.receiptId as string, newParams);
  if (!result.success) {
    res.status(404).json(result);
    return;
  }
  res.json(result);
});
