// Cycle Runner — orchestrates the full AI circular workflow
// Gate0 → Gate1 → Prototype → Validate → Evolve → TeamLead Review → Visual Check → Report
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
import type { LLMRouter, ReviewResponse } from '../core/llm-router.js';

const log = createLogger('cycle-runner');

export type CycleStatus =
  | 'idle'
  | 'understanding'
  | 'gate0'
  | 'gate1'
  | 'prototyping'
  | 'validating'
  | 'evolving'
  | 'reviewing'       // ADR-014: Team Lead code review
  | 'visual_check'    // ADR-014: Browser visual verification
  | 'reporting'
  | 'complete'
  | 'failed';

/** Result of Team Lead code review stage */
export interface TeamLeadReviewResult {
  /** PASS, WARN, or BLOCK */
  verdict: 'PASS' | 'WARN' | 'BLOCK';
  /** Full review response from external LLM */
  review: ReviewResponse;
  /** Number of attempts (1 or 2 if auto-retried after BLOCK) */
  attempts: number;
}

/** Result of browser visual check stage */
export interface VisualCheckResult {
  /** Whether the visual check passed */
  passed: boolean;
  /** Screenshot path if captured */
  screenshotPath?: string;
  /** Notes from the visual check */
  notes: string;
}

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
  /** Optional LLMRouter for Team Lead code review (ADR-014) */
  llmRouter?: LLMRouter;
  /** Optional browser visual check callback (ADR-014). Returns pass/fail + notes. */
  onVisualCheck?: (goal: string, projectRoot: string) => Promise<VisualCheckResult>;
  /** Max retries when Team Lead returns BLOCK verdict (default: 3) */
  maxReviewRetries?: number;
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
  /** ADR-014: Team Lead review result */
  teamLeadReview?: TeamLeadReviewResult;
  /** ADR-014: Browser visual check result */
  visualCheck?: VisualCheckResult;
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
            // ADR-011: Inject Gate 0 business constraints into PRD generation
            businessConstraints: this.state.businessGate
              ? [
                  `Gate 0 판정: ${this.state.businessGate.verdict}`,
                  ...(this.state.businessGate.reason ? [`사유: ${this.state.businessGate.reason}`] : []),
                  ...(this.state.businessGate.pivotSuggestion ? [`피봇 제안: ${this.state.businessGate.pivotSuggestion}`] : []),
                  ...this.state.businessGate.reviews.map(r => `${r.personaName}: ${r.feedback.slice(0, 100)}`),
                ]
              : undefined,
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

      // ── Stage 5.5: Team Lead Code Review (ADR-014) ────────────────────────
      if (lastValidation!.passed && this.options.llmRouter) {
        this.setStatus('reviewing');
        log.info('━━━ Stage 5.5: Team Lead Code Review ━━━');

        const maxReviewRetries = this.options.maxReviewRetries ?? 3;
        let reviewAttempts = 0;
        let finalReview: ReviewResponse | null = null;
        let reviewVerdict: 'PASS' | 'WARN' | 'BLOCK' = 'BLOCK';

        for (let reviewAttempt = 1; reviewAttempt <= maxReviewRetries; reviewAttempt++) {
          reviewAttempts = reviewAttempt;
          log.info(`Team Lead review attempt ${reviewAttempt}/${maxReviewRetries}`);

          const reviewRequest = this.options.llmRouter.buildTeamLeadRequest(
            `## 코드 리뷰 요청\n\n**목표**: ${input.goal}\n**유형**: ${this.state.understanding!.analysis.taskType}\n**복잡도**: ${this.state.understanding!.analysis.complexity}\n\n**검증 결과**: 빌드/테스트 ${lastValidation!.passed ? '통과' : '실패'}\n**검증 항목**: ${lastValidation!.checks.map(c => `${c.passed ? '✅' : '❌'} ${c.name}`).join(', ')}\n\n이 작업의 코드 품질, 보안 취약점, 아키텍처 문제를 검토하고 PASS/WARN/BLOCK 중 하나로 판정해주세요.`,
          );

          finalReview = await this.options.llmRouter.invoke(reviewRequest);

          if (!finalReview.success) {
            log.warn(`Team Lead review failed: ${finalReview.error}. Treating as PASS (graceful degradation).`);
            reviewVerdict = 'PASS';
            break;
          }

          // Parse verdict from review content
          const content = finalReview.content.toLowerCase();
          if (content.includes('block') || content.includes('차단') || content.includes('거부')) {
            reviewVerdict = 'BLOCK';
            log.warn(`Team Lead verdict: BLOCK (attempt ${reviewAttempt}/${maxReviewRetries})`);
            if (reviewAttempt < maxReviewRetries) {
              log.info('Auto-retrying after BLOCK...');
              continue;
            }
          } else if (content.includes('warn') || content.includes('경고') || content.includes('주의')) {
            reviewVerdict = 'WARN';
            log.info('Team Lead verdict: WARN — proceeding with caution');
            break;
          } else {
            reviewVerdict = 'PASS';
            log.info('Team Lead verdict: PASS');
            break;
          }
        }

        this.state.teamLeadReview = {
          verdict: reviewVerdict,
          review: finalReview!,
          attempts: reviewAttempts,
        };

        log.info(`Team Lead review complete: ${reviewVerdict} (${reviewAttempts} attempts)`);
      } else if (!lastValidation!.passed) {
        log.info('Skipping Team Lead review — validation failed');
      } else {
        log.info('Skipping Team Lead review — no LLMRouter configured');
      }

      // ── Stage 5.7: Browser Visual Check (ADR-014) ──────────────────────────
      const hasUI = /ui|페이지|화면|컴포넌트|디자인|프론트|대시보드/i.test(input.goal);
      if (lastValidation!.passed && hasUI && this.options.onVisualCheck) {
        this.setStatus('visual_check');
        log.info('━━━ Stage 5.7: Browser Visual Check ━━━');

        try {
          this.state.visualCheck = await this.options.onVisualCheck(input.goal, this.options.projectRoot);
          log.info(`Visual check: ${this.state.visualCheck.passed ? 'PASS' : 'FAIL'} — ${this.state.visualCheck.notes}`);
        } catch (err) {
          log.warn('Visual check failed (non-fatal)', err);
          this.state.visualCheck = {
            passed: true,
            notes: `시각 검증 오류 (비치명적): ${err instanceof Error ? err.message : String(err)}`,
          };
        }
      } else if (!hasUI) {
        log.info('Skipping visual check — non-UI task');
      } else {
        log.info('Skipping visual check — no onVisualCheck callback configured');
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
        // ADR-014: Team Lead + Visual Check results
        teamLeadReview: this.state.teamLeadReview ? {
          verdict: this.state.teamLeadReview.verdict,
          attempts: this.state.teamLeadReview.attempts,
          reviewSummary: this.state.teamLeadReview.review.content.slice(0, 500),
        } : undefined,
        visualCheck: this.state.visualCheck ? {
          passed: this.state.visualCheck.passed,
          notes: this.state.visualCheck.notes,
          screenshotPath: this.state.visualCheck.screenshotPath,
        } : undefined,
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

  /**
   * ADR-011: Restore workflow state from Obsidian vault.
   * Checks if a previous run for the same goal exists and returns the last completed stage.
   * Returns null if no prior state found (fresh run).
   */
  async restoreWorkflowState(goal: string): Promise<{ lastStage: string; completedStages: string[] } | null> {
    if (!this.options.obsidianStore) {
      return null;
    }

    try {
      const slug = goal
        .toLowerCase()
        .replace(/[^a-z0-9가-힣\s]/g, '')
        .replace(/\s+/g, '-')
        .slice(0, 60);

      const path = `뇽죵이Agent/workflow_state/${slug}.md`;
      const note = await this.options.obsidianStore.readNote(path);

      if (!note || !note.content) {
        log.debug('No prior workflow state found');
        return null;
      }

      // Parse completed stages from frontmatter or content — with runtime validation
      const fm = note.frontmatter as Record<string, unknown> | undefined;
      const rawStages = fm?.completedStages;
      const completedStages: string[] = Array.isArray(rawStages)
        ? rawStages.filter((s): s is string => typeof s === 'string')
        : [];
      const status = typeof fm?.status === 'string' ? fm.status : 'unknown';

      if (completedStages.length === 0) {
        log.debug('Prior workflow state found but no completed stages');
        return null;
      }

      const lastStage = completedStages[completedStages.length - 1];
      log.info(`ADR-011: Restored workflow state — last stage: ${lastStage}, status: ${status}`, {
        completedStages,
      });

      return { lastStage, completedStages };
    } catch (err) {
      // File not found is expected for fresh runs
      log.debug('Workflow state restore attempt failed (expected for new goals)', err);
      return null;
    }
  }
}
