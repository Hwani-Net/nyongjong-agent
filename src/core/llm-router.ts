// LLM Router — unified multi-provider external LLM routing
// Supports OpenAI (GPT-4o), Ollama Cloud (DeepSeek-V3.1:671b), Ollama Local (Qwen3:30b, Gemma3:27b)
// Used by: external_review MCP tool (Council 5인 + 팀장 1~2인 통합)
import OpenAI from 'openai';
import { Ollama } from 'ollama';
import { createLogger } from '../utils/logger.js';

const log = createLogger('llm-router');

// ─── Disclaimer injection ───
// CLO mandated: auto-inject legal/medical disclaimer to prevent expert simulation violations
const DISCLAIMER_ROLES = ['CLO', '법무', '의료', '법률', '의사', '변호사'];
const DISCLAIMER_TEXT =
  '\n\n---\n⚠️ **면책 조항**: 이 응답은 AI 시뮬레이션이며 전문 법률·의료 조언을 대체하지 않습니다.';

// ─── Council preset ───
// 5-member fixed council: matches council/SKILL.md ADR-001
export const COUNCIL_PRESET: CouncilRole[] = [
  { name: 'CTO', systemPromptKey: 'cto', provider: 'deepseek-cloud' },
  { name: 'CFO', systemPromptKey: 'cfo', provider: 'openai' },
  { name: 'CMO', systemPromptKey: 'cmo', provider: 'qwen3-local' },
  { name: 'CLO', systemPromptKey: 'clo', provider: 'openai' },
  { name: '악마의 대변인', systemPromptKey: 'da', provider: 'deepseek-cloud' },
];

// ─── Types ───

export type ProviderType = 'openai' | 'ollama';

export interface LLMProvider {
  /** Unique ID for routing */
  id: string;
  type: ProviderType;
  /** Model identifier (as understood by the provider) */
  model: string;
  /** Ollama host URL. Defaults to OLLAMA_URL env or http://localhost:11434 */
  baseUrl?: string;
  /** Estimated cost per call in USD (for tracking) */
  costPerCall: number;
}

export interface CouncilRole {
  name: string;
  /** Key to look up the system prompt (maps to COUNCIL_SYSTEM_PROMPTS) */
  systemPromptKey: string;
  /** Provider ID to use for this role */
  provider: string;
  /** Override system prompt directly (optional) */
  systemPrompt?: string;
}

export interface ReviewRequest {
  /** Role label (e.g. 'CTO', '코드 리뷰어') */
  role: string;
  /** System prompt — persona definition */
  systemPrompt: string;
  /** User message — the topic/code/question to review */
  userMessage: string;
  /** Provider ID to route this request to */
  provider: string;
  /** Request timeout in ms. Default: 30000 */
  timeoutMs?: number;
}

export interface ReviewResponse {
  role: string;
  provider: string;
  model: string;
  content: string;
  durationMs: number;
  /** Estimated cost in USD */
  cost: number;
  /** True if call succeeded, false if timed out or errored */
  success: boolean;
  error?: string;
}

export interface RouterStats {
  totalCalls: number;
  totalCostUsd: number;
  successRate: number;
  lastCallMs: number;
}

// ─── Built-in Council system prompts ───
// Must match council/SKILL.md persona definitions
const COUNCIL_SYSTEM_PROMPTS: Record<string, string> = {
  cto: `당신은 CTO(최고기술책임자)입니다.
기술 타당성, 아키텍처, 확장성, 보안 위험을 분석합니다.
근거 없는 낙관론을 배제하고, 기술 부채와 숨겨진 복잡도를 직시합니다.
반드시 한국어로만 답변하세요.`,

  cfo: `당신은 CFO(최고재무책임자)입니다.
비용-편익 분석, ROI, 예산 리스크, 숨겨진 비용을 분석합니다.
"해보자"는 말 앞에 항상 "그래서 돈이 얼마나 드나?"를 묻습니다.
반드시 한국어로만 답변하세요.`,

  cmo: `당신은 CMO(최고마케팅책임자)입니다.
시장 기회, 사용자 획득, 경쟁 차별화, 브랜드 일관성을 분석합니다.
기술적 완성도보다 고객이 실제로 쓸 것인지를 먼저 따집니다.
반드시 한국어로만 답변하세요.`,

  clo: `당신은 CLO(최고법무책임자)입니다.
법적 리스크, API 이용약관, 데이터 주권, 규정 준수를 분석합니다.
"할 수 있다"와 "해도 된다"를 구분하는 것이 당신의 존재 이유입니다.
반드시 한국어로만 답변하세요.`,

  da: `당신은 악마의 대변인(Devil's Advocate)입니다.
모든 제안의 약점, 반론, 대안을 찾아내는 것이 임무입니다.
다른 멤버들이 합의하면 할수록 더욱 날카로운 반론을 제시합니다.
"하지만 이렇게 되면 어떻게 할 건가?" 라는 질문의 달인입니다.
반드시 한국어로만 답변하세요.`,

  code_reviewer: `당신은 시니어 소프트웨어 엔지니어이자 엄격한 코드 리뷰어입니다.
코드 품질, 타입 안전성, 성능, 보안 취약점, 테스트 커버리지를 검사합니다.
"동작한다"와 "잘 만들었다"를 구분합니다. 칭찬보다 개선점을 먼저 말합니다.
반드시 한국어로만 답변하세요.`,
};

