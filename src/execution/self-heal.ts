// Self-heal module — auto-retry failed builds/tests up to 3 times with error analysis
import { ShellRunner } from './shell-runner.js';
import { createLogger } from '../utils/logger.js';
import type { ShellResult } from '../workflow/validate.js';

const log = createLogger('self-heal');

export interface SelfHealOptions {
  /** Maximum retry attempts (default: 3) */
  maxRetries?: number;
  /** Working directory for commands */
  cwd: string;
  /** Commands to execute (e.g., ['npm run build', 'npm test']) */
  commands: string[];
}

export interface SelfHealAttempt {
  attempt: number;
  command: string;
  result: ShellResult;
  errorAnalysis?: string;
}

export interface SelfHealResult {
  /** Whether all commands eventually passed */
  success: boolean;
  /** Total attempts across all commands */
  totalAttempts: number;
  /** Per-attempt details */
  attempts: SelfHealAttempt[];
  /** Final summary */
  summary: string;
}

/**
 * Analyze build/test error output to provide actionable insights.
 */
function analyzeError(stderr: string, stdout: string): string {
  const output = `${stderr}\n${stdout}`.toLowerCase();

  if (output.includes('cannot find module') || output.includes('module not found')) {
    return '모듈 미설치 — `npm install` 필요';
  }
  if (output.includes('type error') || output.includes('ts2')) {
    return 'TypeScript 타입 에러 — 타입 정의 수정 필요';
  }
  if (output.includes('syntax error') || output.includes('unexpected token')) {
    return '구문 에러 — 코드 문법 확인 필요';
  }
  if (output.includes('enoent') || output.includes('no such file')) {
    return '파일 미존재 — 경로 확인 필요';
  }
  if (output.includes('port') && output.includes('in use')) {
    return '포트 충돌 — 다른 프로세스가 포트 점유 중';
  }
  if (output.includes('out of memory') || output.includes('heap')) {
    return '메모리 부족 — Node.js 힙 크기 조정 또는 메모리 누수 확인';
  }
  if (output.includes('timeout') || output.includes('timed out')) {
    return '타임아웃 — 네트워크 또는 외부 서비스 응답 지연';
  }
  if (output.includes('permission denied') || output.includes('eacces')) {
    return '권한 부족 — 파일/디렉토리 권한 확인';
  }
  if (output.includes('test failed') || output.includes('failing')) {
    return '테스트 실패 — 테스트 케이스 확인 필요';
  }
  if (output.includes('eslint') || output.includes('lint')) {
    return '린트 에러 — 코드 스타일 규칙 위반';
  }

  return '원인 불명 — 에러 로그 직접 확인 필요';
}

/**
 * Run commands with auto-retry on failure.
 * On each failure, logs error analysis and retries up to maxRetries.
 */
