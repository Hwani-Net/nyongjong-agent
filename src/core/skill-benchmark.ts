// Skill A/B Benchmark Engine — measures skill effectiveness
// Inspired by Claude Code Skills 2.0's automated benchmarking
import { createLogger } from '../utils/logger.js';
import type { ObsidianStore } from './obsidian-store.js';

const log = createLogger('skill-benchmark');

export interface BenchmarkMetrics {
  successRate: number;     // 0-1
  avgTokens: number;
  avgDurationMs: number;
  sampleCount: number;
}

export type BenchmarkVerdict = 'KEEP' | 'REVIEW' | 'RETIRE';

export interface BenchmarkResult {
  skillName: string;
  withSkill: BenchmarkMetrics;
  withoutSkill: BenchmarkMetrics;
  improvement: {
    tokens: string;        // "+15%" or "-20%"
    duration: string;
    success: string;
  };
  verdict: BenchmarkVerdict;
  report: string;
}

interface BenchmarkSession {
  id: string;
  skillName: string;
  startedAt: number;
  baselineTokens: number;
  baselineDurationMs: number;
  baselineSuccess: boolean;
  completed: boolean;
}

interface SkillHistoryEntry {
  tokens: number;
  durationMs: number;
  success: boolean;
  withSkill: boolean;
  ts: number;
}

/**
 * Calculates percentage change between two values.
 * Negative = improvement (fewer tokens/less time), Positive = regression.
 * For success rate: Positive = improvement, Negative = regression.
 */
function pctChange(baseline: number, withSkill: number, invertSign = false): string {
  if (baseline === 0) return 'N/A';
  const change = ((withSkill - baseline) / baseline) * 100;
  const adjusted = invertSign ? change : -change; // negative tokens = good
  const sign = adjusted >= 0 ? '+' : '';
  return `${sign}${adjusted.toFixed(1)}%`;
}

function computeMetrics(entries: SkillHistoryEntry[]): BenchmarkMetrics {
  if (entries.length === 0) {
    return { successRate: 0, avgTokens: 0, avgDurationMs: 0, sampleCount: 0 };
  }
  const successes = entries.filter(e => e.success).length;
  const totalTokens = entries.reduce((sum, e) => sum + e.tokens, 0);
  const totalDuration = entries.reduce((sum, e) => sum + e.durationMs, 0);
  return {
    successRate: successes / entries.length,
    avgTokens: Math.round(totalTokens / entries.length),
    avgDurationMs: Math.round(totalDuration / entries.length),
    sampleCount: entries.length,
  };
}

/**
 * Determine verdict based on improvement metrics.
 * KEEP: skill shows ≥10% improvement in any metric
 * RETIRE: skill shows regression or no improvement
 * REVIEW: mixed/marginal results
 */
function determineVerdict(withSkill: BenchmarkMetrics, withoutSkill: BenchmarkMetrics): BenchmarkVerdict {
  if (withoutSkill.sampleCount === 0 || withSkill.sampleCount === 0) return 'REVIEW';

  const tokenImprovement = withoutSkill.avgTokens > 0
    ? (withoutSkill.avgTokens - withSkill.avgTokens) / withoutSkill.avgTokens
    : 0;
  const durationImprovement = withoutSkill.avgDurationMs > 0
    ? (withoutSkill.avgDurationMs - withSkill.avgDurationMs) / withoutSkill.avgDurationMs
    : 0;
  const successImprovement = withSkill.successRate - withoutSkill.successRate;

  // Any metric improved by ≥10% → KEEP
  if (tokenImprovement >= 0.1 || durationImprovement >= 0.1 || successImprovement >= 0.1) {
    return 'KEEP';
  }

  // All metrics regressed → RETIRE
  if (tokenImprovement < -0.05 && durationImprovement < -0.05 && successImprovement < 0) {
    return 'RETIRE';
  }

  return 'REVIEW';
}

/**
 * A/B Benchmark Engine for skill effectiveness measurement.
 */
export class SkillBenchmark {
  private sessions = new Map<string, BenchmarkSession>();
  private history = new Map<string, SkillHistoryEntry[]>();
  private sessionCounter = 0;

