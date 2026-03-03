// Persona simulator — runs persona consultations using Ollama via OllamaClient
import { OllamaClient } from '../advisory/ollama-client.js';
import { createLogger } from '../utils/logger.js';
import type { ConsultationPlan, PersonaConsultation } from './persona-engine.js';

const log = createLogger('persona-simulator');

export interface SimulationResult {
  persona: string;
  response: string;
  durationMs: number;
  model: string;
  success: boolean;
  error?: string;
}

export interface SimulatorOptions {
  /** Ollama server URL */
  ollamaUrl?: string;
  /** Default model for simulation */
  defaultModel?: string;
  /** Request timeout in ms */
  timeoutMs?: number;
}

/**
 * Persona Simulator — runs persona consultations using Ollama.
 *
 * Design doc Section 5.4:
 *   "이 작업은 정확도보다 다양성이 중요 → 로컬 LLM에 적합"
 *
 * Uses OllamaClient (advisory/ollama-client.ts) for the API connection,
 * as defined in the design doc Section 7 directory structure.
 */
export class PersonaSimulator {
  private client: OllamaClient;
  private defaultModel: string;

  constructor(options: SimulatorOptions = {}) {
    this.client = new OllamaClient({
      baseUrl: options.ollamaUrl,
      timeoutMs: options.timeoutMs || 30000,
    });
    this.defaultModel = options.defaultModel || 'gemma3:4b';
    log.info('PersonaSimulator initialized', { model: this.defaultModel });
  }

  /**
   * Simulate a single persona consultation.
   */
  async simulate(
    personaName: string,
    prompt: string,
    model?: string,
  ): Promise<SimulationResult> {
    const useModel = model || this.defaultModel;
    log.info(`Simulating persona: ${personaName} (model: ${useModel})`);

    const result = await this.client.generate({
      model: useModel,
      prompt,
      temperature: 0.8, // Higher for diversity (design doc: "정확도보다 다양성")
      top_p: 0.9,
      num_predict: 512,
    });

    return {
      persona: personaName,
      response: result.response,
      durationMs: result.durationMs,
      model: useModel,
      success: result.success,
      error: result.error,
    };
  }

  /**
   * Run a full consultation plan (multiple personas).
   * Auto-assigns different Ollama models to each persona for diverse perspectives.
   */
  async runPlan(plan: ConsultationPlan): Promise<SimulationResult[]> {
    log.info(`Running consultation plan: ${plan.consultations.length} personas`);

    // Auto-detect available models for diversity
    const availableModels = await this.getAvailableModels();
    log.info(`Available models for diversity: ${availableModels.join(', ')}`);

    const results: SimulationResult[] = [];

    for (let i = 0; i < plan.consultations.length; i++) {
      const consultation = plan.consultations[i];
      // Round-robin: each persona gets a different model
      const assignedModel = availableModels[i % availableModels.length];
      log.info(`Persona "${consultation.persona.name}" assigned model: ${assignedModel}`);

      let result = await this.simulate(
        consultation.persona.name,
        consultation.prompt,
        assignedModel,
      );

      // Issue fix: detect empty/too-short responses and retry with a different model
      const isEmptyOrUseless = !result.success || !result.response || result.response.trim().length < 20;
      if (isEmptyOrUseless) {
        // Try next model in the list, then default as last resort
        const retryModels = [
          availableModels[(i + 1) % availableModels.length],
          this.defaultModel,
        ].filter(m => m !== assignedModel);

        for (const retryModel of retryModels) {
          log.warn(`Empty/failed response from ${assignedModel} for "${consultation.persona.name}", retrying with ${retryModel}`);
          result = await this.simulate(
            consultation.persona.name,
            consultation.prompt,
            retryModel,
          );
          if (result.success && result.response && result.response.trim().length >= 20) break;
        }
      }

      results.push(result);

      // Brief pause between consultations to avoid overloading Ollama
      if (i < plan.consultations.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }

    const successCount = results.filter((r) => r.success).length;
    log.info(`Plan complete: ${successCount}/${results.length} successful`);

    return results;
  }

  /**
   * Get available models for diverse persona assignment.
   * Prefers larger/more capable models, falls back to defaultModel.
   */
  private async getAvailableModels(): Promise<string[]> {
    try {
      const health = await this.client.healthCheck();
      if (health.available && health.models && health.models.length > 0) {
        // Sort by preference: larger models first for better quality
        const preferenceOrder = [
          'qwen2.5-coder:14b',   // 14B — best for technical/engineering personas
          'deepseek-r1:8b',      // 8B — strong reasoning for business/strategy
          'qwen2.5:7b',          // 7B — good general purpose for user/PM personas
          'gemma3:4b',           // 4B — fast, good for quick persona responses
          'llama3.2:3b',         // 3B — lightweight, diverse perspective
        ];
        const sorted = health.models
          .filter((m: string) => preferenceOrder.includes(m))
          .sort((a: string, b: string) => preferenceOrder.indexOf(a) - preferenceOrder.indexOf(b));

        return sorted.length > 0 ? sorted : [this.defaultModel];
      }
    } catch (e) {
      log.warn('Failed to detect Ollama models, using default', { error: String(e) });
    }
    return [this.defaultModel];
  }

  /**
   * Health check — delegates to OllamaClient.
   */
  async healthCheck(): Promise<{ available: boolean; models?: string[]; error?: string }> {
    return this.client.healthCheck();
  }
}
