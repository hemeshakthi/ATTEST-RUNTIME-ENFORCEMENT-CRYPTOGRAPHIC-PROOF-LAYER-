/**
 * violations.routes.ts
 *
 * REST endpoints for Violations.
 *
 *   GET    /api/violations
 *   POST   /api/violations/:id/suspend-agent
 *   POST   /api/violations/:id/dismiss
 */

import { Router, Request, Response } from 'express';
import { prisma } from '../../config/database';
import { runtimeProxy } from '../../enforcement';

const router = Router();

// ── GET /api/violations ───────────────────────────────────────────

router.get('/', async (_req: Request, res: Response) => {
  const violations = await prisma.violation.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      agent: true,
      contract: true,
      receipt: true,
    },
  });
  res.json(violations);
});

// ── POST /api/violations/:id/suspend-agent ────────────────────────
//    Suspends the agent that committed the violation by unregistering
//    their enforcement contract (zero-trust will block them).

router.post('/:id/suspend-agent', async (req: Request, res: Response) => {
  const violation = await prisma.violation.findUnique({
    where: { id: req.params.id as string },
    include: { agent: true },
  });

  if (!violation) {
    res.status(404).json({ error: 'Violation not found' });
    return;
  }

  // Unregister the agent's enforcement machine
  runtimeProxy.unregisterAgent(violation.agentId);

  // Update agent status
  await prisma.agent.update({
    where: { id: violation.agentId },
    data: { status: 'suspended' },
  });

  // Update violation status
  await prisma.violation.update({
    where: { id: violation.id },
    data: { status: 'escalated' },
  });

  res.json({
    violationId: violation.id,
    agentId: violation.agentId,
    agentName: (violation as any).agent?.name ?? violation.agentId,
    action: 'suspended',
    message: `Agent suspended — all tool calls will be blocked by zero-trust`,
  });
});

// ── POST /api/violations/:id/dismiss ──────────────────────────────

router.post('/:id/dismiss', async (req: Request, res: Response) => {
  const violation = await prisma.violation.findUnique({
    where: { id: req.params.id as string },
  });

  if (!violation) {
    res.status(404).json({ error: 'Violation not found' });
    return;
  }

  await prisma.violation.update({
    where: { id: violation.id },
    data: { status: 'dismissed' },
  });

  res.json({
    violationId: violation.id,
    status: 'dismissed',
  });
});

export default router;
