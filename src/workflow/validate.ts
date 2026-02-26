// Workflow stage 3: Validate — build, test, and quality check
import { createLogger } from '../utils/logger.js';

const log = createLogger('workflow:validate');

export interface ValidateInput {
  /** Project root path */
  projectRoot: string;
  /** Commands to validate (from prototype plan) */
  commands: string[];
  /** Shell runner function */
  runShell: (cmd: string, cwd: string) => Promise<ShellResult>;
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
}

export interface ValidationCheck {
  name: string;
  command: string;
  passed: boolean;
  output: string;
  durationMs: number;
}

/**
 * Stage 3: Validate — run build, tests, and quality checks.
 *
 * This is the automated quality gate. No human intervention needed
 * unless all retries fail.
 */
export async function validate(input: ValidateInput): Promise<ValidationResult> {
  const { projectRoot, commands, runShell } = input;
  log.info(`Starting validation: ${commands.length} checks`);

  const checks: ValidationCheck[] = [];
  const issues: string[] = [];
  let totalDurationMs = 0;

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

  const allPassed = issues.length === 0;
  log.info(`Validation ${allPassed ? 'PASSED' : 'FAILED'}: ${checks.length} checks, ${issues.length} issues`);

  return {
    passed: allPassed,
    checks,
    issues,
    totalDurationMs,
  };
}
