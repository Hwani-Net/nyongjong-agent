// Workflow stage 3: Validate — build, test, and quality check
// Includes auto-injected checks: npm outdated + drift-guard
import { createLogger } from '../utils/logger.js';

const log = createLogger('workflow:validate');

export interface ValidateInput {
  /** Project root path */
  projectRoot: string;
  /** Commands to validate (from prototype plan) */
  commands: string[];
  /** Shell runner function */
  runShell: (cmd: string, cwd: string) => Promise<ShellResult>;
  /** Skip auto-injected checks (npm outdated, drift-guard). Default: false */
  skipAutoChecks?: boolean;
}

export interface ShellResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
}

export interface ValidationResult {
  passed: boolean;
  /** Individual check results */
  checks: ValidationCheck[];
  /** Summary of all issues found */
  issues: string[];
  /** Total duration in ms */
  totalDurationMs: number;
  /** Auto-injected check warnings (non-blocking) */
  warnings: string[];
}

export interface ValidationCheck {
  name: string;
  command: string;
  passed: boolean;
  output: string;
  durationMs: number;
  /** 'warn' means the check flagged issues but didn't block */
  severity?: 'error' | 'warn';
}

/**
 * Stage 3: Validate — run build, tests, and quality checks.
 *
 * This is the automated quality gate. No human intervention needed
 * unless all retries fail.
 *
 * Auto-injected checks (after user commands):
 *   1. npm outdated — warns about major version mismatches (non-blocking)
 *   2. drift-guard check — blocks if design drift > 10% (only if .drift-guard/ exists)
 */
export async function validate(input: ValidateInput): Promise<ValidationResult> {
  const { projectRoot, commands, runShell, skipAutoChecks = false } = input;
  log.info(`Starting validation: ${commands.length} checks`);

  const checks: ValidationCheck[] = [];
  const issues: string[] = [];
  const warnings: string[] = [];
  let totalDurationMs = 0;

  // ── Phase 1: User-defined commands (build, test, etc.) ──
  for (const command of commands) {
    log.debug(`Running: ${command}`);

    const result = await runShell(command, projectRoot);
    totalDurationMs += result.durationMs;

    const passed = result.exitCode === 0;
    const check: ValidationCheck = {
      name: command,
      command,
      passed,
      output: passed ? result.stdout.slice(-500) : result.stderr.slice(-500) || result.stdout.slice(-500),
      durationMs: result.durationMs,
      severity: 'error',
    };

    checks.push(check);

    if (!passed) {
      const issue = `❌ ${command} failed (exit code ${result.exitCode}): ${result.stderr.slice(0, 200)}`;
      issues.push(issue);
      log.warn(issue);
    } else {
      log.info(`✅ ${command} passed (${result.durationMs}ms)`);
    }
  }

  // ── Phase 2: Auto-injected checks ──
  if (!skipAutoChecks) {
    // Check 1: npm outdated (non-blocking warning)
    const outdatedResult = await runNpmOutdatedCheck(projectRoot, runShell);
    checks.push(outdatedResult.check);
    totalDurationMs += outdatedResult.check.durationMs;
    if (outdatedResult.warnings.length > 0) {
      warnings.push(...outdatedResult.warnings);
      log.warn(`📦 npm outdated: ${outdatedResult.warnings.length} package(s) behind`);
    }

    // Check 2: drift-guard (blocking if drift > 10%)
    const driftResult = await runDriftGuardCheck(projectRoot, runShell);
    if (driftResult) {
      checks.push(driftResult.check);
      totalDurationMs += driftResult.check.durationMs;
      if (!driftResult.check.passed) {
        issues.push(`🛡️ drift-guard: ${driftResult.issue}`);
        log.warn(`🛡️ drift-guard BLOCK: ${driftResult.issue}`);
      } else if (driftResult.warnings.length > 0) {
        warnings.push(...driftResult.warnings);
      }
    }
  }

  const allPassed = issues.length === 0;
  log.info(`Validation ${allPassed ? 'PASSED' : 'FAILED'}: ${checks.length} checks, ${issues.length} issues, ${warnings.length} warnings`);

  return {
    passed: allPassed,
    checks,
    issues,
    totalDurationMs,
    warnings,
  };
}

// ─── Auto-injected: npm outdated ─────────────────────────────────────────────

interface AutoCheckResult {
  check: ValidationCheck;
  warnings: string[];
  issue?: string;
}

/**
 * Run `npm outdated` to detect major version mismatches.
 * This is NON-BLOCKING — it produces warnings, not errors.
 * Antigravity should use these warnings to research breaking changes
 * before implementing with outdated APIs.
 */
