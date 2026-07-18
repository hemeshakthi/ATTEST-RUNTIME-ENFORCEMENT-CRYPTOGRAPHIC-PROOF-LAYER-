/**
 * compiler.service.ts
 *
 * Orchestration layer for the full contract compilation pipeline:
 *
 *   YAML string
 *     ┌─────────────┐
 *     │  Validate    │  contract-schema.ts  (Zod)
 *     └──────┬──────┘
 *            ▼
 *     ┌─────────────┐
 *     │  Compile IR  │  ir-compiler.ts
 *     └──────┬──────┘
 *            ▼
 *     ┌─────────────┐
 *     │  Build SM    │  state-machine-builder.ts
 *     └──────┬──────┘
 *            ▼
 *     ┌─────────────┐
 *     │  Store       │  Prisma (Contract.compiledStateMachine)
 *     └─────────────┘
 *
 * Optionally runs the simulator before persisting.
 */

import { CapabilityContractSchema } from './contract-schema';
import { compileYamlToIR, CapabilityIR } from './ir-compiler';
import { buildEnforcementMachine, EnforcementMachine } from './state-machine-builder';
import { runSimulation, SimulationReport } from './simulator';
import { prisma } from '../config/database';
import { parse as parseYaml } from 'yaml';

// ── Public interface ──────────────────────────────────────────────

export interface CompileResult {
  ir: CapabilityIR;
  machine: EnforcementMachine;
  simulation: SimulationReport | null;
}

export interface CompileAndStoreResult extends CompileResult {
  contractId: string;
}

// ── Service ───────────────────────────────────────────────────────

export class CompilerService {

  /**
   * Full pipeline: YAML -> validate -> IR -> state machine.
   * Optionally runs a simulation pass.
   */
  compile(yamlSource: string, options?: { simulate?: boolean; scenarioCount?: number }): CompileResult {
    // Step 1 + 2: Parse + validate YAML -> IR
    const ir = compileYamlToIR(yamlSource);

    // Step 3: Build enforcement machine
    const machine = buildEnforcementMachine(ir);

    // Step 4 (optional): Simulate
    let simulation: SimulationReport | null = null;
    if (options?.simulate) {
      simulation = runSimulation(machine, options.scenarioCount ?? 20);
    }

    return { ir, machine, simulation };
  }

  /**
   * Validate-only — useful for the dashboard "check my YAML" flow.
   * Returns null on success, or a structured error.
   */
  validate(yamlSource: string): { valid: boolean; errors: string[] } {
    try {
      let raw: unknown;
      try {
        raw = parseYaml(yamlSource);
      } catch (e: any) {
        return { valid: false, errors: [`YAML parse error: ${e.message}`] };
      }

      const result = CapabilityContractSchema.safeParse(raw);
      if (!result.success) {
        return {
          valid: false,
          errors: result.error.errors.map(
            e => `${e.path.join('.')}: ${e.message}`,
          ),
        };
      }
      return { valid: true, errors: [] };
    } catch (e: any) {
      return { valid: false, errors: [e.message] };
    }
  }

  /**
   * Full pipeline + persist to database.
   *
   * Creates (or updates) a Contract row and a ContractVersion row,
   * storing the compiled state machine JSON in the contract.
   */
  async compileAndStore(
    yamlSource: string,
    agentId: string,
    contractName: string,
    options?: { simulate?: boolean; scenarioCount?: number },
  ): Promise<CompileAndStoreResult> {
    const result = this.compile(yamlSource, options);

    // Determine next version
    const existingContract = await prisma.contract.findFirst({
      where: { name: contractName, agentId },
      orderBy: { version: 'desc' },
    });

    const nextVersion = existingContract ? existingContract.version + 1 : 1;

    // Upsert contract
    const contract = await prisma.contract.create({
      data: {
        name: contractName,
        version: nextVersion,
        yamlSource,
        compiledStateMachine: JSON.stringify(result.machine.toJSON()),
        status: result.simulation ? 'simulated' : 'draft',
        agentId,
        versions: {
          create: {
            version: nextVersion,
            yamlSource,
            diffFromPrevious: existingContract
              ? `Upgraded from v${existingContract.version}`
              : null,
          },
        },
      },
    });

    // If simulation was run, store the SimulationRun
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
    }

    return {
      ...result,
      contractId: contract.id,
    };
  }
}

/** Singleton instance */
export const compilerService = new CompilerService();
