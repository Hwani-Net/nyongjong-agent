// Workflow Gate 0: Business viability check — business personas review goal before PRD
import { PersonaEngine, type ConsultationPlan } from '../personas/persona-engine.js';
import { PersonaSimulator, type SimulationResult } from '../personas/persona-simulator.js';
import type { UnderstandOutput } from './understand.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('workflow:business-gate');

// ─── Types ───

export type BusinessVerdict = 'PASS' | 'PIVOT' | 'FAIL';

export interface BusinessReview {
  personaId: string;
  personaName: string;
  verdict: BusinessVerdict;
  feedback: string;
}

export interface BusinessGateResult {
  /** Final aggregated verdict */
  verdict: BusinessVerdict;
  /** Reason for the verdict */
  reason: string;
  /** Individual persona reviews */
  reviews: BusinessReview[];
  /** Suggested pivot direction (when verdict is PIVOT) */
  pivotSuggestion?: string;
  /** Market/grounding data if available */
  groundingData?: string;
}

export interface BusinessGateInput {
  /** User's original goal text */
  goal: string;
  /** Analysis from analyzeGoal() */
  analysis: UnderstandOutput;
  /** Optional grounding data (market size, trends, etc.) */
  groundingData?: string;
  /** Optional PersonaSimulator for LLM-based reviews (falls back to heuristic if absent) */
  simulator?: PersonaSimulator;
}

// ─── Gate Skip Logic ───

export type GateNeed = 'SKIP' | 'REQUIRED' | 'ASK_HUMAN';

export interface GateNeedResult {
  /** Whether to skip, require, or ask */
  need: GateNeed;
  /** Human-readable reason */
  reason: string;
}

/**
 * Determine whether Gate 0 (business viability check) should run.
 *
 * Rules:
 * - SKIP: debugging, refactoring, documentation, simple tasks, internal tools
 * - REQUIRED: new product/service, architecture, strategy tasks
 * - ASK_HUMAN: ambiguous — could go either way
 */
export function shouldRunBusinessGate(
  goal: string,
  taskType: string,
  complexity: string,
): GateNeedResult {
  // ── Auto-SKIP tasks (no business review needed) ──

  // Bug fixes / debugging
  if (taskType === 'debugging') {
    return { need: 'SKIP', reason: '버그 수정은 사업성 검토 불필요 — 바로 PRD로 진행' };
  }

  // Refactoring / code improvement
  if (taskType === 'refactoring') {
    return { need: 'SKIP', reason: '코드 리팩터링은 내부 품질 개선 — 사업성 검토 불필요' };
  }

  // Documentation
  if (taskType === 'documentation') {
    return { need: 'SKIP', reason: '문서화 작업은 사업성 검토 불필요' };
  }

  // Simple/low complexity tasks
  if (taskType === 'simple' && complexity === 'low') {
    return { need: 'SKIP', reason: '단순 작업은 사업성 검토 불필요 — 바로 진행' };
  }

  // Internal tool keywords
  if (/내부|인터널|internal|사내|관리자|admin|도구|tool|스크립트|script|자동화/i.test(goal)) {
    return { need: 'SKIP', reason: '내부 도구/스크립트는 사업성 검토 불필요' };
  }

  // ── REQUIRED tasks (must run business review) ──

  // New product/service/app
  if (/서비스|제품|앱|플랫폼|SaaS|마켓|커머스|쇼핑몰|런칭|출시|창업/i.test(goal)) {
    return { need: 'REQUIRED', reason: '신규 서비스/제품 — 사업성 검토 필수' };
  }

  // Revenue/monetization related
  if (/수익|매출|과금|구독|결제|payment|monetiz/i.test(goal)) {
    return { need: 'REQUIRED', reason: '수익/결제 관련 — 사업성 검토 필수' };
  }

  // Market-facing features for new users
  if (/사용자.*유치|고객.*확보|마케팅|광고|SEO|그로스/i.test(goal)) {
    return { need: 'REQUIRED', reason: '사용자 유치/마케팅 — 사업성 검토 필수' };
  }

  // Architecture tasks with high complexity
  if (taskType === 'architecture' && (complexity === 'high' || complexity === 'critical')) {
    return { need: 'REQUIRED', reason: '대규모 아키텍처 변경 — 사업성 검토 권장' };
  }

  // ── ASK_HUMAN — ambiguous cases ──

  // Medium complexity implementation — could be internal or external
  if (taskType === 'implementation' && complexity === 'medium') {
    return { need: 'ASK_HUMAN', reason: '중간 규모 구현 — 사업성 검토 여부를 대표님에게 확인' };
  }

  // Architecture without clear scope
  if (taskType === 'architecture' && complexity === 'medium') {
    return { need: 'ASK_HUMAN', reason: '중간 규모 설계 — 사업성 검토 필요 여부 불분명' };
  }

  // Strategy-like goals that could be internal
  if (/전략|기획|계획|로드맵/i.test(goal) && !/사업|비즈니스|매출/.test(goal)) {
    return { need: 'ASK_HUMAN', reason: '전략/기획 작업 — 사업성 검토 필요 여부 확인 필요' };
  }

  // Default: for implementation tasks with low complexity → SKIP
  if (complexity === 'low') {
    return { need: 'SKIP', reason: '낮은 복잡도 — 사업성 검토 없이 진행' };
  }

  // Default for unknown: ASK
  return { need: 'ASK_HUMAN', reason: '작업 유형이 애매합니다 — 사업성 검토 필요 여부를 대표님에게 확인' };
}

