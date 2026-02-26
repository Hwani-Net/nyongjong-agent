// Persona engine — context-aware automatic persona selection and consultation
import { PersonaLoader, type Persona, type PersonaCategory } from './persona-loader.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('persona-engine');

export type WorkflowStage = 'understand' | 'prototype' | 'validate' | 'evolve' | 'report';

export interface ConsultationRequest {
  /** Current workflow stage */
  stage: WorkflowStage;
  /** The topic/question to consult about */
  topic: string;
  /** Optional: specific persona IDs to include */
  includePersonas?: string[];
  /** Optional: specific categories to focus on */
  categories?: PersonaCategory[];
  /** Max number of personas to consult */
  maxPersonas?: number;
}

export interface PersonaConsultation {
  persona: Persona;
  /** The prompt to send to LLM for this persona's perspective */
  prompt: string;
}

export interface ConsultationPlan {
  stage: WorkflowStage;
  topic: string;
  consultations: PersonaConsultation[];
}

/**
 * Maps workflow stages to relevant persona categories.
 */
const STAGE_CATEGORY_MAP: Record<WorkflowStage, PersonaCategory[]> = {
  understand: ['customer', 'business', 'temporal'],
  prototype: ['engineer', 'customer'],
  validate: ['engineer', 'regulatory', 'customer'],
  evolve: ['philosopher', 'engineer', 'business'],
  report: ['business', 'customer'],
};

export class PersonaEngine {
  private loader: PersonaLoader;

  constructor(loader: PersonaLoader) {
    this.loader = loader;
    log.info('PersonaEngine initialized');
  }

  /**
   * Create a consultation plan — determines which personas to consult
   * and generates prompts for each.
   */
  async createConsultationPlan(request: ConsultationRequest): Promise<ConsultationPlan> {
    const { stage, topic, includePersonas, categories, maxPersonas = 3 } = request;
    log.info(`Creating consultation plan for stage: ${stage}`, { topic });

    let candidates: Persona[] = [];

    // 1. Load explicitly requested personas
    if (includePersonas && includePersonas.length > 0) {
      for (const id of includePersonas) {
        const persona = await this.loader.loadPersona(id);
        if (persona) candidates.push(persona);
      }
    }

    // 2. Find personas by stage activation
    const stagePersonas = await this.loader.findByStage(stage);
    candidates.push(...stagePersonas);

    // 3. Find personas by relevant categories
    const relevantCategories = categories || STAGE_CATEGORY_MAP[stage] || [];
    for (const category of relevantCategories) {
      const catPersonas = await this.loader.findByCategory(category);
      candidates.push(...catPersonas);
    }

    // Deduplicate by ID
    const uniqueMap = new Map<string, Persona>();
    for (const p of candidates) {
      uniqueMap.set(p.id, p);
    }
    candidates = Array.from(uniqueMap.values());

    // Sort by priority (critical > high > normal > low)
    const priorityOrder: Record<string, number> = { critical: 3, high: 2, normal: 1, low: 0 };
    candidates.sort((a, b) => (priorityOrder[b.priority] || 0) - (priorityOrder[a.priority] || 0));

    // Limit count
    const selected = candidates.slice(0, maxPersonas);

    // Generate consultation prompts
    const consultations: PersonaConsultation[] = selected.map((persona) => ({
      persona,
      prompt: this.buildPrompt(persona, stage, topic),
    }));

    log.info(`Consultation plan: ${consultations.length} personas selected`, {
      personas: selected.map((p) => p.id),
    });

    return { stage, topic, consultations };
  }

  /**
   * Build the LLM prompt for a persona consultation.
   */
  private buildPrompt(persona: Persona, stage: WorkflowStage, topic: string): string {
    return [
      `You are role-playing as "${persona.name}" (${persona.category} persona).`,
      '',
      '## Your Character',
      persona.content,
      '',
      `## Current Context`,
      `- Workflow stage: ${stage}`,
      `- Topic: ${topic}`,
      '',
      '## Your Task',
      `As "${persona.name}", provide your perspective on the following topic.`,
      'Stay in character. Be specific and actionable.',
      `Focus on what matters most from your unique viewpoint as a ${persona.category}.`,
      '',
      `## Topic`,
      topic,
    ].join('\n');
  }

  /**
   * Get a summary of available personas grouped by category.
   */
  async getPersonaSummary(): Promise<Record<string, string[]>> {
    const all = await this.loader.loadAll();
    const summary: Record<string, string[]> = {};

    for (const p of all) {
      if (!summary[p.category]) summary[p.category] = [];
      summary[p.category].push(`${p.id} (${p.name})`);
    }

    return summary;
  }
}