  /**
   * Start a baseline measurement (without skill).
   * Returns a session ID to complete later.
   */
  startBaseline(skillName: string, baselineTokens: number, baselineDurationMs: number, baselineSuccess: boolean): string {
    const id = `bench-${Date.now()}-${++this.sessionCounter}`;

    // Duplicate session guard
    for (const [existingId, session] of this.sessions) {
      if (session.skillName === skillName && !session.completed) {
        log.warn(`Overwriting incomplete session for ${skillName}`, { oldId: existingId });
        this.sessions.delete(existingId);
      }
    }

    this.sessions.set(id, {
      id,
      skillName,
      startedAt: Date.now(),
      baselineTokens,
      baselineDurationMs,
      baselineSuccess,
      completed: false,
    });

    // Record baseline to history
    this._recordHistory(skillName, {
      tokens: baselineTokens,
      durationMs: baselineDurationMs,
      success: baselineSuccess,
      withSkill: false,
      ts: Date.now(),
    });

    log.info(`Benchmark baseline started for "${skillName}"`, { id });
    return id;
  }

  /**
   * Complete a benchmark session with "with skill" metrics.
   */
  endWithSkill(sessionId: string, tokens: number, durationMs: number, success: boolean): BenchmarkResult | null {
    const session = this.sessions.get(sessionId);
    if (!session) {
      log.warn(`Benchmark session not found: ${sessionId}`);
      return null;
    }

    if (session.completed) {
      log.warn(`Benchmark session already completed: ${sessionId}`);
      return null;
    }

    session.completed = true;

    // Record with-skill to history
    this._recordHistory(session.skillName, {
      tokens,
      durationMs,
      success,
      withSkill: true,
      ts: Date.now(),
    });

    // Compute stats from full history
    return this.getSkillStats(session.skillName);
  }

  /**
   * Get aggregate benchmark stats for a skill from history.
   */
  getSkillStats(skillName: string): BenchmarkResult | null {
    const entries = this.history.get(skillName);
    if (!entries || entries.length === 0) return null;

    const withSkillEntries = entries.filter(e => e.withSkill);
    const withoutSkillEntries = entries.filter(e => !e.withSkill);

    const withSkill = computeMetrics(withSkillEntries);
    const withoutSkill = computeMetrics(withoutSkillEntries);
    const verdict = determineVerdict(withSkill, withoutSkill);

    const improvement = {
      tokens: pctChange(withoutSkill.avgTokens, withSkill.avgTokens),
      duration: pctChange(withoutSkill.avgDurationMs, withSkill.avgDurationMs),
      success: pctChange(withoutSkill.successRate, withSkill.successRate, true),
    };

    const verdictEmoji = verdict === 'KEEP' ? '✅' : verdict === 'RETIRE' ? '🔴' : '🟡';
    const report = [
      `## 📊 A/B 벤치마크: ${skillName}`,
      '',
      '| 메트릭 | 스킬 미적용 | 스킬 적용 | 개선율 |',
      '|--------|-----------|----------|--------|',
      `| 성공률 | ${(withoutSkill.successRate * 100).toFixed(0)}% | ${(withSkill.successRate * 100).toFixed(0)}% | ${improvement.success} |`,
      `| 평균 토큰 | ${withoutSkill.avgTokens} | ${withSkill.avgTokens} | ${improvement.tokens} |`,
      `| 평균 시간(ms) | ${withoutSkill.avgDurationMs} | ${withSkill.avgDurationMs} | ${improvement.duration} |`,
      `| 샘플 수 | ${withoutSkill.sampleCount} | ${withSkill.sampleCount} | - |`,
      '',
      `**판정: ${verdictEmoji} ${verdict}**`,
      '',
      verdict === 'KEEP' ? '> 이 스킬은 효과적입니다. 유지하세요.' :
      verdict === 'RETIRE' ? '> 이 스킬은 효과가 없거나 역효과입니다. 은퇴를 고려하세요.' :
      '> 결과가 혼합적입니다. 추가 데이터 수집 후 재평가하세요.',
    ].join('\n');

    return { skillName, withSkill, withoutSkill, improvement, verdict, report };
  }

