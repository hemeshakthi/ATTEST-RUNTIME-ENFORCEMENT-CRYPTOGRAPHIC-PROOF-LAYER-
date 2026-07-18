/**
 * server.ts
 *
 * Lightweight HTTP server (Express) serving the Dashboard API.
 * Runs alongside the NitroStack MCP server as a second process on its
 * own port (e.g. 3001).
 *
 * Its ONLY job is to expose the Attest service functions as REST
 * endpoints for the frontend.
 */

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';

// Import routers
import contractsRouter from './routes/contracts.routes';
import runtimeRouter from './routes/runtime.routes';
import receiptsRouter, { demoRouter } from './routes/receipts.routes';
import violationsRouter from './routes/violations.routes';
import agentsRouter, { delegationRouter } from './routes/agents.routes';

const app = express();

// ── Middleware ────────────────────────────────────────────────────

app.use(cors());
app.use(express.json());

// Basic Request Logging
app.use((req: Request, res: Response, next: NextFunction) => {
  console.log(`[Dashboard API] ${req.method} ${req.url}`);
  next();
});

// ── Routes ────────────────────────────────────────────────────────

app.use('/api/contracts', contractsRouter);
app.use('/api/runtime', runtimeRouter);
app.use('/api/receipts', receiptsRouter);
app.use('/api/demo', demoRouter);
app.use('/api/violations', violationsRouter);
app.use('/api/agents', agentsRouter);
app.use('/api/delegation', delegationRouter);

// Health check
app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', service: 'attest-dashboard-api' });
});

// ── Error Handling ────────────────────────────────────────────────

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error(`[Dashboard API] Error:`, err);
  res.status(500).json({
    error: 'Internal Server Error',
    message: err.message,
  });
});

// ── Server Start ──────────────────────────────────────────────────

const PORT = process.env.API_PORT || 3001;

import { runtimeProxy } from '../enforcement';

app.listen(PORT, async () => {
  await runtimeProxy.initializeFromDb();
  console.log(`🚀 Dashboard API server running on http://localhost:${PORT}`);
});
