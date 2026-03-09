// Workflow Gate 1: PRD Self-Healing Loop — customer personas review and refine PRD
import { PersonaEngine } from '../personas/persona-engine.js';
import { PersonaSimulator } from '../personas/persona-simulator.js';
import type { UnderstandOutput } from './understand.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('workflow:prd-elicitation');

// ─── Types ───

export interface PRDDocument {
  /** Why are we building this? */
  context: string;
  /** What's in scope for this version */
  scope: string[];
  /** What's explicitly NOT in scope */
  nonGoals: string[];
  /** Must-have requirements (blockers) */
  mustHave: string[];
  /** Should-have requirements (nice to have) */
  shouldHave: string[];
  /** Things that must NOT happen */
  mustNot: string[];
  /** Measurable success criteria */
  successCriteria: string[];
  /** Identified risks */
  risks: string[];
  /** Version number (incremented each refinement round) */
  version: number;
}

export interface CustomerVerdict {
  personaId: string;
  personaName: string;
  verdict: 'APPROVED' | 'REJECTED';
  /** Blockers — without these, user won't use the product */
  blockers: string[];
  /** Wishes — nice to have but not deal-breakers */
  wishes: string[];
  /** Aspects already satisfied */
  approvedAspects: string[];
}

export interface PRDElicitationResult {
  /** Final refined PRD */
  prd: PRDDocument;
  /** Customer verdicts from final round */
  verdicts: CustomerVerdict[];
  /** Number of refinement rounds performed */
  rounds: number;
  /** Whether all customers are satisfied */
  allSatisfied: boolean;
  /** Human-readable report */
  report: string;
}

export interface PRDElicitationInput {
  /** User's original goal */
  goal: string;
  /** Analysis from analyzeGoal() */
  analysis: UnderstandOutput;
  /** Max refinement rounds (default: 3) */
  maxRounds?: number;
  /** Project context if available */
  projectContext?: string;
  /** Optional PersonaSimulator for LLM-based customer reviews */
  simulator?: PersonaSimulator;
  /** ADR-011: Business constraints from Gate 0 (injected automatically by CycleRunner) */
  businessConstraints?: string[];
}

// ─── Customer persona IDs for PRD review ───

const CUSTOMER_PERSONA_IDS = ['user-advocate', 'frustrated-user'];

// ─── Main PRD Elicitation Loop ───

/**
 * Gate 1: PRD Self-Healing Loop.
 *
 * Flow:
 *   1. Generate initial PRD from goal analysis
 *   2. Customer personas review and provide verdicts
 *   3. If rejected: apply complaints, refine PRD, re-review
 *   4. Loop until all satisfied or max rounds reached
 *   5. Return final PRD + verdicts for human approval
 */
export async function runPRDElicitation(
  input: PRDElicitationInput,
  personaEngine: PersonaEngine,
): Promise<PRDElicitationResult> {
  const { goal, analysis, maxRounds = 3, projectContext, simulator, businessConstraints } = input;
  log.info('Starting PRD elicitation', { goal: goal.slice(0, 80), maxRounds });

  // Phase 1: Generate initial PRD (ADR-011: inject business constraints)
  let prd = generateInitialPRD(goal, analysis, projectContext, businessConstraints);
  log.info('Initial PRD generated', { version: prd.version });

  let verdicts: CustomerVerdict[] = [];
  let rounds = 0;
  let allSatisfied = false;

  // Phase 2-4: Self-healing loop
  while (rounds < maxRounds && !allSatisfied) {
    rounds++;
    log.info(`PRD review round ${rounds}/${maxRounds}`);

    // Get customer verdicts
    verdicts = await reviewByCustomerPersonas(prd, goal, analysis.analysis.taskType, personaEngine, simulator);

    // Check if all satisfied (no blockers)
    allSatisfied = verdicts.every(v => v.blockers.length === 0);

    if (!allSatisfied && rounds < maxRounds) {
      // Apply complaints and refine
      prd = applyComplaints(prd, verdicts);
      log.info(`PRD refined to v${prd.version}`, {
        blockersResolved: verdicts.reduce((sum, v) => sum + v.blockers.length, 0),
      });
    }
  }

  if (!allSatisfied) {
    log.warn('Max rounds reached without full satisfaction', { rounds });
  }

  // Phase 5: Format report for human
  const report = formatPRDReport(prd, verdicts, rounds, allSatisfied);

  log.info('PRD elicitation complete', {
    version: prd.version,
    rounds,
    allSatisfied,
    usedLLM: !!simulator,
  });

  return { prd, verdicts, rounds, allSatisfied, report };
}

