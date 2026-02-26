import { describe, it, expect, vi, beforeEach } from 'vitest';
import { analyzeGoal } from '../../src/workflow/understand.js';
import { createPrototypePlan, type PrototypeInput } from '../../src/workflow/prototype.js';
import { evolve, type EvolveInput } from '../../src/workflow/evolve.js';
import { generateReport } from '../../src/workflow/report.js';
import type { ValidationResult } from '../../src/workflow/validate.js';

describe('Workflow: Understand', () => {
  it('should detect UI task', () => {
    const result = analyzeGoal({ goal: '로그인 페이지 UI를 만들어줘' });
    expect(result.analysis.keyRequirements).toContain('UI/UX 구현 필요');
    expect(result.analysis.keyRequirements).toContain('새 기능 구현');
  });

  it('should detect API task', () => {
    const result = analyzeGoal({ goal: 'REST API 엔드포인트 추가' });
    expect(result.analysis.keyRequirements).toContain('API 엔드포인트 구현 필요');
  });

  it('should detect debugging task', () => {
    const result = analyzeGoal({ goal: '로그인 버그 수정' });
    expect(result.analysis.taskType).toBe('debugging');
    expect(result.analysis.keyRequirements).toContain('기존 버그 수정');
  });

  it('should detect refactoring task', () => {
    const result = analyzeGoal({ goal: '코드 구조 리팩토링' });
    expect(result.analysis.taskType).toBe('refactoring');
  });

  it('should estimate complexity based on signals', () => {
    const result = analyzeGoal({
      goal: 'UI 페이지와 API 엔드포인트를 만들어서 실시간 인증 시스템을 구현해야 합니다. 기존 프로젝트에 추가로 보안도 신경써주세요.',
      knowledgeItems: ['ki1', 'ki2', 'ki3'],
    });
    // Multiple complexity signals: UI+API, >200 chars, 인증, 3+ KIs
    expect(['high', 'critical']).toContain(result.analysis.complexity);
  });

  it('should generate persona questions', () => {
    const result = analyzeGoal({ goal: '새 기능 만들어줘' });
    expect(result.personaQuestions.length).toBeGreaterThanOrEqual(1);
  });
});

describe('Workflow: Prototype', () => {
  it('should create plan with test files', () => {
    const input: PrototypeInput = {
      analysis: {
        taskType: 'implementation',
        complexity: 'medium',
        scope: '새 프로젝트',
        keyRequirements: ['새 기능 구현'],
      },
      goal: 'Build a new feature',
    };

    const plan = createPrototypePlan(input);
    expect(plan.filePlan.length).toBeGreaterThanOrEqual(1);
    expect(plan.commands).toContain('npm test');
    expect(plan.effort).toBeDefined();
  });
});

describe('Workflow: Evolve', () => {
  it('should not retry when validation passed', () => {
    const input: EvolveInput = {
      validation: { passed: true, checks: [], issues: [], totalDurationMs: 100 },
      attempt: 1,
      maxAttempts: 3,
    };
    const result = evolve(input);
    expect(result.shouldRetry).toBe(false);
    expect(result.escalateToHuman).toBe(false);
  });

  it('should suggest retry on first failure', () => {
    const failedValidation: ValidationResult = {
      passed: false,
      checks: [{
        name: 'npm test',
        command: 'npm test',
        passed: false,
        output: 'TypeError: cannot read property of undefined',
        durationMs: 500,
      }],
      issues: ['Test failed'],
      totalDurationMs: 500,
    };

    const result = evolve({
      validation: failedValidation,
      attempt: 1,
      maxAttempts: 3,
    });

    expect(result.shouldRetry).toBe(true);
    expect(result.fixes.length).toBeGreaterThanOrEqual(1);
  });

  it('should escalate to human after max attempts', () => {
    const result = evolve({
      validation: { passed: false, checks: [], issues: ['error'], totalDurationMs: 100 },
      attempt: 3,
      maxAttempts: 3,
    });

    expect(result.shouldRetry).toBe(false);
    expect(result.escalateToHuman).toBe(true);
  });
});

describe('Workflow: Report', () => {
  it('should generate success report', () => {
    const report = generateReport({
      goal: '새 기능 구현',
      analysis: {
        taskType: 'implementation',
        complexity: 'medium',
        keyRequirements: ['새 기능 구현'],
        risks: [],
      },
      validation: { passed: true, checks: [], issues: [], totalDurationMs: 1000 },
      totalDurationMs: 5000,
      cycleIterations: 1,
    });

    expect(report.status).toBe('✅');
    expect(report.markdown).toContain('검증 결과');
    expect(report.nextAction).toContain('다음');
  });

  it('should generate failure report', () => {
    const report = generateReport({
      goal: '버그 수정',
      analysis: {
        taskType: 'debugging',
        complexity: 'high',
        keyRequirements: ['버그 수정'],
        risks: ['높은 복잡도'],
      },
      validation: { passed: false, checks: [], issues: ['테스트 실패'], totalDurationMs: 2000 },
      evolutionHistory: [{
        shouldRetry: false,
        failureAnalysis: 'test error',
        fixes: [],
        escalateToHuman: true,
        notes: 'Escalated',
      }],
      totalDurationMs: 10000,
      cycleIterations: 3,
    });

    expect(report.status).toBe('❌');
    expect(report.markdown).toContain('이슈');
  });
});
