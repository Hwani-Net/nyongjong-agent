// Integration tests for PersonaSimulator — REAL Ollama connection, NO mocks
// If Ollama is offline, tests gracefully report skip/failure without crashing
import { describe, it, expect, beforeEach } from 'vitest';
import { PersonaSimulator } from '../../src/personas/persona-simulator.js';
import type { ConsultationPlan } from '../../src/personas/persona-engine.js';

describe('PersonaSimulator (real Ollama)', () => {
  let simulator: PersonaSimulator;

  beforeEach(() => {
    simulator = new PersonaSimulator({
      ollamaUrl: 'http://localhost:11434',
      defaultModel: 'gemma3:4b',
      timeoutMs: 30000,
    });
  });

  it('should initialize without crashing', () => {
    const sim = new PersonaSimulator();
    expect(sim).toBeDefined();
  });

  it('should report health check result (available or not)', async () => {
    const health = await simulator.healthCheck();
    expect(health).toHaveProperty('available');
    // If available, must have models array
    if (health.available) {
      expect(Array.isArray(health.models)).toBe(true);
    }
  });

  it('should simulate a persona (success or graceful failure if Ollama offline)', async () => {
    const result = await simulator.simulate('시니어 엔지니어', '이 아키텍처를 평가해주세요');
    expect(result.persona).toBe('시니어 엔지니어');
    expect(result.model).toBe('gemma3:4b');
    expect(result.durationMs).toBeGreaterThan(0);

    if (result.success) {
      // Ollama is online — response must be non-empty
      expect(result.response.length).toBeGreaterThan(0);
    } else {
      // Ollama is offline — success: false, error must explain why
      expect(result.error).toBeDefined();
      expect(result.error!.length).toBeGreaterThan(0);
      expect(result.response).toBe('');
    }
  }, 15000);

  it('should use custom model when specified', async () => {
    const result = await simulator.simulate('기술 철학자', '이 접근법의 의미', 'qwen3:4b');
    // Whether success or failure, model name must match
    expect(result.model).toBe('qwen3:4b');
  });

  it('should run a full consultation plan (success or graceful failure)', async () => {
    const plan: ConsultationPlan = {
      stage: 'understand',
      topic: '비용/UX 평가',
      consultations: [
        {
          persona: {
            id: 'ceo', name: '내돈내산 대표', category: 'business',
            era: 'modern', activatedAt: ['understand'], priority: 'high',
            content: '비용 관점 페르소나', metadata: {},
          },
          prompt: '이 기능의 비용 대비 가치는?',
        },
        {
          persona: {
            id: 'user-advocate', name: '사용자 대변인', category: 'customer',
            era: 'modern', activatedAt: ['validate'], priority: 'normal',
            content: '사용자 관점 페르소나', metadata: {},
          },
          prompt: '사용자 경험은 어떻게 평가하나요?',
        },
      ],
    };

    const results = await simulator.runPlan(plan);
    expect(results).toHaveLength(2);
    expect(results[0].persona).toBe('내돈내산 대표');
    expect(results[1].persona).toBe('사용자 대변인');

    // Each result must have valid structure regardless of Ollama availability
    for (const r of results) {
      expect(r.durationMs).toBeGreaterThan(0);
      expect(r.model).toBe('gemma3:4b');
      if (!r.success) {
        expect(r.error).toBeDefined();
      }
    }
  }, 30000);
});