// ─── PRD Generation ───

/**
 * Generate initial PRD from goal analysis.
 */
export function generateInitialPRD(
  goal: string,
  analysis: UnderstandOutput,
  projectContext?: string,
  businessConstraints?: string[],
): PRDDocument {
  const { taskType, complexity, scope, keyRequirements, risks } = analysis.analysis;

  // Build context (ADR-011: include business gate constraints if present)
  let context = projectContext
    ? `${goal}\n\n프로젝트 컨텍스트: ${projectContext}`
    : goal;

  if (businessConstraints && businessConstraints.length > 0) {
    context += `\n\n비즈니스 Gate 제약사항:\n${businessConstraints.map(c => `- ${c}`).join('\n')}`;
  }

  // Convert keyRequirements to mustHave
  const mustHave = keyRequirements.map(r => r);

  // Generate scope from goal signals
  const scopeItems = extractScope(goal, keyRequirements);

  // Generate non-goals (what we're NOT doing)
  const nonGoals = inferNonGoals(goal, taskType, complexity);

  // Generate success criteria
  const successCriteria = generateSuccessCriteria(taskType, keyRequirements);

  // Generate must-not constraints (ADR-011: merge business constraints)
  const mustNot = generateMustNots(taskType, risks);
  if (businessConstraints) {
    for (const constraint of businessConstraints) {
      if (!mustNot.includes(constraint)) {
        mustNot.push(constraint);
      }
    }
  }

  return {
    context,
    scope: scopeItems,
    nonGoals,
    mustHave,
    shouldHave: [],
    mustNot,
    successCriteria,
    risks: [...risks],
    version: 0,
  };
}

/**
 * Extract scope items from goal text.
 */
function extractScope(goal: string, keyRequirements: string[]): string[] {
  const scope: string[] = [];

  // Add each key requirement as a scope item
  for (const req of keyRequirements) {
    scope.push(req);
  }

  // Extract specific features mentioned in goal
  const featurePatterns = [
    /칸반|kanban/i,
    /채팅|chat/i,
    /대시보드|dashboard/i,
    /터미널|terminal/i,
    /에이전트|agent/i,
    /로그인|인증|auth/i,
    /결제|payment/i,
    /검색|search/i,
    /알림|notification/i,
    /설정|settings/i,
  ];

  for (const pattern of featurePatterns) {
    const match = goal.match(pattern);
    if (match) {
      scope.push(`${match[0]} 기능 구현`);
    }
  }

  return [...new Set(scope)]; // deduplicate
}

/**
 * Infer non-goals based on what the goal does NOT mention.
 */
function inferNonGoals(goal: string, taskType: string, complexity: string): string[] {
  const nonGoals: string[] = [];

  if (!/모바일|반응형|responsive/i.test(goal)) {
    nonGoals.push('모바일 최적화 (이번 버전 제외)');
  }
  if (!/다국어|i18n|번역/i.test(goal)) {
    nonGoals.push('다국어 지원 (이번 버전 제외)');
  }
  if (!/다중.*사용자|멀티.*유저|multi.*user/i.test(goal)) {
    nonGoals.push('다중 사용자 지원');
  }
  if (!/실시간|websocket|소켓/i.test(goal)) {
    nonGoals.push('실시간 동기화');
  }
  if (!/테스트|test/i.test(goal) && taskType !== 'debugging') {
    nonGoals.push('E2E 테스트 자동화 (단위 테스트만 포함)');
  }

  return nonGoals;
}

