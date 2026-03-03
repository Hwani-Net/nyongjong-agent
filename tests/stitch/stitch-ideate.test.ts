// Tests for stitch-ideate — design comparison plan generator
import { describe, it, expect } from 'vitest';
import { generateIdeatePlan } from '../../src/stitch/stitch-ideate.js';

describe('StitchIdeate', () => {
  it('should generate default 3 variants', () => {
    const result = generateIdeatePlan('fishing log mobile app');
    expect(result.screens).toHaveLength(3);
    expect(result.projectTitle).toContain('Ideate:');
    expect(result.estimatedSeconds).toBe(90); // 3 * 30s
  });

  it('should respect variantCount option', () => {
    const result = generateIdeatePlan('dashboard', { variantCount: 5 });
    expect(result.screens).toHaveLength(5);
    expect(result.estimatedSeconds).toBe(150);
  });

  it('should cap variants at 5', () => {
    const result = generateIdeatePlan('app', { variantCount: 10 });
    expect(result.screens).toHaveLength(5);
  });

  it('should use GEMINI_3_PRO for first variant', () => {
    const result = generateIdeatePlan('test app');
    expect(result.screens[0].modelId).toBe('GEMINI_3_PRO');
    expect(result.screens[1].modelId).toBe('GEMINI_3_FLASH');
  });

  it('should default to DESKTOP device type', () => {
    const result = generateIdeatePlan('app');
    for (const screen of result.screens) {
      expect(screen.deviceType).toBe('DESKTOP');
    }
  });

  it('should apply MOBILE device type', () => {
    const result = generateIdeatePlan('app', { deviceType: 'MOBILE' });
    for (const screen of result.screens) {
      expect(screen.deviceType).toBe('MOBILE');
      expect(screen.prompt).toContain('Mobile-first');
    }
  });

  it('should use custom project title', () => {
    const result = generateIdeatePlan('app', { projectTitle: 'My Custom Title' });
    expect(result.projectTitle).toBe('My Custom Title');
  });

  it('should apply custom style keywords', () => {
    const keywords = ['neon', 'futuristic', 'dark'];
    const result = generateIdeatePlan('app', { styleKeywords: keywords });
    for (const screen of result.screens) {
      expect(screen.prompt).toContain('neon, futuristic, dark');
    }
  });

  it('should generate workflow with mcp_StitchMCP references', () => {
    const result = generateIdeatePlan('app');
    expect(result.workflow).toContain('mcp_StitchMCP_create_project');
    expect(result.workflow).toContain('mcp_StitchMCP_generate_screen_from_text');
    expect(result.workflow).toContain('Stitch Ideate 실행 계획');
  });

  it('should include diverse focus areas', () => {
    const result = generateIdeatePlan('app', { variantCount: 5 });
    const focuses = result.screens.map(s => s.focus);
    expect(focuses).toContain('Minimalist & Clean');
    expect(focuses).toContain('Bold & Vibrant');
    expect(focuses).toContain('Dark & Premium');
    expect(focuses).toContain('Warm & Friendly');
    expect(focuses).toContain('Editorial & Elegant');
  });

  it('should handle empty string input without crashing', () => {
    const result = generateIdeatePlan('');
    expect(result.screens).toHaveLength(3);
    expect(result.projectTitle).toBe('Ideate: ');
  });

  it('should truncate long baseIdea in title to 40 chars', () => {
    const longIdea = 'A'.repeat(100);
    const result = generateIdeatePlan(longIdea);
    expect(result.projectTitle).toBe(`Ideate: ${'A'.repeat(40)}`);
  });
});
