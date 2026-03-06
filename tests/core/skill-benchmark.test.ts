import { describe, it, expect, beforeEach } from 'vitest';
import { SkillBenchmark } from '../../src/core/skill-benchmark.js';

describe('SkillBenchmark', () => {
  let engine: SkillBenchmark;

  beforeEach(() => {
    engine = new SkillBenchmark();
  });

  it('should start baseline and return session ID', () => {
    const id = engine.startBaseline('test-skill', 1000, 500, true);
    expect(id).toMatch(/^bench-/);
  });

  it('should end session with skill and produce result', () => {
    const id = engine.startBaseline('test-skill', 1000, 500, true);
    const result = engine.endWithSkill(id, 800, 400, true);

    expect(result).not.toBeNull();
    expect(result!.skillName).toBe('test-skill');
    expect(result!.withSkill.sampleCount).toBe(1);
    expect(result!.withoutSkill.sampleCount).toBe(1);
    expect(result!.verdict).toBeDefined();
    expect(result!.report).toContain('A/B 벤치마크');
  });

  it('should return null for unknown session', () => {
    const result = engine.endWithSkill('nonexistent', 100, 100, true);
    expect(result).toBeNull();
  });

  it('should prevent double completion', () => {
    const id = engine.startBaseline('test', 100, 100, true);
    engine.endWithSkill(id, 80, 80, true);
    const secondAttempt = engine.endWithSkill(id, 80, 80, true);
    expect(secondAttempt).toBeNull();
  });

  it('should calculate improvement correctly — skill saves tokens', () => {
    // Baseline: 1000 tokens, 500ms
    engine.startBaseline('efficient-skill', 1000, 500, true);
    // With skill: 700 tokens, 350ms (30% improvement)
    const id2 = engine.startBaseline('efficient-skill', 1200, 600, true);
    engine.endWithSkill(id2, 600, 300, true);

    const stats = engine.getSkillStats('efficient-skill');
    expect(stats).not.toBeNull();
    // with skill entries: 600 tokens, without: 1000+1200=2200/2=1100
    expect(stats!.withSkill.avgTokens).toBeLessThan(stats!.withoutSkill.avgTokens);
  });

  it('should return KEEP verdict when skill improves metrics significantly', () => {
    // Baseline (without skill): expensive
    engine.startBaseline('good-skill', 2000, 1000, false);
    // Another baseline
    const id = engine.startBaseline('good-skill', 1800, 900, false);
    // With skill: much better
    engine.endWithSkill(id, 500, 200, true);

    const stats = engine.getSkillStats('good-skill');
    expect(stats).not.toBeNull();
    expect(stats!.verdict).toBe('KEEP');
  });

  it('should return RETIRE verdict when skill makes things worse', () => {
    // Baseline (without skill): already good
    const id = engine.startBaseline('bad-skill', 100, 50, true);
    // With skill: worse in every way
    engine.endWithSkill(id, 500, 200, false);

    const stats = engine.getSkillStats('bad-skill');
    expect(stats).not.toBeNull();
    expect(stats!.verdict).toBe('RETIRE');
  });

  it('should return null stats for skill with no data', () => {
    const stats = engine.getSkillStats('unknown-skill');
    expect(stats).toBeNull();
  });

  it('should list all benchmarked skills', () => {
    engine.startBaseline('skill-a', 100, 100, true);
    engine.startBaseline('skill-b', 200, 200, true);

    const skills = engine.getAllBenchmarkedSkills();
    expect(skills).toContain('skill-a');
    expect(skills).toContain('skill-b');
  });

  it('should generate summary report', () => {
    const id = engine.startBaseline('summary-test', 1000, 500, true);
    engine.endWithSkill(id, 800, 400, true);

    const summary = engine.generateSummaryReport();
    expect(summary).toContain('벤치마크 종합 보고서');
    expect(summary).toContain('summary-test');
  });

  it('should return empty message when no benchmark data', () => {
    const summary = engine.generateSummaryReport();
    expect(summary).toContain('아직 벤치마크 데이터가 없습니다');
  });

  describe('flushToObsidian', () => {
    // Minimal mock of ObsidianStore — only writeNote is needed
    const createMockStore = () => {
      const written: Array<{ path: string; content: string; frontmatter: Record<string, unknown> | undefined }> = [];
      const mockStore = {
        writeNote: async (path: string, content: string, fm?: Record<string, unknown>) => {
          written.push({ path, content, frontmatter: fm });
        },
        _written: written,
      };
      return mockStore as unknown as import('../../src/core/obsidian-store.js').ObsidianStore & { _written: typeof written };
    };

    it('should flush a completed benchmark and return the vault path', async () => {
      const id = engine.startBaseline('flush-skill', 1000, 500, true);
      engine.endWithSkill(id, 700, 350, true);

      const store = createMockStore();
      const path = await engine.flushToObsidian('flush-skill', store);

      expect(path).toBe('뇽죵이Agent/benchmark/flush-skill.md');
      expect(store._written).toHaveLength(1);
    });

    it('should include verdict and metrics in flushed frontmatter', async () => {
      const id = engine.startBaseline('meta-skill', 2000, 1000, false);
      engine.endWithSkill(id, 500, 200, true);

      const store = createMockStore();
      await engine.flushToObsidian('meta-skill', store);

      const written = store._written[0]!;
      expect(written.frontmatter?.skill).toBe('meta-skill');
      expect(written.frontmatter?.verdict).toBeDefined();
      expect(written.frontmatter?.sampleCount).toBe(2);
      expect(written.content).toContain('A/B 벤치마크');
    });

    it('should throw if skill has no benchmark data', async () => {
      const store = createMockStore();
      await expect(engine.flushToObsidian('no-such-skill', store)).rejects.toThrow(
        'no data for "no-such-skill"',
      );
    });

    it('should flush all skills and write summary.md', async () => {
      const id1 = engine.startBaseline('skill-x', 1000, 500, true);
      engine.endWithSkill(id1, 800, 400, true);
      const id2 = engine.startBaseline('skill-y', 2000, 1000, false);
      engine.endWithSkill(id2, 500, 200, true);

      const store = createMockStore();
      const { paths, summaryPath } = await engine.flushAllToObsidian(store);

      expect(paths).toHaveLength(2);
      expect(summaryPath).toBe('뇽죵이Agent/benchmark/summary.md');
      // 2 skill notes + 1 summary = 3 writes total
      expect(store._written).toHaveLength(3);
    });
  });
});