async function runNpmOutdatedCheck(
  projectRoot: string,
  runShell: (cmd: string, cwd: string) => Promise<ShellResult>,
): Promise<AutoCheckResult> {
  const cmd = 'npm outdated --json';
  const warnings: string[] = [];

  try {
    const result = await runShell(cmd, projectRoot);

    // npm outdated exits 1 if any packages are outdated — that's normal
    if (result.stdout.trim() === '' || result.stdout.trim() === '{}') {
      return {
        check: {
          name: '[auto] npm outdated',
          command: cmd,
          passed: true,
          output: 'All packages up to date',
          durationMs: result.durationMs,
          severity: 'warn',
        },
        warnings: [],
      };
    }

    // Parse JSON output
    let outdated: Record<string, { current: string; wanted: string; latest: string }> = {};
    try {
      outdated = JSON.parse(result.stdout);
    } catch {
      // Non-JSON output (e.g. no package.json) — skip gracefully
      return {
        check: {
          name: '[auto] npm outdated',
          command: cmd,
          passed: true,
          output: 'Skipped (no package.json or non-JSON output)',
          durationMs: result.durationMs,
          severity: 'warn',
        },
        warnings: [],
      };
    }

    // Check for MAJOR version differences
    for (const [pkg, info] of Object.entries(outdated)) {
      if (!info.current || !info.latest) continue;
      const currentMajor = parseInt(info.current.split('.')[0], 10);
      const latestMajor = parseInt(info.latest.split('.')[0], 10);

      if (!isNaN(currentMajor) && !isNaN(latestMajor) && latestMajor > currentMajor) {
        warnings.push(`📦 ${pkg}: ${info.current} → ${info.latest} (MAJOR update)`);
      }
    }

    const output = warnings.length > 0
      ? `${warnings.length} major update(s):\n${warnings.join('\n')}`
      : `${Object.keys(outdated).length} package(s) outdated (minor/patch only)`;

    return {
      check: {
        name: '[auto] npm outdated',
        command: cmd,
        passed: true, // Always passes — warnings only
        output: output.slice(0, 500),
        durationMs: result.durationMs,
        severity: 'warn',
      },
      warnings,
    };
  } catch {
    // Shell execution failed — skip gracefully
    return {
      check: {
        name: '[auto] npm outdated',
        command: cmd,
        passed: true,
        output: 'Skipped (shell error)',
        durationMs: 0,
        severity: 'warn',
      },
      warnings: [],
    };
  }
}

// ─── Auto-injected: drift-guard ──────────────────────────────────────────────

/**
 * Run `drift-guard check` if .drift-guard/ directory exists.
 * This is BLOCKING if drift > 10%.
 * Returns null if .drift-guard/ doesn't exist (no snapshot = skip).
 */
async function runDriftGuardCheck(
  projectRoot: string,
  runShell: (cmd: string, cwd: string) => Promise<ShellResult>,
): Promise<AutoCheckResult | null> {
  // First: check if .drift-guard/ exists
  const detectCmd = 'ls -d .drift-guard';
  try {
    const detectResult = await runShell(detectCmd, projectRoot);
    if (detectResult.exitCode !== 0) {
      log.debug('No .drift-guard/ found — skipping drift-guard check');
      return null;
    }
  } catch {
    return null;
  }

  // .drift-guard/ exists → run check
  const cmd = 'npx drift-guard check --output json';
  const warnings: string[] = [];

  try {
    const result = await runShell(cmd, projectRoot);
    const output = result.stdout || result.stderr;

    // Try to parse drift score from output
    let driftScore = 0;
    try {
      const jsonResult = JSON.parse(output);
      driftScore = jsonResult.driftScore ?? jsonResult.drift ?? 0;
    } catch {
      // Try regex fallback for text output
      const scoreMatch = output.match(/(\d+(?:\.\d+)?)%/);
      if (scoreMatch) {
        driftScore = parseFloat(scoreMatch[1]);
      }
    }

    const passed = driftScore <= 10;

    if (driftScore > 0 && driftScore <= 10) {
      warnings.push(`🛡️ drift-guard: ${driftScore}% drift detected (within threshold)`);
    }

    return {
      check: {
        name: '[auto] drift-guard check',
        command: cmd,
        passed,
        output: output.slice(0, 500),
        durationMs: result.durationMs,
        severity: passed ? 'warn' : 'error',
      },
      warnings,
      issue: passed ? undefined : `Design drift ${driftScore}% exceeds 10% threshold`,
    };
  } catch {
    // drift-guard not installed or broken — warn but don't block
    return {
      check: {
        name: '[auto] drift-guard check',
        command: cmd,
        passed: true,
        output: 'Skipped (drift-guard not available)',
        durationMs: 0,
        severity: 'warn',
      },
      warnings: ['🛡️ drift-guard CLI not available — install with: npm i -g @stayicon/drift-guard'],
    };
  }
}
