/**
 * contract-schema.ts
 * 
 * Zod schema for validating Capability Contract YAML.
 * A capability contract defines what an agent is allowed (and denied)
 * to do, along with rate limits, financial caps, expiry, and
 * delegation restrictions.
 */

import { z } from 'zod';

// ── Rate-limit string format: "<count>/<window>" ──────────────────
// e.g. "10/min", "100/hour", "5/sec"
const rateLimitRegex = /^(\d+)\/(sec|min|hour|day)$/;

export const RateLimitSchema = z.string().regex(
  rateLimitRegex,
  'Rate limit must match format "<count>/<window>" e.g. "10/min", "100/hour"'
);

// ── Expiry string format: "<number><unit>" ────────────────────────
// e.g. "24h", "7d", "30m"
const expiryRegex = /^(\d+)(s|m|h|d)$/;

export const ExpirySchema = z.string().regex(
  expiryRegex,
  'Expiry must match format "<number><unit>" e.g. "24h", "7d", "30m"'
);

// ── Main Capability Contract Schema ───────────────────────────────
export const CapabilityContractSchema = z.object({
  agent: z.string().min(1, 'Agent identifier is required'),
  allowed_tools: z.array(z.string().min(1)).min(1, 'At least one tool must be allowed'),
  denied_fields: z.array(z.string()).default([]),
  rate_limit: RateLimitSchema,
  financial_threshold: z.number().positive().optional(),
  expires: ExpirySchema,
  non_delegatable: z.boolean().default(false),
});

export type CapabilityContract = z.infer<typeof CapabilityContractSchema>;

// ── Helpers ───────────────────────────────────────────────────────

/**
 * Parse a rate-limit string into its numeric components.
 */
export function parseRateLimit(rl: string): { count: number; window: string; windowMs: number } {
  const match = rl.match(rateLimitRegex);
  if (!match) throw new Error(`Invalid rate limit: ${rl}`);
  const count = parseInt(match[1], 10);
  const window = match[2];
  const windowMs = {
    sec: 1_000,
    min: 60_000,
    hour: 3_600_000,
    day: 86_400_000,
  }[window]!;
  return { count, window, windowMs };
}

/**
 * Parse an expiry string into milliseconds.
 */
export function parseExpiry(exp: string): number {
  const match = exp.match(expiryRegex);
  if (!match) throw new Error(`Invalid expiry: ${exp}`);
  const num = parseInt(match[1], 10);
  const unit = match[2];
  const multiplier = { s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000 }[unit]!;
  return num * multiplier;
}
