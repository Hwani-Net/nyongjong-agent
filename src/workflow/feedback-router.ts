// Feedback Router — classifies human feedback and determines rollback target
import { createLogger } from '../utils/logger.js';

const log = createLogger('workflow:feedback-router');

// ─── Types ───

export type RollbackTarget = 'gate0' | 'gate1_prd' | 'stitch_design' | 'evolve_code';

export interface FeedbackClassification {
  /** Where to roll back to */
  target: RollbackTarget;
  /** Confidence score (0-1) */
  confidence: number;
  /** Extracted keywords that triggered this classification */
  matchedKeywords: string[];
  /** Human-readable explanation */
  explanation: string;
}

// ─── Keyword patterns per rollback target ───

const ROLLBACK_PATTERNS: {
  target: RollbackTarget;
  patterns: RegExp[];
  explanation: string;
}[] = [
  {
    target: 'gate0',
    patterns: [
      /타겟|타깃|시장|비즈니스|사업|전략|방향|아이디어|고객층|대상/i,
      /경쟁|경쟁사|차별|차별점|포지션|비전|미션/i,
      /수익|매출|BM|비즈니스\s*모델|사업\s*모델|수익화/i,
      /시장\s*분석|시장\s*조사|타겟\s*변경|방향\s*전환/i,
    ],
    explanation: '사업 방향/전략 변경 → Gate 0(사업성 검토)부터 재실행',
  },
  {
    target: 'gate1_prd',
    patterns: [
      /기능|범위|우선순위|스펙|요구사항|요건/i,
      /빼|추가|변경|수정|포함|제외|넣|삭제/i,
      /성공\s*기준|수용\s*조건|비목표|비\s*목표|non.?goal/i,
      /MVP|1차|이번\s*버전|다음\s*버전|스코프/i,
      /MUST|SHOULD|필수|권장|선택/i,
    ],
    explanation: '기능/범위/조건 변경 → Gate 1(PRD)부터 재실행',
  },
  {
    target: 'stitch_design',
    patterns: [
      /색|색상|컬러|color|칼라/i,
      /디자인|레이아웃|배치|정렬|간격|패딩|마진/i,
      /폰트|글꼴|글자|크기|사이즈|타이포/i,
      /아이콘|이미지|로고|일러스트/i,
      /위치|왼쪽|오른쪽|위|아래|중앙|센터/i,
      /다크\s*모드|dark\s*mode|라이트|테마/i,
      /예쁘|못생|투박|세련|깔끔|모던/i,
    ],
    explanation: '시각적 디자인 변경 → Stitch 디자인 단계부터 재실행',
  },
  {
    target: 'evolve_code',
    patterns: [
      /동작|작동|기능\s*안|에러|버그|오류/i,
      /안\s*[돼되]|깨|실패|문제|고장/i,
      /느리|느림|렉|버벅|성능|최적화/i,
      /클릭.*안|누르.*안|반응.*없|무한\s*루프/i,
      /API.*안|서버.*안|데이터.*잘못/i,
    ],
    explanation: '동작/버그 수정 → evolve(코드 수정) 단계에서 처리',
  },
];

// ─── Main Classification ───

/**
 * Classify human feedback to determine the minimum rollback point.
 *
 * Principle: "Minimum rollback" — only re-run from the affected stage.
 * Higher stages (gate0 > gate1 > stitch > evolve) are more expensive,
 * so we prefer rolling back to the lowest necessary point.
 */
export function classifyFeedback(feedback: string): FeedbackClassification {
  log.info('Classifying feedback', { feedbackLen: feedback.length });

  const scores: { target: RollbackTarget; score: number; keywords: string[] }[] = [];

  for (const { target, patterns, explanation } of ROLLBACK_PATTERNS) {
    let score = 0;
    const keywords: string[] = [];

    for (const pattern of patterns) {
      const match = feedback.match(pattern);
      if (match) {
        score++;
        keywords.push(match[0]);
      }
    }

    if (score > 0) {
      scores.push({ target, score, keywords });
    }
  }

  // If no patterns matched, default to evolve_code (lowest impact)
  if (scores.length === 0) {
    log.info('No patterns matched, defaulting to evolve_code');
    return {
      target: 'evolve_code',
      confidence: 0.3,
      matchedKeywords: [],
      explanation: '특정 패턴이 감지되지 않음 → 코드 수정으로 기본 처리',
    };
  }

  // Sort by score descending
  scores.sort((a, b) => b.score - a.score);

  // Highest scoring target wins
  const winner = scores[0];
  const maxPossibleScore = ROLLBACK_PATTERNS.find(p => p.target === winner.target)!.patterns.length;
  const confidence = Math.min(winner.score / maxPossibleScore, 1.0);

  const matchedEntry = ROLLBACK_PATTERNS.find(p => p.target === winner.target)!;

  log.info('Feedback classified', {
    target: winner.target,
    confidence: confidence.toFixed(2),
    keywords: winner.keywords,
  });

  return {
    target: winner.target,
    confidence,
    matchedKeywords: winner.keywords,
    explanation: matchedEntry.explanation,
  };
}

/**
 * Get a human-readable description of what re-running from a rollback target means.
 */
export function describeRollback(target: RollbackTarget): string {
  const descriptions: Record<RollbackTarget, string> = {
    gate0: '사업성 검토(Gate 0)부터 재시작합니다. 비즈니스 페르소나가 새 방향을 심사하고, 이후 PRD → 디자인 → 코딩 순서로 모두 재실행됩니다.',
    gate1_prd: 'PRD 수정(Gate 1)부터 재시작합니다. 커스토머 페르소나가 수정된 PRD를 재심사하고, 이후 디자인 → 코딩이 재실행됩니다. 사업성 검토는 유지됩니다.',
    stitch_design: 'UI 디자인 단계부터 재시작합니다. Stitch에서 디자인을 수정하고 코드에 반영합니다. PRD와 사업성 검토는 유지됩니다.',
    evolve_code: '코드 수정만 진행합니다. 기존 PRD와 디자인을 유지하면서 동작/버그만 수정합니다.',
  };

  return descriptions[target];
}

/**
 * Format feedback classification result for display.
 */
export function formatFeedbackReport(classification: FeedbackClassification): string {
  const targetNames: Record<RollbackTarget, string> = {
    gate0: 'Gate 0 (사업성)',
    gate1_prd: 'Gate 1 (PRD)',
    stitch_design: 'Stitch (디자인)',
    evolve_code: 'Evolve (코드)',
  };

  return [
    `## 🔄 피드백 분류 결과`,
    '',
    `**롤백 위치:** ${targetNames[classification.target]}`,
    `**확신도:** ${(classification.confidence * 100).toFixed(0)}%`,
    `**감지 키워드:** ${classification.matchedKeywords.join(', ') || '없음'}`,
    '',
    `**설명:** ${classification.explanation}`,
    '',
    `**재실행 범위:** ${describeRollback(classification.target)}`,
  ].join('\n');
}
