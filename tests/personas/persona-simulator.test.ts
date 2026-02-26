// Tests for PersonaSimulator — mocked Ollama client
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PersonaSimulator } from '../../src/personas/persona-simulator.js';
import type { ConsultationPlan } from '../../src/personas/persona-engine.js';

// Mock the OllamaClient module
vi.mock('../../src/advisory/ollama-client.js', () => ({
  OllamaClient: vi.fn().mockImplementation(() => ({
    generate: vi.fn().mockResolvedValue({
      response: '시니어 엔지니어 관점에서 이 설계는 SOLID 원칙에 부합합니다.',
      durationMs: 1500,
      success: true,
    }),
    healthCheck: vi.fn().mockResolvedValue({
      available: true,
      models: ['gemma3:4b', 'qwen3:4b'],
    }),
  })),
}));

describe('PersonaSimulator', () => {
  let simulator: PersonaSimulator;

  beforeEach(() => {
    simulator = new PersonaSimulator({
      ollamaUrl: 'http://localhost:11434',
      defaultModel: 'gemma3:4b',
      timeoutMs: 5000,
    });
  });

  it('should initialize with default options', () => {
    const sim = new PersonaSimulator();
    expect(sim).toBeDefined();
  });

  it('should simulate a single persona consultation', async () => {
    const result = await simulator.simulate('시니어 엔지니어', '이 아키텍처를 평가해주세요');
    expect(result.persona).toBe('시니어 엔지니어');
    expect(result.response).toContain('SOLID');
    expect(result.success).toBe(true);
    expect(result.durationMs).toBeGreaterThan(0);
    expect(result.model).toBe('gemma3:4b');
  });

  it('should run a full consultation plan', async () => {
    const plan: ConsultationPlan = {
      consultations: [
        {
          persona: { name: '내돈내산 대표', systemPrompt: '비용 관점', traits: [], stages: ['understand'], category: 'business', priority: 1 },
          prompt: '이 기능의 비용은?',
        },
        {
          persona: { name: '사용자 대변인', systemPrompt: '사용자 관점', traits: [], stages: ['validate'], category: 'customer', priority: 2 },
          prompt: '사용자 경험은?',
        },
      ],
    };

    const results = await simulator.runPlan(plan);
    expect(results).toHaveLength(2);
    expect(results[0].persona).toBe('내돈내산 대표');
    expect(results[1].persona).toBe('사용자 대변인');
    expect(results.every(r => r.success)).toBe(true);
  });

  it('should perform health check', async () => {
    const health = await simulator.healthCheck();
    expect(health.available).toBe(true);
    expect(health.models).toContain('gemma3:4b');
  });

  it('should use custom model when specified', async () => {
    const result = await simulator.simulate('기술 철학자', '이 접근법의 철학적 의미', 'qwen3:4b');
    expect(result.model).toBe('qwen3:4b');
  });
});
