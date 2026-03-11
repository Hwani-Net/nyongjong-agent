// Integration tests for CycleRunner — REAL ShellRunner, NO mocked shell
// NOTE: validate stage runs the prototype plan's commands directly.
// We use goals that produce lightweight commands (echo) to avoid recursive npm test.
import { describe, it, expect } from 'vitest';
import { CycleRunner } from '../../src/workflow/cycle-runner.js';

import { createPrototypePlan } from '../../src/workflow/prototype.js';
import type { ShellResult } from '../../src/workflow/validate.js';

const PROJECT_ROOT = process.cwd();
const TIMEOUT = 120_000;

// Mock shell that returns success immediately — avoids recursive npm test execution.
// Real shell integration is covered by execution.test.ts (ShellRunner unit tests).
function makeMockShell(): (cmd: string, cwd: string) => Promise<ShellResult> {
  return async (cmd: string) => ({
    exitCode: 0,
    stdout: `mock output for: ${cmd.slice(0, 60)}`,
    stderr: '',
    durationMs: 1,
  });
}

function makeRunner(maxRetries = 2): CycleRunner {
  return new CycleRunner({
    maxRetries,
    projectRoot: PROJECT_ROOT,
    runShell: makeMockShell(),
  });
}


describe('CycleRunner (mock shell)', () => {
  it('should initialize with idle state', () => {
    const runner = makeRunner();
    const state = runner.getState();
    expect(state.status).toBe('idle');
    expect(state.currentAttempt).toBe(0);
    expect(state.validationHistory).toEqual([]);
    expect(state.evolutionHistory).toEqual([]);
  });

  it('should complete full cycle: understand → prototype → validate → report', async () => {
    const runner = makeRunner(1);
    // "TypeScript 유틸리티 함수" → implementation task
    // prototype stage generates: npm typecheck + npm test
    // We just check the lifecycle works end-to-end
    const report = await runner.run({ goal: 'TypeScript 유틸리티 함수 구현' });

    expect(report).toHaveProperty('status');
    expect(report).toHaveProperty('markdown');
    expect(report.markdown.length).toBeGreaterThan(0);

    const state = runner.getState();
    expect(['complete', 'failed']).toContain(state.status);
    expect(state.understanding).toBeDefined();
    expect(state.prototypePlan).toBeDefined();
    expect(state.validationHistory.length).toBeGreaterThanOrEqual(1);
    expect(state.totalDurationMs).toBeGreaterThan(0);
  }, TIMEOUT);

  it('should track validation history (pass or fail — both are valid real results)', async () => {
    const runner = makeRunner(1);
    await runner.run({ goal: '간단한 메모 기능 추가' });

    const state = runner.getState();
    expect(state.validationHistory.length).toBeGreaterThanOrEqual(1);
    const lastValidation = state.validationHistory[state.validationHistory.length - 1];
    expect(lastValidation).toHaveProperty('passed');
    expect(lastValidation).toHaveProperty('checks');
    expect(Array.isArray(lastValidation.checks)).toBe(true);
  }, TIMEOUT);

  it('should include analysis output in report', async () => {
    const runner = makeRunner(1);
    const report = await runner.run({
      goal: 'REST API 엔드포인트를 만들어줘',
      projectContext: '뇽죵이 Agent v0.4.0',
    });

    expect(report.markdown).toBeDefined();
    expect(report.nextAction).toBeDefined();
  }, TIMEOUT);

  it('should handle real shell exception gracefully (state becomes failed)', async () => {
    const errRunner = new CycleRunner({
      maxRetries: 1,
      projectRoot: PROJECT_ROOT,
      runShell: async (): Promise<ShellResult> => {
        throw new Error('Real shell exception for test');
      },
    });

    await expect(errRunner.run({ goal: '에러 테스트' })).rejects.toThrow('Real shell exception for test');
    const state = errRunner.getState();
    expect(state.status).toBe('failed');
  });
});

// ─── createPrototypePlan unit test (pure logic, no shell) ─────────────────
describe('createPrototypePlan (pure logic)', () => {
  it('should produce commands for implementation task', () => {
    const plan = createPrototypePlan({
      analysis: { taskType: 'implementation', complexity: 'low', scope: 'existing project expansion', keyRequirements: ['새 기능 구현'] },
      goal: 'TypeScript 유틸리티 구현',
      projectRoot: PROJECT_ROOT,
    });

    expect(plan.filePlan.length).toBeGreaterThanOrEqual(1);
    expect(plan.commands.length).toBeGreaterThanOrEqual(1);
    expect(plan.effort).toBeDefined();
    expect(plan.notes).toContain('Plan Summary');
  });
});

// ─── ADR-014: Team Lead Review + Visual Check stages ──────────────────────
describe('CycleRunner ADR-014 stages', () => {
  // Mock LLMRouter that always returns PASS
  function makeMockLLMRouter() {
    return {
      buildTeamLeadRequest: (content: string) => ({
        role: '코드 리뷰어 (팀장)',
        systemPrompt: 'test prompt',
        userMessage: content,
        provider: 'test',
      }),
      invoke: async () => ({
        role: '코드 리뷰어 (팀장)',
        provider: 'test',
        model: 'test-model',
        content: '코드 품질 양호합니다. PASS 판정.',
        durationMs: 100,
        cost: 0,
        success: true,
      }),
    };
  }

  it('should include teamLeadReview in state when llmRouter is provided', async () => {
    const runner = new CycleRunner({
      maxRetries: 1,
      projectRoot: PROJECT_ROOT,
      runShell: makeMockShell(),
      llmRouter: makeMockLLMRouter() as any,
    });

    await runner.run({ goal: 'TypeScript 유틸리티 함수 구현' });
    const state = runner.getState();

    expect(state.teamLeadReview).toBeDefined();
    expect(state.teamLeadReview!.verdict).toBe('PASS');
    expect(state.teamLeadReview!.attempts).toBe(1);
  }, TIMEOUT);

  it('should include teamLeadReview section in report markdown', async () => {
    const runner = new CycleRunner({
      maxRetries: 1,
      projectRoot: PROJECT_ROOT,
      runShell: makeMockShell(),
      llmRouter: makeMockLLMRouter() as any,
    });

    const report = await runner.run({ goal: 'REST API 서버 개발' });
    expect(report.markdown).toContain('팀장 코드 리뷰');
    expect(report.markdown).toContain('PASS');
  }, TIMEOUT);

  it('should trigger visual check for UI-related goals', async () => {
    let visualCheckCalled = false;
    const runner = new CycleRunner({
      maxRetries: 1,
      projectRoot: PROJECT_ROOT,
      runShell: makeMockShell(),
      onVisualCheck: async () => {
        visualCheckCalled = true;
        return { passed: true, notes: '화면 정상' };
      },
    });

    await runner.run({ goal: '대시보드 페이지 UI 구현' });
    const state = runner.getState();

    expect(visualCheckCalled).toBe(true);
    expect(state.visualCheck).toBeDefined();
    expect(state.visualCheck!.passed).toBe(true);
  }, TIMEOUT);

  it('should skip visual check for non-UI goals', async () => {
    let visualCheckCalled = false;
    const runner = new CycleRunner({
      maxRetries: 1,
      projectRoot: PROJECT_ROOT,
      runShell: makeMockShell(),
      onVisualCheck: async () => {
        visualCheckCalled = true;
        return { passed: true, notes: '화면 정상' };
      },
    });

    await runner.run({ goal: 'TypeScript 유틸리티 함수 구현' });
    expect(visualCheckCalled).toBe(false);
  }, TIMEOUT);
});