/**
 * Generate measurable success criteria.
 */
function generateSuccessCriteria(taskType: string, keyRequirements: string[]): string[] {
  const criteria: string[] = [];

  // Universal criteria
  criteria.push('빌드 에러 0개');
  criteria.push('TypeScript strict 모드 경고 0개');

  // UI-specific
  if (keyRequirements.some(r => r.includes('UI'))) {
    criteria.push('핵심 기능 3클릭 이내 도달');
    criteria.push('첫 화면 로딩 3초 이내');
  }

  // API-specific
  if (keyRequirements.some(r => r.includes('API'))) {
    criteria.push('API 응답 시간 500ms 이내');
    criteria.push('에러 응답에 한글 메시지 포함');
  }

  // Bug fix specific
  if (taskType === 'debugging') {
    criteria.push('보고된 버그 재현 불가 확인');
    criteria.push('회귀 테스트 통과');
  }

  return criteria;
}

/**
 * Generate must-not constraints.
 */
function generateMustNots(taskType: string, risks: string[]): string[] {
  const mustNots: string[] = [];

  mustNots.push('하드코딩된 API 키 / 비밀번호');
  mustNots.push('console.log 잔류 (개발용)');

  if (risks.some(r => r.includes('프로덕션'))) {
    mustNots.push('프로덕션 데이터 직접 수정');
  }

  if (risks.some(r => r.includes('외부 API'))) {
    mustNots.push('테스트에서 실제 유료 API 호출');
  }

  return mustNots;
}

// ─── Customer Persona Review ───

/**
 * Have customer personas review the PRD and return verdicts.
 * If simulator is provided and Ollama is available, uses LLM inference.
 */
async function reviewByCustomerPersonas(
  prd: PRDDocument,
  goal: string,
  taskType: string,
  personaEngine: PersonaEngine,
  simulator?: PersonaSimulator,
): Promise<CustomerVerdict[]> {
  const topic = formatPRDForReview(prd, goal);

  // Get consultation plan
  const plan = await personaEngine.createConsultationPlan({
    stage: 'understand',
    topic,
    includePersonas: CUSTOMER_PERSONA_IDS,
    categories: ['customer'],
    maxPersonas: 3,
    taskType,
  });

  // Generate verdicts
  const verdicts: CustomerVerdict[] = [];

  for (const consultation of plan.consultations) {
    // Try LLM-based verdict first
    if (simulator) {
      const llmVerdict = await tryLLMCustomerVerdict(
        simulator,
        consultation.persona.id,
        consultation.persona.name,
        consultation.prompt,
        prd,
      );
      if (llmVerdict) {
        verdicts.push(llmVerdict);
        continue;
      }
    }

    // Heuristic fallback
    const verdict = generateCustomerVerdict(
      consultation.persona.id,
      consultation.persona.name,
      prd,
    );
    verdicts.push(verdict);
  }

  // If no personas found, add default approval
  if (verdicts.length === 0) {
    verdicts.push({
      personaId: 'default-customer',
      personaName: 'Default Customer',
      verdict: 'APPROVED',
      blockers: [],
      wishes: [],
      approvedAspects: ['기본 검토 통과'],
    });
  }

  return verdicts;
}

/**
 * Try to get an LLM-based customer verdict from Ollama.
 * Returns null if unavailable or unparseable.
 */
async function tryLLMCustomerVerdict(
  simulator: PersonaSimulator,
  personaId: string,
  personaName: string,
  prompt: string,
  prd: PRDDocument,
): Promise<CustomerVerdict | null> {
  try {
    const result = await simulator.simulate(personaName, prompt);
    if (!result.success || !result.response) {
      log.debug(`LLM customer verdict failed for ${personaId}, falling back to heuristic`);
      return null;
    }

    return parseLLMCustomerVerdict(personaId, personaName, result.response, prd);
  } catch (err) {
    log.debug(`LLM customer verdict error for ${personaId}`, err);
    return null;
  }
}

