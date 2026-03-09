// Stitch Design Audit — ADR-008 "Design Dictatorship Protocol" compliance checker
// Compares Stitch-generated HTML design tokens against implementation code (TSX/CSS)
// to detect violations of the 3 core rules:
//   Rule 1: No Approximation (어림짐작 금지)
//   Rule 2: DOM Preservation (DOM 구조 신성불가침)
//   Rule 3: No Effect Omission (시각 효과 보존)

export interface AuditResult {
  verdict: 'PASS' | 'WARN' | 'FAIL';
  score: number;          // 0-100
  violations: Violation[];
  summary: string;        // Markdown report
}

export interface Violation {
  rule: 'NO_APPROXIMATION' | 'DOM_PRESERVATION' | 'EFFECT_PRESERVATION';
  severity: 'error' | 'warning';
  message: string;
  stitchValue?: string;   // Original Stitch value
  implValue?: string;     // Implementation value found
}

// ── Tailwind v4 standard mappings ─────────────────────────────────────────────
// Only includes values where approximation is common.
// If Stitch uses a value NOT in this table → arbitrary value required.

const TW_BORDER_RADIUS: Record<string, string> = {
  'none': '0px',
  'sm': '2px',       // rounded-sm = 2px (v4)
  'DEFAULT': '4px',  // rounded = 4px
  'md': '6px',       // rounded-md = 6px
  'lg': '8px',
  'xl': '12px',
  '2xl': '16px',
  '3xl': '24px',
  'full': '9999px',
};

const TW_COLORS: Record<string, string> = {
  // Common blue palette
  'blue-50': '#eff6ff', 'blue-100': '#dbeafe', 'blue-200': '#bfdbfe',
  'blue-300': '#93c5fd', 'blue-400': '#60a5fa', 'blue-500': '#3b82f6',
  'blue-600': '#2563eb', 'blue-700': '#1d4ed8', 'blue-800': '#1e40af',
  'blue-900': '#1e3a8a',
  // Common gray palette
  'gray-50': '#f9fafb', 'gray-100': '#f3f4f6', 'gray-200': '#e5e7eb',
  'gray-300': '#d1d5db', 'gray-400': '#9ca3af', 'gray-500': '#6b7280',
  'gray-600': '#4b5563', 'gray-700': '#374151', 'gray-800': '#1f2937',
  'gray-900': '#111827',
  // Common green palette
  'green-500': '#22c55e', 'green-600': '#16a34a',
  // Common red palette
  'red-500': '#ef4444', 'red-600': '#dc2626',
  // Slate
  'slate-50': '#f8fafc', 'slate-100': '#f1f5f9', 'slate-200': '#e2e8f0',
  'slate-300': '#cbd5e1', 'slate-700': '#334155', 'slate-800': '#1e293b',
  'slate-900': '#0f172a',
};

// Reverse lookup: hex → tw class name
const HEX_TO_TW_COLOR = new Map<string, string>();
for (const [name, hex] of Object.entries(TW_COLORS)) {
  HEX_TO_TW_COLOR.set(hex.toLowerCase(), name);
}

// Visual effects that must be preserved (Rule 3)
const VISUAL_EFFECTS = [
  { css: 'backdrop-filter', tailwind: ['backdrop-blur', 'backdrop-filter'] },
  { css: 'linear-gradient', tailwind: ['bg-gradient', 'from-', 'to-', 'via-', 'linear-gradient'] },
  { css: 'radial-gradient', tailwind: ['bg-radial', 'radial-gradient'] },
  { css: 'box-shadow', tailwind: ['shadow', 'drop-shadow', 'box-shadow'] },
  { css: 'filter:', tailwind: ['filter', 'blur-', 'brightness-', 'contrast-'] },
  { css: 'opacity:', tailwind: ['opacity-'] },
  { css: 'transform:', tailwind: ['transform', 'rotate-', 'scale-', 'translate-'] },
  { css: 'transition:', tailwind: ['transition', 'duration-', 'ease-'] },
  { css: 'animation:', tailwind: ['animate-'] },
];

// ── Core audit function ───────────────────────────────────────────────────────

/**
 * Audit implementation code against Stitch HTML for ADR-008 compliance.
 *
 * @param stitchHtml - Raw HTML from Stitch get_screen
 * @param implCode   - Implementation code (TSX, CSS, or combined)
 * @returns AuditResult with verdict, score, and violations
 */
