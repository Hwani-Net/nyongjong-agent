import { describe, it, expect, beforeEach } from 'vitest';
import {
  SkillLifecycleManager,
  parseFrontmatter,
  parseFrontmatterCategory,
} from '../../src/core/skill-lifecycle.js';
import { clearSkillUsageHistory, getSkillUsageHistory } from '../../src/core/shared-state.js';

describe('parseFrontmatterCategory', () => {
  it('should parse capability category', () => {
    const content = '---\nname: test\ndescription: test\ncategory: capability\n---\nBody';
    expect(parseFrontmatterCategory(content)).toBe('capability');
  });

  it('should parse workflow category', () => {
    const content = '---\nname: test\ncategory: workflow\n---\nBody';
    expect(parseFrontmatterCategory(content)).toBe('workflow');
  });

  it('should default to workflow when no category', () => {
    const content = '---\nname: test\ndescription: test\n---\nBody';
    expect(parseFrontmatterCategory(content)).toBe('workflow');
  });

  it('should default to workflow when no frontmatter', () => {
    expect(parseFrontmatterCategory('# No frontmatter')).toBe('workflow');
  });
});

describe('parseFrontmatter', () => {
  it('should parse name, description, and category', () => {
    const content = '---\nname: svg-animation\ndescription: SVG 애니메이션\ncategory: capability\n---\n# Body';
    const result = parseFrontmatter(content);
    expect(result.name).toBe('svg-animation');
    expect(result.description).toBe('SVG 애니메이션');
    expect(result.category).toBe('capability');
  });

  it('should handle missing fields gracefully', () => {
    const content = '---\nname: test-skill\n---\n# Body';
    const result = parseFrontmatter(content);
    expect(result.name).toBe('test-skill');
    expect(result.description).toBe('');
    expect(result.category).toBe('workflow');
  });
});

describe('SkillLifecycleManager', () => {
  let manager: SkillLifecycleManager;

  beforeEach(() => {
    manager = new SkillLifecycleManager();
    clearSkillUsageHistory();
  });

  it('should register skills', () => {
    manager.registerSkills([
      { name: 'skill-a', description: 'A', category: 'capability' },
      { name: 'skill-b', description: 'B', category: 'workflow' },
    ]);
    const all = manager.getAllSkills();
    expect(all).toHaveLength(2);
    expect(all[0].name).toBe('skill-a');
    expect(all[0].category).toBe('capability');
  });

  it('should record usage and update metrics', () => {
    manager.registerSkills([
      { name: 'test', description: 'Test', category: 'capability' },
    ]);
    manager.recordUsage('test', 500, 1000);
    manager.recordUsage('test', 300, 800);

    const skill = manager.getAllSkills().find(s => s.name === 'test');
    expect(skill).toBeDefined();
    expect(skill!.useCount).toBe(2);
    expect(skill!.totalTokens).toBe(800);
    expect(skill!.avgDurationMs).toBe(900);
    expect(skill!.lastUsed).toBeGreaterThan(0);
  });

  it('should record to shared-state', () => {
    manager.registerSkills([
      { name: 'shared-test', description: 'Test', category: 'workflow' },
    ]);
    manager.recordUsage('shared-test', 100, 200);

    const history = getSkillUsageHistory();
    expect(history).toHaveLength(1);
    expect(history[0].skillName).toBe('shared-test');
    expect(history[0].category).toBe('workflow');
  });

  it('should identify retire candidates (capability + unused)', () => {
    manager.registerSkills([
      { name: 'old-cap', description: 'Old', category: 'capability' },
      { name: 'old-wf', description: 'Old WF', category: 'workflow' },
      { name: 'fresh-cap', description: 'Fresh', category: 'capability' },
    ]);
    // fresh-cap was used recently
    manager.recordUsage('fresh-cap', 100, 200);

    // With 0 threshold → only truly never-used capability
    const candidates = manager.getRetireCandidates(0);
    expect(candidates.map(c => c.name)).toContain('old-cap');
    expect(candidates.map(c => c.name)).not.toContain('old-wf'); // workflow never retires
    expect(candidates.map(c => c.name)).not.toContain('fresh-cap'); // was just used
  });

  it('should never mark workflow skills as retire candidates', () => {
    manager.registerSkills([
      { name: 'wf-1', description: 'WF', category: 'workflow' },
      { name: 'wf-2', description: 'WF2', category: 'workflow' },
    ]);
    const candidates = manager.getRetireCandidates(0);
    expect(candidates).toHaveLength(0);
  });

  it('should generate audit report', () => {
    manager.registerSkills([
      { name: 'cap-a', description: 'Cap A', category: 'capability' },
      { name: 'wf-b', description: 'WF B', category: 'workflow' },
      { name: 'cap-c', description: 'Cap C', category: 'capability' },
    ]);
    manager.recordUsage('wf-b', 500, 1000);

    const report = manager.generateAuditReport(30);
    expect(report.totalSkills).toBe(3);
    expect(report.capabilityCount).toBe(2);
    expect(report.workflowCount).toBe(1);
    expect(report.retireCandidates.length).toBeGreaterThanOrEqual(2); // cap-a, cap-c
    expect(report.topUsed).toHaveLength(1); // wf-b
    expect(report.report).toContain('스킬 수명 감사 보고서');
  });
});