/**
 * Parse LLM response to extract customer verdict, blockers, and wishes.
 */
function parseLLMCustomerVerdict(
  personaId: string,
  personaName: string,
  response: string,
  prd: PRDDocument,
): CustomerVerdict {
  const upper = response.toUpperCase();
  const verdict: CustomerVerdict['verdict'] =
    upper.includes('REJECTED') || upper.includes('반려') || upper.includes('불승인')
      ? 'REJECTED'
      : 'APPROVED';

  // Extract blockers from lines that mention issue keywords
  const lines = response.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const blockers: string[] = [];
  const wishes: string[] = [];

  for (const line of lines) {
    const lUpper = line.toUpperCase();
    if (/BLOCK|불만|없으면|필수|반드시/.test(line)) {
      blockers.push(line.slice(0, 200));
    } else if (/WISH|권장|있으면|조음|자슈하면/.test(line)) {
      wishes.push(line.slice(0, 200));
    }
  }

  return {
    personaId,
    personaName,
    verdict,
    blockers: blockers.slice(0, 3),
    wishes: wishes.slice(0, 3),
    approvedAspects: verdict === 'APPROVED' ? ['LLM 심사 통과'] : [],
  };
}

/**
 * Format PRD for persona review.
 */
function formatPRDForReview(prd: PRDDocument, goal: string): string {
  return [
    '## PRD 심사 요청 (Customer Persona)',
    '',
    `### 목표`,
    goal,
    '',
    `### 범위`,
    prd.scope.map(s => `- ${s}`).join('\n'),
    '',
    `### 비목표 (이번 버전 제외)`,
    prd.nonGoals.map(n => `- ${n}`).join('\n'),
    '',
    `### 필수 요구사항 (MUST)`,
    prd.mustHave.map(m => `- ${m}`).join('\n'),
    '',
    `### 금지 사항 (MUST NOT)`,
    prd.mustNot.map(m => `- ${m}`).join('\n'),
    '',
    `### 성공 기준`,
    prd.successCriteria.map(c => `- ${c}`).join('\n'),
    '',
    '### 판정',
    '이 PRD를 사용자 관점에서 심사해주세요.',
    'APPROVED 또는 REJECTED로 판정하고,',
    'blockers (이것 없으면 사용 불가)와 wishes (있으면 좋음)를 구분해주세요.',
  ].join('\n');
}

/**
 * Generate a customer verdict using heuristic analysis.
 * When LLM (Ollama) is available, this is replaced by model inference.
 */
function generateCustomerVerdict(
  personaId: string,
  personaName: string,
  prd: PRDDocument,
): CustomerVerdict {
  if (personaId === 'user-advocate') {
    return reviewAsUserAdvocate(personaId, personaName, prd);
  }

  if (personaId === 'frustrated-user') {
    return reviewAsFrustratedUser(personaId, personaName, prd);
  }

  // Generic customer persona
  return {
    personaId,
    personaName,
    verdict: 'APPROVED',
    blockers: [],
    wishes: [],
    approvedAspects: ['기본 검토 통과'],
  };
}

/**
 * User Advocate review — focuses on UX, accessibility, and ease of use.
 */
