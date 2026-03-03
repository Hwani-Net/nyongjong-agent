// Persona engine — context-aware automatic persona selection and consultation
import { PersonaLoader, type Persona, type PersonaCategory } from './persona-loader.js';
import type { PersonaTemplate } from './persona-templates.js';
import { findRoleCard, buildRoleCardPrompt, buildSituationPrompt } from './role-cards.js';
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
  /** Optional: domain-detected persona templates to auto-create if missing */
  suggestedPersonas?: PersonaTemplate[];
  /** Whether to auto-create suggested personas that don't exist yet */
  autoCreate?: boolean;
  /** Optional: task type for situation-specific Role Card rules */
  taskType?: string;
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
    const { stage, topic, includePersonas, categories, maxPersonas = 3, suggestedPersonas, autoCreate = true, taskType } = request;
    log.info(`Creating consultation plan for stage: ${stage}`, { topic });

    let candidates: Persona[] = [];

    // 0. Auto-create domain-specific personas if requested
    if (suggestedPersonas && suggestedPersonas.length > 0 && autoCreate) {
      for (const template of suggestedPersonas) {
        const persona = await this.ensurePersonaExists(template);
        if (persona) candidates.push(persona);
      }
    }

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

    // Generate consultation prompts (with Role Card injection)
    const consultations: PersonaConsultation[] = selected.map((persona) => ({
      persona,
      prompt: this.buildPrompt(persona, stage, topic, taskType),
    }));

    log.info(`Consultation plan: ${consultations.length} personas selected`, {
      personas: selected.map((p) => p.id),
    });

    return { stage, topic, consultations };
  }

  /**
   * Ensure a persona exists in the vault. If not, create it from a template.
   * Returns the loaded persona (existing or newly created).
   */
  private async ensurePersonaExists(template: PersonaTemplate): Promise<Persona | null> {
    const existing = await this.loader.loadPersona(template.id);
    if (existing) {
      log.debug(`Persona already exists: ${template.id}`);
      return existing;
    }

    log.info(`Auto-creating persona from template: ${template.id}`);
    await this.loader.createPersona({
      id: template.id,
      name: template.name,
      category: template.category,
      era: template.era,
      activatedAt: template.activatedAt,
      priority: template.priority,
      content: template.content,
    });

    return this.loader.loadPersona(template.id);
  }

  /**
   * Build the LLM prompt for a persona consultation.
   * Injects Role Card communication protocol when a matching card is found.
   */
  private buildPrompt(persona: Persona, stage: WorkflowStage, topic: string, taskType?: string): string {
    // Try to find a matching Role Card for structured communication
    const roleCard = findRoleCard(persona);
    const roleCardSection = roleCard ? buildRoleCardPrompt(roleCard) : '';
    const situationSection = roleCard ? buildSituationPrompt(roleCard, taskType) : '';

    return [
      `You are role-playing as "${persona.name}" (${persona.category} persona).`,
      '',
      '## Your Character',
      persona.content,
      '',
      // Inject Role Card communication protocol if available
      ...(roleCardSection ? [roleCardSection, ''] : []),
      ...(situationSection ? [situationSection, ''] : []),
      `## Current Context`,
      `- Workflow stage: ${stage}`,
      `- Topic: ${topic}`,
      ...(taskType ? [`- Task type: ${taskType}`] : []),
      '',
      '## Your Task',
      `As "${persona.name}", provide your perspective on the following topic.`,
      'Stay in character. Be specific and actionable.',
      `Focus on what matters most from your unique viewpoint as a ${persona.category}.`,
      ...(roleCard ? ['', `⚠️ 반드시 위의 "응답 형식"을 따르세요. 자유 형식 금지.`] : []),
      '',
      `## Topic`,
      topic,
      '',
      '## CRITICAL LANGUAGE RULE',
      '반드시 한국어로만 답변하세요. 영어, 중국어, 일본어 등 다른 언어로 전환하지 마세요.',
      '모든 답변은 처음부터 끝까지 100% 한국어여야 합니다.',
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
