// Cycle Runner — orchestrates the full AI circular workflow (Gate0 → Gate1 → Prototype → Validate → Evolve → Report)
import { createLogger } from '../utils/logger.js';
import { notifyClawStageChange, notifyClawComplete } from './claw-bridge.js';
import { analyzeGoal, type UnderstandInput, type UnderstandOutput } from './understand.js';
import { createPrototypePlan, type PrototypePlan } from './prototype.js';
import { validate, type ValidationResult, type ShellResult } from './validate.js';
import { evolve, type EvolveOutput } from './evolve.js';
import { generateReport, type Report } from './report.js';
import type { GitWorktree } from '../execution/git-worktree.js';
import {
  runBusinessGate,
  shouldRunBusinessGate,
  type BusinessGateResult,
} from './business-gate.js';
import { runPRDElicitation, type PRDElicitationResult } from './prd-elicitation.js';
import { recordGateDecision, setLastGate, setLastPRD } from '../core/shared-state.js';
import type { PersonaEngine } from '../personas/persona-engine.js';
import type { PersonaSimulator } from '../personas/persona-simulator.js';
import type { ObsidianStore } from '../core/obsidian-store.js';

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
  /** Optional callback when workflow stage changes */
  onStageChange?: (stage: CycleStatus, goal: string) => void;
  /** Optional PersonaEngine for Gate 0 & Gate 1 */
  personaEngine?: PersonaEngine;
  /** Optional PersonaSimulator for LLM-based reviews */
  personaSimulator?: PersonaSimulator;
  /** Optional ObsidianStore for persisting workflow state across sessions */
  obsidianStore?: ObsidianStore;
  /** Optional GitWorktree for branch isolation per task */
  gitWorktree?: GitWorktree;
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
   * Set status + fire onStageChange callback + Claw visual bridge.
   */
  private setStatus(status: CycleStatus): void {
    this.state.status = status;
    // Fire user callback (non-blocking)
    if (this.options.onStageChange) {
      try { this.options.onStageChange(status, this.state.goal); } catch { /* non-blocking */ }
    }
    // Notify Claw visual bridge (non-blocking, fire-and-forget)
    notifyClawStageChange(status, this.state.goal).catch(() => { /* non-blocking */ });
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
      this.setStatus('understanding');
      log.info('━━━ Stage 1: Understand ━━━');
      this.state.understanding = analyzeGoal(input);
      const { taskType, complexity } = this.state.understanding.analysis;

      // ── Stage 2: Gate 0 — Business viability ─────────────────────────────
      this.setStatus('gate0');
      log.info('━━━ Stage 2: Gate 0 (Business Gate) ━━━');

      const gateNeed = shouldRunBusinessGate(input.goal, taskType, complexity);
      // forceGates=true → /자율 New MVP 모드: complexity 무관하게 항상 REQUIRED 처리
      const effectiveGateNeed = input.forceGates
        ? { need: 'REQUIRED' as const, reason: 'forceGates=true (/자율 모드)' }
        : gateNeed;
      log.info(`Gate 0 decision: ${effectiveGateNeed.need} — ${effectiveGateNeed.reason}${input.forceGates ? ' [FORCED]' : ''}`);

      if (input.skipGates) {
        log.info('Gate 0 skipped (skipGates=true)');
        recordGateDecision({ goal: input.goal, verdict: 'SKIP', taskType });
      } else if (effectiveGateNeed.need === 'REQUIRED' && this.options.personaEngine) {
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
          this.setStatus('failed');
          this.state.totalDurationMs = Date.now() - startTime;
          return failReport;
        }
      } else {
        // SKIP or ASK_HUMAN (no engine) — record as SKIP
        recordGateDecision({ goal: input.goal, verdict: 'SKIP', taskType });
      }

      // ── Stage 3: Gate 1 — PRD elicitation ────────────────────────────────
      this.setStatus('gate1');
      log.info('━━━ Stage 3: Gate 1 (PRD) ━━━');

      if (!input.skipGates && (effectiveGateNeed.need === 'REQUIRED' || input.forceGates) && this.options.personaEngine) {
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

      // ── Stage 4: Prototype (with optional Git Worktree isolation) ────────
      this.setStatus('prototyping');
      log.info('━━━ Stage 4: Prototype ━━━');

      // Create isolated worktree branch for this task
      let worktreeBranch: string | null = null;
      let worktreePath: string | null = null;
      if (this.options.gitWorktree) {
        const slug = input.goal
          .toLowerCase()
          .replace(/[^a-z0-9가-힣]/g, '-')
          .replace(/-+/g, '-')
          .slice(0, 40);
        worktreeBranch = `task/${slug}-${Date.now().toString(36)}`;
        worktreePath = `${this.options.projectRoot}/.worktrees/${worktreeBranch.replace(/\//g, '-')}`;
        const created = await this.options.gitWorktree.create(worktreePath, worktreeBranch);
        if (created) {
          log.info(`🌿 Isolated worktree created: ${worktreeBranch}`);
        } else {
          log.warn('Failed to create worktree — continuing on main branch');
          worktreeBranch = null;
          worktreePath = null;
        }
      }

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
        this.setStatus('validating');
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
        this.setStatus('evolving');
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
      this.setStatus('reporting');
      log.info('━━━ Stage 7: Report ━━━');

      this.state.totalDurationMs = Date.now() - startTime;

      const report = generateReport({
        goal: input.goal,
        analysis: this.state.understanding.analysis,
        validation: lastValidation!,
        evolutionHistory: this.state.evolutionHistory.length > 0 ? this.state.evolutionHistory : undefined,
        totalDurationMs: this.state.totalDurationMs,
        cycleIterations: this.state.currentAttempt,
        businessGateVerdict: this.state.businessGate?.verdict,
        prdResult: this.state.prdResult ? {
          version: this.state.prdResult.prd.version,
          rounds: this.state.prdResult.rounds,
          allSatisfied: this.state.prdResult.allSatisfied,
        } : undefined,
        forceGates: input.forceGates,
      });

      this.state.report = report;
      this.setStatus(lastValidation!.passed ? 'complete' : 'failed');

      // ── Git Worktree: merge on success, cleanup on failure ──
      if (this.options.gitWorktree && worktreeBranch && worktreePath) {
        if (lastValidation!.passed) {
          const merged = await this.options.gitWorktree.mergeAndCleanup(worktreePath, worktreeBranch);
          if (merged) {
            log.info(`🌿 Worktree merged to main: ${worktreeBranch}`);
          } else {
            log.warn(`Worktree merge failed for ${worktreeBranch} — branch preserved for manual review`);
          }
        } else {
          // Validation failed — remove worktree but keep branch for inspection
          await this.options.gitWorktree.remove(worktreePath);
          log.info(`🌿 Worktree cleaned up (validation failed): ${worktreeBranch} — branch preserved`);
        }
      }

      // Notify Claw that all agents should return to idle
      notifyClawComplete(input.goal).catch(() => { /* non-blocking */ });

      // Notify gate decision to Dashboard callback (run_cycle path)
      if (this.options.onGateDecision) {
        const verdict = lastValidation!.passed ? 'PASS' : 'FAIL';
        this.options.onGateDecision(input.goal, verdict);
      }

      // ── Persist workflow state to Obsidian for cross-session continuity ──
      await this.persistWorkflowState(input.goal);

      log.info(`🔄 Cycle ${this.state.status}: ${report.status} (${this.state.totalDurationMs}ms)`);

      return report;
    } catch (error) {
      this.setStatus('failed');
      notifyClawComplete(input.goal).catch(() => { /* non-blocking */ });
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

  /**
   * Persist workflow state to Obsidian vault for cross-session continuity.
   * Path format: workflow_state/{sanitized-goal-slug}.md
   * Next Antigravity session can read this via memory_search to resume.
   */
  private async persistWorkflowState(goal: string): Promise<void> {
    if (!this.options.obsidianStore) {
      log.debug('No obsidianStore provided — skipping workflow state persistence');
      return;
    }

    try {
      const slug = goal
        .toLowerCase()
        .replace(/[^a-z0-9가-힣\s]/g, '')
        .replace(/\s+/g, '-')
        .slice(0, 60);

      const path = `뇽죵이Agent/workflow_state/${slug}.md`;

      const completedStages: string[] = [];
      if (this.state.understanding) completedStages.push('understand');
      if (this.state.businessGate) completedStages.push('gate0');
      if (this.state.prdResult) completedStages.push('gate1');
      if (this.state.prototypePlan) completedStages.push('prototype');
      if (this.state.validationHistory.length > 0) completedStages.push('validate');
      if (this.state.evolutionHistory.length > 0) completedStages.push('evolve');
      if (this.state.report) completedStages.push('report');

      const content = [
        `# Workflow State: ${goal.slice(0, 80)}`,
        '',
        `- **Status**: ${this.state.status}`,
        `- **Started**: ${this.state.startedAt}`,
        `- **Duration**: ${this.state.totalDurationMs}ms`,
        `- **Attempts**: ${this.state.currentAttempt}`,
        `- **Completed Stages**: ${completedStages.join(' → ')}`,
        '',
        this.state.businessGate ? `## Gate 0 Result\n- Verdict: ${this.state.businessGate.verdict}` : '',
        this.state.prdResult ? `## Gate 1 Result\n- Version: ${this.state.prdResult.prd.version}\n- Rounds: ${this.state.prdResult.rounds}\n- All Satisfied: ${this.state.prdResult.allSatisfied}` : '',
        this.state.report ? `## Report\n- Status: ${this.state.report.status}` : '',
      ].filter(Boolean).join('\n');

      await this.options.obsidianStore.writeNote(path, content, {
        type: 'workflow_state',
        goal: goal.slice(0, 120),
        status: this.state.status,
        completedStages,
        updatedAt: new Date().toISOString(),
      });

      log.info(`Workflow state persisted to ${path}`);
    } catch (err) {
      log.warn('Failed to persist workflow state (non-fatal)', err);
    }
  }
}