function reviewAsUserAdvocate(
  personaId: string,
  personaName: string,
  prd: PRDDocument,
): CustomerVerdict {
  const blockers: string[] = [];
  const wishes: string[] = [];
  const approvedAspects: string[] = [];

  // Check: 3-click access criterion
  const has3Click = prd.successCriteria.some(c => /3.*클릭|3.*click/i.test(c));
  if (!has3Click) {
    blockers.push('핵심 기능 3클릭 이내 기준이 성공 기준에 없습니다');
  } else {
    approvedAspects.push('3클릭 기준 명시됨');
  }

  // Check: loading time criterion
  const hasLoadTime = prd.successCriteria.some(c => /로딩|load|초/i.test(c));
  if (!hasLoadTime) {
    blockers.push('로딩 시간 기준이 없습니다 (3초 이내 권장)');
  } else {
    approvedAspects.push('로딩 시간 기준 명시됨');
  }

  // Check: Korean error messages
  const hasKoreanError = prd.mustHave.some(m => /한글|에러.*메시지|error.*message/i.test(m))
    || prd.successCriteria.some(c => /한글|에러/i.test(c));
  if (!hasKoreanError) {
    wishes.push('에러 메시지 한글화 기준 추가 권장');
  } else {
    approvedAspects.push('한글 에러 메시지 기준 있음');
  }

  // Check: dark/light mode
  const hasDarkMode = prd.scope.some(s => /다크|dark|테마|theme/i.test(s))
    || prd.shouldHave.some(s => /다크|dark/i.test(s));
  if (!hasDarkMode) {
    wishes.push('다크모드/라이트모드 토글 추가 권장');
  }

  const verdict = blockers.length === 0 ? 'APPROVED' : 'REJECTED';

  return { personaId, personaName, verdict, blockers, wishes, approvedAspects };
}

/**
 * Frustrated User review — focuses on pain points and MUST/SHOULD distinction.
 */
function reviewAsFrustratedUser(
  personaId: string,
  personaName: string,
  prd: PRDDocument,
): CustomerVerdict {
  const blockers: string[] = [];
  const wishes: string[] = [];
  const approvedAspects: string[] = [];

  // Check: clear problem statement
  if (!prd.context || prd.context.length < 20) {
    blockers.push('왜 이걸 만드는지 맥락이 너무 부족합니다. 기존 도구의 불편함이 명시되어야 합니다');
  } else {
    approvedAspects.push('제품 맥락 설명 있음');
  }

  // Check: scope has at least 2 concrete items
  const concreteScope = prd.scope.filter(s =>
    !/구현.*필요|작성|업데이트/i.test(s)
  );
  if (concreteScope.length < 2) {
    blockers.push('구체적인 기능 범위가 부족합니다. "무엇을 만드나"가 명확해야 합니다');
  } else {
    approvedAspects.push(`구체적 기능 ${concreteScope.length}개 명시됨`);
  }

  // Check: nonGoals exist (scope boundary)
  if (prd.nonGoals.length === 0) {
    blockers.push('비목표(이번에 안 할 것)가 없습니다. 범위를 무한정 해석할 위험이 있습니다');
  } else {
    approvedAspects.push(`비목표 ${prd.nonGoals.length}개 명시됨`);
  }

  // Check: success criteria are measurable
  const measurableCriteria = prd.successCriteria.filter(c =>
    /\d|초|%|건|개|이내|이상|이하/i.test(c)
  );
  if (measurableCriteria.length === 0) {
    wishes.push('성공 기준에 수치(초, %, 건수 등)가 포함되면 좋겠습니다');
  } else {
    approvedAspects.push(`측정 가능한 기준 ${measurableCriteria.length}개 있음`);
  }

  // Check: mustNot has safety constraints
  if (prd.mustNot.length === 0) {
    wishes.push('"절대 하면 안 되는 것" 목록이 있으면 실수를 방지할 수 있습니다');
  } else {
    approvedAspects.push(`금지 사항 ${prd.mustNot.length}개 명시됨`);
  }

  const verdict = blockers.length === 0 ? 'APPROVED' : 'REJECTED';

  return { personaId, personaName, verdict, blockers, wishes, approvedAspects };
}

// ─── PRD Refinement ───

/**
 * Apply customer complaints to refine the PRD.
 */
