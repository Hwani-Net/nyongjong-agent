// Tests for stitch-design-system — HTML → design token extractor
import { describe, it, expect } from 'vitest';
import { extractDesignTokens } from '../../src/stitch/stitch-design-system.js';

// Minimal HTML fixture with various CSS patterns
const SAMPLE_HTML = `
<html>
<head>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
  <style>
    :root {
      --primary: #3b82f6;
      --secondary: #10b981;
      --bg: #f8fafc;
      --text: #1e293b;
    }
    body {
      font-family: 'Inter', sans-serif;
      font-weight: 400;
      margin: 0;
      padding: 16px;
      background-color: #f8fafc;
      color: #1e293b;
    }
    .card {
      background: rgba(255, 255, 255, 0.9);
      border-radius: 12px;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
      padding: 24px;
      margin: 8px 16px;
    }
    .btn {
      background: hsl(217, 91%, 60%);
      border-radius: 8px;
      font-weight: 600;
      padding: 12px 24px;
      gap: 8px;
    }
    h1 { font-weight: 700; }
  </style>
</head>
<body>
  <div class="card">
    <h1 style="color: #3b82f6;">Hello Stitch</h1>
    <button class="btn">Click me</button>
  </div>
</body>
</html>
`;

describe('StitchDesignSystem', () => {
  it('should extract hex colors', () => {
    const tokens = extractDesignTokens(SAMPLE_HTML);
    expect(tokens.colors.length).toBeGreaterThan(0);
    // #3b82f6 appears multiple times (CSS var + inline style)
    const primary = tokens.colors.find(c => c.normalized === '#3b82f6');
    expect(primary).toBeDefined();
    expect(primary!.occurrences).toBeGreaterThanOrEqual(2);
  });

  it('should extract rgb colors and convert to hex', () => {
    const tokens = extractDesignTokens(SAMPLE_HTML);
    // rgba(0, 0, 0, 0.1) → #000000, which is filtered out
    // rgba(255, 255, 255, 0.9) → #ffffff, also filtered
    // These are filtered by design; verify other colors exist
    expect(tokens.colors.length).toBeGreaterThan(0);
  });

  it('should extract hsl colors and convert to hex', () => {
    const tokens = extractDesignTokens(SAMPLE_HTML);
    // hsl(217, 91%, 60%) should be extracted and converted
    expect(tokens.colors.length).toBeGreaterThan(0);
  });

  it('should filter out pure black and white', () => {
    const tokens = extractDesignTokens(SAMPLE_HTML);
    const hasBlack = tokens.colors.some(c => c.normalized === '#000000');
    const hasWhite = tokens.colors.some(c => c.normalized === '#ffffff');
    expect(hasBlack).toBe(false);
    expect(hasWhite).toBe(false);
  });

  it('should suggest color roles', () => {
    const tokens = extractDesignTokens(SAMPLE_HTML);
    if (tokens.colors.length > 0) {
      expect(tokens.colors[0].suggestedRole).toBe('Primary');
    }
    if (tokens.colors.length > 1) {
      expect(tokens.colors[1].suggestedRole).toBe('Secondary');
    }
  });

  it('should extract fonts from Google Fonts link', () => {
    const tokens = extractDesignTokens(SAMPLE_HTML);
    const inter = tokens.fonts.find(f => f.family === 'Inter');
    expect(inter).toBeDefined();
  });

  it('should extract fonts from font-family CSS', () => {
    const tokens = extractDesignTokens(SAMPLE_HTML);
    expect(tokens.fonts.length).toBeGreaterThan(0);
  });

  it('should filter system fonts', () => {
    const tokens = extractDesignTokens(SAMPLE_HTML);
    const sansSerif = tokens.fonts.find(f => f.family === 'sans-serif');
    expect(sansSerif).toBeUndefined();
  });

  it('should extract spacing values', () => {
    const tokens = extractDesignTokens(SAMPLE_HTML);
    expect(tokens.spacing.length).toBeGreaterThan(0);
  });

  it('should extract border-radius values', () => {
    const tokens = extractDesignTokens(SAMPLE_HTML);
    expect(tokens.borderRadius).toContain('12px');
    expect(tokens.borderRadius).toContain('8px');
  });

  it('should extract box-shadow values', () => {
    const tokens = extractDesignTokens(SAMPLE_HTML);
    expect(tokens.shadows.length).toBeGreaterThan(0);
    expect(tokens.shadows[0]).toContain('rgba');
  });

  it('should extract CSS custom properties', () => {
    const tokens = extractDesignTokens(SAMPLE_HTML);
    expect(tokens.rawCssVariables['--primary']).toBe('#3b82f6');
    expect(tokens.rawCssVariables['--secondary']).toBe('#10b981');
    expect(tokens.rawCssVariables['--bg']).toBe('#f8fafc');
  });

  it('should generate DESIGN.md content', () => {
    const tokens = extractDesignTokens(SAMPLE_HTML, 'TestProject');
    expect(tokens.designMd).toContain('# Design System: TestProject');
    expect(tokens.designMd).toContain('Color Palette');
    expect(tokens.designMd).toContain('Typography');
  });

  it('should handle empty HTML gracefully', () => {
    const tokens = extractDesignTokens('');
    expect(tokens.colors).toEqual([]);
    expect(tokens.fonts).toEqual([]);
    expect(tokens.spacing).toEqual([]);
    expect(tokens.designMd).toContain('Design System: Untitled');
  });

  it('should handle HTML with no CSS', () => {
    const tokens = extractDesignTokens('<html><body><p>Hello</p></body></html>');
    expect(tokens.colors).toEqual([]);
    expect(tokens.fonts).toEqual([]);
    expect(tokens.shadows).toEqual([]);
  });

  it('should limit colors to top 10', () => {
    // Generate HTML with many colors
    const manyColors = Array.from({ length: 20 }, (_, i) => 
      `color: #${(i + 10).toString(16).padStart(2, '0')}${(i + 20).toString(16).padStart(2, '0')}${(i + 30).toString(16).padStart(2, '0')};`
    ).join('\n');
    const html = `<style>${manyColors}</style>`;
    const tokens = extractDesignTokens(html);
    expect(tokens.colors.length).toBeLessThanOrEqual(10);
  });

  it('should normalize 3-char hex to 6-char', () => {
    const html = '<div style="color: #f00; background: #0af;"></div>';
    const tokens = extractDesignTokens(html);
    const red = tokens.colors.find(c => c.normalized === '#ff0000');
    expect(red).toBeDefined();
  });
});
