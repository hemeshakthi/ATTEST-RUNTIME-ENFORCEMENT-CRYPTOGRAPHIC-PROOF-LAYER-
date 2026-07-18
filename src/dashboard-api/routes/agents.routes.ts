/**
 * agents.routes.ts
 *
 * REST endpoints for Agents & Delegation.
 *
 *   GET    /api/agents
 *   GET    /api/agents/:id
 *   POST   /api/delegation
 *   GET    /api/delegation/graph
 */

import { Router, Request, Response } from 'express';
import { prisma } from '../../config/database';
import {
  createDelegation,
  getDelegationGraph,
} from '../../modules/agents';

const router = Router();

// ── GET /api/agents ───────────────────────────────────────────────

router.get('/', async (_req: Request, res: Response) => {
  const agents = await prisma.agent.findMany({
    include: {
      contracts: {
        where: { status: 'deployed' },
        orderBy: { version: 'desc' },
        take: 1,
      },
      delegationsFrom: {
        include: { toAgent: true },
      },
      delegationsTo: {
        include: { fromAgent: true },
      },
    },
  });
  res.json(agents);
});

// ── GET /api/agents/:id ───────────────────────────────────────────

router.get('/:id', async (req: Request, res: Response) => {
  const agent = await prisma.agent.findUnique({
    where: { id: req.params.id as string },
    include: {
      contracts: { orderBy: { version: 'desc' } },
      receipts: { orderBy: { timestamp: 'desc' }, take: 20 },
      violations: { orderBy: { createdAt: 'desc' } },
      delegationsFrom: { include: { toAgent: true } },
      delegationsTo: { include: { fromAgent: true } },
    },
  });

  if (!agent) {
    res.status(404).json({ error: 'Agent not found' });
    return;
  }

  res.json(agent);
});

export default router;

// ── Delegation routes (exported separately) ───────────────────────

export const delegationRouter = Router();

// POST /api/delegation
delegationRouter.post('/', async (req: Request, res: Response) => {
  const { fromAgentId, toAgentId, scopedCapability } = req.body;

  if (!fromAgentId || !toAgentId || !scopedCapability) {
    res.status(400).json({
      error: 'fromAgentId, toAgentId, and scopedCapability are required',
    });
    return;
  }

  try {
    const result = await createDelegation(
      fromAgentId,
      toAgentId,
      scopedCapability,
    );
    res.status(201).json(result);
  } catch (err: any) {
    res.status(422).json({ error: err.message });
  }
});

// GET /api/delegation/graph
delegationRouter.get('/graph', async (_req: Request, res: Response) => {
  const graph = await getDelegationGraph();
  res.json(graph);
});