  /**
   * Get all skills that have benchmark data.
   */
  getAllBenchmarkedSkills(): string[] {
    return Array.from(this.history.keys());
  }

  /**
   * Generate a summary report of all benchmarked skills.
   */
  generateSummaryReport(): string {
    const skillNames = this.getAllBenchmarkedSkills();
    if (skillNames.length === 0) {
      return '아직 벤치마크 데이터가 없습니다. `skill_benchmark` 도구로 스킬 효과를 측정하세요.';
    }

    const lines: string[] = [
      '# 📊 스킬 벤치마크 종합 보고서',
      '',
      '| 스킬 | 판정 | 토큰 개선 | 속도 개선 | 성공률 개선 | 샘플 |',
      '|------|------|----------|----------|-----------|------|',
    ];

    for (const name of skillNames) {
      const stats = this.getSkillStats(name);
      if (!stats) continue;
      const emoji = stats.verdict === 'KEEP' ? '✅' : stats.verdict === 'RETIRE' ? '🔴' : '🟡';
      const totalSamples = stats.withSkill.sampleCount + stats.withoutSkill.sampleCount;
      lines.push(`| ${name} | ${emoji} ${stats.verdict} | ${stats.improvement.tokens} | ${stats.improvement.duration} | ${stats.improvement.success} | ${totalSamples} |`);
    }

    return lines.join('\n');
  }

  private _recordHistory(skillName: string, entry: SkillHistoryEntry): void {
    if (!this.history.has(skillName)) {
      this.history.set(skillName, []);
    }
    const entries = this.history.get(skillName)!;
    entries.push(entry);
    // Keep max 100 entries per skill
    if (entries.length > 100) entries.shift();
  }

  /**
   * Flush a single skill's benchmark result to Obsidian vault.
   * Saves to `<basePath>/<skillName>.md` with YAML frontmatter.
   * @returns The vault-relative path that was written.
   */
  async flushToObsidian(
    skillName: string,
    store: ObsidianStore,
    basePath = '뇽죵이Agent/benchmark',
  ): Promise<string> {
    const stats = this.getSkillStats(skillName);
    if (!stats) {
      throw new Error(`SkillBenchmark: no data for "${skillName}". Run start_baseline first.`);
    }

    const flushedAt = new Date().toISOString();
    const totalSamples = stats.withSkill.sampleCount + stats.withoutSkill.sampleCount;
    const notePath = `${basePath}/${skillName}.md`;

    const frontmatter = {
      skill: skillName,
      verdict: stats.verdict,
      flushedAt,
      sampleCount: totalSamples,
      tokenImprovement: stats.improvement.tokens,
      durationImprovement: stats.improvement.duration,
      successImprovement: stats.improvement.success,
    };

    await store.writeNote(notePath, stats.report, frontmatter);
    log.info(`Benchmark flushed to Obsidian: ${notePath}`);
    return notePath;
  }

  /**
   * Flush ALL benchmarked skills to Obsidian.
   * Also writes a summary note at `<basePath>/summary.md`.
   * @returns Array of paths written.
   */
  async flushAllToObsidian(
    store: ObsidianStore,
    basePath = '뇽죵이Agent/benchmark',
  ): Promise<{ paths: string[]; summaryPath: string }> {
    const skillNames = this.getAllBenchmarkedSkills();
    if (skillNames.length === 0) {
      throw new Error('SkillBenchmark: no benchmark data to flush.');
    }

    const paths: string[] = [];
    for (const name of skillNames) {
      try {
        const path = await this.flushToObsidian(name, store, basePath);
        paths.push(path);
      } catch (err) {
        log.warn(`flushAllToObsidian: skipping "${name}"`, err);
      }
    }

    // Write summary note
    const summaryReport = this.generateSummaryReport();
    const summaryPath = `${basePath}/summary.md`;
    await store.writeNote(summaryPath, summaryReport, {
      flushedAt: new Date().toISOString(),
      totalSkills: skillNames.length,
      flushedSkills: paths.length,
    });

    log.info(`flushAllToObsidian: ${paths.length} skills + summary written`);
    return { paths, summaryPath };
  }
}
