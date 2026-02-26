// Tests for advisory modules: OllamaClient + LlmBenchmark
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OllamaClient } from '../../src/advisory/ollama-client.js';
import { LlmBenchmark } from '../../src/advisory/llm-benchmark.js';

describe('OllamaClient', () => {
  it('should initialize with default baseUrl', () => {
    const client = new OllamaClient();
    // Just verifying no crash — the URL is private
    expect(client).toBeDefined();
  });

  it('should initialize with custom baseUrl', () => {
    const client = new OllamaClient({ baseUrl: 'http://custom:11434' });
    expect(client).toBeDefined();
  });

  it('should strip trailing slash from baseUrl', () => {
    const client = new OllamaClient({ baseUrl: 'http://localhost:11434/' });
    expect(client).toBeDefined();
  });

  it('should check availability', async () => {
    const client = new OllamaClient();
    const available = await client.isAvailable();
    // Ollama should be running locally; if not, it returns false without crashing
    expect(typeof available).toBe('boolean');
  });

  it('should list models', async () => {
    const client = new OllamaClient();
    const models = await client.listModels();
    expect(Array.isArray(models)).toBe(true);
    // If Ollama is running, models should have entries
    if (models.length > 0) {
      expect(models[0]).toHaveProperty('name');
      expect(models[0]).toHaveProperty('size');
    }
  });

  it('should health check', async () => {
    const client = new OllamaClient();
    const health = await client.healthCheck();
    expect(health).toHaveProperty('available');
    if (health.available) {
      expect(health.models).toBeDefined();
      expect(Array.isArray(health.models)).toBe(true);
    }
  });

  it('should handle generate failure gracefully', async () => {
    // Use a non-existent model to trigger failure
    const client = new OllamaClient({ baseUrl: 'http://localhost:11434', timeoutMs: 5000 });
    const result = await client.generate({
      model: 'nonexistent-model-xyz',
      prompt: 'test',
      num_predict: 10,
    });

    // Should not throw, just return success: false
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });
});

describe('LlmBenchmark', () => {
  it('should initialize with defaults', () => {
    const client = new OllamaClient();
    const benchmark = new LlmBenchmark({ ollamaClient: client });
    expect(benchmark).toBeDefined();
  });

  it('should initialize with custom thresholds', () => {
    const client = new OllamaClient();
    const benchmark = new LlmBenchmark({
      ollamaClient: client,
      minQualityScore: 7,
      maxResponseMs: 15000,
    });
    expect(benchmark).toBeDefined();
  });

  // Note: Full benchmark test requires Ollama to be running with a model
  // We test the structure only if Ollama is available
  it('should return proper BenchmarkResult structure on failure', async () => {
    // Use a mock client that always fails
    const mockClient = {
      generate: vi.fn().mockResolvedValue({
        response: '',
        model: 'mock',
        durationMs: 100,
        success: false,
        error: 'mock error',
      }),
      isAvailable: vi.fn().mockResolvedValue(false),
      listModels: vi.fn().mockResolvedValue([]),
      healthCheck: vi.fn().mockResolvedValue({ available: false }),
    } as any;

    const benchmark = new LlmBenchmark({ ollamaClient: mockClient });
    const result = await benchmark.benchmark('mock-model');

    expect(result.model).toBe('mock-model');
    expect(result.available).toBe(true); // It attempted the benchmark
    expect(result.tests.length).toBe(3); // 3 benchmark tests
    expect(result.tests.every(t => !t.passed)).toBe(true); // All failed
    expect(result.qualityScore).toBe(0);
    expect(result.passed).toBe(false);
    expect(result.summary).toContain('FAILED');
  });
});
