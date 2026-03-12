// Tests for all 5 workflow stages (understand is tested separately)
import { describe, it, expect, vi } from 'vitest';
import { createPrototypePlan } from '../../src/workflow/prototype.js';
import { validate } from '../../src/workflow/validate.js';
import { evolve } from '../../src/workflow/evolve.js';
import { generateReport } from '../../src/workflow/report.js';
import type { ValidationResult } from '../../src/workflow/validate.js';

// ─── Stage 2: Prototype ─────────────────────────────────────────────
describe('Prototype (Stage 2)', () => {
  it('should generate a file plan with test files always included', () => {
    const result = createPrototypePlan({
      analysis: {
        taskType: 'implementation',
        complexity: 'low',
        scope: 'new',
        keyRequirements: ['새 기능 구현'],
      },
      goal: 'Add a health check endpoint',
    });

    expect(result.filePlan.length).toBeGreaterThanOrEqual(2); // src/ + tests/
    expect(result.filePlan.some(f => f.path === 'tests/')).toBe(true);
    expect(result.commands).toContain('npm test');
    expect(result.effort).toBe('< 1 hour');
  });

  it('should include UI components for UI tasks', () => {
    const result = createPrototypePlan({
      analysis: {
        taskType: 'implementation',
        complexity: 'medium',
        scope: 'new',
        keyRequirements: ['UI/UX 구현 필요', 'API 엔드포인트 구현 필요'],
      },
      goal: 'Build dashboard with API',
    });

    expect(result.filePlan.some(f => f.path === 'src/components/')).toBe(true);
    expect(result.filePlan.some(f => f.path === 'src/api/')).toBe(true);
    expect(result.commands).toContain('npm run build');
  });

  it('should incorporate persona feedback into notes', () => {
    const result = createPrototypePlan({
      analysis: {
        taskType: 'strategy',
        complexity: 'high',
        scope: 'existing',
        keyRequirements: [],
      },
      goal: 'Design auth strategy',
      personaFeedback: ['CEO says focus on ROI', 'Engineer suggests JWT'],
    });

    expect(result.notes).toContain('Persona Insights');
    expect(result.notes).toContain('CEO says focus on ROI');
    expect(result.effort).toBe('2-4 hours');
  });

  it('should estimate effort based on complexity', () => {
    const complexities = [
      { complexity: 'low', expected: '< 1 hour' },
      { complexity: 'medium', expected: '1-2 hours' },
      { complexity: 'high', expected: '2-4 hours' },
      { complexity: 'critical', expected: '4+ hours' },
    ];

    for (const { complexity, expected } of complexities) {
      const result = createPrototypePlan({
        analysis: { taskType: 'implementation', complexity, scope: 'new', keyRequirements: [] },
        goal: 'Test effort',
      });
      expect(result.effort).toBe(expected);
    }
  });

  it('should sort file plan by order', () => {
    const result = createPrototypePlan({
      analysis: {
        taskType: 'implementation',
        complexity: 'low',
        scope: 'new',
        keyRequirements: ['UI/UX 구현 필요', '새 기능 구현'],
      },
      goal: 'Full stack feature',
    });

    // Verify ordering: lower order numbers come first
    for (let i = 1; i < result.filePlan.length; i++) {
      expect(result.filePlan[i].order).toBeGreaterThanOrEqual(result.filePlan[i - 1].order);
    }
  });
});

