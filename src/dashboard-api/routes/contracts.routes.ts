/**
 * contracts.routes.ts
 *
 * REST endpoints for Capability Contracts.
 *
 *   GET    /api/contracts
 *   GET    /api/contracts/:id
 *   POST   /api/contracts           (create draft from YAML)
 *   POST   /api/contracts/:id/compile
 *   POST   /api/contracts/:id/simulate
 *   POST   /api/contracts/:id/deploy
 *   GET    /api/contracts/:id/versions
 *   POST   /api/contracts/:id/rollback/:versionId
 */

import { Router, Request, Response } from 'express';
import { prisma } from '../../config/database';
import { compilerService } from '../../compiler';
import { runtimeProxy } from '../../enforcement';

const router = Router();

// ── GET /api/contracts ────────────────────────────────────────────

router.get('/', async (_req: Request, res: Response) => {
  const contracts = await prisma.contract.findMany({
    orderBy: { updatedAt: 'desc' },
    include: { agent: true },
  });
  res.json(contracts);
});

// ── GET /api/contracts/:id ────────────────────────────────────────

router.get('/:id', async (req: Request, res: Response) => {
  const contract = await prisma.contract.findUnique({
    where: { id: req.params.id as string },
    include: { agent: true, versions: { orderBy: { version: 'desc' } } },
  });
  if (!contract) {
    res.status(404).json({ error: 'Contract not found' });
    return;
  }
  res.json(contract);
});

// ── POST /api/contracts ───────────────────────────────────────────
//    Body: { name, agentId, yamlSource }

router.post('/', async (req: Request, res: Response) => {
  const { name, agentId, yamlSource } = req.body;
  if (!name || !agentId || !yamlSource) {
    res.status(400).json({ error: 'name, agentId, and yamlSource are required' });
    return;
  }

  // Validate YAML first
  const validation = compilerService.validate(yamlSource);
  if (!validation.valid) {
    res.status(422).json({ error: 'Invalid YAML', details: validation.errors });
    return;
  }

  const contract = await prisma.contract.create({
    data: {
      name,
      version: 1,
      yamlSource,
      compiledStateMachine: '{}',
      status: 'draft',
      agentId,
      versions: {
        create: { version: 1, yamlSource },
      },
    },
  });

  res.status(201).json(contract);
});

// ── POST /api/contracts/:id/compile ───────────────────────────────

router.post('/:id/compile', async (req: Request, res: Response) => {
  const contract = await prisma.contract.findUnique({
    where: { id: req.params.id as string },
  });
  if (!contract) {
    res.status(404).json({ error: 'Contract not found' });
    return;
  }

  const result = compilerService.compile(contract.yamlSource);

  await prisma.contract.update({
    where: { id: contract.id },
    data: {
      compiledStateMachine: JSON.stringify(result.machine.toJSON()),
      status: contract.status === 'draft' ? 'simulated' : contract.status,
    },
  });

  res.json({
    contractId: contract.id,
    predicateCount: result.ir.predicates.length,
    predicates: result.ir.predicates.map(p => ({ id: p.id, type: p.type })),
  });
});

// ── POST /api/contracts/:id/simulate ──────────────────────────────

router.post('/:id/simulate', async (req: Request, res: Response) => {
  const contract = await prisma.contract.findUnique({
    where: { id: req.params.id as string },
  });
  if (!contract) {
    res.status(404).json({ error: 'Contract not found' });
    return;
  }

  const scenarioCount = req.body.scenarioCount ?? 20;
  const result = compilerService.compile(contract.yamlSource, {
    simulate: true,
    scenarioCount,
  });

  // Store simulation run
  if (result.simulation) {
    await prisma.simulationRun.create({
      data: {
        contractId: contract.id,
        scenarioCount: result.simulation.scenarioCount,
        passCount: result.simulation.passCount,
        failCount: result.simulation.failCount,
        coveragePercent: result.simulation.coveragePercent,
        deadRules: JSON.stringify(result.simulation.deadRules),
        conflictingRules: JSON.stringify(result.simulation.conflictingRules),
      },
    });

    await prisma.contract.update({
      where: { id: contract.id },
      data: { status: 'simulated' },
    });
  }

  res.json({
    contractId: contract.id,
    simulation: result.simulation,
  });
});

// ── POST /api/contracts/:id/deploy ────────────────────────────────

router.post('/:id/deploy', async (req: Request, res: Response) => {
  const contract = await prisma.contract.findUnique({
    where: { id: req.params.id as string },
  });
  if (!contract) {
    res.status(404).json({ error: 'Contract not found' });
    return;
  }

  // Compile and register the enforcement machine
  const result = compilerService.compile(contract.yamlSource);
  runtimeProxy.registerAgentWithMachine(contract.agentId, result.machine);

  await prisma.contract.update({
    where: { id: contract.id },
    data: { status: 'deployed' },
  });

  res.json({
    contractId: contract.id,
    status: 'deployed',
    agentId: contract.agentId,
    message: `Contract "${contract.name}" deployed — enforcement active for agent ${contract.agentId}`,
  });
});

// ── GET /api/contracts/:id/versions ───────────────────────────────

router.get('/:id/versions', async (req: Request, res: Response) => {
  const versions = await prisma.contractVersion.findMany({
    where: { contractId: req.params.id as string },
    orderBy: { version: 'desc' },
  });
  res.json(versions);
});

// ── POST /api/contracts/:id/rollback/:versionId ───────────────────

router.post('/:id/rollback/:versionId', async (req: Request, res: Response) => {
  const version = await prisma.contractVersion.findUnique({
    where: { id: req.params.versionId as string },
  });
  if (!version || version.contractId !== (req.params.id as string)) {
    res.status(404).json({ error: 'Version not found for this contract' });
    return;
  }

  const contract = await prisma.contract.findUnique({
    where: { id: req.params.id as string },
  });
  if (!contract) {
    res.status(404).json({ error: 'Contract not found' });
    return;
  }

  // Create a new version that's a copy of the rollback target
  const newVersion = contract.version + 1;
  await prisma.contract.update({
    where: { id: contract.id },
    data: {
      yamlSource: version.yamlSource,
      version: newVersion,
      status: 'draft',
      compiledStateMachine: '{}',
      versions: {
        create: {
          version: newVersion,
          yamlSource: version.yamlSource,
          diffFromPrevious: `Rolled back to v${version.version}`,
        },
      },
    },
  });

  res.json({
    contractId: contract.id,
    rolledBackToVersion: version.version,
    newVersion,
    status: 'draft',
  });
});

export default router;
