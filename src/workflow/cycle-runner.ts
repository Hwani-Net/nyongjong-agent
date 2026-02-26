// Cycle Runner — orchestrates the AI circular workflow (6 stages)
import { createLogger } from '../utils/logger.js';
import { analyzeGoal, type UnderstandInput, type UnderstandOutput } from './understand.js';
import { createPrototypePlan, type PrototypePlan } from './prototype.js';
import { validate, type ValidationResult, type ShellResult } from './validate.js';
import { evolve, type EvolveOutput } from './evolve.js';
import { generateReport, type Report } from './report.js';

const log = createLogger('cycle-runner');

export type CycleStatus = 'idle' | 'understanding' | 'prototyping' | 'validating' | 'evolving' | 'reporting' | 'complete' | 'failed';

export interface CycleRunnerOptions {
  /** Maximum prototype→validate→evolve retries */
  maxRetries: number;
  /** Project root path */
  projectRoot: string;
  /** Shell runner function */
  runShell: (cmd: string, cwd: string) => Promise<ShellResult>;
}

export interface CycleState {
  status: CycleStatus;
  goal: string;
  currentAttempt: number;
  understanding?: UnderstandOutput;
  prototypePlan?: PrototypePlan;
  validationHistory: ValidationResult[];
  evolutionHistory: EvolveOutput[];
  report?: Report;
  startedAt: string;
  totalDurationMs: number;
}

/**
 * AI Circular Workflow: Understand → Prototype → Validate → Evolve → Report
 *
 * The core innovation: Design and code happen simultaneously,
 * with iterative self-healing. Only one human gate exists (at Report stage).
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
      // Stage 1: Understand
      this.state.status = 'understanding';
      log.info('━━━ Stage 1: Understand ━━━');
      this.state.understanding = analyzeGoal(input);

      // Stage 2: Prototype
      this.state.status = 'prototyping';
      log.info('━━━ Stage 2: Prototype ━━━');
      this.state.prototypePlan = createPrototypePlan({
        analysis: this.state.understanding.analysis,
        goal: input.goal,
        projectRoot: this.options.projectRoot,
      });

      // Stage 3+4: Validate → Evolve loop
      let lastValidation: ValidationResult | null = null;

      for (let attempt = 1; attempt <= this.options.maxRetries; attempt++) {
        this.state.currentAttempt = attempt;

        // Stage 3: Validate
        this.state.status = 'validating';
        log.info(`━━━ Stage 3: Validate (attempt ${attempt}) ━━━`);

        lastValidation = await validate({
          projectRoot: this.options.projectRoot,
          commands: this.state.prototypePlan.commands,
          runShell: this.options.runShell,
        });
        this.state.validationHistory.push(lastValidation);

        // If passed, break out
        if (lastValidation.passed) {
          log.info('✅ Validation passed!');
          break;
        }

        // Stage 4: Evolve
        this.state.status = 'evolving';
        log.info(`━━━ Stage 4: Evolve (attempt ${attempt}) ━━━`);

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

      // Stage 5: Report
      this.state.status = 'reporting';
      log.info('━━━ Stage 5: Report ━━━');

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
