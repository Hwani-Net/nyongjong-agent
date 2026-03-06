// Skill Lifecycle Manager — tracks skill categories, usage, and retirement candidates
// Inspired by Claude Code Skills 2.0's Capability vs Workflow categorization
import { createLogger } from '../utils/logger.js';
import { recordSkillUsage, getSkillUsageHistory, type SkillUsageEntry } from './shared-state.js';

const log = createLogger('skill-lifecycle');

/**
 * Skill category as defined by Claude Code Skills 2.0:
 * - capability: compensates for model limitations, retires when model improves
 * - workflow: encodes team/personal preferences, persists indefinitely
 */
export type SkillCategory = 'capability' | 'workflow';

export interface SkillMeta {
  name: string;
  category: SkillCategory;
  description: string;
  lastUsed: number;      // timestamp (0 = never used)
  useCount: number;
  totalTokens: number;
  avgDurationMs: number;
  retireCandidate: boolean;
}

export interface SkillAuditReport {
  totalSkills: number;
  capabilityCount: number;
  workflowCount: number;
  retireCandidates: SkillMeta[];
  topUsed: SkillMeta[];
  neverUsed: SkillMeta[];
  report: string;
}

/**
 * Parse SKILL.md frontmatter to extract category.
 * Falls back to 'workflow' if not specified.
 */
export function parseFrontmatterCategory(content: string): SkillCategory {
  const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!fmMatch) return 'workflow';

  const categoryMatch = fmMatch[1].match(/^category:\s*(capability|workflow)\s*$/m);
  return (categoryMatch?.[1] as SkillCategory) || 'workflow';
}

/**
 * Parse SKILL.md frontmatter fields.
 */
export function parseFrontmatter(content: string): { name: string; description: string; category: SkillCategory } {
  const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!fmMatch) return { name: 'unknown', description: '', category: 'workflow' };

  const nameMatch = fmMatch[1].match(/^name:\s*(.+?)\s*$/m);
  const descMatch = fmMatch[1].match(/^description:\s*(.+?)\s*$/m);
  const category = parseFrontmatterCategory(content);

  return {
    name: nameMatch?.[1] || 'unknown',
    description: descMatch?.[1] || '',
    category,
  };
}

/**
 * Manages skill lifecycle: categorization, usage tracking, retirement.
 */
export class SkillLifecycleManager {
  private skills = new Map<string, SkillMeta>();

  /**
   * Register skills from parsed frontmatter data.
   * In production, this is called after scanning .agent/skills/ directory.
   */
  registerSkills(skills: Array<{ name: string; description: string; category: SkillCategory }>): void {
    for (const s of skills) {
      if (!this.skills.has(s.name)) {
        this.skills.set(s.name, {
          name: s.name,
          category: s.category,
          description: s.description,
          lastUsed: 0,
          useCount: 0,
          totalTokens: 0,
          avgDurationMs: 0,
          retireCandidate: false,
        });
      }
    }
    log.info(`Registered ${skills.length} skills`);
  }

  /**
   * Record a skill usage event.
   */
  recordUsage(skillName: string, tokens: number, durationMs: number, success = true): void {
    const skill = this.skills.get(skillName);
    if (skill) {
      skill.useCount++;
      skill.totalTokens += tokens;
      skill.lastUsed = Date.now();
      // Running average
      skill.avgDurationMs = skill.avgDurationMs === 0
        ? durationMs
        : (skill.avgDurationMs * (skill.useCount - 1) + durationMs) / skill.useCount;
    }

    // Also record to shared-state for dashboard visibility
    recordSkillUsage({
      skillName,
      category: skill?.category || 'workflow',
      tokens,
      durationMs,
      success,
    });
  }

  /**
   * Identify retirement candidates.
   * Only 'capability' skills unused for N days qualify.
   * 'workflow' skills never auto-retire.
   */
  getRetireCandidates(daysThreshold = 30): SkillMeta[] {
    const cutoff = Date.now() - daysThreshold * 24 * 60 * 60 * 1000;
    const candidates: SkillMeta[] = [];

    for (const skill of this.skills.values()) {
      // Only capability skills can be retired
      if (skill.category !== 'capability') continue;

      const isStale = skill.lastUsed === 0 || skill.lastUsed < cutoff;
      skill.retireCandidate = isStale;
      if (isStale) candidates.push(skill);
    }

    return candidates;
  }

  /**
   * Get all registered skills.
   */
  getAllSkills(): SkillMeta[] {
    return Array.from(this.skills.values());
  }

  /**
   * Generate a comprehensive audit report.
   */
  generateAuditReport(daysThreshold = 30): SkillAuditReport {
    const all = this.getAllSkills();
    const retireCandidates = this.getRetireCandidates(daysThreshold);
    const neverUsed = all.filter(s => s.useCount === 0);
    const topUsed = [...all]
      .filter(s => s.useCount > 0)
      .sort((a, b) => b.useCount - a.useCount)
      .slice(0, 10);

    const capCount = all.filter(s => s.category === 'capability').length;
    const wfCount = all.filter(s => s.category === 'workflow').length;

    // Format report
    const lines: string[] = [
      `# 🔍 스킬 수명 감사 보고서`,
      '',
      `| 항목 | 수치 |`,
      `|------|------|`,
      `| 총 스킬 수 | ${all.length} |`,
      `| ⚡ Capability (임시 보완) | ${capCount} |`,
      `| 🔧 Workflow (영구 고착) | ${wfCount} |`,
      `| 🔴 은퇴 후보 | ${retireCandidates.length} |`,
      `| ⚪ 미사용 | ${neverUsed.length} |`,
      '',
    ];

    if (retireCandidates.length > 0) {
      lines.push(`## 🔴 은퇴 후보 (capability + ${daysThreshold}일 미사용)`);
      lines.push('| 스킬 | 설명 | 마지막 사용 |');
      lines.push('|------|------|------------|');
      for (const s of retireCandidates) {
        const lastUsedStr = s.lastUsed === 0 ? '미사용' : new Date(s.lastUsed).toLocaleDateString('ko-KR');
        lines.push(`| ${s.name} | ${s.description} | ${lastUsedStr} |`);
      }
      lines.push('');
    }

    if (topUsed.length > 0) {
      lines.push(`## 🏆 사용량 TOP 10`);
      lines.push('| 스킬 | 카테고리 | 사용 횟수 | 평균 토큰 | 평균 시간(ms) |');
      lines.push('|------|----------|----------|----------|--------------|');
      for (const s of topUsed) {
        const avgTokens = s.useCount > 0 ? Math.round(s.totalTokens / s.useCount) : 0;
        const catEmoji = s.category === 'capability' ? '⚡' : '🔧';
        lines.push(`| ${s.name} | ${catEmoji} ${s.category} | ${s.useCount} | ${avgTokens} | ${Math.round(s.avgDurationMs)} |`);
      }
      lines.push('');
    }

    return {
      totalSkills: all.length,
      capabilityCount: capCount,
      workflowCount: wfCount,
      retireCandidates,
      topUsed,
      neverUsed,
      report: lines.join('\n'),
    };
  }
}
