// Advisory: Ollama API client — low-level interface to local LLM
import { createLogger } from '../utils/logger.js';

const log = createLogger('ollama-client');

export interface OllamaGenerateOptions {
  model: string;
  prompt: string;
  /** Sampling temperature (0-1) */
  temperature?: number;
  /** Top-p sampling */
  top_p?: number;
  /** Max tokens to generate */
  num_predict?: number;
  /** System prompt */
  system?: string;
}

export interface OllamaGenerateResult {
  response: string;
  model: string;
  durationMs: number;
  success: boolean;
  error?: string;
}

export interface OllamaModel {
  name: string;
  size: number;
  modified_at: string;
}

export interface OllamaClientOptions {
  /** Ollama server URL (default: http://localhost:11434) */
  baseUrl?: string;
  /** Default request timeout in ms */
  timeoutMs?: number;
}

/**
 * Low-level Ollama API client.
 *
 * Design doc Section 1 & 5.4:
 *   Ollama is used for advisory/supplementary opinions only,
 *   NOT for primary code generation. Its main role is
 *   persona simulation (Section 5.4).
 */
export class OllamaClient {
  private baseUrl: string;
  private timeoutMs: number;

  constructor(options: OllamaClientOptions = {}) {
    this.baseUrl = (options.baseUrl || process.env.OLLAMA_URL || 'http://localhost:11434').replace(/\/$/, '');
    this.timeoutMs = options.timeoutMs || 30000;
    log.info('OllamaClient initialized', { baseUrl: this.baseUrl });
  }

  /**
   * Check if Ollama server is available.
   */
  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`, {
        signal: AbortSignal.timeout(5000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * List available models.
   */
  async listModels(): Promise<OllamaModel[]> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`, {
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) {
        log.warn(`Failed to list models: HTTP ${response.status}`);
        return [];
      }

      const data = (await response.json()) as { models?: OllamaModel[] };
      return data.models || [];
    } catch (error) {
      log.warn('Failed to list Ollama models', error);
      return [];
    }
  }

  /**
   * Generate text using Ollama's generate API.
   */
  async generate(options: OllamaGenerateOptions): Promise<OllamaGenerateResult> {
    const start = Date.now();
    log.debug(`Generating with ${options.model}`, { promptLength: options.prompt.length });

    try {
      const response = await fetch(`${this.baseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: options.model,
          prompt: options.prompt,
          system: options.system,
          stream: false,
          options: {
            temperature: options.temperature ?? 0.7,
            top_p: options.top_p ?? 0.9,
            num_predict: options.num_predict ?? 512,
          },
        }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        return {
          response: '',
          model: options.model,
          durationMs: Date.now() - start,
          success: false,
          error: `HTTP ${response.status}: ${errorText.slice(0, 200)}`,
        };
      }

      const data = (await response.json()) as { response: string };

      log.debug(`Generation complete (${Date.now() - start}ms)`);

      return {
        response: data.response,
        model: options.model,
        durationMs: Date.now() - start,
        success: true,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      log.error(`Ollama generate failed: ${msg}`);
      return {
        response: '',
        model: options.model,
        durationMs: Date.now() - start,
        success: false,
        error: msg,
      };
    }
  }

  /**
   * Health check with detailed status.
   */
  async healthCheck(): Promise<{ available: boolean; models?: string[]; error?: string }> {
    try {
      const models = await this.listModels();
      return {
        available: true,
        models: models.map((m) => m.name),
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return { available: false, error: msg };
    }
  }
}