// ─── Stage 3: Validate ──────────────────────────────────────────────
describe('Validate (Stage 3)', () => {
  it('should pass when all commands succeed', async () => {
    const mockShell = vi.fn().mockResolvedValue({
      exitCode: 0,
      stdout: 'All tests passed',
      stderr: '',
      durationMs: 100,
    });

    const result = await validate({
      projectRoot: '/tmp/test',
      commands: ['npm run typecheck', 'npm test'],
      runShell: mockShell,
      skipAutoChecks: true,
    });

    expect(result.passed).toBe(true);
    expect(result.checks.length).toBe(2);
    expect(result.issues.length).toBe(0);
    expect(mockShell).toHaveBeenCalledTimes(2);
  });

  it('should fail when a command fails', async () => {
    const mockShell = vi.fn()
      .mockResolvedValueOnce({ exitCode: 0, stdout: 'OK', stderr: '', durationMs: 50 })
      .mockResolvedValueOnce({ exitCode: 1, stdout: '', stderr: 'Test failed', durationMs: 200 });

    const result = await validate({
      projectRoot: '/tmp/test',
      commands: ['npm run typecheck', 'npm test'],
      runShell: mockShell,
      skipAutoChecks: true,
    });

    expect(result.passed).toBe(false);
    expect(result.issues.length).toBe(1);
    expect(result.issues[0]).toContain('npm test');
  });

  it('should accumulate total duration', async () => {
    const mockShell = vi.fn().mockResolvedValue({
      exitCode: 0, stdout: '', stderr: '', durationMs: 300,
    });

    const result = await validate({
      projectRoot: '/tmp/test',
      commands: ['cmd1', 'cmd2', 'cmd3'],
      runShell: mockShell,
      skipAutoChecks: true,
    });

    expect(result.totalDurationMs).toBe(900);
  });

  it('should handle empty command list', async () => {
    const result = await validate({
      projectRoot: '/tmp/test',
      commands: [],
      runShell: vi.fn(),
      skipAutoChecks: true,
    });

    expect(result.passed).toBe(true);
    expect(result.checks.length).toBe(0);
  });
});

// ─── Stage 4: Evolve ────────────────────────────────────────────────
describe('Evolve (Stage 4)', () => {
  const passedValidation: ValidationResult = {
    passed: true,
    checks: [{ name: 'npm test', command: 'npm test', passed: true, output: 'OK', durationMs: 100 }],
    issues: [],
    totalDurationMs: 100,
    warnings: [],
  };

  const failedValidation: ValidationResult = {
    passed: false,
    checks: [
      { name: 'npm test', command: 'npm test', passed: false, output: 'TypeError TS2345: miss type', durationMs: 100 },
    ],
    issues: ['npm test failed (exit code 1)'],
    totalDurationMs: 100,
    warnings: [],
  };

  it('should not retry when validation passed', () => {
    const result = evolve({ validation: passedValidation, attempt: 1, maxAttempts: 3 });

    expect(result.shouldRetry).toBe(false);
    expect(result.escalateToHuman).toBe(false);
    expect(result.fixes.length).toBe(0);
  });

  it('should suggest type error fix for TypeScript errors', () => {
    const result = evolve({ validation: failedValidation, attempt: 1, maxAttempts: 3 });

    expect(result.shouldRetry).toBe(true);
    expect(result.fixes.some(f => f.type === 'code-change' && f.description.includes('type'))).toBe(true);
  });

  it('should suggest dependency fix for module not found', () => {
    const missingModuleValidation: ValidationResult = {
      passed: false,
      checks: [{ name: 'build', command: 'npm run build', passed: false, output: 'Cannot find module foo', durationMs: 50 }],
      issues: ['build failed'],
      totalDurationMs: 50,
      warnings: [],
    };

    const result = evolve({ validation: missingModuleValidation, attempt: 1, maxAttempts: 3 });
    expect(result.fixes.some(f => f.type === 'dependency')).toBe(true);
  });

  it('should escalate to human when all attempts exhausted', () => {
    const result = evolve({ validation: failedValidation, attempt: 3, maxAttempts: 3 });

    expect(result.shouldRetry).toBe(false);
    expect(result.escalateToHuman).toBe(true);
  });

  it('should detect environment issues', () => {
    const envValidation: ValidationResult = {
      passed: false,
      checks: [{ name: 'build', command: 'build', passed: false, output: 'ENOSPC: no space left', durationMs: 50 }],
      issues: ['build failed'],
      totalDurationMs: 50,
      warnings: [],
    };

    const result = evolve({ validation: envValidation, attempt: 1, maxAttempts: 3 });
    expect(result.fixes.some(f => f.type === 'environment')).toBe(true);
  });

  it('should add generic fix when no pattern matches', () => {
    const unknownValidation: ValidationResult = {
      passed: false,
      checks: [{ name: 'lint', command: 'lint', passed: false, output: 'unknown error xyz', durationMs: 50 }],
      issues: ['lint failed'],
      totalDurationMs: 50,
      warnings: [],
    };

    const result = evolve({ validation: unknownValidation, attempt: 1, maxAttempts: 3 });
    expect(result.fixes.some(f => f.confidence === 'low')).toBe(true);
  });
});

