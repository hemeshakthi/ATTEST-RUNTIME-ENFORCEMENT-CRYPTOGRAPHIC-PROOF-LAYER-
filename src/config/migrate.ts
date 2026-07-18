/**
 * Programmatic database migration for Alpine Linux / NitroCloud.
 *
 * Prisma's CLI (`prisma migrate deploy`) uses a separate "schema engine"
 * native binary that fails on Alpine Linux when OpenSSL 3.x is present but
 * undetectable.  Instead of relying on the CLI, this module reads the raw
 * SQL migration files and executes them through PrismaClient (query engine),
 * which our database.ts OpenSSL fix already handles.
 */

import { readFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';
import { prisma } from './database';

export async function ensureDatabaseReady(): Promise<void> {
  // 1. Check if tables already exist
  try {
    await prisma.$queryRawUnsafe(`SELECT 1 FROM "Agent" LIMIT 1`);
    console.log('[Migrate] Database already initialised — skipping.');
    return;
  } catch {
    console.log('[Migrate] Tables not found — running migrations…');
  }

  // 2. Find all migration directories (sorted chronologically)
  const migrationsRoot = join(process.cwd(), 'prisma', 'migrations');
  if (!existsSync(migrationsRoot)) {
    throw new Error(`Migrations directory not found: ${migrationsRoot}`);
  }

  const migrationDirs = readdirSync(migrationsRoot, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name)
    .sort();

  // 3. Execute each migration's SQL
  for (const dir of migrationDirs) {
    const sqlPath = join(migrationsRoot, dir, 'migration.sql');
    if (!existsSync(sqlPath)) continue;

    console.log(`[Migrate] Applying ${dir}…`);
    const sql = readFileSync(sqlPath, 'utf-8');

    // Split on semicolons, trim, and run each non-empty statement
    const statements = sql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));

    for (const stmt of statements) {
      await prisma.$executeRawUnsafe(stmt);
    }
  }

  console.log('[Migrate] ✅ All migrations applied successfully.');
}