// ─── Business persona IDs that participate in Gate 0 ───

const BUSINESS_PERSONA_IDS = ['ceo-nyongjong', 'growth-hacker'];

/**
 * Gate 0: Business viability check.
 *
 * Business personas review the goal and determine if it's worth building.
 * Results in PASS (proceed), PIVOT (redirect), or FAIL (stop).
 *
 * Flow:
 *   1. Build consultation plan for business personas
 *   2. Each persona generates a verdict + feedback
 *   3. Aggregate verdicts into final result
 *   4. FAIL → stop, PIVOT → suggest alternative, PASS → proceed to PRD
 */
export async function runBusinessGate(
  input: BusinessGateInput,
  personaEngine: PersonaEngine,
): Promise<BusinessGateResult> {
  const { goal, analysis, groundingData, simulator } = input;
  log.info('Running business gate', { goal: goal.slice(0, 80) });

  // Build topic for persona consultation
  const topic = buildBusinessTopic(goal, analysis, groundingData);

  // Get consultation plan from persona engine
  const plan = await personaEngine.createConsultationPlan({
    stage: 'understand',
    topic,
    includePersonas: BUSINESS_PERSONA_IDS,
    categories: ['business'],
    maxPersonas: 3,
  });

  // Generate reviews — LLM if simulator available, heuristic fallback otherwise
  const reviews = await generateBusinessReviews(plan, goal, analysis, simulator);

  // Aggregate verdicts
  const result = aggregateVerdicts(reviews);

  log.info('Business gate result', {
    verdict: result.verdict,
    reviewCount: result.reviews.length,
    usedLLM: !!simulator,
  });

  return result;
}

/**
 * Build the topic string for business persona consultation.
 */
