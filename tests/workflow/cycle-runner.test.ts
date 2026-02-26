// Tests for CycleRunner — full AI workflow orchestration with mocked shell
import { describe, it, expect, vi } from 'vitest';
import { CycleRunner, type CycleRunnerOptions } from '../../src/workflow/cycle-runner.js';
import type { ShellResult } from '../../src/workflow/validate.js';

// Mock shell that always succeeds
const successShell = vi.fn(async (_cmd: string, _cwd: string): Promise<ShellResult> => ({
  exitCode: 0,
  stdout: 'OK',
  stderr: '',
  durationMs: 50,
}));

// Mock shell that always fails
const failShell = vi.fn(async (_cmd: string, _cwd: string): Promise<ShellResult> => ({
  exitCode: 1,
  stdout: '',
  stderr: 'Error: test failed',
  durationMs: 50,
}));

function createRunner(shell = successShell, maxRetries = 3): CycleRunner {
  return new CycleRunner({ maxRetries, projectRoot: '/tmp/test', runShell: shell });
}

describe('CycleRunner', () => {
  it('should initialize with idle state', () => {
    const runner = createRunner();
    const state = runner.getState();
    expect(state.status).toBe('idle');
    expect(state.currentAttempt).toBe(0);
    expect(state.validationHistory).toEqual([]);
    expect(state.evolutionHistory).toEqual([]);
  });

  it('should complete full cycle with successful validation', async () => {
    const runner = createRunner(successShell);
    const report = await runner.run({ goal: 'TypeScript 유틸리티 함수 구현' });

    expect(report.status).toBe('✅');
    expect(report.markdown).toContain('검증 결과');

    const state = runner.getState();
    expect(state.status).toBe('complete');
    expect(state.understanding).toBeDefined();
    expect(state.prototypePlan).toBeDefined();
    expect(state.validationHistory.length).toBeGreaterThanOrEqual(1);
    expect(state.totalDurationMs).toBeGreaterThan(0);
  });

  it('should retry and eventually fail after max attempts', async () => {
    const runner = createRunner(failShell, 2);
    const report = await runner.run({ goal: '실패하는 기능 구현' });

    expect(report.status).toBe('❌');
    const state = runner.getState();
    expect(state.status).toBe('failed');
    expect(state.evolutionHistory.length).toBeGreaterThanOrEqual(1);
  });

  it('should track validation history across retries', async () => {
    let callCount = 0;
    const mixedShell = vi.fn(async (_cmd: string, _cwd: string): Promise<ShellResult> => {
      callCount++;
      // Fail first 2 calls per command, succeed on 3rd
      return {
        exitCode: callCount <= 4 ? 1 : 0,
        stdout: callCount > 4 ? 'OK' : '',
        stderr: callCount <= 4 ? 'Error' : '',
        durationMs: 50,
      };
    });

    const runner = createRunner(mixedShell, 3);
    const report = await runner.run({ goal: '점진적 복구 시나리오' });

    const state = runner.getState();
    expect(state.validationHistory.length).toBeGreaterThanOrEqual(1);
  });

  it('should include analysis in the final report', async () => {
    const runner = createRunner(successShell);
    const report = await runner.run({
      goal: 'REST API 엔드포인트를 만들어줘',
      projectContext: '뇽죵이 Agent v0.4.0',
    });

    expect(report.markdown).toContain('다음');
    expect(report.nextAction).toBeDefined();
  });

  it('should handle errors gracefully', async () => {
    const errorShell = vi.fn(async () => {
      throw new Error('Shell crashed');
    });

    const runner = createRunner(errorShell);
    await expect(runner.run({ goal: '에러 테스트' })).rejects.toThrow('Shell crashed');

    const state = runner.getState();
    expect(state.status).toBe('failed');
  });
});
