// Persona simulator — runs persona consultations via Ollama (local LLM)
import { createLogger } from '../utils/logger.js';
import type { PersonaConsultation, ConsultationPlan } from './persona-engine.js';

const log = createLogger('persona-simulator');

export interface SimulationResult {
  personaId: string;
  personaName: string;
  response: string;
  model: string;
  durationMs: number;
}

export interface SimulatorOptions {
  /** Ollama API base URL */
  ollamaUrl: string;
  /** Default model for persona simulation */
  defaultModel?: string;
  /** Request timeout in ms */
  timeoutMs?: number;
}

export class PersonaSimulator {
  private ollamaUrl: string;
  private defaultModel: string;
  private timeoutMs: number;

  constructor(options: SimulatorOptions) {
    this.ollamaUrl = options.ollamaUrl.replace(/\/$/, '');
    this.defaultModel = options.defaultModel || 'llama3.2';
    this.timeoutMs = options.timeoutMs || 30000;
    log.info('PersonaSimulator initialized', {
      ollamaUrl: this.ollamaUrl,
      model: this.defaultModel,
    });
  }

  /**
   * Run a single persona consultation via Ollama.
   */
  async simulate(consultation: PersonaConsultation, model?: string): Promise<SimulationResult> {
    const useModel = model || this.defaultModel;
    const start = Date.now();

    log.debug(`Simulating persona: ${consultation.persona.id} with model: ${useModel}`);

    try {
      const response = await this.callOllama(consultation.prompt, useModel);
      const durationMs = Date.now() - start;

      log.info(`Persona simulation complete: ${consultation.persona.id} (${durationMs}ms)`);

      return {
        personaId: consultation.persona.id,
        personaName: consultation.persona.name,
        response,
        model: useModel,
        durationMs,
      };
    } catch (error) {
      const durationMs = Date.now() - start;
      log.error(`Persona simulation failed: ${consultation.persona.id}`, error);

      return {
        personaId: consultation.persona.id,
        personaName: consultation.persona.name,
        response: `[Simulation failed: ${error instanceof Error ? error.message : String(error)}]`,
        model: useModel,
        durationMs,
      };
    }
  }

  /**
   * Run all consultations in a plan (sequentially to respect local LLM resources).
   */
  async runPlan(plan: ConsultationPlan, model?: string): Promise<SimulationResult[]> {
    log.info(`Running consultation plan: ${plan.consultations.length} personas for "${plan.topic}"`);

    const results: SimulationResult[] = [];

    for (const consultation of plan.consultations) {
      const result = await this.simulate(consultation, model);
      results.push(result);
    }

    const totalDuration = results.reduce((sum, r) => sum + r.durationMs, 0);
    log.info(`Consultation plan complete: ${results.length} results in ${totalDuration}ms`);

    return results;
  }

  /**
   * Check if Ollama is available and responsive.
   */
  async healthCheck(): Promise<{ available: boolean; models?: string[]; error?: string }> {
    try {
      const response = await fetch(`${this.ollamaUrl}/api/tags`, {
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) {
        return { available: false, error: `HTTP ${response.status}` };
      }

      const data = (await response.json()) as { models?: Array<{ name: string }> };
      const models = data.models?.map((m) => m.name) || [];

      log.info(`Ollama health check OK: ${models.length} models available`);
      return { available: true, models };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      log.warn(`Ollama health check failed: ${msg}`);
      return { available: false, error: msg };
    }
  }

  /**
   * Call Ollama's generate API.
   */
  private async callOllama(prompt: string, model: string): Promise<string> {
    const response = await fetch(`${this.ollamaUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt,
        stream: false,
        options: {
          temperature: 0.8,
          top_p: 0.9,
          num_predict: 512,
        },
      }),
      signal: AbortSignal.timeout(this.timeoutMs),
    });

    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as { response: string };
    return data.response;
  }
}
