// Workflow stage 4: Evolve — analyze failures and auto-fix
import { createLogger } from '../utils/logger.js';
import type { ValidationResult } from './validate.js';

const log = createLogger('workflow:evolve');

export interface EvolveInput {
  /** Validation result from stage 3 */
  validation: ValidationResult;
  /** Current attempt number (1-indexed) */
  attempt: number;
  /** Maximum retry attempts */
  maxAttempts: number;
  /** Optional: Team Lead review feedback to incorporate into fix suggestions (ADR-014) */
  reviewFeedback?: string;
}

export interface EvolveOutput {
  /** Should we retry the prototype → validate cycle? */
  shouldRetry: boolean;
  /** Analysis of what went wrong */
  failureAnalysis: string;
  /** Specific fix suggestions */
  fixes: FixSuggestion[];
  /** If all retries exhausted, escalate to human */
  escalateToHuman: boolean;
  /** Evolution notes for logging */
  notes: string;
}

export interface FixSuggestion {
  /** The failed check this fix addresses */
  forCheck: string;
  /** Description of the fix */
  description: string;
  /** Fix type */
  type: 'code-change' | 'config-change' | 'dependency' | 'environment';
  /** Confidence level */
  confidence: 'high' | 'medium' | 'low';
}

/**
 * Stage 4: Evolve — analyze validation failures and determine next steps.
 *
 * In the AI circular workflow, failures don't go back to the human.
 * The system tries to self-heal up to maxAttempts times.
 */
export function evolve(input: EvolveInput): EvolveOutput {
  const { validation, attempt, maxAttempts, reviewFeedback } = input;
  log.info(`Evolution analysis: attempt ${attempt}/${maxAttempts}${reviewFeedback ? ' (with review feedback)' : ''}`);

  // If validation passed, no evolution needed
  if (validation.passed) {
    log.info('Validation passed, no evolution needed');
    return {
      shouldRetry: false,
      failureAnalysis: 'All checks passed',
      fixes: [],
      escalateToHuman: false,
      notes: 'Validation passed on this attempt.',
    };
  }

  // Analyze each failure
  const fixes: FixSuggestion[] = [];
  const failureLines: string[] = [];

  for (const check of validation.checks.filter((c) => !c.passed)) {
    failureLines.push(`- ${check.name}: ${check.output.slice(0, 100)}`);

    // Pattern matching for common failures
    if (/type\s*error|ts\d{4}/i.test(check.output)) {
      fixes.push({
        forCheck: check.name,
        description: 'TypeScript type error — review type annotations',
        type: 'code-change',
        confidence: 'high',
      });
    }

    if (/module\s*not\s*found|cannot\s*find/i.test(check.output)) {
      fixes.push({
        forCheck: check.name,
        description: 'Missing dependency — run npm install or fix import path',
        type: 'dependency',
        confidence: 'high',
      });
    }

    if (/test\s*failed|expect|assert/i.test(check.output)) {
      fixes.push({
        forCheck: check.name,
        description: 'Test assertion failure — update test or fix implementation',
        type: 'code-change',
        confidence: 'medium',
      });
    }

    if (/enospc|enomem|timeout/i.test(check.output)) {
      fixes.push({
        forCheck: check.name,
        description: 'Environment resource issue — check disk/memory/timeout',
        type: 'environment',
        confidence: 'low',
      });
    }
  }

  // If no specific fixes found, add a generic one
  if (fixes.length === 0) {
    fixes.push({
      forCheck: 'general',
      description: 'Unrecognized failure pattern — requires manual analysis',
      type: 'code-change',
      confidence: 'low',
    });
  }

  // ADR-014: Incorporate Team Lead review feedback into fix suggestions
  if (reviewFeedback) {
    fixes.push({
      forCheck: 'team-lead-review',
      description: `팀장 리뷰 피드백: ${reviewFeedback.slice(0, 200)}`,
      type: 'code-change',
      confidence: 'high',
    });
  }

  const shouldRetry = attempt < maxAttempts;
  const escalateToHuman = !shouldRetry;

  const failureAnalysis = failureLines.join('\n');
  const notes = shouldRetry
    ? `Attempt ${attempt}/${maxAttempts}: ${fixes.length} fix suggestions. Retrying...`
    : `All ${maxAttempts} attempts exhausted. Escalating to human.`;

  if (escalateToHuman) {
    log.warn('All retries exhausted — escalating to human');
  } else {
    log.info(`Will retry (attempt ${attempt + 1}/${maxAttempts})`);
  }

  return {
    shouldRetry,
    failureAnalysis,
    fixes,
    escalateToHuman,
    notes,
  };
}