export async function selfHealRun(options: SelfHealOptions): Promise<SelfHealResult> {
  const { maxRetries = 3, cwd, commands } = options;
  const shell = new ShellRunner({ defaultTimeoutMs: 120_000 }); // 2 min per command
  const attempts: SelfHealAttempt[] = [];
  let totalAttempts = 0;

  for (const command of commands) {
    let succeeded = false;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      totalAttempts++;
      log.info(`Self-heal: attempt ${attempt}/${maxRetries} for "${command}"`);

      const result = await shell.run(command, cwd);
      const errorAnalysis = result.exitCode !== 0
        ? analyzeError(result.stderr, result.stdout)
        : undefined;

      attempts.push({ attempt, command, result, errorAnalysis });

      if (result.exitCode === 0) {
        log.info(`Self-heal: "${command}" passed on attempt ${attempt}`);
        succeeded = true;
        break;
      }

      log.warn(`Self-heal: "${command}" failed (attempt ${attempt}/${maxRetries})`, {
        exitCode: result.exitCode,
        errorAnalysis,
      });

      // Brief pause before retry (exponential backoff: 1s, 2s, 4s)
      if (attempt < maxRetries) {
        await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt - 1)));
      }
    }

    if (!succeeded) {
      const failedAttempts = attempts.filter(a => a.command === command);
      const lastError = failedAttempts[failedAttempts.length - 1]?.errorAnalysis || '원인 불명';

      return {
        success: false,
        totalAttempts,
        attempts,
        summary: `❌ "${command}" 실패 — ${maxRetries}회 재시도 후에도 미해결.\n원인: ${lastError}\n에러 출력(마지막 500자):\n${failedAttempts[failedAttempts.length - 1]?.result.stderr.slice(-500) || '(없음)'}`,
      };
    }
  }

  return {
    success: true,
    totalAttempts,
    attempts,
    summary: `✅ 전체 명령 성공 (총 ${totalAttempts}회 시도). 명령: ${commands.join(', ')}`,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Completion Loop — Ralph-style iterative loop with user-defined iterations
// ═══════════════════════════════════════════════════════════════════════════

export interface CompletionLoopOptions {
  /** Working directory for commands */
  cwd: string;
  /** Commands to execute each iteration (e.g., ['npm run build', 'npm test']) */
  commands: string[];
  /** Command to verify completion (e.g., 'npm test') */
  completionCheck: string;
  /** Success string to search for in output (e.g., 'All tests passing', 'passing') */
  completionPromise: string;
  /** Max iterations — user decides (default: 5) */
  maxIterations?: number;
}

export interface CompletionLoopAttempt {
  iteration: number;
  commandResults: Array<{ command: string; exitCode: number; durationMs: number }>;
  checkResult: {
    exitCode: number;
    stdout: string;
    stderr: string;
    promiseMet: boolean;
  };
  errorAnalysis?: string;
}

export interface CompletionLoopResult {
  /** Whether completion promise was met */
  success: boolean;
  /** How many iterations were executed */
  iterations: number;
  /** Max iterations allowed */
  maxIterations: number;
  /** The success condition that was checked */
  completionPromise: string;
  /** Per-iteration details */
  attempts: CompletionLoopAttempt[];
  /** Early exit reason (if applicable) */
  earlyExit?: string;
  /** Human-readable summary */
  summary: string;
}

/**
 * Run commands in a loop until a completion promise is met.
 *
 * Inspired by the Ralph Wiggum technique (Anthropic), but with:
 *   - User-defined max iterations (not infinite)
 *   - Error analysis on each failure
 *   - Same-error early exit (3 consecutive identical errors → stop)
 */
export async function completionLoopRun(options: CompletionLoopOptions): Promise<CompletionLoopResult> {
  const { cwd, commands, completionCheck, completionPromise, maxIterations = 5 } = options;
  const shell = new ShellRunner({ defaultTimeoutMs: 180_000 }); // 3 min per command
  const attempts: CompletionLoopAttempt[] = [];
  let consecutiveSameError = 0;
  let lastErrorSignature = '';

  log.info(`🔄 Completion loop started: promise="${completionPromise}", max=${maxIterations} iterations`);

  for (let iteration = 1; iteration <= maxIterations; iteration++) {
    log.info(`━━━ Iteration ${iteration}/${maxIterations} ━━━`);

    // Step 1: Run all commands
    const commandResults: CompletionLoopAttempt['commandResults'] = [];
    for (const command of commands) {
      const result = await shell.run(command, cwd);
      commandResults.push({
        command,
        exitCode: result.exitCode,
        durationMs: result.durationMs,
      });

      if (result.exitCode !== 0) {
        log.warn(`Command failed: ${command} (exit ${result.exitCode})`);
      }
    }

    // Step 2: Run completion check
    const checkResult = await shell.run(completionCheck, cwd);
    const fullOutput = `${checkResult.stdout}\n${checkResult.stderr}`;
    const promiseMet = fullOutput.toLowerCase().includes(completionPromise.toLowerCase());

    const attempt: CompletionLoopAttempt = {
      iteration,
      commandResults,
      checkResult: {
        exitCode: checkResult.exitCode,
        stdout: checkResult.stdout.slice(-1000),
        stderr: checkResult.stderr.slice(-1000),
        promiseMet,
      },
    };

    // Step 3: Check if promise is met
    if (promiseMet) {
      attempt.errorAnalysis = undefined;
      attempts.push(attempt);
      log.info(`✅ Completion promise met on iteration ${iteration}!`);

      return {
        success: true,
        iterations: iteration,
        maxIterations,
        completionPromise,
        attempts,
        summary: `✅ 완료 조건 달성! (${iteration}/${maxIterations}회 반복)\n조건: "${completionPromise}"`,
      };
    }

    // Step 4: Error analysis
    const errorAnalysis = analyzeError(checkResult.stderr, checkResult.stdout);
    attempt.errorAnalysis = errorAnalysis;
    attempts.push(attempt);

    log.warn(`Iteration ${iteration} — promise not met. Analysis: ${errorAnalysis}`);

    // Step 5: Same-error early exit (prevent blind repetition)
    const currentErrorSignature = `${checkResult.exitCode}:${errorAnalysis}`;
    if (currentErrorSignature === lastErrorSignature) {
      consecutiveSameError++;
      if (consecutiveSameError >= 3) {
        const earlyExit = `동일 에러 ${consecutiveSameError}회 연속 — 맹목적 반복 방지를 위해 조기 종료. 에러: ${errorAnalysis}`;
        log.warn(`🛑 Early exit: ${earlyExit}`);

        return {
          success: false,
          iterations: iteration,
          maxIterations,
          completionPromise,
          attempts,
          earlyExit,
          summary: `❌ 조기 종료 (${iteration}/${maxIterations}회)\n사유: ${earlyExit}\n조건: "${completionPromise}"`,
        };
      }
    } else {
      consecutiveSameError = 1;
      lastErrorSignature = currentErrorSignature;
    }

    // Brief pause before next iteration (exponential backoff: 1s, 2s, 4s, cap at 8s)
    if (iteration < maxIterations) {
      const delay = Math.min(1000 * Math.pow(2, iteration - 1), 8000);
      log.debug(`Waiting ${delay}ms before next iteration...`);
      await new Promise(r => setTimeout(r, delay));
    }
  }

  // All iterations exhausted
  const lastAttempt = attempts[attempts.length - 1];
  return {
    success: false,
    iterations: maxIterations,
    maxIterations,
    completionPromise,
    attempts,
    summary: `❌ 완료 조건 미달성 (${maxIterations}/${maxIterations}회 소진)\n조건: "${completionPromise}"\n마지막 에러: ${lastAttempt?.errorAnalysis || '원인 불명'}`,
  };
}
