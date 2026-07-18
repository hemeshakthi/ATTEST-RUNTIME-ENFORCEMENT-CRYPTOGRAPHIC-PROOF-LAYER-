import { readdirSync } from 'fs';
import { join } from 'path';

/**
 * Fix Prisma OpenSSL detection on Alpine Linux (musl).
 * Prisma can't detect the OpenSSL version and defaults to 1.1.x,
 * which doesn't exist on modern Alpine (OpenSSL 3.x).
 * We find the correct engine binary and tell Prisma to use it.
 */
if (process.platform === 'linux' && !process.env.PRISMA_QUERY_ENGINE_LIBRARY) {
  try {
    const prismaDir = join(process.cwd(), 'node_modules', '.prisma', 'client');
    const engine = readdirSync(prismaDir)
      .filter(f => f.startsWith('libquery_engine') && f.endsWith('.node'))
      .find(f => f.includes('openssl-3.0.x'));
    if (engine) {
      process.env.PRISMA_QUERY_ENGINE_LIBRARY = join(prismaDir, engine);
    }
  } catch {
    // Engine detection failed — Prisma will use its default
  }
}

import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient();
