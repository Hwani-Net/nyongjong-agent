// Model recommendation engine — suggests optimal AI model based on task characteristics
import { createLogger } from '../utils/logger.js';

const log = createLogger('model-selector');

/**
 * Supported Antigravity models (from global rules).
 */
export type ModelId =
  | 'gemini-3.1-pro-high'
  | 'gemini-3.1-pro-low'
  | 'gemini-3-flash'
  | 'claude-sonnet-4.6-thinking'
  | 'claude-opus-4.6-thinking'
  | 'gpt-oss-120b-medium';

export type TaskType =
  | 'architecture'
  | 'implementation'
  | 'debugging'
  | 'refactoring'
  | 'simple'
  | 'documentation'
  | 'strategy';

export type Complexity = 'low' | 'medium' | 'high' | 'critical';

export interface ModelRecommendation {
  model: ModelId;
  displayName: string;
  reason: string;
  costTier: number; // 1-4 (💰)
}

interface SelectionInput {
  taskType: TaskType;
  complexity: Complexity;
  /** If true, prefer cheaper models */
  budgetConstrained?: boolean;
}

/**
 * Model capability matrix aligned with architecture doc Section 2.
 */
const MODEL_PROFILES: Record<ModelId, {
  displayName: string;
  costTier: number;
  strengths: TaskType[];
  complexityRange: Complexity[];
}> = {
  'gemini-3.1-pro-high': {
    displayName: 'Gemini 3.1 Pro (High)',
    costTier: 3,
    strengths: ['architecture', 'implementation', 'refactoring'],
    complexityRange: ['high', 'critical'],
  },
  'gemini-3.1-pro-low': {
    displayName: 'Gemini 3.1 Pro (Low)',
    costTier: 2,
    strengths: ['implementation', 'refactoring'],
    complexityRange: ['medium', 'high'],
  },
  'gemini-3-flash': {
    displayName: 'Gemini 3 Flash',
    costTier: 1,
    strengths: ['simple', 'documentation'],
    complexityRange: ['low', 'medium'],
  },
  'claude-sonnet-4.6-thinking': {
    displayName: 'Claude Sonnet 4.6 (Thinking)',
    costTier: 3,
    strengths: ['debugging', 'architecture'],
    complexityRange: ['high', 'critical'],
  },
  'claude-opus-4.6-thinking': {
    displayName: 'Claude Opus 4.6 (Thinking)',
    costTier: 4,
    strengths: ['architecture', 'strategy'],
    complexityRange: ['critical'],
  },
  'gpt-oss-120b-medium': {
    displayName: 'GPT-OSS 120B (Medium)',
    costTier: 2,
    strengths: ['implementation', 'documentation'],
    complexityRange: ['medium', 'high'],
  },
};

const COMPLEXITY_ORDER: Record<Complexity, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
};

/**
 * Recommend the optimal model for a given task.
 */
export function recommendModel(input: SelectionInput): ModelRecommendation {
  const { taskType, complexity, budgetConstrained = false } = input;

  log.debug('Selecting model', { taskType, complexity, budgetConstrained });

  // Score each model
  const scored = Object.entries(MODEL_PROFILES).map(([modelId, profile]) => {
    let score = 0;

    // Task type match (+3)
    if (profile.strengths.includes(taskType)) score += 3;

    // Complexity range match (+2)
    if (profile.complexityRange.includes(complexity)) score += 2;

    // Budget constraint penalty — stronger penalty to force downgrade
    if (budgetConstrained) score -= Math.ceil(profile.costTier * 1.5);

    // Prefer not to over-provision: penalize if model is too powerful for the task
    const complexityNum = COMPLEXITY_ORDER[complexity];
    const minComplexity = COMPLEXITY_ORDER[profile.complexityRange[0]];
    if (minComplexity > complexityNum) score -= 1;

    return { modelId: modelId as ModelId, profile, score };
  });

  // Sort by score (descending), then by cost tier (ascending for tie-breaking)
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.profile.costTier - b.profile.costTier;
  });

  const best = scored[0];

  const recommendation: ModelRecommendation = {
    model: best.modelId,
    displayName: best.profile.displayName,
    reason: `Best match for ${taskType} (${complexity} complexity)${budgetConstrained ? ', budget-optimized' : ''}`,
    costTier: best.profile.costTier,
  };

  log.info(`Recommended: ${recommendation.displayName}`, { reason: recommendation.reason });
  return recommendation;
}

/**
 * Get all available models.
 */
export function listModels(): Array<{ id: ModelId; displayName: string; costTier: number }> {
  return Object.entries(MODEL_PROFILES).map(([id, profile]) => ({
    id: id as ModelId,
    displayName: profile.displayName,
    costTier: profile.costTier,
  }));
}
