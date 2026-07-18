/**
 * Barrel export for the compiler module.
 */
export { CapabilityContractSchema, parseRateLimit, parseExpiry } from './contract-schema';
export type { CapabilityContract } from './contract-schema';
export { compileYamlToIR, buildIR } from './ir-compiler';
export type { CapabilityIR, Predicate } from './ir-compiler';
export { buildEnforcementMachine } from './state-machine-builder';
export type { EnforcementMachine, EnforcementState, ProposedAction, EvaluationResult, Decision } from './state-machine-builder';
export { runSimulation } from './simulator';
export type { SimulationReport, ScenarioResult } from './simulator';
export { CompilerService, compilerService } from './compiler.service';
export type { CompileResult, CompileAndStoreResult } from './compiler.service';
