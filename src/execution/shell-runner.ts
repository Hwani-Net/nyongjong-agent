// Shell runner — executes bash commands with timeout and output capture
import { exec } from 'child_process';
import { createLogger } from '../utils/logger.js';
import type { ShellResult } from '../workflow/validate.js';

const log = createLogger('shell-runner');

export interface ShellRunnerOptions {
  /** Default timeout in ms */
  defaultTimeoutMs?: number;
  /** Default shell ('bash' on Linux/Mac, 'cmd' on Windows) */
  shell?: string;
}

export class ShellRunner {
  private defaultTimeoutMs: number;
  private shell: string;

  constructor(options: ShellRunnerOptions = {}) {
    this.defaultTimeoutMs = options.defaultTimeoutMs || 60000;
    this.shell = options.shell || (process.platform === 'win32' ? 'cmd.exe' : '/bin/bash');
    log.info('ShellRunner initialized', { shell: this.shell, timeout: this.defaultTimeoutMs });
  }

  /**
   * Execute a shell command and return the result.
   */
  async run(command: string, cwd: string, timeoutMs?: number): Promise<ShellResult> {
    const timeout = timeoutMs || this.defaultTimeoutMs;
    const start = Date.now();

    log.debug(`Executing: ${command}`, { cwd, timeout });

    return new Promise<ShellResult>((resolve) => {
      const child = exec(command, {
        cwd,
        timeout,
        shell: this.shell,
        maxBuffer: 10 * 1024 * 1024, // 10MB
        env: { ...process.env },
      }, (error, stdout, stderr) => {
        const durationMs = Date.now() - start;
        const exitCode = error ? (error.code || 1) : 0;

        if (exitCode !== 0) {
          log.warn(`Command failed: ${command} (exit ${exitCode}, ${durationMs}ms)`);
        } else {
          log.debug(`Command succeeded: ${command} (${durationMs}ms)`);
        }

        resolve({
          exitCode: typeof exitCode === 'number' ? exitCode : 1,
          stdout: stdout || '',
          stderr: stderr || '',
          durationMs,
        });
      });

      // Ensure we don't leave zombies
      child.on('error', (err) => {
        log.error(`Command error: ${command}`, err);
        resolve({
          exitCode: 1,
          stdout: '',
          stderr: err.message,
          durationMs: Date.now() - start,
        });
      });
    });
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
