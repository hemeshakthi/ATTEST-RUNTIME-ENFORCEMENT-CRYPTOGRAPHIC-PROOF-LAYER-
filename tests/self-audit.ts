/**
 * self-audit.ts — Checkpoint 1 Integration Tests (Checks 5 & 6)
 *
 * 5. Compile a sample contract, call a tool that violates it,
 *    confirm BLOCKED, confirm receipt is generated.
 * 6. Verify chain is valid, tamper a receipt, confirm chain breaks.
 */

import { runtimeProxy } from '../src/enforcement/runtime-proxy';
import { compileYamlToIR, buildEnforcementMachine } from '../src/compiler';
import { generateReceipt } from '../src/attestation/receipt-generator';
import { verifyReceiptChain, tamperReceipt, getReceipts } from '../src/attestation/attestation.service';
import { prisma } from '../src/config/database';

const READ_ONLY_CONTRACT = `
agent: audit-test-agent
allowed_tools:
  - readBalance
denied_fields:
  - ssn
  - password
rate_limit: "3/min"
expires: "24h"
non_delegatable: true
`.trim();

async function main() {
  console.log('=== CHECKPOINT 1 — SELF-AUDIT ===\n');

  // We need a contract in the DB to attach receipts to
  const agent = await prisma.agent.findFirst();
  if (!agent) {
    console.error('FAIL: No agents found in database');
    process.exit(1);
  }

  const contract = await prisma.contract.create({
    data: {
      name: 'Audit Test Contract',
      version: 1,
      yamlSource: READ_ONLY_CONTRACT,
      compiledStateMachine: '{}',
      status: 'deployed',
      agentId: agent.id,
    },
  });
  console.log(`Created test contract: ${contract.id}`);

  // ── CHECK 5: Compile contract, enforce, check BLOCK ───────

  console.log('\n--- CHECK 5: Enforcement Simulation ---');

  // Compile and register
  const ir = compileYamlToIR(READ_ONLY_CONTRACT);
  const machine = buildEnforcementMachine(ir);
  runtimeProxy.registerAgentWithMachine(agent.id, machine);
  console.log('✅ Contract compiled and agent registered');

  // 5a. ALLOWED call
  const allowResult = await runtimeProxy.enforce(
    agent.id,
    'readBalance',
    { accountId: 'acc-1' },
    () => ({ data: 'snapshot' }),
    async () => ({ balance: 1000 }),
  );
  console.log(`readBalance → ${allowResult.decision}`);
  if (allowResult.decision !== 'ALLOWED') {
    console.error('FAIL: readBalance should be ALLOWED');
    process.exit(1);
  }
  console.log('✅ readBalance correctly ALLOWED');

  // Generate receipt for allowed call
  const allowedReceipt = await generateReceipt(allowResult, contract.id);
  console.log(`✅ Receipt generated for ALLOWED call: ${allowedReceipt.id}`);

  // 5b. BLOCKED call — tool not in allow-list
  const blockResult = await runtimeProxy.enforce(
    agent.id,
    'transferMoney',
    { amount: 500 },
    () => ({ data: 'snapshot' }),
    async () => {
      throw new Error('THIS SHOULD NEVER EXECUTE');
    },
  );
  console.log(`transferMoney → ${blockResult.decision}`);
  if (blockResult.decision !== 'BLOCKED') {
    console.error('FAIL: transferMoney should be BLOCKED');
    process.exit(1);
  }
  if (blockResult.decision === 'BLOCKED') {
    console.log(`✅ transferMoney correctly BLOCKED (rule: ${blockResult.ruleId}, reason: ${blockResult.reason})`);
  }

  // Generate receipt for blocked call
  const blockedReceipt = await generateReceipt(blockResult, contract.id);
  console.log(`✅ Receipt generated for BLOCKED call: ${blockedReceipt.id}`);

  // Verify the receipt stored the correct reason
  const storedReceipt = await prisma.executionReceipt.findUnique({
    where: { id: blockedReceipt.id },
  });
  if (!storedReceipt) {
    console.error('FAIL: Blocked receipt not found in DB');
    process.exit(1);
  }
  if (storedReceipt.decision !== 'blocked') {
    console.error(`FAIL: Expected decision "blocked", got "${storedReceipt.decision}"`);
    process.exit(1);
  }
  console.log(`✅ Blocked receipt persisted with correct reason: "${storedReceipt.reasonText}"`);

  // 5c. BLOCKED call — denied field present
  const fieldBlockResult = await runtimeProxy.enforce(
    agent.id,
    'readBalance',
    { accountId: 'acc-1', ssn: '123-45-6789' },
    () => ({ data: 'snapshot' }),
    async () => ({ balance: 1000 }),
  );
  if (fieldBlockResult.decision !== 'BLOCKED') {
    console.error('FAIL: readBalance with denied field should be BLOCKED');
    process.exit(1);
  }
  const fieldReceipt = await generateReceipt(fieldBlockResult, contract.id);
  console.log(`✅ Field denial correctly BLOCKED and receipt generated: ${fieldReceipt.id}`);

  // ── CHECK 6: Hash chain verification + tamper detection ────

  console.log('\n--- CHECK 6: Hash Chain Verification ---');

  // 6a. Verify chain is valid (3 receipts now)
  const verification1 = await verifyReceiptChain(contract.id);
  console.log(`Chain verification: valid=${verification1.valid}, checked=${verification1.checkedCount}`);
  if (!verification1.valid) {
    console.error('FAIL: Chain should be valid before tampering');
    process.exit(1);
  }
  console.log(`✅ Chain is valid with ${verification1.checkedCount} receipts`);

  // 6b. Tamper the first receipt
  const tampResult = await tamperReceipt(allowedReceipt.id, { accountId: 'HACKED', amount: 999999 });
  console.log(`Tamper result: ${tampResult.message}`);
  if (!tampResult.success) {
    console.error('FAIL: Tamper should succeed');
    process.exit(1);
  }
  console.log('✅ Receipt tampered successfully');

  // 6c. Verify chain again — should now be broken
  const verification2 = await verifyReceiptChain(contract.id);
  console.log(`Chain verification after tamper: valid=${verification2.valid}, brokenAt=${verification2.brokenAtReceiptId}`);
  if (verification2.valid) {
    console.error('FAIL: Chain should be INVALID after tampering');
    process.exit(1);
  }
  console.log(`✅ Chain correctly detected as BROKEN at receipt: ${verification2.brokenAtReceiptId}`);

  // ── Cleanup ────────────────────────────────────────────────

  console.log('\n=== ALL SELF-AUDIT CHECKS PASSED ===');

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error('SELF-AUDIT FAILED:', e);
  await prisma.$disconnect();
  process.exit(1);
});
