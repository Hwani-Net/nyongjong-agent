// Stitch Ideate — generate multi-prompt comparison plans for design exploration
// This module does NOT call Stitch MCP directly. It generates an execution plan
// that Antigravity follows to call generate_screen_from_text multiple times.

export interface IdeatePrompt {
  /** The design prompt text */
  prompt: string;
  /** Suggested AI model for this prompt */
  modelId: 'GEMINI_3_PRO' | 'GEMINI_3_FLASH' | 'MODEL_ID_UNSPECIFIED';
  /** Target device type */
  deviceType: 'MOBILE' | 'DESKTOP';
  /** Brief description of this variant's focus */
  focus: string;
}

export interface IdeateResult {
  /** Project creation instruction */
  projectTitle: string;
  /** Array of prompts to execute against Stitch */
  screens: IdeatePrompt[];
  /** Human-readable workflow instructions for Antigravity */
  workflow: string;
  /** Estimated time in seconds */
  estimatedSeconds: number;
}

/**
 * Generate an ideation plan with N design variants.
 *
 * @param baseIdea - The core design concept from the user
 * @param options  - Customization options
 * @returns An execution plan for Antigravity to follow
 */
export function generateIdeatePlan(
  baseIdea: string,
  options: {
    variantCount?: number;
    deviceType?: 'MOBILE' | 'DESKTOP';
    projectTitle?: string;
    styleKeywords?: string[];
  } = {},
): IdeateResult {
  const count = Math.min(options.variantCount || 3, 5); // Max 5 variants
  const device = options.deviceType || 'DESKTOP';
  const title = options.projectTitle || `Ideate: ${baseIdea.slice(0, 40)}`;

  // Generate diverse variant prompts from the base idea
  const styleDirections = [
    { focus: 'Minimalist & Clean', keywords: 'clean, minimalist, whitespace, modern sans-serif, subtle shadows' },
    { focus: 'Bold & Vibrant', keywords: 'vibrant colors, bold typography, gradient accents, energetic, dynamic' },
    { focus: 'Dark & Premium', keywords: 'dark mode, glassmorphism, neon accents, premium feel, sleek' },
    { focus: 'Warm & Friendly', keywords: 'warm tones, rounded corners, friendly illustrations, soft shadows, approachable' },
    { focus: 'Editorial & Elegant', keywords: 'editorial layout, serif typography, muted palette, sophisticated, magazine-style' },
  ];

  const screens: IdeatePrompt[] = [];
  for (let i = 0; i < count; i++) {
    const direction = styleDirections[i % styleDirections.length];

    // Use provided style keywords if available, otherwise use defaults
    const styleStr = options.styleKeywords && options.styleKeywords.length > 0
      ? options.styleKeywords.join(', ')
      : direction.keywords;

    screens.push({
      prompt: `${baseIdea}. Style: ${styleStr}. ${device === 'MOBILE' ? 'Mobile-first layout with bottom navigation.' : 'Desktop layout with sidebar or top navigation.'}`,
      modelId: i === 0 ? 'GEMINI_3_PRO' : 'GEMINI_3_FLASH', // First one with best model
      deviceType: device,
      focus: direction.focus,
    });
  }

  const workflow = `## Stitch Ideate 실행 계획

### 1단계: 프로젝트 생성
\`\`\`
mcp_StitchMCP_create_project(title: "${title}")
\`\`\`

### 2단계: ${count}개 디자인 변형 생성
${screens.map((s, i) => `
**변형 ${i + 1}: ${s.focus}**
\`\`\`
mcp_StitchMCP_generate_screen_from_text(
  projectId: "[위에서 생성한 ID]",
  prompt: "${s.prompt.replace(/"/g, '\\"')}",
  deviceType: "${s.deviceType}",
  modelId: "${s.modelId}"
)
\`\`\`
`).join('')}

### 3단계: 대표님에게 비교 제시
- notify_user로 ${count}개 스크린 스크린샷을 나란히 보여줌
- 각 변형의 초점 설명 첨부
- 대표님이 선택하면 해당 디자인으로 진행

### 4단계: 선택된 디자인으로 Vibe Design 계속
- edit_screens로 세부 수정
- 대표님 최종 승인 후 HTML 추출`;

  return {
    projectTitle: title,
    screens,
    workflow,
    estimatedSeconds: count * 30, // ~30s per screen generation
  };
}
