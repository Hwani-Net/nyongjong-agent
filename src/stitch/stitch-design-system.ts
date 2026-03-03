// Stitch Design System Extractor — parse HTML to extract design tokens
// Input: raw HTML from Stitch get_screen
// Output: structured design tokens for DESIGN.md generation

export interface DesignTokens {
  colors: ColorToken[];
  fonts: FontToken[];
  spacing: string[];
  borderRadius: string[];
  shadows: string[];
  rawCssVariables: Record<string, string>;
  designMd: string; // Pre-formatted DESIGN.md content
}

export interface ColorToken {
  value: string;     // hex, rgb, or hsl
  normalized: string; // always hex
  occurrences: number;
  suggestedRole: string; // e.g., "Primary", "Background", "Accent"
}

export interface FontToken {
  family: string;
  weights: string[];
  usedIn: string; // e.g., "headings", "body", "buttons"
}

/**
 * Extract design tokens from Stitch-generated HTML.
 */
export function extractDesignTokens(html: string, projectName: string = 'Untitled'): DesignTokens {
  // ── Extract Colors ──
  const colorMap = new Map<string, number>();

  // 1. Extract from tailwind.config if exists
  const twConfigRegex = /colors:\s*{([\s\S]*?)}/g;
  let twMatch;
  while ((twMatch = twConfigRegex.exec(html)) !== null) {
    const colorBlock = twMatch[1];
    const hexInBlock = /"([#0-9a-fA-F]+)"|'([#0-9a-fA-F]+)'/g;
    let hexMatch;
    while ((hexMatch = hexInBlock.exec(colorBlock)) !== null) {
      const hex = normalizeHex(hexMatch[1] || hexMatch[2]);
      if (hex) colorMap.set(hex, (colorMap.get(hex) || 0) + 10); // Weight config colors more
    }
  }

  // 2. Match hex colors in HTML (style tags or attributes)
  const hexRegex = /#([0-9a-fA-F]{3,8})\b/g;
  let match;
  while ((match = hexRegex.exec(html)) !== null) {
    const hex = normalizeHex(match[0]);
    colorMap.set(hex, (colorMap.get(hex) || 0) + 1);
  }

  // Match rgb/rgba colors
  const rgbRegex = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*[\d.]+)?\s*\)/g;
  while ((match = rgbRegex.exec(html)) !== null) {
    const hex = rgbToHex(parseInt(match[1]), parseInt(match[2]), parseInt(match[3]));
    colorMap.set(hex, (colorMap.get(hex) || 0) + 1);
  }

  // Match hsl/hsla colors
  const hslRegex = /hsla?\(\s*(\d+)\s*,?\s*([\d.]+)%?\s*,?\s*([\d.]+)%?(?:\s*[/,]\s*[\d.]+)?\s*\)/g;
  while ((match = hslRegex.exec(html)) !== null) {
    const hex = hslToHex(parseInt(match[1]), parseFloat(match[2]), parseFloat(match[3]));
    colorMap.set(hex, (colorMap.get(hex) || 0) + 1);
  }

  // Filter out pure black/white/transparent, sort by frequency
  const filteredColors = [...colorMap.entries()]
    .filter(([hex]) => !['#000000', '#ffffff', '#fff', '#000'].includes(hex.toLowerCase()))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10); // Top 10 colors

  const colors: ColorToken[] = filteredColors.map(([hex, count], i) => ({
    value: hex,
    normalized: hex,
    occurrences: count,
    suggestedRole: suggestColorRole(hex, i),
  }));

  // ── Extract Fonts ──
  const fontMap = new Map<string, Set<string>>();
  
  // Try to find Manrope, Inter, etc in Google Fonts links or tailwind config
  const fontNameRegex = /family=([a-zA-Z+]+)|fontFamily:\s*{\s*\w+:\s*\[\s*["']([^"']+)["']/g;
  let fMatch;
  while ((fMatch = fontNameRegex.exec(html)) !== null) {
    const family = (fMatch[1] || fMatch[2]).replace(/\+/g, ' ');
    if (!isSystemFont(family)) {
      if (!fontMap.has(family)) fontMap.set(family, new Set());
    }
  }

  // Existing style attribute check
  const fontFamilyRegex = /font-family:\s*['"]?([^'";,}]+)/gi;
  while ((match = fontFamilyRegex.exec(html)) !== null) {
    const family = match[1].trim().replace(/['"]/g, '');
    if (!isSystemFont(family)) {
      if (!fontMap.has(family)) fontMap.set(family, new Set());
    }
  }

  // Extract font weights
  const fontWeightRegex = /font-weight:\s*(\d+|bold|normal|light|medium|semibold)/gi;
  while ((match = fontWeightRegex.exec(html)) !== null) {
    // Associate with the most recent font family (best effort)
    for (const [, weights] of fontMap) {
      weights.add(match[1]);
    }
  }

  const fonts: FontToken[] = [...fontMap.entries()].map(([family, weights]) => ({
    family,
    weights: [...weights],
    usedIn: 'general',
  }));

  // ── Extract Spacing ──
  const spacingSet = new Set<string>();
  const spacingRegex = /(?:margin|padding|gap):\s*([\d.]+(?:px|rem|em)(?:\s+[\d.]+(?:px|rem|em))*)/gi;
  while ((match = spacingRegex.exec(html)) !== null) {
    spacingSet.add(match[1]);
  }
  const spacing = [...spacingSet].slice(0, 8);

  // ── Extract Border Radius ──
  const radiusSet = new Set<string>();
  const radiusRegex = /border-radius:\s*([\d.]+(?:px|rem|%)+)/gi;
  while ((match = radiusRegex.exec(html)) !== null) {
    radiusSet.add(match[1]);
  }
  const borderRadius = [...radiusSet];

  // ── Extract Shadows ──
  const shadowSet = new Set<string>();
  const shadowRegex = /box-shadow:\s*([^;]+)/gi;
  while ((match = shadowRegex.exec(html)) !== null) {
    shadowSet.add(match[1].trim());
  }
  const shadows = [...shadowSet].slice(0, 5);

  // ── Extract CSS Variables ──
  const cssVars: Record<string, string> = {};
  const varRegex = /--([\w-]+):\s*([^;]+)/g;
  while ((match = varRegex.exec(html)) !== null) {
    cssVars[`--${match[1]}`] = match[2].trim();
  }

  // ── Generate DESIGN.md ──
  const designMd = generateDesignMd(projectName, colors, fonts, spacing, borderRadius, shadows, cssVars);

  return { colors, fonts, spacing, borderRadius, shadows, rawCssVariables: cssVars, designMd };
}

// ── Helpers ──

function normalizeHex(hex: string): string {
  hex = hex.replace('#', '');
  if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
  return `#${hex.toLowerCase()}`;
}

function rgbToHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map(v => v.toString(16).padStart(2, '0')).join('')}`;
}

function hslToHex(h: number, s: number, l: number): string {
  s /= 100; l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

function suggestColorRole(hex: string, index: number): string {
  const roles = ['Primary', 'Secondary', 'Accent', 'Background Alt', 'Text Secondary',
    'Border', 'Success', 'Warning', 'Danger', 'Info'];
  return roles[index] || `Color ${index + 1}`;
}

function isSystemFont(family: string): boolean {
  const systemFonts = ['sans-serif', 'serif', 'monospace', 'cursive', 'fantasy',
    'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Arial', 'Helvetica'];
  return systemFonts.some(sf => family.toLowerCase().includes(sf.toLowerCase()));
}

function generateDesignMd(
  projectName: string,
  colors: ColorToken[],
  fonts: FontToken[],
  spacing: string[],
  borderRadius: string[],
  shadows: string[],
  cssVars: Record<string, string>,
): string {
  const lines: string[] = [];
  lines.push(`# Design System: ${projectName}`);
  lines.push(`**Auto-extracted by stitch_design_system_extract**`);
  lines.push('');

  // Colors
  lines.push('## 1. Color Palette & Roles');
  lines.push('| 색상 | Hex | 역할 | 빈도 |');
  lines.push('|------|-----|------|------|');
  for (const c of colors) {
    lines.push(`| 🎨 | \`${c.normalized}\` | ${c.suggestedRole} | ${c.occurrences}회 |`);
  }
  lines.push('');

  // Fonts
  lines.push('## 2. Typography');
  if (fonts.length > 0) {
    for (const f of fonts) {
      lines.push(`- **${f.family}**: weights [${f.weights.join(', ')}]`);
    }
  } else {
    lines.push('- (시스템 폰트 사용)');
  }
  lines.push('');

  // Spacing
  if (spacing.length > 0) {
    lines.push('## 3. Spacing');
    lines.push(`주요 간격: ${spacing.join(', ')}`);
    lines.push('');
  }

  // Border Radius
  if (borderRadius.length > 0) {
    lines.push('## 4. Border Radius');
    lines.push(`값: ${borderRadius.join(', ')}`);
    lines.push('');
  }

  // Shadows
  if (shadows.length > 0) {
    lines.push('## 5. Shadows');
    for (const s of shadows) {
      lines.push(`- \`${s}\``);
    }
    lines.push('');
  }

  // CSS Variables
  const varEntries = Object.entries(cssVars);
  if (varEntries.length > 0) {
    lines.push('## 6. CSS Variables (Raw)');
    lines.push('```css');
    for (const [key, val] of varEntries.slice(0, 20)) {
      lines.push(`${key}: ${val};`);
    }
    lines.push('```');
  }

  return lines.join('\n');
}