export function auditDesignCompliance(stitchHtml: string, implCode: string): AuditResult {
  const violations: Violation[] = [];

  if (!stitchHtml.trim() || !implCode.trim()) {
    return {
      verdict: 'PASS',
      score: 100,
      violations: [],
      summary: '입력이 비어있어 검사할 항목이 없습니다.',
    };
  }

  // ── Rule 1: No Approximation ────────────────────────────────────────────
  checkBorderRadiusApproximation(stitchHtml, implCode, violations);
  checkColorApproximation(stitchHtml, implCode, violations);

  // ── Rule 2: DOM Preservation ────────────────────────────────────────────
  checkDomPreservation(stitchHtml, implCode, violations);

  // ── Rule 3: Effect Preservation ─────────────────────────────────────────
  checkEffectPreservation(stitchHtml, implCode, violations);

  // ── Score calculation ───────────────────────────────────────────────────
  const errorCount = violations.filter(v => v.severity === 'error').length;
  const warningCount = violations.filter(v => v.severity === 'warning').length;
  const score = Math.max(0, 100 - (errorCount * 15) - (warningCount * 5));

  let verdict: AuditResult['verdict'];
  if (score >= 80) verdict = 'PASS';
  else if (score >= 50) verdict = 'WARN';
  else verdict = 'FAIL';

  const summary = generateAuditSummary(verdict, score, violations);

  return { verdict, score, violations, summary };
}

// ── Rule 1 checks ─────────────────────────────────────────────────────────────

function checkBorderRadiusApproximation(
  stitchHtml: string, implCode: string, violations: Violation[],
): void {
  // Extract all border-radius values from Stitch HTML
  const radiusRegex = /border-radius:\s*([\d.]+)(px|rem|%)/gi;
  let match;
  while ((match = radiusRegex.exec(stitchHtml)) !== null) {
    const value = `${match[1]}${match[2]}`;

    // Check if this exact value maps to a standard TW class
    const twStandard = Object.entries(TW_BORDER_RADIUS)
      .find(([, px]) => px === value);

    if (twStandard) {
      // This value HAS a standard TW equivalent — using `rounded-${twStandard[0]}` is fine
      continue;
    }

    // This value does NOT have a standard TW equivalent → must use arbitrary
    // Check if impl uses a standard rounded-* class instead of rounded-[exact]
    // Exclude arbitrary value patterns like rounded-[14px]
    const standardRoundedRegex = /rounded(?:-(sm|md|lg|xl|2xl|3xl|full))?(?![[\d-])\b/g;
    let implMatch;
    while ((implMatch = standardRoundedRegex.exec(implCode)) !== null) {
      const twClass = implMatch[0];
      const twKey = implMatch[1] || 'DEFAULT';
      const twValue = TW_BORDER_RADIUS[twKey];

      if (twValue && twValue !== value) {
        violations.push({
          rule: 'NO_APPROXIMATION',
          severity: 'error',
          message: `border-radius 근사화: Stitch에서 ${value}인데 구현에서 ${twClass}(=${twValue}) 사용. rounded-[${value}]를 써야 합니다.`,
          stitchValue: value,
          implValue: twClass,
        });
      }
    }

    // Check if arbitrary value is used correctly
    const arbitraryRegex = new RegExp(`rounded-\\[${value.replace('.', '\\.')}\\]`);
    if (arbitraryRegex.test(implCode)) {
      // Correct — arbitrary value matches
      continue;
    }
  }
}

function checkColorApproximation(
  stitchHtml: string, implCode: string, violations: Violation[],
): void {
  // Extract hex colors from Stitch HTML
  const hexRegex = /#([0-9a-fA-F]{6})\b/g;
  let match;
  const stitchColors = new Set<string>();

  while ((match = hexRegex.exec(stitchHtml)) !== null) {
    stitchColors.add(`#${match[1].toLowerCase()}`);
  }

  // For each Stitch color, check if impl uses a close-but-wrong TW class
  for (const hex of stitchColors) {
    const exactTwName = HEX_TO_TW_COLOR.get(hex);

    if (exactTwName) {
      // This color is a standard TW color — using the TW class is fine
      continue;
    }

    // Non-standard color — check if impl uses a standard color class
    // that is CLOSE but not exact (approximation)
    for (const [twHex, twName] of HEX_TO_TW_COLOR.entries()) {
      if (colorDistance(hex, twHex) < 30 && colorDistance(hex, twHex) > 0) {
        // Check if the TW class name appears in impl code
        const classPattern = new RegExp(`(?:text|bg|border|ring|accent|fill|stroke)-${twName.replace('-', '-')}\\b`);
        if (classPattern.test(implCode) && !implCode.includes(`[${hex}]`)) {
          violations.push({
            rule: 'NO_APPROXIMATION',
            severity: 'error',
            message: `색상 근사화: Stitch에서 ${hex}인데 구현에서 ${twName}(=${twHex}) 사용. [${hex}] 임의값을 써야 합니다.`,
            stitchValue: hex,
            implValue: twName,
          });
          break; // One violation per color is enough
        }
      }
    }
  }
}

/** Simple RGB distance for detecting approximation */
function colorDistance(hex1: string, hex2: string): number {
  const r1 = parseInt(hex1.slice(1, 3), 16);
  const g1 = parseInt(hex1.slice(3, 5), 16);
  const b1 = parseInt(hex1.slice(5, 7), 16);
  const r2 = parseInt(hex2.slice(1, 3), 16);
  const g2 = parseInt(hex2.slice(3, 5), 16);
  const b2 = parseInt(hex2.slice(5, 7), 16);
  return Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2);
}

