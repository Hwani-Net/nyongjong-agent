// Workflow stage 1: Understand — goal analysis + persona consultation
import { createLogger } from '../utils/logger.js';
import { detectDomainPersonas, type PersonaTemplate } from '../personas/persona-templates.js';

const log = createLogger('workflow:understand');

export interface UnderstandInput {
  /** User's goal/request text */
  goal: string;
  /** Optional: existing project context */
  projectContext?: string;
  /** Optional: relevant KI summaries */
  knowledgeItems?: string[];
  /** Optional: skip Gate 0 (business) and Gate 1 (PRD) — useful for bug fixes, refactoring */
  skipGates?: boolean;
  /** Optional: force Gate 0 + Gate 1 regardless of complexity — use for /자율 (new project MVP) */
  forceGates?: boolean;
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
  /** Domain-specific personas detected from goal (for auto-creation) */
  suggestedPersonas: PersonaTemplate[];
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
      suggestedPersonas: [],
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
  const hasResearch = /조사|리서치|시장\s?조사|경쟁사|트렌드|벤치마크|연구|분석.*보고서|research|market|competitor|survey/i.test(goal);
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
    // P-009: \b doesn't work with Korean. Split into Korean (loose) + English (\b) patterns.
    /(인증|결제|보안|실시간|암호화)/i.test(goal) || /\b(OAuth|JWT|WebSocket)\b/i.test(goal),
    hasExternalAPI,                     // External API integration
    hasMultiFile,                       // Multi-file changes
    hasMigration,                       // Migration/transformation work
    hasStrategy && hasAPI,              // Strategy + implementation = complex
    taskType === 'architecture',        // Architecture tasks are inherently complex
    /i18n|다국어|localization|번역|intl/i.test(goal),  // i18n = cross-cutting complexity
    // Multi-system integration (3+ distinct techs/services mentioned)
    (goal.match(/\b(Next\.?js|React|Vue|Svelte|Express|Flask|Django|Supabase|Firebase|Stripe|Redis|Docker|K8s|PostgreSQL|MongoDB|GraphQL|gRPC|WebSocket|Prisma)\b/gi) || []).length >= 3,
    // AI/ML domain — inherently complex inference, prompt engineering, evaluation
    // Note: \b doesn't work with Korean (Unicode non-word chars), so Korean terms use loose match
    /(AI|인공지능|머신러닝|machine\s*learning|LLM|GPT|Gemini|Claude|모델\s*학습|추론|inference|embedding|RAG|fine.?tun|프롬프트|prompt\s*engineer)/i.test(goal),
    // Regulatory/legal domain — compliance rules add hidden complexity
    /(세금|신고|납부|tax|법률|법규|규제|금융|의료|HIPAA|GDPR|컴플라이언스|compliance|인허가|개인정보|약관|전자상거래법|통신판매|특허)/i.test(goal),
    // Target user scale — serving businesses/enterprises adds operational complexity
    /(소상공인|자영업|중소기업|B2B|기업용|enterprise|플랫폼|SaaS|멀티테넌트|multi.?tenant)/i.test(goal),
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
  if (hasResearch) {
    personaQuestions.push(`이 조사의 신뢰할 수 있는 데이터 소스는 무엇인가요? NLM에 적재할 원본 URL을 식별해주세요. 목표: ${goal}`);
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
  if (hasResearch) keyRequirements.push('📚 NLM 노트북 필수 — 팩트 기반 지식만 사용');

  // Identify risks
  const risks: string[] = [];
  if (hasUI && hasAPI) risks.push('프론트-백 통합 복잡도');
  if (!projectContext) risks.push('프로젝트 컨텍스트 부족');
  if (complexitySignals >= 2) risks.push('높은 복잡도 — 단계별 검증 필요');
  if (hasExternalAPI) risks.push('외부 API 의존성 — 장애 전파 가능');
  if (hasMigration) risks.push('마이그레이션 — 기존 기능 회귀 위험');
  if (hasResearch) risks.push('⚠️ NLM 미적재 시 할루시네이션 위험 — 반드시 원본 URL 소스로 적재');

  // Destructive operation detection
  const hasDangerous = /rm\s+-rf|DROP\s+(TABLE|DATABASE)|DELETE\s+FROM|삭제|초기화|format|truncate/i.test(goal);
  const hasProduction = /프로덕션|production|prod\s|운영\s?서버|라이브/i.test(goal);
  if (hasDangerous) {
    risks.push('⚠️ 파괴적 작업 — 데이터 손실 위험! 사전 승인 필수');
  }
  if (hasDangerous && hasProduction) {
    risks.push('🚨 프로덕션 환경 대상 — 즉시 실행 금지, 대표님 승인 후 진행');
  }

  // Scope: refactoring, debugging, documentation on existing files = existing project
  const scope = (projectContext || hasRefactor || hasBug || hasDocumentation) ? '기존 프로젝트 확장' : '새 프로젝트';
  const nextAction = taskType === 'debugging'
    ? '버그 재현 → 원인 분석 → 수정'
    : taskType === 'strategy' ? '요구사항 분석 → 대안 비교 → 전략 수립'
    : taskType === 'documentation' ? '기존 문서 검토 → 추가 내용 작성'
    : '프로토타입 생성';

  const rawAnalysis = `Goal: ${goal}\nType: ${taskType}\nComplexity: ${complexity}\nScope: ${scope}\nRequirements: ${keyRequirements.join(', ')}\nRisks: ${risks.join(', ')}`;

  // Detect domain-specific personas
  const suggestedPersonas = detectDomainPersonas(goal);

  log.info('Goal analysis complete', { taskType, complexity, suggestedPersonaCount: suggestedPersonas.length });

  return {
    analysis: { taskType, complexity, scope, keyRequirements, risks },
    personaQuestions,
    nextAction,
    rawAnalysis,
    suggestedPersonas,
  };
}

// ─── PRD Elicitation Support Functions ───

export type AmbiguityType = 'priority' | 'techStack' | 'scope' | 'successCriteria' | 'targetUser';

export interface Ambiguity {
  type: AmbiguityType;
  question: string;
  options: string[];
}

/**
 * Detect ambiguous/missing information in a goal analysis.
 * Returns up to 3 items (to prevent PRD Fatigue).
 */
export function detectAmbiguities(
  analysis: UnderstandOutput,
  goal: string,
  projectContext?: string,
): Ambiguity[] {
  const gaps: Ambiguity[] = [];

  // 1. Complex tasks without priority order
  if (
    (analysis.analysis.complexity === 'high' || analysis.analysis.complexity === 'critical')
    && !/우선|먼저|첫\s?번째|1차|MVP/i.test(goal)
  ) {
    gaps.push({
      type: 'priority',
      question: '이번 버전에서 가장 중요한 기능은?',
      options: analysis.analysis.keyRequirements.slice(0, 3),
    });
  }

  // 2. Architecture task without tech stack
  if (
    analysis.analysis.taskType === 'architecture'
    && !/tailwind|shadcn|vanilla|react|vue|next/i.test(goal)
  ) {
    gaps.push({
      type: 'techStack',
      question: '기술 스택 선택:',
      options: ['React + Tailwind + Shadcn', 'React + Vanilla CSS', '기존 프로젝트 스택 유지'],
    });
  }

  // 3. New project without scope boundary
  if (
    !projectContext
    && analysis.analysis.scope === '새 프로젝트'
    && !/이번\s?버전|1차|MVP|제외|안\s?할/i.test(goal)
  ) {
    gaps.push({
      type: 'scope',
      question: '이번 버전에서 제외할 것은?',
      options: ['모바일 최적화', '다국어 지원', '실시간 동기화', '없음 — 전부 포함'],
    });
  }

  // 4. No success criteria mentioned
  if (!/기준|목표|KPI|성공|완료\s?조건|지표/i.test(goal)) {
    gaps.push({
      type: 'successCriteria',
      question: '성공 기준은?',
      options: ['빠른 빌드 (에러 0개)', '사용자 3초 내 이해', '매출 기여', '기타 (자유 입력)'],
    });
  }

  // 5. No target user specified
  if (!/사용자|고객|유저|target|타겟|대상/i.test(goal)) {
    gaps.push({
      type: 'targetUser',
      question: '주 사용자는 누구인가요?',
      options: ['대표님 본인 (1인 사용)', '내부 팀', '일반 소비자', '기업 고객 (B2B)'],
    });
  }

  // Return max 3 to prevent fatigue
  return gaps.slice(0, 3);
}

/**
 * Generate human-readable options for presentation.
 */
export function generateOptions(ambiguities: Ambiguity[]): string {
  if (ambiguities.length === 0) {
    return '불명확한 포인트 없음 — PRD 바로 생성 가능';
  }

  const lines: string[] = ['## 📋 PRD 보강을 위한 질문\n'];

  ambiguities.forEach((amb, i) => {
    lines.push(`**Q${i + 1}. ${amb.question}**`);
    amb.options.forEach((opt, j) => {
      const letter = String.fromCharCode(65 + j); // A, B, C...
      lines.push(`  ${letter}) ${opt}`);
    });
    lines.push('');
  });

  lines.push('> 💬 추가 의견이 있으시면 자유롭게 입력해 주세요.');

  return lines.join('\n');
}

/**
 * Format analysis output for PRD consumption.
 */
export function formatAnalysisForPRD(analysis: UnderstandOutput): string {
  const { taskType, complexity, scope, keyRequirements, risks } = analysis.analysis;

  return [
    `## 목표 분석 결과`,
    `- **유형:** ${taskType}`,
    `- **복잡도:** ${complexity}`,
    `- **범위:** ${scope}`,
    '',
    `### 핵심 요구사항`,
    ...keyRequirements.map(r => `- ${r}`),
    '',
    `### 리스크`,
    ...risks.map(r => `- ${r}`),
    '',
    `### 페르소나 질문`,
    ...analysis.personaQuestions.map((q, i) => `${i + 1}. ${q}`),
  ].join('\n');
}
