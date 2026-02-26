// Advisory: LLM Benchmark — validates local LLM models before use
import { OllamaClient, type OllamaGenerateResult } from './ollama-client.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('llm-benchmark');

export interface BenchmarkResult {
  model: string;
  available: boolean;
  /** Response quality score (0-10) */
  qualityScore: number;
  /** Average response time in ms */
  avgResponseMs: number;
  /** Whether the model passed the benchmark */
  passed: boolean;
  /** Individual test results */
  tests: BenchmarkTest[];
  /** Summary */
  summary: string;
}

export interface BenchmarkTest {
  name: string;
  prompt: string;
  response: string;
  durationMs: number;
  passed: boolean;
  reason: string;
}

export interface BenchmarkOptions {
  /** Ollama client instance */
  ollamaClient: OllamaClient;
  /** Minimum quality score to pass (default: 5) */
  minQualityScore?: number;
  /** Maximum acceptable response time in ms (default: 30000) */
  maxResponseMs?: number;
}

/**
 * LLM Benchmark tool — verifies that a local Ollama model meets
 * minimum quality standards before being used for advisory tasks.
 *
 * Design doc Section 0, Item 6:
 *   "로컬 LLM: 바로 사용 → 개별 검증 후 사용"
 */
export class LlmBenchmark {
  private client: OllamaClient;
  private minQualityScore: number;
  private maxResponseMs: number;

  constructor(options: BenchmarkOptions) {
    this.client = options.ollamaClient;
    this.minQualityScore = options.minQualityScore ?? 5;
    this.maxResponseMs = options.maxResponseMs ?? 30000;
    log.info('LlmBenchmark initialized', {
      minQuality: this.minQualityScore,
      maxResponseMs: this.maxResponseMs,
    });
  }

  /**
   * Run the full benchmark suite on a model.
   */
  async benchmark(model: string): Promise<BenchmarkResult> {
    log.info(`Benchmarking model: ${model}`);

    const tests: BenchmarkTest[] = [];

    // Test 1: Korean language understanding
    tests.push(await this.runTest(model, {
      name: 'Korean comprehension',
      prompt: '다음 문장을 요약하세요: "인공지능 기술은 빠르게 발전하고 있으며, 특히 자연어 처리 분야에서 큰 진전이 있었습니다."',
      validate: (response) => {
        const hasKorean = /[\uAC00-\uD7A3]/.test(response);
        const hasRelevance = /인공지능|AI|자연어|기술|발전/.test(response);
        return {
          passed: hasKorean && hasRelevance,
          reason: hasKorean && hasRelevance
            ? 'Korean comprehension OK'
            : `Missing: ${!hasKorean ? 'Korean output' : ''} ${!hasRelevance ? 'relevance' : ''}`,
        };
      },
    }));

    // Test 2: Structured output
    tests.push(await this.runTest(model, {
      name: 'Structured output',
      prompt: 'List 3 advantages of TypeScript over JavaScript. Format as numbered list.',
      validate: (response) => {
        const hasNumbers = /[1-3]\.|①|②|③/.test(response);
        const hasContent = response.length > 30;
        return {
          passed: hasNumbers && hasContent,
          reason: hasNumbers && hasContent
            ? 'Structured output OK'
            : 'Failed to produce numbered list',
        };
      },
    }));

    // Test 3: Role-playing (persona simulation capability)
    tests.push(await this.runTest(model, {
      name: 'Persona simulation',
      prompt: '당신은 스타트업 CEO입니다. "이 기능이 매출에 도움이 될까요?"라고 물었을 때, CEO 관점에서 답하세요.',
      validate: (response) => {
        const hasKorean = /[\uAC00-\uD7A3]/.test(response);
        const hasBusinessTerms = /매출|비용|수익|투자|고객|시장|ROI|사업/.test(response);
        return {
          passed: hasKorean && hasBusinessTerms,
          reason: hasKorean && hasBusinessTerms
            ? 'Persona simulation OK'
            : 'Failed to maintain CEO persona',
        };
      },
    }));

    // Calculate scores
    const passedTests = tests.filter((t) => t.passed).length;
    const qualityScore = Math.round((passedTests / tests.length) * 10);
    const avgResponseMs = tests.length > 0
      ? Math.round(tests.reduce((sum, t) => sum + t.durationMs, 0) / tests.length)
      : 0;

    const passed = qualityScore >= this.minQualityScore && avgResponseMs <= this.maxResponseMs;

    const summary = [
      `Model: ${model}`,
      `Quality: ${qualityScore}/10 (min: ${this.minQualityScore})`,
      `Avg response: ${avgResponseMs}ms (max: ${this.maxResponseMs}ms)`,
      `Tests: ${passedTests}/${tests.length} passed`,
      `Result: ${passed ? '✅ PASSED' : '❌ FAILED'}`,
    ].join('\n');

    log.info(summary);

    return {
      model,
      available: true,
      qualityScore,
      avgResponseMs,
      passed,
      tests,
      summary,
    };
  }

  private async runTest(
    model: string,
    config: {
      name: string;
      prompt: string;
      validate: (response: string) => { passed: boolean; reason: string };
    },
  ): Promise<BenchmarkTest> {
    log.debug(`Running test: ${config.name}`);

    const result: OllamaGenerateResult = await this.client.generate({
      model,
      prompt: config.prompt,
      temperature: 0.3, // Lower for benchmark consistency
      num_predict: 256,
    });

    if (!result.success) {
      return {
        name: config.name,
        prompt: config.prompt,
        response: '',
        durationMs: result.durationMs,
        passed: false,
        reason: `Generation failed: ${result.error}`,
      };
    }

    const validation = config.validate(result.response);

    return {
      name: config.name,
      prompt: config.prompt,
      response: result.response.slice(0, 500),
      durationMs: result.durationMs,
      passed: validation.passed,
      reason: validation.reason,
    };
  }
}
