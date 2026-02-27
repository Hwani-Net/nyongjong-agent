// Cycle Runner — orchestrates the full AI circular workflow (Gate0 → Gate1 → Prototype → Validate → Evolve → Report)
import { createLogger } from '../utils/logger.js';
import { analyzeGoal, type UnderstandInput, type UnderstandOutput } from './understand.js';
import { createPrototypePlan, type PrototypePlan } from './prototype.js';
import { validate, type ValidationResult, type ShellResult } from './validate.js';
import { evolve, type EvolveOutput } from './evolve.js';
import { generateReport, type Report } from './report.js';
import {
  runBusinessGate,
  shouldRunBusinessGate,
  type BusinessGateResult,
} from './business-gate.js';
import { runPRDElicitation, type PRDElicitationResult } from './prd-elicitation.js';
import { recordGateDecision, setLastGate, setLastPRD } from '../core/shared-state.js';
import type { PersonaEngine } from '../personas/persona-engine.js';
import type { PersonaSimulator } from '../personas/persona-simulator.js';

const log = createLogger('cycle-runner');

export type CycleStatus =
  | 'idle'
  | 'understanding'
  | 'gate0'
  | 'gate1'
  | 'prototyping'
  | 'validating'
  | 'evolving'
  | 'reporting'
  | 'complete'
  | 'failed';

export interface CycleRunnerOptions {
  /** Maximum prototype→validate→evolve retries */
  maxRetries: number;
  /** Project root path */
  projectRoot: string;
  /** Shell runner function */
  runShell: (cmd: string, cwd: string) => Promise<ShellResult>;
  /** Optional callback to record a gate decision in Dashboard */
  onGateDecision?: (goal: string, verdict: string) => void;
  /** Optional PersonaEngine for Gate 0 & Gate 1 */
  personaEngine?: PersonaEngine;
  /** Optional PersonaSimulator for LLM-based reviews */
  personaSimulator?: PersonaSimulator;
}

export interface CycleState {
  status: CycleStatus;
  goal: string;
  currentAttempt: number;
  understanding?: UnderstandOutput;
  businessGate?: BusinessGateResult;
  prdResult?: PRDElicitationResult;
  prototypePlan?: PrototypePlan;
  validationHistory: ValidationResult[];
  evolutionHistory: EvolveOutput[];
  report?: Report;
  startedAt: string;
  totalDurationMs: number;
}

/**
 * AI Circular Workflow:
 *   Gate 0 (Business) → Gate 1 (PRD) → Prototype → Validate → Evolve → Report
 *
 * Gate 0 & 1 are skipped automatically for debugging/refactoring/simple tasks.
 * Only one human review gate exists: the final Report stage.
 */
export class CycleRunner {
  private options: CycleRunnerOptions;
  private state: CycleState;

  constructor(options: CycleRunnerOptions) {
    this.options = options;
    this.state = this.createInitialState('');
    log.info('CycleRunner initialized', { maxRetries: options.maxRetries });
  }

  /**
   * Get the current cycle state.
   */
  getState(): Readonly<CycleState> {
    return { ...this.state };
  }

