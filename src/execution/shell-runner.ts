// Shell runner — powered by 'execa' npm package (battle-tested process execution)
// Replaces custom child_process.exec wrapper with well-maintained package
import { execaCommand } from 'execa';
import { createLogger } from '../utils/logger.js';
import type { ShellResult } from '../workflow/validate.js';

const log = createLogger('shell-runner');

export interface ShellRunnerOptions {
  /** Default timeout in ms */
  defaultTimeoutMs?: number;
  /** Default shell */
  shell?: string;
}

export class ShellRunner {
  private defaultTimeoutMs: number;
  private shell: string | boolean;

  constructor(options: ShellRunnerOptions = {}) {
    this.defaultTimeoutMs = options.defaultTimeoutMs || 60000;
    this.shell = options.shell || true; // execa uses true for default shell
    log.info('ShellRunner initialized (execa)', { timeout: this.defaultTimeoutMs });
  }

  /**
   * Execute a shell command and return the result.
   */
  async run(command: string, cwd: string, timeoutMs?: number): Promise<ShellResult> {
    const timeout = timeoutMs || this.defaultTimeoutMs;
    const start = Date.now();

    log.debug(`Executing: ${command}`, { cwd, timeout });

    try {
      const result = await execaCommand(command, {
        cwd,
        timeout,
        shell: true,
        reject: false, // Don't throw on non-zero exit
        env: { ...process.env },
        maxBuffer: 10 * 1024 * 1024, // 10MB
      });

      const durationMs = Date.now() - start;
      const exitCode = result.exitCode ?? 1;

      if (exitCode !== 0) {
        log.warn(`Command failed: ${command} (exit ${exitCode}, ${durationMs}ms)`);
      } else {
        log.debug(`Command succeeded: ${command} (${durationMs}ms)`);
      }

      return {
        exitCode,
        stdout: result.stdout || '',
        stderr: result.stderr || '',
        durationMs,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      log.error(`Command error: ${command}`, error);
      return {
        exitCode: 1,
        stdout: '',
        stderr: msg,
        durationMs: Date.now() - start,
      };
    }
  }

  /**
   * Run multiple commands sequentially, stopping on first failure (if stopOnError is true).
   */
  async runSequence(
    commands: string[],
    cwd: string,
    stopOnError = true,
  ): Promise<ShellResult[]> {
    const results: ShellResult[] = [];

    for (const command of commands) {
      const result = await this.run(command, cwd);
      results.push(result);

      if (stopOnError && result.exitCode !== 0) {
        log.warn(`Sequence stopped at: ${command}`);
        break;
      }
    }

    return results;
  }
}