function buildBusinessTopic(
  goal: string,
  analysis: UnderstandOutput,
  groundingData?: string,
): string {
  const parts = [
    '## 사업성 검토 요청',
    '',
    `### 목표`,
    goal,
    '',
    `### 분석 결과`,
    `- 유형: ${analysis.analysis.taskType}`,
    `- 복잡도: ${analysis.analysis.complexity}`,
    `- 범위: ${analysis.analysis.scope}`,
    `- 핵심 요구사항: ${analysis.analysis.keyRequirements.join(', ')}`,
    `- 리스크: ${analysis.analysis.risks.join(', ')}`,
    '',
    '### 판단 포인트',
    '1. 이 제품/기능이 시장에서 가치가 있는가?',
    '2. 투자 대비 수익(ROI)이 기대되는가?',
    '3. 경쟁 우위 또는 차별점이 있는가?',
    '4. 지금 만들 타이밍인가?',
    '',
    '### ⚠️ 판정 기준 (중요)',
    '- 이것은 초기 아이디어 단계입니다. 세부 기획이 부족한 것은 정상입니다.',
    '- PASS: 시장 가치가 있고 기본적으로 실현 가능하면 통과',
    '- PIVOT: 방향 수정이 필요할 때만 (예: 타겟 변경, 범위 축소)',
    '- FAIL: 근본적 결함이 있을 때만 (예: 불법, 기술적 불가능, 시장 0)',
    '- 컨텍스트 부족, 세부 기획 미비는 FAIL 사유가 아닙니다!',
    '',
    '### 응답 형식',
    '반드시 응답 마지막에 다음 형식으로 판정을 명시하세요:',
    '[VERDICT:PASS] 또는 [VERDICT:PIVOT] 또는 [VERDICT:FAIL]',
    '반드시 한국어로만 답변하세요.',
  ];

  if (groundingData) {
    parts.push('', '### 시장 데이터', groundingData);
  }

  return parts.join('\n');
}

/**
 * Generate business reviews based on consultation plan.
 * If a PersonaSimulator is provided and Ollama is available, uses LLM inference.
 * Otherwise falls back to heuristic analysis.
 */
async function generateBusinessReviews(
  plan: ConsultationPlan,
  goal: string,
  analysis: UnderstandOutput,
  simulator?: PersonaSimulator,
): Promise<BusinessReview[]> {
  const reviews: BusinessReview[] = [];

  for (const consultation of plan.consultations) {
    // Try LLM-based review first
    if (simulator) {
      const llmReview = await tryLLMReview(simulator, consultation.persona.id, consultation.persona.name, consultation.prompt);
      if (llmReview) {
        reviews.push(llmReview);
        continue;
      }
      // LLM failed → fall through to heuristic
    }

    // Heuristic fallback
    const review = analyzeBusinessViability(
      consultation.persona.id,
      consultation.persona.name,
      goal,
      analysis,
    );
    reviews.push(review);
  }

  // If no personas were found, add a default assessment
  if (reviews.length === 0) {
    reviews.push({
      personaId: 'default-business',
      personaName: 'Default Business Reviewer',
      verdict: 'PASS',
      feedback: '비즈니스 페르소나가 없어 기본 평가 적용. 명확한 목표가 있으므로 PASS.',
    });
  }

  return reviews;
}

/**
 * Try to get an LLM-based review from Ollama via PersonaSimulator.
 * Returns null if Ollama is unavailable or the response can't be parsed.
 */
async function tryLLMReview(
  simulator: PersonaSimulator,
  personaId: string,
  personaName: string,
  prompt: string,
): Promise<BusinessReview | null> {
  try {
    const result = await simulator.simulate(personaName, prompt);
    if (!result.success || !result.response) {
      log.debug(`LLM review failed for ${personaId}, falling back to heuristic`);
      return null;
    }

    // Parse LLM response for verdict
    const verdict = parseLLMVerdict(result.response);
    return {
      personaId,
      personaName,
      verdict,
      feedback: result.response.slice(0, 500),
    };
  } catch (err) {
    log.debug(`LLM review error for ${personaId}`, err);
    return null;
  }
}

/**
 * Parse LLM response text to extract a business verdict.
 */
