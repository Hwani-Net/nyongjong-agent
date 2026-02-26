// Tests for ModelSelector — model recommendation engine
import { describe, it, expect } from 'vitest';
import { recommendModel, listModels } from '../../src/core/model-selector.js';

describe('ModelSelector', () => {
  it('should recommend high-tier model for critical architecture tasks', () => {
    const result = recommendModel({
      taskType: 'architecture',
      complexity: 'critical',
    });
    // Gemini 3.1 Pro High and Claude Opus tie on score; cheaper wins tie-break
    expect(result.model).toBe('gemini-3.1-pro-high');
    expect(result.costTier).toBe(3);
  });

  it('should recommend Claude Opus for critical strategy tasks', () => {
    const result = recommendModel({
      taskType: 'strategy',
      complexity: 'critical',
    });
    expect(result.model).toBe('claude-opus-4.6-thinking');
    expect(result.costTier).toBe(4);
  });

  it('should recommend Gemini Flash for simple tasks', () => {
    const result = recommendModel({
      taskType: 'simple',
      complexity: 'low',
    });
    expect(result.model).toBe('gemini-3-flash');
    expect(result.costTier).toBe(1);
  });

  it('should recommend Claude Sonnet for high-complexity debugging', () => {
    const result = recommendModel({
      taskType: 'debugging',
      complexity: 'high',
    });
    expect(result.model).toBe('claude-sonnet-4.6-thinking');
  });

  it('should prefer cheaper models when budget constrained', () => {
    const expensive = recommendModel({
      taskType: 'implementation',
      complexity: 'high',
    });
    const cheap = recommendModel({
      taskType: 'implementation',
      complexity: 'high',
      budgetConstrained: true,
    });
    expect(cheap.costTier).toBeLessThanOrEqual(expensive.costTier);
  });

  it('should recommend documentation-strength model for docs', () => {
    const result = recommendModel({
      taskType: 'documentation',
      complexity: 'medium',
    });
    // Should be either Gemini Flash or GPT-OSS (both have 'documentation' strength)
    expect(['gemini-3-flash', 'gpt-oss-120b-medium']).toContain(result.model);
  });

  it('should always return a valid recommendation', () => {
    const result = recommendModel({
      taskType: 'strategy',
      complexity: 'critical',
    });
    expect(result.model).toBeDefined();
    expect(result.displayName).toBeDefined();
    expect(result.reason).toBeDefined();
    expect(result.costTier).toBeGreaterThanOrEqual(1);
    expect(result.costTier).toBeLessThanOrEqual(4);
  });

  it('should list all 6 models', () => {
    const models = listModels();
    expect(models).toHaveLength(6);
    expect(models.every((m) => m.id && m.displayName && m.costTier)).toBe(true);
  });
});
