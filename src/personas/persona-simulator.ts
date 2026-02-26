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
   */
  async runPlan(plan: ConsultationPlan): Promise<SimulationResult[]> {
    log.info(`Running consultation plan: ${plan.consultations.length} personas`);
    const results: SimulationResult[] = [];

    for (const consultation of plan.consultations) {
      const result = await this.simulate(
        consultation.persona.name,
        consultation.prompt,
      );
      results.push(result);

      // Brief pause between consultations to avoid overloading Ollama
      if (plan.consultations.indexOf(consultation) < plan.consultations.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }

    const successCount = results.filter((r) => r.success).length;
    log.info(`Plan complete: ${successCount}/${results.length} successful`);

    return results;
  }

  /**
   * Health check — delegates to OllamaClient.
   */
  async healthCheck(): Promise<{ available: boolean; models?: string[]; error?: string }> {
    return this.client.healthCheck();
  }
}
