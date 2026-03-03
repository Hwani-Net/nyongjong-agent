// Advisory: Ollama API client — powered by official 'ollama' npm package
// Replaces 169-line custom fetch implementation with battle-tested official SDK
import { Ollama } from 'ollama';
import { createLogger } from '../utils/logger.js';

const log = createLogger('ollama-client');

export interface OllamaGenerateOptions {
  model: string;
  prompt: string;
  temperature?: number;
  top_p?: number;
  num_predict?: number;
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
  baseUrl?: string;
  timeoutMs?: number;
}

/**
 * Ollama API client — thin wrapper around official 'ollama' npm package.
 * Maintains same interface as before for backward compatibility.
 */
export class OllamaClient {
  private ollama: Ollama;
  private timeoutMs: number;

  constructor(options: OllamaClientOptions = {}) {
    const host = options.baseUrl || process.env.OLLAMA_URL || 'http://localhost:11434';
    this.ollama = new Ollama({ host });
    this.timeoutMs = options.timeoutMs || 30000;
    log.info('OllamaClient initialized (official SDK)', { host });
  }

  async isAvailable(): Promise<boolean> {
    try {
      await this.ollama.list();
      return true;
    } catch {
      return false;
    }
  }

  async listModels(): Promise<OllamaModel[]> {
    try {
      const response = await this.ollama.list();
      return (response.models || []).map((m: { name: string; size?: number; modified_at?: Date | string }) => ({
        name: m.name,
        size: m.size ?? 0,
        modified_at: m.modified_at?.toString() ?? '',
      }));
    } catch (error) {
      log.warn('Failed to list Ollama models', error);
      return [];
    }
  }

  async generate(options: OllamaGenerateOptions): Promise<OllamaGenerateResult> {
    const start = Date.now();
    log.debug(`Generating with ${options.model}`, { promptLength: options.prompt.length });

    try {
      const response = await this.ollama.generate({
        model: options.model,
        prompt: options.prompt,
        system: options.system,
        stream: false,
        options: {
          temperature: options.temperature ?? 0.7,
          top_p: options.top_p ?? 0.9,
          num_predict: options.num_predict ?? 512,
        },
      });

      log.debug(`Generation complete (${Date.now() - start}ms)`);

      return {
        response: response.response,
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

  async healthCheck(): Promise<{ available: boolean; models?: string[]; error?: string }> {
    try {
      const models = await this.listModels();
      return { available: true, models: models.map(m => m.name) };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return { available: false, error: msg };
    }
  }
}
