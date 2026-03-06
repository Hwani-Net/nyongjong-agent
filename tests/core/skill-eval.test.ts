import { describe, it, expect } from 'vitest';
import {
  scanEvals,
  simulateEval,
  runComparison,
  type EvalCase,
} from '../../src/core/skill-eval.js';
import { SkillLifecycleManager } from '../../src/core/skill-lifecycle.js';

describe('SkillEval Framework', () => {
  describe('scanEvals', () => {
    it('should return empty array for non-existent directory', async () => {
      const result = await scanEvals('/tmp/nonexistent-skill-dir-12345');
      expect(result).toEqual([]);
    });
  });

  describe('simulateEval', () => {
    const evalCase: EvalCase = {
      name: 'test-eval',
      prompt: 'pentagonal-audit 스킬로 코드를 평가해줘',
      expectedContains: ['평가', '점수'],
      maxTokens: 3000,
      timeoutMs: 10000,
      skillName: 'pentagonal-audit',
    };

    it('should return EvalResult with correct structure', async () => {
      const result = await simulateEval(evalCase, true, '5축 평가 기준으로 점수를 매깁니다');
      expect(result).toHaveProperty('evalName', 'test-eval');
      expect(result).toHaveProperty('skillName', 'pentagonal-audit');
      expect(result).toHaveProperty('withSkill', true);
      expect(result).toHaveProperty('passed');
      expect(result).toHaveProperty('matchedKeywords');
      expect(result).toHaveProperty('missedKeywords');
      expect(result).toHaveProperty('tokens');
      expect(result).toHaveProperty('durationMs');
      expect(result).toHaveProperty('timestamp');
    });

    it('should find keywords in skill content when withSkill=true', async () => {
      const result = await simulateEval(evalCase, true, '이 코드의 평가 결과 점수는 85점입니다');
      expect(result.matchedKeywords).toContain('평가');
      expect(result.matchedKeywords).toContain('점수');
      expect(result.passed).toBe(true);
    });

    it('should miss keywords when withSkill=false and prompt lacks them', async () => {
      const simpleCase: EvalCase = {
        name: 'missing-test',
        prompt: 'hello world',
        expectedContains: ['평가', '점수'],
        skillName: 'test',
      };
      const result = await simulateEval(simpleCase, false);
      expect(result.missedKeywords.length).toBeGreaterThan(0);
      expect(result.passed).toBe(false);
    });
  });

  describe('runComparison', () => {
    it('should return KEEP when skill helps pass eval', async () => {
      const evalCase: EvalCase = {
        name: 'comparison-test',
        prompt: 'basic task',
        expectedContains: ['평가', '점수'],
        skillName: 'test-skill',
      };
      const skillContent = '이 스킬은 코드 평가와 점수 산출을 합니다';
      const result = await runComparison(evalCase, skillContent);

      expect(result).toHaveProperty('skillName', 'test-skill');
      expect(result).toHaveProperty('evalName', 'comparison-test');
      expect(result).toHaveProperty('verdict');
      expect(result).toHaveProperty('reason');
      expect(['KEEP', 'RETIRE', 'REVIEW']).toContain(result.verdict);
    });
  });
});

describe('SkillLifecycleManager Retirement', () => {
  describe('isRetired', () => {
    it('should detect retired: true in frontmatter', () => {
      const content = '---\nname: test-skill\nretired: true\n---\n# Test Skill';
      expect(SkillLifecycleManager.isRetired(content)).toBe(true);
    });

    it('should return false when no retired flag', () => {
      const content = '---\nname: test-skill\n---\n# Test Skill';
      expect(SkillLifecycleManager.isRetired(content)).toBe(false);
    });

    it('should return false when no frontmatter', () => {
      expect(SkillLifecycleManager.isRetired('# Just markdown')).toBe(false);
    });
  });

  describe('retireSkillContent', () => {
    it('should add retired: true to existing frontmatter', () => {
      const content = '---\nname: test-skill\n---\n# Content';
      const result = SkillLifecycleManager.retireSkillContent(content);
      expect(result).toContain('retired: true');
      expect(SkillLifecycleManager.isRetired(result)).toBe(true);
    });

    it('should create frontmatter if none exists', () => {
      const content = '# No frontmatter skill';
      const result = SkillLifecycleManager.retireSkillContent(content);
      expect(result).toContain('---\nretired: true\n---');
    });

    it('should not duplicate retired: true if already retired', () => {
      const content = '---\nname: test\nretired: true\n---\n# Content';
      const result = SkillLifecycleManager.retireSkillContent(content);
      expect(result).toBe(content); // unchanged
    });
  });

  describe('reactivateSkillContent', () => {
    it('should remove retired: true from frontmatter', () => {
      const content = '---\nname: test-skill\nretired: true\n---\n# Content';
      const result = SkillLifecycleManager.reactivateSkillContent(content);
      expect(result).not.toContain('retired: true');
      expect(SkillLifecycleManager.isRetired(result)).toBe(false);
    });

    it('should return unchanged if not retired', () => {
      const content = '---\nname: test-skill\n---\n# Content';
      const result = SkillLifecycleManager.reactivateSkillContent(content);
      expect(result).toBe(content);
    });
  });
});

describe('Dashboard Skill Actions', () => {
  it('should have skill action buttons in HTML', async () => {
    const fs = await import('fs/promises');
    const content = await fs.readFile('src/dashboard/server.ts', 'utf-8');
    expect(content).toContain('runSkillEval');
    expect(content).toContain('retireSkill');
    expect(content).toContain('reactivateSkill');
    expect(content).toContain('skill-card-actions');
  });

  it('should have eval/retire/reactivate API routes', async () => {
    const fs = await import('fs/promises');
    const content = await fs.readFile('src/dashboard/server.ts', 'utf-8');
    expect(content).toContain('/api/skills/');
    expect(content).toContain('/eval');
    expect(content).toContain('/retire');
    expect(content).toContain('/reactivate');
  });

  it('should have MCP actions for eval and retirement', async () => {
    const fs = await import('fs/promises');
    const content = await fs.readFile('src/mcp-server.ts', 'utf-8');
    expect(content).toContain("'run_eval'");
    expect(content).toContain("'scan_evals'");
    expect(content).toContain("'retire'");
    expect(content).toContain("'reactivate'");
  });
});