export function applyComplaints(prd: PRDDocument, verdicts: CustomerVerdict[]): PRDDocument {
  const refined = { ...prd, version: prd.version + 1 };
  refined.scope = [...prd.scope];
  refined.nonGoals = [...prd.nonGoals];
  refined.mustHave = [...prd.mustHave];
  refined.shouldHave = [...prd.shouldHave];
  refined.mustNot = [...prd.mustNot];
  refined.successCriteria = [...prd.successCriteria];
  refined.risks = [...prd.risks];

  for (const verdict of verdicts) {
    // Blockers → add to mustHave or successCriteria
    for (const blocker of verdict.blockers) {
      if (/기준|criteria|성공/i.test(blocker)) {
        // Add inferred criterion
        if (blocker.includes('3클릭')) {
          refined.successCriteria.push('핵심 기능 3클릭 이내 도달');
        }
        if (blocker.includes('로딩')) {
          refined.successCriteria.push('첫 화면 로딩 3초 이내');
        }
      } else if (/맥락|context|불편/i.test(blocker)) {
        // Context issue — enrich context description
        refined.context += '\n(보강 필요: 기존 도구 대비 차별점 명시)';
      } else if (/범위|scope|기능/i.test(blocker)) {
        // Scope clarity issue — add note
        refined.mustHave.push('구체적 기능 범위 명시 필수');
      } else if (/비목표|non.*goal/i.test(blocker)) {
        // Non-goals missing — add defaults
        if (refined.nonGoals.length === 0) {
          refined.nonGoals.push('범위 외 확장은 다음 버전으로 연기');
        }
      } else {
        // Generic blocker → add as mustHave
        refined.mustHave.push(blocker);
      }
    }

    // Wishes → add to shouldHave
    for (const wish of verdict.wishes) {
      if (!refined.shouldHave.includes(wish)) {
        refined.shouldHave.push(wish);
      }
    }
  }

  // Deduplicate all arrays
  refined.scope = [...new Set(refined.scope)];
  refined.nonGoals = [...new Set(refined.nonGoals)];
  refined.mustHave = [...new Set(refined.mustHave)];
  refined.shouldHave = [...new Set(refined.shouldHave)];
  refined.mustNot = [...new Set(refined.mustNot)];
  refined.successCriteria = [...new Set(refined.successCriteria)];

  return refined;
}

// ─── Formatting ───

/**
 * Format final PRD + verdicts for human approval.
 */
export function formatPRDReport(
  prd: PRDDocument,
  verdicts: CustomerVerdict[],
  rounds: number,
  allSatisfied: boolean,
): string {
  const icon = allSatisfied ? '✅' : '⚠️';
  const statusText = allSatisfied
    ? `커스토머 전원 만족 (${rounds}라운드)`
    : `최대 ${rounds}라운드 도달 (일부 불만 잔존)`;

  const lines = [
    `## ${icon} PRD 커스토머 심사 결과 — ${statusText}`,
    '',
    '### 심사 결과',
  ];

  for (const v of verdicts) {
    const vIcon = v.verdict === 'APPROVED' ? '✅' : '❌';
    lines.push(`- ${vIcon} **${v.personaName}** (${v.verdict})`);
    if (v.approvedAspects.length > 0) {
      lines.push(`  - 만족: ${v.approvedAspects.join(', ')}`);
    }
    if (v.blockers.length > 0) {
      lines.push(`  - 🚫 불만: ${v.blockers.join(', ')}`);
    }
    if (v.wishes.length > 0) {
      lines.push(`  - 💡 권장: ${v.wishes.join(', ')}`);
    }
  }

  lines.push(
    '',
    `### 최종 PRD (v${prd.version})`,
    '',
    `**맥락:** ${prd.context.slice(0, 200)}`,
    '',
    '**범위:**',
    ...prd.scope.map(s => `- ${s}`),
    '',
    '**비목표:**',
    ...prd.nonGoals.map(n => `- ${n}`),
    '',
    '**필수 (MUST):**',
    ...prd.mustHave.map(m => `- ${m}`),
    '',
    '**권장 (SHOULD):**',
    ...prd.shouldHave.map(s => `- ${s}`),
    '',
    '**금지 (MUST NOT):**',
    ...prd.mustNot.map(m => `- ${m}`),
    '',
    '**성공 기준:**',
    ...prd.successCriteria.map(c => `- ${c}`),
    '',
    '**리스크:**',
    ...prd.risks.map(r => `- ${r}`),
  );

  return lines.join('\n');
}