function parseLLMVerdict(response: string): BusinessVerdict {
  // Priority 1: Structured verdict marker (most reliable)
  const markerMatch = response.match(/\[VERDICT:(PASS|PIVOT|FAIL)\]/i);
  if (markerMatch) {
    return markerMatch[1].toUpperCase() as BusinessVerdict;
  }

  // Priority 2: Korean verdict keywords at sentence start or as standalone
  // Only match when these words appear as a clear judgment, not in discussion context
  const lines = response.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    // Look for lines that start with verdict-like patterns
    if (/^\*{0,2}판정\*{0,2}\s*[:：]\s*(PASS|PIVOT|FAIL|통과|합격|불합격|중단)/i.test(trimmed)) {
      if (/FAIL|불합격|중단/i.test(trimmed)) return 'FAIL';
      if (/PIVOT|방향\s*수정|조정/i.test(trimmed)) return 'PIVOT';
      return 'PASS';
    }
  }

  // Priority 3: Fallback — default to PASS for ambiguous responses
  // Rationale: at idea stage, benefit of doubt is better than false rejection
  return 'PASS';
}

/**
 * Heuristic-based business viability analysis per persona.
 * When LLM (Ollama) is available, this is replaced by actual model inference.
 */
function analyzeBusinessViability(
  personaId: string,
  personaName: string,
  goal: string,
  analysis: UnderstandOutput,
): BusinessReview {
  // CEO persona: cost/ROI focus
  if (personaId === 'ceo-nyongjong') {
    return analyzeCeoView(personaId, personaName, goal, analysis);
  }

  // Growth hacker: market/user acquisition focus
  if (personaId === 'growth-hacker') {
    return analyzeGrowthView(personaId, personaName, goal, analysis);
  }

  // Generic business persona
  return {
    personaId,
    personaName,
    verdict: 'PASS',
    feedback: `목표 "${goal.slice(0, 50)}..."의 사업성 검토 완료. 기본 통과.`,
  };
}

/**
 * CEO perspective: cost efficiency and ROI.
 */
function analyzeCeoView(
  personaId: string,
  personaName: string,
  goal: string,
  analysis: UnderstandOutput,
): BusinessReview {
  const { complexity, keyRequirements, risks } = analysis.analysis;

  // High complexity + no clear user value → PIVOT
  const hasUserValue = keyRequirements.some(
    r => r.includes('UI') || r.includes('기능') || r.includes('API'),
  );
  const isOverengineered = complexity === 'critical' && !hasUserValue;

  // Paid API dependency → PIVOT warning
  const hasCostRisk = risks.some(r => r.includes('외부 API'));

  // Production risk → PIVOT (사전 승인 권고, FAIL이 아님)
  const hasProductionRisk = risks.some(r => r.includes('프로덕션'));

  if (hasProductionRisk) {
    return {
      personaId,
      personaName,
      verdict: 'PIVOT',
      feedback: '프로덕션 환경 관련 작업 — 대표님 사전 검토 후 진행 권장. 스테이징에서 먼저 검증하세요.',
    };
  }

  if (isOverengineered) {
    return {
      personaId,
      personaName,
      verdict: 'PIVOT',
      feedback: `복잡도가 ${complexity}이지만 사용자 직접 가치가 불명확합니다. MVP 범위로 축소하세요.`,
    };
  }

  if (hasCostRisk) {
    return {
      personaId,
      personaName,
      verdict: 'PASS',
      feedback: `통과하지만 외부 API 비용 주의. 무료 대안 먼저 탐색하세요. 월 비용 한도 설정 필수.`,
    };
  }

  return {
    personaId,
    personaName,
    verdict: 'PASS',
    feedback: `"${goal.slice(0, 40)}..." — 비용 효율적이고 사용자 가치 있음. 진행하세요.`,
  };
}

/**
 * Growth hacker perspective: market opportunity and user acquisition.
 */
