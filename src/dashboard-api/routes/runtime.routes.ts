/**
 * runtime.routes.ts
 *
 * REST endpoints for Runtime status and control.
 *
 *   GET    /api/runtime/status
 *   POST   /api/runtime/emergency-stop
 *   POST   /api/runtime/resume
 *   GET    /api/runtime/live-feed  (SSE stream)
 */

import { Router, Request, Response } from 'express';
import { runtimeProxy } from '../../enforcement';
import { prisma } from '../../config/database';

const router = Router();

// ── GET /api/runtime/status ───────────────────────────────────────

router.get('/status', async (_req: Request, res: Response) => {
  const agentIds = runtimeProxy.getRegisteredAgentIds();
  const agentStates = await Promise.all(agentIds.map(async (id) => {
    const receipts = await prisma.executionReceipt.findMany({
      where: { agentId: id },
      orderBy: { timestamp: 'desc' }
    });

    const allowedReceipts = receipts.filter(r => r.decision === 'allowed');
    const cumulativeFinancial = allowedReceipts.reduce((acc, r) => {
      try {
        const params = JSON.parse(r.params);
        const amount = params.amount || params.value || params.total || 0;
        return acc + amount;
      } catch {
        return acc;
      }
    }, 0);

    const firstReceipt = receipts[receipts.length - 1];

    return {
      agentId: id,
      callCount: receipts.length,
      cumulativeFinancial,
      activatedAt: firstReceipt ? firstReceipt.timestamp.toISOString() : null,
    };
  }));

  const totalReceiptsCount = await prisma.executionReceipt.count();
  const recentReceipts = await prisma.executionReceipt.findMany({
    orderBy: { timestamp: 'desc' },
    take: 100,
  });

  const recentDecisions = recentReceipts.map(r => ({
    decision: r.decision.toUpperCase() as 'ALLOWED' | 'BLOCKED',
    agentId: r.agentId,
    toolName: r.toolName,
    params: JSON.parse(r.params),
    reason: r.reasonText || undefined,
    ruleId: r.reasonRuleId || undefined,
    timestamp: r.timestamp.toISOString(),
    contractId: r.contractId,
    preStateHash: r.preStateHash || undefined,
    postStateHash: r.postStateHash || undefined,
  }));

  res.json({
    emergencyStopActive: runtimeProxy.emergencyStopActive,
    zeroTrustEnabled: runtimeProxy.zeroTrustEnabled,
    registeredAgents: agentIds.length,
    agents: agentStates,
    auditLogSize: totalReceiptsCount,
    recentDecisions,
  });
});

// ── POST /api/runtime/emergency-stop ──────────────────────────────

router.post('/emergency-stop', (_req: Request, res: Response) => {
  runtimeProxy.activateEmergencyStop();
  res.json({
    emergencyStopActive: true,
    message: '🛑 Emergency stop activated — ALL agent execution halted',
  });
});

// ── POST /api/runtime/resume ──────────────────────────────────────

router.post('/resume', (_req: Request, res: Response) => {
  runtimeProxy.deactivateEmergencyStop();
  res.json({
    emergencyStopActive: false,
    message: '✅ Emergency stop deactivated — normal operation resumed',
  });
});

// ── GET /api/runtime/live-feed ────────────────────────────────────
//    Server-Sent Events stream of enforcement decisions.

router.get('/live-feed', async (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  // Send initial heartbeat
  res.write(`data: ${JSON.stringify({ type: 'connected', timestamp: new Date().toISOString() })}\n\n`);

  let lastSeenTimestamp = new Date(Date.now() - 5000);
  const seenIds = new Set<string>();

  try {
    const recent = await prisma.executionReceipt.findMany({
      where: { timestamp: { gte: lastSeenTimestamp } },
      select: { id: true }
    });
    recent.forEach(r => seenIds.add(r.id));
  } catch {}

  // Poll every 500ms for new entries in DB
  const interval = setInterval(async () => {
    try {
      const newReceipts = await prisma.executionReceipt.findMany({
        where: { timestamp: { gte: lastSeenTimestamp } },
        orderBy: { timestamp: 'asc' }
      });

      for (const r of newReceipts) {
        if (!seenIds.has(r.id)) {
          seenIds.add(r.id);
          const entry = {
            decision: r.decision.toUpperCase() as 'ALLOWED' | 'BLOCKED',
            agentId: r.agentId,
            toolName: r.toolName,
            params: JSON.parse(r.params),
            reason: r.reasonText || undefined,
            ruleId: r.reasonRuleId || undefined,
            timestamp: r.timestamp.toISOString(),
            contractId: r.contractId,
            preStateHash: r.preStateHash || undefined,
            postStateHash: r.postStateHash || undefined,
          };
          res.write(`data: ${JSON.stringify(entry)}\n\n`);
        }
      }

      if (newReceipts.length > 0) {
        lastSeenTimestamp = new Date(newReceipts[newReceipts.length - 1].timestamp.getTime() - 1000);
        if (seenIds.size > 1000) {
          seenIds.clear();
          newReceipts.forEach(r => seenIds.add(r.id));
        }
      }
    } catch (err) {
      // Ignore
    }
  }, 500);

  // Heartbeat every 15s to keep connection alive
  const heartbeat = setInterval(() => {
    res.write(`: heartbeat\n\n`);
  }, 15000);

  // Cleanup on client disconnect
  req.on('close', () => {
    clearInterval(interval);
    clearInterval(heartbeat);
  });
});

export default router;
