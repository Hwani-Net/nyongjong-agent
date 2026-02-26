// Test runner — discovers and executes tests with configurable frameworks
import { ShellRunner } from './shell-runner.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('test-runner');

export interface TestRunnerOptions {
  shellRunner: ShellRunner;
  /** Project root path */
  projectRoot: string;
  /** Test framework command (default: 'npx vitest run') */
  testCommand?: string;
  /** TypeCheck command (default: 'npx tsc --noEmit') */
  typeCheckCommand?: string;
}

export interface TestResult {
  framework: string;
  passed: boolean;
  exitCode: number;
  output: string;
  durationMs: number;
  /** Parsed test counts if available */
  testCounts?: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
  };
}

export class TestRunner {
  private shell: ShellRunner;
  private projectRoot: string;
  private testCommand: string;
  private typeCheckCommand: string;

  constructor(options: TestRunnerOptions) {
    this.shell = options.shellRunner;
    this.projectRoot = options.projectRoot;
    this.testCommand = options.testCommand || 'npx vitest run';
    this.typeCheckCommand = options.typeCheckCommand || 'npx tsc --noEmit';
    log.info('TestRunner initialized', { projectRoot: this.projectRoot });
  }

  /**
   * Run all tests.
   */
  async runTests(): Promise<TestResult> {
    log.info('Running tests...');

    const result = await this.shell.run(this.testCommand, this.projectRoot);
    const output = result.stdout + result.stderr;

    // Try to parse test counts from vitest output
    const testCounts = this.parseVitestOutput(output);

    const testResult: TestResult = {
      framework: 'vitest',
      passed: result.exitCode === 0,
      exitCode: result.exitCode,
      output: output.slice(-2000), // Keep last 2KB
      durationMs: result.durationMs,
      testCounts,
    };

    log.info(`Tests ${testResult.passed ? 'PASSED' : 'FAILED'}`, testCounts);
    return testResult;
  }

  /**
   * Run TypeScript type checking.
   */
  async runTypeCheck(): Promise<TestResult> {
    log.info('Running type check...');

    const result = await this.shell.run(this.typeCheckCommand, this.projectRoot);

    return {
      framework: 'tsc',
      passed: result.exitCode === 0,
      exitCode: result.exitCode,
      output: (result.stdout + result.stderr).slice(-2000),
      durationMs: result.durationMs,
    };
  }

  /**
   * Run both type check and tests.
   */
  async runAll(): Promise<TestResult[]> {
    const results: TestResult[] = [];

    const typeCheck = await this.runTypeCheck();
    results.push(typeCheck);

    // Only run tests if type check passes
    if (typeCheck.passed) {
      const tests = await this.runTests();
      results.push(tests);
    } else {
      log.warn('Skipping tests due to type check failure');
    }

    return results;
  }

  /**
   * Parse vitest output for test counts.
   */
  private parseVitestOutput(output: string): TestResult['testCounts'] | undefined {
    // Match patterns like "Tests  23 passed (23)" or "Tests  1 failed | 22 passed (23)"
    const testsMatch = output.match(/Tests\s+(?:(\d+)\s+failed\s*\|?\s*)?(\d+)\s+passed\s*\((\d+)\)/);

    if (testsMatch) {
      const failed = parseInt(testsMatch[1] || '0', 10);
      const passed = parseInt(testsMatch[2], 10);
      const total = parseInt(testsMatch[3], 10);
      return { total, passed, failed, skipped: total - passed - failed };
    }

    return undefined;
  }
}