// ─── Default providers ───
const DEFAULT_PROVIDERS: LLMProvider[] = [
  {
    id: 'openai',
    type: 'openai',
    model: 'gpt-4o',
    costPerCall: 0.02,
  },
  {
    id: 'deepseek-cloud',
    type: 'ollama',
    model: 'deepseek-v3.1:671b-cloud',
    baseUrl: process.env.OLLAMA_URL || 'http://localhost:11434',
    costPerCall: 0.002,
  },
  {
    id: 'qwen3-local',
    type: 'ollama',
    model: 'qwen3:30b',
    baseUrl: process.env.OLLAMA_URL || 'http://localhost:11434',
    costPerCall: 0,
  },
  {
    id: 'gemma3-local',
    type: 'ollama',
    model: 'gemma3:27b',
    baseUrl: process.env.OLLAMA_URL || 'http://localhost:11434',
    costPerCall: 0,
  },
  {
    id: 'qwen3-coder-cloud',
    type: 'ollama',
    model: 'qwen3-coder:480b-cloud',
    baseUrl: process.env.OLLAMA_URL || 'http://localhost:11434',
    costPerCall: 0.002,
  },
];

// ─── LLMRouter ───

export class LLMRouter {
  private providers: Map<string, LLMProvider>;
  private openai: OpenAI | null = null;
  private stats: RouterStats = {
    totalCalls: 0,
    totalCostUsd: 0,
    successRate: 1,
    lastCallMs: 0,
  };
  private successCount = 0;
  private totalCount = 0;

  constructor(providers?: LLMProvider[]) {
    this.providers = new Map((providers ?? DEFAULT_PROVIDERS).map((p) => [p.id, p]));

    // Initialize OpenAI client if key is available
    const apiKey = process.env.OPENAI_API_KEY;
    if (apiKey) {
      this.openai = new OpenAI({ apiKey });
      log.info('LLMRouter: OpenAI client initialized');
    } else {
      log.warn('LLMRouter: OPENAI_API_KEY not set — openai provider will fail');
    }

    log.info(`LLMRouter initialized with ${this.providers.size} providers`, {
      providers: [...this.providers.keys()],
    });
  }

  // ─── Public API ───