function analyzeGrowthView(
  personaId: string,
  personaName: string,
  goal: string,
  analysis: UnderstandOutput,
): BusinessReview {
  const { taskType, keyRequirements } = analysis.analysis;

  // Documentation-only tasks don't need market validation
  if (taskType === 'documentation') {
    return {
      personaId,
      personaName,
      verdict: 'PASS',
      feedback: '문서화 작업은 사업성 검토 불필요. 바로 진행하세요.',
    };
  }

  // Internal tools (debugging, refactoring) → auto-pass
  if (taskType === 'debugging' || taskType === 'refactoring') {
    return {
      personaId,
      personaName,
      verdict: 'PASS',
      feedback: '내부 개선 작업은 사업성 검토 불필요. 품질 향상으로 간접 기여.',
    };
  }

  // UI-only without clear KPI → PIVOT
  const hasUI = keyRequirements.some(r => r.includes('UI'));
  const hasKPI = /KPI|지표|매출|전환|DAU|MAU|가입/.test(goal);

  if (hasUI && !hasKPI) {
    return {
      personaId,
      personaName,
      verdict: 'PASS', // Still pass, but with advice
      feedback: `UI 중심 기능이지만 성과 지표(KPI)가 정의되지 않았습니다. ` +
        `DAU/전환율/공유율 중 최소 1개 KPI 포함을 권장합니다.`,
    };
  }

  return {
    personaId,
    personaName,
    verdict: 'PASS',
    feedback: `"${goal.slice(0, 40)}..." — 사용자 가치와 성장 기회 확인됨. 진행.`,
  };
}

/**
 * Aggregate individual reviews into a final verdict.
 *
 * Rules:
 * - All PASS → PASS
 * - Any FAIL + others → FAIL (conservative)
 * - Mix of PASS/PIVOT → PIVOT (needs adjustment)
 * - All PIVOT → PIVOT
 */
function aggregateVerdicts(reviews: BusinessReview[]): BusinessGateResult {
  const failReviews = reviews.filter(r => r.verdict === 'FAIL');
  const pivotReviews = reviews.filter(r => r.verdict === 'PIVOT');
  const passReviews = reviews.filter(r => r.verdict === 'PASS');

  // 과반수(50%+) FAIL 시에만 → overall FAIL (1명 FAIL로 전체 중단 방지)
  if (failReviews.length > 0 && failReviews.length > reviews.length / 2) {
    return {
      verdict: 'FAIL',
      reason: `사업성 검토 불합격 (${failReviews.length}/${reviews.length}명): ${failReviews.map(r => r.feedback).join(' | ')}`,
      reviews,
    };
  }

  // Any PIVOT → overall PIVOT
  if (pivotReviews.length > 0) {
    const pivotSuggestion = pivotReviews.map(r => r.feedback).join('\n');
    return {
      verdict: 'PIVOT',
      reason: `방향 수정 필요: ${pivotReviews.length}명의 리뷰어가 조정을 권고`,
      reviews,
      pivotSuggestion,
    };
  }

  // All PASS
  return {
    verdict: 'PASS',
    reason: `사업성 검토 통과: ${passReviews.length}명 전원 승인`,
    reviews,
  };
}

/**
 * Format business gate result for human-readable output.
 */
export function formatBusinessGateReport(result: BusinessGateResult): string {
  const icon = result.verdict === 'PASS' ? '✅'
    : result.verdict === 'PIVOT' ? '🔄'
    : '❌';

  const lines = [
    `## ${icon} 사업성 검토 결과: ${result.verdict}`,
    '',
    `**판정 사유:** ${result.reason}`,
    '',
    '### 개별 심사',
  ];

  for (const review of result.reviews) {
    const reviewIcon = review.verdict === 'PASS' ? '✅'
      : review.verdict === 'PIVOT' ? '🔄' : '❌';
    lines.push(`- ${reviewIcon} **${review.personaName}** (${review.verdict}): ${review.feedback}`);
  }

  if (result.pivotSuggestion) {
    lines.push('', '### 🔄 방향 수정 제안', result.pivotSuggestion);
  }

  if (result.groundingData) {
    lines.push('', '### 📊 시장 데이터', result.groundingData);
  }

  return lines.join('\n');
}
