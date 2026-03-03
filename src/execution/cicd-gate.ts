// CI/CD Gate — pre-push quality checks (lint + build + test)
import { ShellRunner } from './shell-runner.js';
import { createLogger } from '../utils/logger.js';
import type { ShellResult } from '../workflow/validate.js';

const log = createLogger('cicd-gate');

export interface CICDGateOptions {
  /** Project working directory */
  cwd: string;
  /** Commands to run as quality checks */
  checks?: string[];
  /** Whether to stop on first failure (default: false — run all checks) */
  stopOnFirst?: boolean;
}

export interface CICDCheckResult {
  command: string;
  passed: boolean;
  result: ShellResult;
}

export interface CICDGateResult {
  /** Whether all checks passed */
  allPassed: boolean;
  /** Individual check results */
  checks: CICDCheckResult[];
  /** Summary */
  summary: string;
  /** Recommendation */
  recommendation: string;
}

/**
 * Default pre-push quality checks.
 * Automatically detects available checks from package.json.
 */
function getDefaultChecks(cwd: string): string[] {
  const checks: string[] = [];

  try {
    const fs = require('fs');
    const path = require('path');
    const pkgPath = path.join(cwd, 'package.json');

    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      const scripts = pkg.scripts || {};

      // TypeScript type check (highest priority)
      if (scripts['typecheck'] || scripts['type-check']) {
        checks.push(scripts['typecheck'] ? 'npm run typecheck' : 'npm run type-check');
      } else if (pkg.devDependencies?.typescript || pkg.dependencies?.typescript) {
        checks.push('npx tsc --noEmit');
      }

      // Lint
      if (scripts['lint']) {
        checks.push('npm run lint');
      }

      // Build
      if (scripts['build']) {
        checks.push('npm run build');
      }

      // Test
      if (scripts['test'] && scripts['test'] !== 'echo "Error: no test specified" && exit 1') {
        checks.push('npm run test');
      }
    }
  } catch (err) {
    log.debug('Could not read package.json for auto-detection', err);
  }

  // Fallback: at least try TypeScript check
  if (checks.length === 0) {
    checks.push('npx tsc --noEmit');
  }

  return checks;
}

/**
 * Run CI/CD quality gate checks.
 * Checks lint, build, and test in sequence. Reports pass/fail per check.
 */
export async function runCICDGate(options: CICDGateOptions): Promise<CICDGateResult> {
  const { cwd, stopOnFirst = false } = options;
  const checks = options.checks || getDefaultChecks(cwd);

  log.info(`CI/CD gate: running ${checks.length} checks in ${cwd}`);

  const shell = new ShellRunner({ defaultTimeoutMs: 120_000 });
  const results: CICDCheckResult[] = [];

  for (const command of checks) {
    log.info(`CI/CD check: ${command}`);
    const result = await shell.run(command, cwd);
    const passed = result.exitCode === 0;

    results.push({ command, passed, result });

    if (!passed) {
      log.warn(`CI/CD check failed: ${command} (exit ${result.exitCode})`);
      if (stopOnFirst) break;
    }
  }

  const passCount = results.filter(r => r.passed).length;
  const failCount = results.length - passCount;
  const allPassed = failCount === 0;

  const summary = allPassed
    ? `✅ CI/CD 게이트 통과: ${passCount}개 체크 전부 성공`
    : `❌ CI/CD 게이트 실패: ${failCount}/${results.length}개 체크 실패`;

  const recommendation = allPassed
    ? '모든 품질 체크 통과. git push 안전합니다.'
    : `실패한 체크:\n${results.filter(r => !r.passed).map(r => `  - ${r.command}: exit ${r.result.exitCode}\n    ${r.result.stderr.slice(0, 200)}`).join('\n')}\n\n→ 위 문제를 수정한 후 다시 실행하세요.`;

  return { allPassed, checks: results, summary, recommendation };
}

/**
 * Format CI/CD gate result as human-readable report.
 */
export function formatCICDGateReport(result: CICDGateResult): string {
  const lines = [
    `## ${result.allPassed ? '✅' : '❌'} CI/CD 품질 게이트`,
    '',
    result.summary,
    '',
    '### 체크 결과',
  ];

  for (const check of result.checks) {
    const icon = check.passed ? '✅' : '❌';
    const time = `${(check.result.durationMs / 1000).toFixed(1)}s`;
    lines.push(`- ${icon} \`${check.command}\` (${time})`);
    if (!check.passed && check.result.stderr) {
      lines.push(`  > ${check.result.stderr.slice(0, 150).replace(/\n/g, ' ')}`);
    }
  }

  lines.push('', '### 권장 사항', result.recommendation);

  return lines.join('\n');
}
