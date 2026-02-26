// Workflow stage 1: Understand — goal analysis + persona consultation
import { createLogger } from '../utils/logger.js';

const log = createLogger('workflow:understand');

export interface UnderstandInput {
  /** User's goal/request text */
  goal: string;
  /** Optional: existing project context */
  projectContext?: string;
  /** Optional: relevant KI summaries */
  knowledgeItems?: string[];
}

export interface UnderstandOutput {
  /** Parsed goal analysis */
  analysis: {
    taskType: string;
    complexity: string;
    scope: string;
    keyRequirements: string[];
    risks: string[];
  };
  /** Persona consultation prompts (to be run by persona engine) */
  personaQuestions: string[];
  /** Suggested next action */
  nextAction: string;
  /** Raw analysis for logging */
  rawAnalysis: string;
}

/**
 * Stage 1: Understand — analyze the goal and prepare for prototyping.
 *
 * This stage:
 * 1. Parses the user's goal into structured requirements
 * 2. Identifies task type and complexity
 * 3. Generates questions for persona consultation
 * 4. Determines what knowledge/context is needed
 */
export function analyzeGoal(input: UnderstandInput): UnderstandOutput {
  const { goal, projectContext, knowledgeItems } = input;
  log.info('Analyzing goal', { goalLength: goal.length });

  // Extract key signals from the goal text
  const hasUI = /ui|페이지|화면|컴포넌트|디자인|프론트/i.test(goal);
  const hasAPI = /api|엔드포인트|서버|백엔드|라우트/i.test(goal);
  const hasBug = /버그|에러|오류|수정|안\s?[돼되]|문제/i.test(goal);
  const hasNew = /만들|생성|추가|새\s?[로운]|구현/i.test(goal);
  const hasRefactor = /리팩|개선|정리|최적화|구조/i.test(goal);

  // Determine task type
  let taskType = 'implementation';
  if (hasBug) taskType = 'debugging';
  else if (hasRefactor) taskType = 'refactoring';
  else if (hasNew && hasUI && hasAPI) taskType = 'architecture';
  else if (hasNew) taskType = 'implementation';

  // Estimate complexity
  const complexitySignals = [
    hasUI && hasAPI, // Full-stack = higher complexity
    (knowledgeItems?.length || 0) > 2, // Many related KIs = complex domain
    goal.length > 200, // Long description = complex request
    /\b(인증|결제|보안|실시간)\b/.test(goal), // Complex domain keywords
  ].filter(Boolean).length;

  const complexity = complexitySignals >= 3 ? 'critical'
    : complexitySignals >= 2 ? 'high'
    : complexitySignals >= 1 ? 'medium'
    : 'low';

  // Generate persona questions
  const personaQuestions: string[] = [];
  if (hasUI) {
    personaQuestions.push(`이 UI의 첫 화면은 사용자에게 어떤 인상을 주어야 할까요? 목표: ${goal}`);
  }
  if (hasNew) {
    personaQuestions.push(`이 기능의 핵심 가치는 무엇이고, 사용자가 3초 안에 이해할 수 있을까요? 목표: ${goal}`);
  }
  personaQuestions.push(`이 작업에서 가장 큰 리스크는 무엇일까요? 목표: ${goal}`);

  // Build key requirements from goal
  const keyRequirements: string[] = [];
  if (hasUI) keyRequirements.push('UI/UX 구현 필요');
  if (hasAPI) keyRequirements.push('API 엔드포인트 구현 필요');
  if (hasBug) keyRequirements.push('기존 버그 수정');
  if (hasNew) keyRequirements.push('새 기능 구현');
  if (hasRefactor) keyRequirements.push('코드 구조 개선');

  // Identify risks
  const risks: string[] = [];
  if (hasUI && hasAPI) risks.push('프론트-백 통합 복잡도');
  if (!projectContext) risks.push('프로젝트 컨텍스트 부족');
  if (complexitySignals >= 2) risks.push('높은 복잡도 — 단계별 검증 필요');

  const scope = projectContext ? '기존 프로젝트 확장' : '새 프로젝트';
  const nextAction = taskType === 'debugging'
    ? '버그 재현 → 원인 분석 → 수정'
    : '프로토타입 생성';

  const rawAnalysis = `Goal: ${goal}\nType: ${taskType}\nComplexity: ${complexity}\nScope: ${scope}\nRequirements: ${keyRequirements.join(', ')}\nRisks: ${risks.join(', ')}`;

  log.info('Goal analysis complete', { taskType, complexity });

  return {
    analysis: { taskType, complexity, scope, keyRequirements, risks },
    personaQuestions,
    nextAction,
    rawAnalysis,
  };
}
