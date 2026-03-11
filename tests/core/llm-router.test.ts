// Unit tests for LLMRouter — all external API calls are mocked
// No real OpenAI / Ollama calls. Uses vi.hoisted() + vi.mock to stub providers.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LLMRouter, COUNCIL_PRESET, type ReviewRequest } from '../../src/core/llm-router.js';

// ─── Hoisted mock vars ───────────────────────────────────────────────────────
// vi.hoisted() runs BEFORE vi.mock() factories — allows external variable refs inside factories.
// This is the officially supported vitest pattern for shared mocks.
const { mockCreate, mockChat } = vi.hoisted(() => ({
  mockCreate: vi.fn().mockResolvedValue({
    choices: [{ message: { content: '[OpenAI mock response]' } }],
  }),
  mockChat: vi.fn().mockResolvedValue({
    message: { content: '[Ollama mock response]' },
  }),
}));

// ─── Mock openai module ───────────────────────────────────────────────────────
vi.mock('openai', () => ({
  default: vi.fn().mockImplementation(() => ({
    chat: { completions: { create: mockCreate } },
  })),
}));

// ─── Mock ollama module ───────────────────────────────────────────────────────
vi.mock('ollama', () => ({
  Ollama: vi.fn().mockImplementation(() => ({
    chat: mockChat,
    list: vi.fn().mockResolvedValue({ models: [] }),
  })),
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeRequest(overrides: Partial<ReviewRequest> = {}): ReviewRequest {
  return {
    role: 'CTO',
    systemPrompt: '당신은 CTO입니다.',
    userMessage: '이 아키텍처 검토해주세요.',
    provider: 'deepseek-cloud',
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('LLMRouter', () => {
  let router: LLMRouter;

  beforeEach(() => {
    process.env.OPENAI_API_KEY = 'sk-test-key';
    // Restore mock return values each test — prevents leakage when vi.clearAllMocks() ran
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: '[OpenAI mock response]' } }],
    });
    mockChat.mockResolvedValue({
      message: { content: '[Ollama mock response]' },
    });
    router = new LLMRouter();
  });

  afterEach(() => {
    // No vi.clearAllMocks() here — clearAllMocks resets mock return values,
    // which would undo the mockResolvedValue calls in beforeEach for other tests.
    // beforeEach fully restores mock state before each test, so nothing needed here.
  });

  // ─── Provider management ────────────────────────────────────────────────

  it('should initialize with 5 default providers', () => {
    const providers = router.listProviders();
    const ids = providers.map((p) => p.id);
    expect(ids).toContain('openai');
    expect(ids).toContain('deepseek-cloud');
    expect(ids).toContain('qwen3-local');
    expect(ids).toContain('gemma3-local');
    expect(ids).toContain('qwen3-coder-cloud');
  });

  it('should register a custom provider', () => {
    router.registerProvider({
      id: 'custom-test',
      type: 'ollama',
      model: 'custom:7b',
      costPerCall: 0,
    });
    const ids = router.listProviders().map((p) => p.id);
    expect(ids).toContain('custom-test');
  });

  // ─── Single invoke ──────────────────────────────────────────────────────

  it('should invoke Ollama provider and return success', async () => {
    const result = await router.invoke(makeRequest({ provider: 'deepseek-cloud' }));
    expect(result.success).toBe(true);
    expect(result.role).toBe('CTO');
    expect(result.content).toBe('[Ollama mock response]');
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('should invoke OpenAI provider and return success', async () => {
    const result = await router.invoke(makeRequest({ provider: 'openai', role: 'CFO' }));
    expect(result.success).toBe(true);
    expect(result.role).toBe('CFO');
    expect(result.content).toBe('[OpenAI mock response]');
  });

  it('should return error response for unknown provider', async () => {
    const result = await router.invoke(makeRequest({ provider: 'nonexistent' }));
    expect(result.success).toBe(false);
    expect(result.error).toContain('Unknown provider');
    expect(result.content).toContain('[오류]');
  });

  // ─── Disclaimer injection ────────────────────────────────────────────────

  it('should auto-inject disclaimer for CLO role', async () => {
    const result = await router.invoke(makeRequest({ role: 'CLO', provider: 'openai' }));
    expect(result.success).toBe(true);
    expect(result.content).toContain('면책 조항');
  });

  it('should NOT inject disclaimer for CTO role', async () => {
    const result = await router.invoke(makeRequest({ role: 'CTO', provider: 'deepseek-cloud' }));
    expect(result.success).toBe(true);
    expect(result.content).not.toContain('면책 조항');
  });

  it('should inject disclaimer for 법무 role', async () => {
    const result = await router.invoke(makeRequest({ role: '법무 담당', provider: 'openai' }));
    expect(result.success).toBe(true);
    expect(result.content).toContain('면책 조항');
  });

  // ─── Parallel invoke ─────────────────────────────────────────────────────

  it('should invoke 3 requests in parallel and return all results', async () => {
    const requests = [
      makeRequest({ role: 'CTO', provider: 'deepseek-cloud' }),
      makeRequest({ role: 'CFO', provider: 'openai' }),
      makeRequest({ role: 'CMO', provider: 'qwen3-local' }),
    ];
    const results = await router.invokeParallel(requests);

    expect(results).toHaveLength(3);
    expect(results.every((r) => r.success)).toBe(true);
    expect(results.map((r) => r.role)).toEqual(['CTO', 'CFO', 'CMO']);
  });

  it('should return partial results if one provider fails (unknown provider)', async () => {
    const requests = [
      makeRequest({ role: 'CTO', provider: 'deepseek-cloud' }),   // success
      makeRequest({ role: '???', provider: 'does-not-exist' }),    // failure
      makeRequest({ role: 'CMO', provider: 'qwen3-local' }),       // success
    ];
    const results = await router.invokeParallel(requests);

    expect(results).toHaveLength(3);
    expect(results[0].success).toBe(true);
    expect(results[1].success).toBe(false);
    expect(results[2].success).toBe(true);
  });

  // ─── Council preset ──────────────────────────────────────────────────────

  it('COUNCIL_PRESET should have 5 roles', () => {
    expect(COUNCIL_PRESET).toHaveLength(5);
    const names = COUNCIL_PRESET.map((r) => r.name);
    expect(names).toContain('CTO');
    expect(names).toContain('CFO');
    expect(names).toContain('CMO');
    expect(names).toContain('CLO');
    expect(names).toContain('악마의 대변인');
  });

  it('buildCouncilRequests should produce 5 ReviewRequests', () => {
    const requests = router.buildCouncilRequests('이 PRD를 검토해주세요.');
    expect(requests).toHaveLength(5);
    expect(requests.every((r) => r.systemPrompt.length > 0)).toBe(true);
    expect(requests.every((r) => r.userMessage === '이 PRD를 검토해주세요.')).toBe(true);
  });

  it('invokeParallel with council should return 5 responses', async () => {
    const requests = router.buildCouncilRequests('사업 피벗을 고려 중입니다.');
    const results = await router.invokeParallel(requests);
    expect(results).toHaveLength(5);
  });

  // ─── Team lead preset ────────────────────────────────────────────────────

  it('buildTeamLeadRequest should produce a single code-review request', () => {
    const request = router.buildTeamLeadRequest('function foo(x) { return x }');
    expect(request.role).toContain('코드 리뷰어');
    expect(request.provider).toBe('deepseek-cloud');
    expect(request.systemPrompt).toContain('코드 리뷰어');
  });

  it('buildTeamLeadRequest should respect custom provider', () => {
    const request = router.buildTeamLeadRequest('code', { provider: 'qwen3-coder-cloud' });
    expect(request.provider).toBe('qwen3-coder-cloud');
  });

  // ─── Cost tracking ───────────────────────────────────────────────────────

  it('should accumulate total cost across calls', async () => {
    await router.invoke(makeRequest({ provider: 'openai' }));         // $0.005
    await router.invoke(makeRequest({ provider: 'deepseek-cloud' })); // $0.002
    await router.invoke(makeRequest({ provider: 'qwen3-local' }));    // $0

    const stats = router.getStats();
    expect(stats.totalCalls).toBe(3);
    expect(stats.totalCostUsd).toBeCloseTo(0.007, 3);
  });

  it('should track success rate correctly', async () => {
    await router.invoke(makeRequest({ provider: 'deepseek-cloud' }));   // success
    await router.invoke(makeRequest({ provider: 'nonexistent-fail' })); // failure

    const stats = router.getStats();
    expect(stats.successRate).toBeCloseTo(0.5, 1);
  });
});
