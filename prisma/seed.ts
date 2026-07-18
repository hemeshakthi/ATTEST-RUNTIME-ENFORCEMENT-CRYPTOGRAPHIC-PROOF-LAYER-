import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

/**
 * Seed the Attest database with the demo delegation chain:
 *
 *   CEO Agent
 *     └─ grants "manage all finance operations" to Finance Agent
 *          └─ grants "approve payroll under ₹50,000" to Payroll Agent
 *
 * Each agent gets a proper capability contract YAML.
 * Delegation edges are validated subsets of the parent's contract.
 */
async function main() {
  console.log("Seeding database...\n");

  // ── 1. Create Agents ───────────────────────────────────────────

  const ceoAgent = await prisma.agent.create({
    data: {
      name: "CEO Agent",
      orgId: "org-1",
      status: "active"
    }
  });

  const financeAgent = await prisma.agent.create({
    data: {
      name: "Finance Agent",
      orgId: "org-1",
      status: "active"
    }
  });

  const payrollAgent = await prisma.agent.create({
    data: {
      name: "Payroll Agent",
      orgId: "org-1",
      status: "active"
    }
  });

  console.log("Agents created:", [ceoAgent.name, financeAgent.name, payrollAgent.name]);

  // ── 2. Create CEO Agent's Contract (root of trust) ─────────────
  //
  // The CEO has the broadest capabilities: all tools, high limits.
  
  const ceoContractYaml = `
agent: ${ceoAgent.id}
allowed_tools:
  - readBalance
  - transferMoney
  - closeAccount
  - checkLeaveBalance
  - approveLeave
  - approvePayroll
denied_fields:
  - ssn
rate_limit: "100/min"
financial_threshold: 1000000
expires: "30d"
non_delegatable: false
`.trim();

  const ceoContract = await prisma.contract.create({
    data: {
      name: "CEO Full Capabilities",
      version: 1,
      yamlSource: ceoContractYaml,
      compiledStateMachine: JSON.stringify({ state: "active" }),
      status: "deployed",
      agentId: ceoAgent.id,
      versions: {
        create: {
          version: 1,
          yamlSource: ceoContractYaml,
        }
      }
    }
  });

  console.log("CEO Contract created:", ceoContract.name);

  // ── 3. Create Finance Agent's Contract ─────────────────────────
  //
  // Finance Agent can manage financial tools only:
  //   readBalance, transferMoney, approvePayroll
  // Rate limit: 50/min, financial cap: 500000, 7-day expiry.
  
  const financeContractYaml = `
agent: ${financeAgent.id}
allowed_tools:
  - readBalance
  - transferMoney
  - approvePayroll
denied_fields:
  - ssn
  - password
rate_limit: "50/min"
financial_threshold: 500000
expires: "7d"
non_delegatable: false
`.trim();

  const financeContract = await prisma.contract.create({
    data: {
      name: "Finance Operations Contract",
      version: 1,
      yamlSource: financeContractYaml,
      compiledStateMachine: JSON.stringify({ state: "active" }),
      status: "deployed",
      agentId: financeAgent.id,
      versions: {
        create: {
          version: 1,
          yamlSource: financeContractYaml,
        }
      }
    }
  });

  console.log("Finance Contract created:", financeContract.name);

  // ── 4. Create Payroll Agent's Contract ─────────────────────────
  //
  // Payroll Agent can ONLY approve payroll under ₹50,000.
  // It must NOT be able to transfer money or close accounts.
  
  const payrollContractYaml = `
agent: ${payrollAgent.id}
allowed_tools:
  - approvePayroll
denied_fields:
  - ssn
  - password
  - bankAccount
rate_limit: "10/min"
financial_threshold: 50000
expires: "1d"
non_delegatable: true
`.trim();

  const payrollContract = await prisma.contract.create({
    data: {
      name: "Payroll Only Contract",
      version: 1,
      yamlSource: payrollContractYaml,
      compiledStateMachine: JSON.stringify({ state: "active" }),
      status: "deployed",
      agentId: payrollAgent.id,
      versions: {
        create: {
          version: 1,
          yamlSource: payrollContractYaml,
        }
      }
    }
  });

  console.log("Payroll Contract created:", payrollContract.name);

  // ── 5. Create Delegation Chain ─────────────────────────────────
  //
  // CEO -> Finance: "manage all finance operations"
  // Finance -> Payroll: "approve payroll under ₹50,000"

  const delegation1 = await prisma.delegationEdge.create({
    data: {
      fromAgentId: ceoAgent.id,
      toAgentId: financeAgent.id,
      scopedCapability: JSON.stringify({
        allowed_tools: ["readBalance", "transferMoney", "approvePayroll"],
        denied_fields: ["ssn", "password"],
        rate_limit: "50/min",
        financial_threshold: 500000,
        expires: "7d",
      }),
    }
  });

  const delegation2 = await prisma.delegationEdge.create({
    data: {
      fromAgentId: financeAgent.id,
      toAgentId: payrollAgent.id,
      scopedCapability: JSON.stringify({
        allowed_tools: ["approvePayroll"],
        denied_fields: ["ssn", "password", "bankAccount"],
        rate_limit: "10/min",
        financial_threshold: 50000,
        expires: "1d",
      }),
    }
  });

  console.log("Delegations created:", delegation1.id, delegation2.id);

  // ── Print Summary ──────────────────────────────────────────────

  console.log("\n--- SEEDED DATA ---");
  console.log("\nDelegation Chain:");
  console.log(`  ${ceoAgent.name} (all tools, ₹10,00,000 cap)`);
  console.log(`    └─> ${financeAgent.name} (readBalance, transferMoney, approvePayroll, ₹5,00,000 cap)`);
  console.log(`          └─> ${payrollAgent.name} (approvePayroll ONLY, ₹50,000 cap, non-delegatable)`);

  const agents = await prisma.agent.findMany();
  console.log("\nAgents:\n", JSON.stringify(agents, null, 2));

  const contracts = await prisma.contract.findMany();
  console.log("Contracts:\n", JSON.stringify(contracts, null, 2));

  const delegations = await prisma.delegationEdge.findMany();
  console.log("Delegations:\n", JSON.stringify(delegations, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