  /**
   * Invoke a single LLM with a review request.
   * Returns a ReviewResponse (success=false on error instead of throwing).
   */
  async invoke(request: ReviewRequest): Promise<ReviewResponse> {
    const provider = this.providers.get(request.provider);
    if (!provider) {
      return this.errorResponse(request, `Unknown provider: ${request.provider}`);
    }

    const start = Date.now();
    log.info(`LLMRouter.invoke → ${provider.id} (${provider.model})`, { role: request.role });

    try {
      let content: string;
      if (provider.type === 'openai') {
        content = await this.callOpenAI(provider, request.systemPrompt, request.userMessage, request.timeoutMs);
      } else {
        content = await this.callOllama(provider, request.systemPrompt, request.userMessage, request.timeoutMs);
      }

      // Auto-inject disclaimer for sensitive roles (CLO mandate)
      if (DISCLAIMER_ROLES.some((r) => request.role.includes(r))) {
        content += DISCLAIMER_TEXT;
      }

      const durationMs = Date.now() - start;
      this.recordSuccess(provider.costPerCall, durationMs);

      return {
        role: request.role,
        provider: provider.id,
        model: provider.model,
        content,
        durationMs,
        cost: provider.costPerCall,
        success: true,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.error(`LLMRouter.invoke failed (${provider.id}): ${msg}`);
      this.recordFailure();
      return this.errorResponse(request, msg, provider);
    }
  }

  /**
   * Invoke multiple LLMs in parallel.
   * Uses Promise.allSettled — partial failures don't block the rest.
   * Returns all results, including failed ones (success=false).
   */
  async invokeParallel(requests: ReviewRequest[]): Promise<ReviewResponse[]> {
    log.info(`LLMRouter.invokeParallel: ${requests.length} requests`, {
      roles: requests.map((r) => r.role),
    });

    const settled = await Promise.allSettled(requests.map((r) => this.invoke(r)));

    return settled.map((result, i) => {
      if (result.status === 'fulfilled') return result.value;
      // Should not happen (invoke never throws), but safety net
      return this.errorResponse(requests[i], String(result.reason));
    });
  }

  /**
   * Build a full Council request set (5 roles) from a topic string.
   * Uses COUNCIL_PRESET for role → provider mapping.
   */
  buildCouncilRequests(topic: string, customRoles?: CouncilRole[]): ReviewRequest[] {
    const roles = customRoles ?? COUNCIL_PRESET;
    return roles.map((role) => ({
      role: role.name,
      systemPrompt: role.systemPrompt ?? COUNCIL_SYSTEM_PROMPTS[role.systemPromptKey] ?? '',
      userMessage: topic,
      provider: role.provider,
    }));
  }

  /**
   * Build a team-lead (팀장) review request.
   * Defaults to code_reviewer persona on deepseek-cloud.
   */
  buildTeamLeadRequest(
    content: string,
    options?: { provider?: string; customPrompt?: string },
  ): ReviewRequest {
    return {
      role: '코드 리뷰어 (팀장)',
      systemPrompt: options?.customPrompt ?? COUNCIL_SYSTEM_PROMPTS.code_reviewer,
      userMessage: content,
      provider: options?.provider ?? 'deepseek-cloud',
    };
  }

  /** Get current routing stats */
  getStats(): RouterStats {
    return { ...this.stats };
  }

  /** List all registered providers */
  listProviders(): LLMProvider[] {
    return [...this.providers.values()];
  }

  /** Register or replace a provider at runtime */
  registerProvider(provider: LLMProvider): void {
    this.providers.set(provider.id, provider);
    log.info(`Provider registered: ${provider.id} (${provider.model})`);
  }

  // ─── Private: OpenAI ───

  private async callOpenAI(
    provider: LLMProvider,
    system: string,
    user: string,
    timeoutMs = 30000,
  ): Promise<string> {
    if (!this.openai) {
      throw new Error('OpenAI client not initialized (OPENAI_API_KEY missing)');
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await this.openai.chat.completions.create(
        {
          model: provider.model,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
          temperature: 0.7,
          max_tokens: 1024,
        },
        { signal: controller.signal },
      );
      return response.choices[0]?.message?.content ?? '';
    } finally {
      clearTimeout(timer);
    }
  }

  // ─── Private: Ollama ───

  private async callOllama(
    provider: LLMProvider,
    system: string,
    user: string,
    timeoutMs = 30000,
  ): Promise<string> {
    const host = provider.baseUrl ?? process.env.OLLAMA_URL ?? 'http://localhost:11434';
    // Create a fresh Ollama instance per-call (no long-lived connection pooling issue)
    const ollama = new Ollama({ host });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await ollama.chat({
        model: provider.model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        options: {
          temperature: 0.7,
          num_predict: 1024,
        },
        // @ts-ignore — AbortSignal is supported by Ollama SDK but not in shipped types
        signal: controller.signal,
      });
      return response.message?.content ?? '';
    } finally {
      clearTimeout(timer);
    }
  }

  // ─── Private: helpers ───

  private errorResponse(
    request: ReviewRequest,
    error: string,
    provider?: LLMProvider,
  ): ReviewResponse {
    return {
      role: request.role,
      provider: request.provider,
      model: provider?.model ?? 'unknown',
      content: `[오류] ${error}`,
      durationMs: 0,
      cost: 0,
      success: false,
      error,
    };
  }

  private recordSuccess(cost: number, durationMs: number): void {
    this.totalCount++;
    this.successCount++;
    this.stats.totalCalls++;
    this.stats.totalCostUsd += cost;
    this.stats.successRate = this.successCount / this.totalCount;
    this.stats.lastCallMs = durationMs;
  }

  private recordFailure(): void {
    this.totalCount++;
    this.stats.totalCalls++;
    this.stats.successRate = this.successCount / this.totalCount;
  }
}