  /**
   * Run the full AI cycle for a given goal.
   */
  async run(input: UnderstandInput): Promise<Report> {
    const startTime = Date.now();
    this.state = this.createInitialState(input.goal);

    log.info(`🔄 Cycle started: "${input.goal.slice(0, 80)}"`);

    try {
      // ── Stage 1: Understand ───────────────────────────────────────────────
      this.state.status = 'understanding';
      log.info('━━━ Stage 1: Understand ━━━');
      this.state.understanding = analyzeGoal(input);
      const { taskType, complexity } = this.state.understanding.analysis;

      // ── Stage 2: Gate 0 — Business viability ─────────────────────────────
      this.state.status = 'gate0';
      log.info('━━━ Stage 2: Gate 0 (Business Gate) ━━━');

      const gateNeed = shouldRunBusinessGate(input.goal, taskType, complexity);
      log.info(`Gate 0 decision: ${gateNeed.need} — ${gateNeed.reason}`);

      if (gateNeed.need === 'REQUIRED' && this.options.personaEngine) {
        const ollamaOk = this.options.personaSimulator
          ? await this.options.personaSimulator.healthCheck().then(h => h.available).catch(() => false)
          : false;

        this.state.businessGate = await runBusinessGate(
          {
            goal: input.goal,
            analysis: this.state.understanding,
            simulator: ollamaOk ? this.options.personaSimulator : undefined,
          },
          this.options.personaEngine,
        );

        // Persist to shared-state → Dashboard
        recordGateDecision({
          goal: input.goal,
          verdict: this.state.businessGate.verdict,
          taskType,
        });
        setLastGate({
          reviews: this.state.businessGate.reviews,
          hasGrounding: !!this.state.businessGate.groundingData,
          goal: input.goal,
          verdict: this.state.businessGate.verdict,
          ts: Date.now(),
        });

        if (this.state.businessGate.verdict === 'FAIL') {
          log.warn('Gate 0 FAIL — aborting cycle');
          const failReport = generateReport({
            goal: input.goal,
            analysis: this.state.understanding.analysis,
            validation: { passed: false, checks: [], issues: ['Gate 0 (Business Gate) FAIL — cycle aborted'], totalDurationMs: 0 },
            totalDurationMs: Date.now() - startTime,
            cycleIterations: 0,
          });
          this.state.report = failReport;
          this.state.status = 'failed';
          this.state.totalDurationMs = Date.now() - startTime;
          return failReport;
        }
      } else {
        // SKIP or ASK_HUMAN (no engine) — record as SKIP
        recordGateDecision({ goal: input.goal, verdict: 'SKIP', taskType });
      }

      // ── Stage 3: Gate 1 — PRD elicitation ────────────────────────────────
      this.state.status = 'gate1';
      log.info('━━━ Stage 3: Gate 1 (PRD) ━━━');

      if (gateNeed.need === 'REQUIRED' && this.options.personaEngine) {
        const ollamaOk2 = this.options.personaSimulator
          ? await this.options.personaSimulator.healthCheck().then(h => h.available).catch(() => false)
          : false;

        this.state.prdResult = await runPRDElicitation(
          {
            goal: input.goal,
            analysis: this.state.understanding,
            projectContext: input.projectContext,
            simulator: ollamaOk2 ? this.options.personaSimulator : undefined,
          },
          this.options.personaEngine,
        );

        // Persist to shared-state → Dashboard
        setLastPRD({
          version: this.state.prdResult.prd.version,
          verdicts: this.state.prdResult.verdicts.map((v, i) => ({
            round: i + 1,
            status: v.verdict,
            issues: v.blockers,
          })),
          rounds: this.state.prdResult.rounds,
          goal: input.goal,
          ts: Date.now(),
        });

        log.info('Gate 1 (PRD) complete', {
          version: this.state.prdResult.prd.version,
          allSatisfied: this.state.prdResult.allSatisfied,
          rounds: this.state.prdResult.rounds,
        });
      }

      // ── Stage 4: Prototype ────────────────────────────────────────────────
      this.state.status = 'prototyping';
      log.info('━━━ Stage 4: Prototype ━━━');
      this.state.prototypePlan = createPrototypePlan({
        analysis: this.state.understanding.analysis,
        goal: input.goal,
        projectRoot: this.options.projectRoot,
      });

      // ── Stage 5+6: Validate → Evolve loop ────────────────────────────────
      let lastValidation: ValidationResult | null = null;

      for (let attempt = 1; attempt <= this.options.maxRetries; attempt++) {
        this.state.currentAttempt = attempt;

        // Stage 5: Validate
        this.state.status = 'validating';
        log.info(`━━━ Stage 5: Validate (attempt ${attempt}) ━━━`);

        lastValidation = await validate({
          projectRoot: this.options.projectRoot,
          commands: this.state.prototypePlan.commands,
          runShell: this.options.runShell,
        });
        this.state.validationHistory.push(lastValidation);

        if (lastValidation.passed) {
          log.info('✅ Validation passed!');
          break;
        }

        // Stage 6: Evolve
        this.state.status = 'evolving';
        log.info(`━━━ Stage 6: Evolve (attempt ${attempt}) ━━━`);

        const evolution = evolve({
          validation: lastValidation,
          attempt,
          maxAttempts: this.options.maxRetries,
        });
        this.state.evolutionHistory.push(evolution);

        if (!evolution.shouldRetry) {
          log.warn('Evolution decided not to retry');
          break;
        }

        log.info(`Retrying with ${evolution.fixes.length} suggested fixes...`);
      }

      // ── Stage 7: Report ───────────────────────────────────────────────────
      this.state.status = 'reporting';
      log.info('━━━ Stage 7: Report ━━━');

      this.state.totalDurationMs = Date.now() - startTime;

      const report = generateReport({
        goal: input.goal,
        analysis: this.state.understanding.analysis,
        validation: lastValidation!,
        evolutionHistory: this.state.evolutionHistory.length > 0 ? this.state.evolutionHistory : undefined,
        totalDurationMs: this.state.totalDurationMs,
        cycleIterations: this.state.currentAttempt,
      });

      this.state.report = report;
      this.state.status = lastValidation!.passed ? 'complete' : 'failed';

      // Notify gate decision to Dashboard callback (run_cycle path)
      if (this.options.onGateDecision) {
        const verdict = lastValidation!.passed ? 'PASS' : 'FAIL';
        this.options.onGateDecision(input.goal, verdict);
      }

      log.info(`🔄 Cycle ${this.state.status}: ${report.status} (${this.state.totalDurationMs}ms)`);

      return report;
    } catch (error) {
      this.state.status = 'failed';
      this.state.totalDurationMs = Date.now() - startTime;
      log.error('Cycle failed with unexpected error', error);
      throw error;
    }
  }

  private createInitialState(goal: string): CycleState {
    return {
      status: 'idle',
      goal,
      currentAttempt: 0,
      validationHistory: [],
      evolutionHistory: [],
      startedAt: new Date().toISOString(),
      totalDurationMs: 0,
    };
  }
}