// ── Rule 2 check ──────────────────────────────────────────────────────────────

function checkDomPreservation(
  stitchHtml: string, implCode: string, violations: Violation[],
): void {
  const stitchDepth = measureMaxNestingDepth(stitchHtml);
  const implDepth = measureMaxNestingDepth(implCode);

  // Only flag if impl is significantly SHALLOWER (compressed DOM)
  const depthDiff = stitchDepth - implDepth;
  if (depthDiff >= 3) {
    violations.push({
      rule: 'DOM_PRESERVATION',
      severity: 'error',
      message: `DOM 구조 압축 의심: Stitch 깊이 ${stitchDepth} → 구현 깊이 ${implDepth} (${depthDiff}단 축소). DOM 중첩 구조를 유지하세요.`,
      stitchValue: `depth=${stitchDepth}`,
      implValue: `depth=${implDepth}`,
    });
  } else if (depthDiff >= 2) {
    violations.push({
      rule: 'DOM_PRESERVATION',
      severity: 'warning',
      message: `DOM 구조 변경 가능성: Stitch 깊이 ${stitchDepth} → 구현 깊이 ${implDepth} (${depthDiff}단 차이).`,
      stitchValue: `depth=${stitchDepth}`,
      implValue: `depth=${implDepth}`,
    });
  }
}

/** Count max nesting depth of div/section/main/article tags */
function measureMaxNestingDepth(code: string): number {
  const openTags = /<(div|section|main|article|aside|header|footer|nav)\b[^>]*>/gi;
  const closeTags = /<\/(div|section|main|article|aside|header|footer|nav)>/gi;

  let currentDepth = 0;
  let maxDepth = 0;

  // Simple event-based depth tracking
  const events: { index: number; type: 'open' | 'close' }[] = [];

  let m;
  while ((m = openTags.exec(code)) !== null) {
    events.push({ index: m.index, type: 'open' });
  }
  while ((m = closeTags.exec(code)) !== null) {
    events.push({ index: m.index, type: 'close' });
  }

  events.sort((a, b) => a.index - b.index);

  for (const ev of events) {
    if (ev.type === 'open') {
      currentDepth++;
      maxDepth = Math.max(maxDepth, currentDepth);
    } else {
      currentDepth = Math.max(0, currentDepth - 1);
    }
  }

  return maxDepth;
}

// ── Rule 3 check ──────────────────────────────────────────────────────────────

function checkEffectPreservation(
  stitchHtml: string, implCode: string, violations: Violation[],
): void {
  for (const effect of VISUAL_EFFECTS) {
    if (stitchHtml.includes(effect.css)) {
      const implHasEffect = effect.tailwind.some(tw => implCode.includes(tw))
        || implCode.includes(effect.css);

      if (!implHasEffect) {
        violations.push({
          rule: 'EFFECT_PRESERVATION',
          severity: 'error',
          message: `시각 효과 누락: Stitch에 '${effect.css}' 효과가 있지만 구현 코드에서 찾을 수 없습니다.`,
          stitchValue: effect.css,
        });
      }
    }
  }
}

// ── Summary generator ─────────────────────────────────────────────────────────

function generateAuditSummary(
  verdict: AuditResult['verdict'],
  score: number,
  violations: Violation[],
): string {
  const lines: string[] = [];
  lines.push(`## 🎨 디자인 독재 프로토콜 감사 결과`);
  lines.push('');

  const icon = verdict === 'PASS' ? '✅' : verdict === 'WARN' ? '⚠️' : '❌';
  lines.push(`**판정:** ${icon} ${verdict} (${score}/100점)`);
  lines.push('');

  if (violations.length === 0) {
    lines.push('모든 규칙을 준수합니다. ADR-008 위반 없음.');
    return lines.join('\n');
  }

  // Group by rule
  const byRule = new Map<string, Violation[]>();
  for (const v of violations) {
    const existing = byRule.get(v.rule) || [];
    existing.push(v);
    byRule.set(v.rule, existing);
  }

  const ruleLabels: Record<string, string> = {
    'NO_APPROXIMATION': '규칙 1: 어림짐작 금지',
    'DOM_PRESERVATION': '규칙 2: DOM 구조 보존',
    'EFFECT_PRESERVATION': '규칙 3: 시각 효과 보존',
  };

  for (const [rule, vList] of byRule) {
    lines.push(`### ${ruleLabels[rule] || rule}`);
    for (const v of vList) {
      const sev = v.severity === 'error' ? '🔴' : '🟡';
      lines.push(`- ${sev} ${v.message}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}
