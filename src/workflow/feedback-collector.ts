// Feedback collector — gathers user satisfaction and stores in Obsidian
import { ObsidianStore } from '../core/obsidian-store.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('feedback-collector');

export interface FeedbackInput {
  /** Project or task name */
  project: string;
  /** Satisfaction score (1-5) */
  score: number;
  /** Free-form comment */
  comment?: string;
  /** Which workflow stage this feedback is about */
  stage?: string;
  /** What was delivered */
  deliverable?: string;
}

export interface FeedbackResult {
  /** Whether feedback was saved */
  saved: boolean;
  /** Path where feedback was stored */
  path?: string;
  /** Summary message */
  message: string;
  /** Computed satisfaction level */
  level: 'excellent' | 'good' | 'neutral' | 'poor' | 'terrible';
}

const SCORE_LABELS: Record<number, { label: string; level: FeedbackResult['level']; emoji: string }> = {
  5: { label: '매우 만족', level: 'excellent', emoji: '🌟' },
  4: { label: '만족', level: 'good', emoji: '😊' },
  3: { label: '보통', level: 'neutral', emoji: '😐' },
  2: { label: '불만족', level: 'poor', emoji: '😞' },
  1: { label: '매우 불만족', level: 'terrible', emoji: '😡' },
};

/**
 * Collect and save user feedback to Obsidian.
 */
export async function collectFeedback(
  input: FeedbackInput,
  store: ObsidianStore,
  agentDataDir: string,
): Promise<FeedbackResult> {
  const { project, score, comment, stage, deliverable } = input;

  // Validate score
  const clampedScore = Math.max(1, Math.min(5, Math.round(score)));
  const scoreInfo = SCORE_LABELS[clampedScore] || SCORE_LABELS[3];

  log.info(`Feedback received: ${project} → ${clampedScore}/5 (${scoreInfo.label})`);

  // Build feedback note
  const timestamp = new Date().toISOString();
  const dateStr = timestamp.split('T')[0];

  const frontmatter = [
    '---',
    `date: "${dateStr}"`,
    `project: "${project}"`,
    `score: ${clampedScore}`,
    `level: "${scoreInfo.level}"`,
    `stage: "${stage || 'report'}"`,
    'type: feedback',
    '---',
  ].join('\n');

  const body = [
    `# ${scoreInfo.emoji} 피드백: ${project}`,
    '',
    `| 항목 | 값 |`,
    `|------|-----|`,
    `| 프로젝트 | ${project} |`,
    `| 점수 | ${scoreInfo.emoji} ${clampedScore}/5 (${scoreInfo.label}) |`,
    `| 단계 | ${stage || 'report'} |`,
    `| 시간 | ${timestamp} |`,
    deliverable ? `| 결과물 | ${deliverable} |` : '',
    '',
    comment ? `## 코멘트\n${comment}` : '',
  ].filter(Boolean).join('\n');

  const content = `${frontmatter}\n\n${body}`;
  const path = `${agentDataDir}/feedback/${dateStr}-${project.replace(/[^a-zA-Z0-9가-힣]/g, '-')}.md`;

  try {
    await store.writeNote(path, content);
    log.info(`Feedback saved to: ${path}`);

    return {
      saved: true,
      path,
      message: `${scoreInfo.emoji} ${scoreInfo.label} (${clampedScore}/5) — 피드백이 저장되었습니다.`,
      level: scoreInfo.level,
    };
  } catch (err) {
    log.error('Failed to save feedback', err);
    return {
      saved: false,
      message: `피드백 저장 실패: ${String(err)}`,
      level: scoreInfo.level,
    };
  }
}

/**
 * Format feedback collection prompt for the user.
 */
export function formatFeedbackPrompt(project: string, deliverable?: string): string {
  return [
    `## 📋 작업 완료 피드백`,
    '',
    `프로젝트 **${project}**${deliverable ? ` — ${deliverable}` : ''}의 결과에 대해 평가해주세요.`,
    '',
    '| 점수 | 의미 |',
    '|:----:|------|',
    '| 5 🌟 | 매우 만족 — 기대 이상 |',
    '| 4 😊 | 만족 — 잘 했음 |',
    '| 3 😐 | 보통 — 개선 가능 |',
    '| 2 😞 | 불만족 — 문제 있음 |',
    '| 1 😡 | 매우 불만족 — 재작업 필요 |',
    '',
    '`feedback_collect` 도구로 점수와 코멘트를 전달해주세요.',
  ].join('\n');
}
