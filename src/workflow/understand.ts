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

  // Guard: empty or whitespace-only goal
  if (!goal.trim()) {
    log.warn('Empty goal received');
    return {
      analysis: {
        taskType: 'simple',
        complexity: 'low',
        scope: '새 프로젝트',
        keyRequirements: [],
        risks: ['빈 목표 — 추가 정보 필요'],
      },
      personaQuestions: [],
      nextAction: '목표 명확화 필요',
      rawAnalysis: 'Goal: (empty)\nType: simple\nComplexity: low',
    };
  }

  // Extract key signals from the goal text
  const hasUI = /ui|페이지|화면|컴포넌트|디자인|프론트|대시보드|차트|테이블|그래프|D3/i.test(goal);
  const hasAPI = /api|엔드포인트|서버|백엔드|라우트/i.test(goal);
  const hasBug = /버그|에러|오류|수정|안\s?[돼되]|문제|끊어|실패|깨/i.test(goal);
  const hasNew = /만들|생성|추가|새\s?[로운]|구현|구축|설정|배포|세팅|implement|create|build|deploy|set\s?up/i.test(goal);
  const hasRefactor = /리팩|개선|정리|최적화|구조|분리|모듈|refactor|optimize|restructure/i.test(goal);
  const hasStrategy = /전략|설계|아키텍처|비교|분석|수립|방향|로드맵|architect|strategy|design\s?pattern|roadmap/i.test(goal);
  const hasDocumentation = /문서|README|가이드|트러블|설명|주석|CHANGELOG/i.test(goal);
  const hasSimple = /확인|조회|목록|리스트|보여|알려/i.test(goal);
  const hasExternalAPI = /카카오|네이버|구글|AWS|Firebase|Supabase|외부\s?API|연동|Slack|Discord|Telegram/i.test(goal);
  const hasMultiFile = /분리|여러\s?파일|모듈|마이크로서비스|독립|컴포넌트\s?분리|microservice|monorepo|multi.?module/i.test(goal);
  const hasMigration = /마이그레이션|전환|이전|업그레이드|포팅|migrat|upgrade|port(?:ing)?/i.test(goal);

  // Determine task type (priority: specific types first)
  let taskType = 'implementation';
  if (hasDocumentation && !hasNew && !hasAPI) taskType = 'documentation';
  else if (hasBug && !hasNew && !hasDocumentation) taskType = 'debugging';
  else if (hasStrategy) taskType = 'strategy';
  else if (hasRefactor && !hasNew) taskType = 'refactoring';
  else if (hasSimple && !hasNew && !hasAPI && !hasUI) taskType = 'simple';
  else if ((hasNew && hasUI && hasAPI) || hasMultiFile || hasMigration) taskType = 'architecture';
  else if (hasNew || hasAPI) taskType = 'implementation';

  // Estimate complexity — expanded signal set
  const wordCount = goal.split(/\s+/).length;
  const complexitySignals = [
    hasUI && hasAPI,                    // Full-stack
    (knowledgeItems?.length || 0) > 2,  // Many related KIs
    goal.length > 200,                  // Long description
    wordCount > 30,                     // Many words = detailed request
    /\b(인증|결제|보안|실시간|암호화|OAuth|JWT|WebSocket)\b/i.test(goal),
    hasExternalAPI,                     // External API integration
    hasMultiFile,                       // Multi-file changes
    hasMigration,                       // Migration/transformation work
    hasStrategy && hasAPI,              // Strategy + implementation = complex
    taskType === 'architecture',        // Architecture tasks are inherently complex
    /i18n|다국어|localization|번역|intl/i.test(goal),  // i18n = cross-cutting complexity
    // Multi-system integration (3+ distinct techs/services mentioned)
    (goal.match(/\b(Next\.?js|React|Vue|Svelte|Express|Flask|Django|Supabase|Firebase|Stripe|Redis|Docker|K8s|PostgreSQL|MongoDB|GraphQL|gRPC|WebSocket|Prisma)\b/gi) || []).length >= 3,
  ].filter(Boolean).length;

  const complexity = complexitySignals >= 4 ? 'critical'
    : complexitySignals >= 3 ? 'high'
    : complexitySignals >= 2 ? 'medium'
    : 'low';

  // Generate persona questions
  const personaQuestions: string[] = [];
  if (hasUI) {
    personaQuestions.push(`이 UI의 첫 화면은 사용자에게 어떤 인상을 주어야 할까요? 목표: ${goal}`);
  }
  if (hasNew) {
    personaQuestions.push(`이 기능의 핵심 가치는 무엇이고, 사용자가 3초 안에 이해할 수 있을까요? 목표: ${goal}`);
  }
  if (hasStrategy) {
    personaQuestions.push(`이 전략의 기대 효과와 리스크를 비교 분석해주세요. 목표: ${goal}`);
  }
  personaQuestions.push(`이 작업에서 가장 큰 리스크는 무엇일까요? 목표: ${goal}`);

  // Build key requirements from goal
  const keyRequirements: string[] = [];
  if (hasUI) keyRequirements.push('UI/UX 구현 필요');
  if (hasAPI) keyRequirements.push('API 엔드포인트 구현 필요');
  if (hasBug) keyRequirements.push('기존 버그 수정');
  if (hasNew) keyRequirements.push('새 기능 구현');
  if (hasRefactor) keyRequirements.push('코드 구조 개선');
  if (hasStrategy) keyRequirements.push('전략/설계 수립');
  if (hasDocumentation) keyRequirements.push('문서 작성/업데이트');
  if (hasExternalAPI) keyRequirements.push('외부 API 연동');

  // Identify risks
  const risks: string[] = [];
  if (hasUI && hasAPI) risks.push('프론트-백 통합 복잡도');
  if (!projectContext) risks.push('프로젝트 컨텍스트 부족');
  if (complexitySignals >= 2) risks.push('높은 복잡도 — 단계별 검증 필요');
  if (hasExternalAPI) risks.push('외부 API 의존성 — 장애 전파 가능');
  if (hasMigration) risks.push('마이그레이션 — 기존 기능 회귀 위험');

  // Scope: refactoring, debugging, documentation on existing files = existing project
  const scope = (projectContext || hasRefactor || hasBug || hasDocumentation) ? '기존 프로젝트 확장' : '새 프로젝트';
  const nextAction = taskType === 'debugging'
    ? '버그 재현 → 원인 분석 → 수정'
    : taskType === 'strategy' ? '요구사항 분석 → 대안 비교 → 전략 수립'
    : taskType === 'documentation' ? '기존 문서 검토 → 추가 내용 작성'
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