// ─── Stage 5: Report ────────────────────────────────────────────────
describe('Report (Stage 5)', () => {
  it('should generate a success report', () => {
    const report = generateReport({
      goal: 'Add health check endpoint',
      analysis: { taskType: 'implementation', complexity: 'low', keyRequirements: ['API'], risks: [] },
      validation: {
        passed: true,
        checks: [{ name: 'npm test', command: 'npm test', passed: true, output: 'OK', durationMs: 500 }],
        issues: [],
        totalDurationMs: 500,
        warnings: [],
      },
      totalDurationMs: 3000,
      cycleIterations: 1,
    });

    expect(report.status).toBe('✅');
    expect(report.title).toContain('✅');
    expect(report.markdown).toContain('검증 결과');
    expect(report.recommendedModel).toBe('Gemini 3 Flash');
    expect(report.nextAction).toContain('다음');
  });

  it('should generate a failure report with issues', () => {
    const report = generateReport({
      goal: 'Complex migration task',
      analysis: { taskType: 'strategy', complexity: 'critical', keyRequirements: [], risks: ['data loss'] },
      validation: {
        passed: false,
        checks: [{ name: 'npm test', command: 'npm test', passed: false, output: 'Error', durationMs: 200 }],
        issues: ['npm test failed'],
        totalDurationMs: 200,
        warnings: [],
      },
      evolutionHistory: [{ shouldRetry: false, failureAnalysis: 'all failed', fixes: [], escalateToHuman: true, notes: 'All attempts exhausted' }],
      totalDurationMs: 60000,
      cycleIterations: 3,
    });

    expect(report.status).toBe('❌');
    expect(report.markdown).toContain('이슈');
    expect(report.markdown).toContain('진화 이력');
    expect(report.recommendedModel).toBe('Claude Opus 4.6 (Thinking)');
    expect(report.nextAction).toContain('수정');
  });

  it('should include persona results when available', () => {
    const report = generateReport({
      goal: 'Test persona section',
      analysis: { taskType: 'implementation', complexity: 'medium', keyRequirements: [], risks: [] },
      validation: { passed: true, checks: [], issues: [], totalDurationMs: 100, warnings: [] },
      personaResults: [{ persona: 'CEO', response: 'Focus on revenue', durationMs: 1000, model: 'gemma3:4b', success: true }],
      totalDurationMs: 5000,
      cycleIterations: 1,
    });

    expect(report.markdown).toContain('페르소나 자문');
    expect(report.markdown).toContain('CEO');
  });

  it('should recommend correct model per complexity', () => {
    const complexityModelMap = [
      { complexity: 'low', expected: 'Gemini 3 Flash' },
      { complexity: 'medium', expected: 'Gemini 3.1 Pro (Low)' },
      { complexity: 'high', expected: 'Gemini 3.1 Pro (High)' },
      { complexity: 'critical', expected: 'Claude Opus 4.6 (Thinking)' },
    ];

    for (const { complexity, expected } of complexityModelMap) {
      const report = generateReport({
        goal: 'Test',
        analysis: { taskType: 'implementation', complexity, keyRequirements: [], risks: [] },
        validation: { passed: true, checks: [], issues: [], totalDurationMs: 100, warnings: [] },
        totalDurationMs: 100,
        cycleIterations: 1,
      });
      expect(report.recommendedModel).toBe(expected);
    }
  });

  it('should format duration correctly', () => {
    const report1 = generateReport({
      goal: 'Test', analysis: { taskType: 'simple', complexity: 'low', keyRequirements: [], risks: [] },
      validation: { passed: true, checks: [], issues: [], totalDurationMs: 0, warnings: [] },
      totalDurationMs: 500, cycleIterations: 1,
    });
    expect(report1.markdown).toContain('500ms');

    const report2 = generateReport({
      goal: 'Test', analysis: { taskType: 'simple', complexity: 'low', keyRequirements: [], risks: [] },
      validation: { passed: true, checks: [], issues: [], totalDurationMs: 0, warnings: [] },
      totalDurationMs: 65000, cycleIterations: 1,
    });
    expect(report2.markdown).toContain('1.1min');
  });
});
