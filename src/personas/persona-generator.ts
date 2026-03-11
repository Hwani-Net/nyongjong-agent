// Dynamic persona generator — creates project-specific personas using Ollama
// Hybrid approach: domain templates (base) + LLM-generated contextual personas (dynamic)
import OpenAI from 'openai';
import { OllamaClient } from '../advisory/ollama-client.js';
import { createLogger } from '../utils/logger.js';
import type { PersonaTemplate } from './persona-templates.js';
import type { PersonaCategory } from './persona-loader.js';

const log = createLogger('persona-generator');

export interface GeneratedPersona {
  id: string;
  name: string;
  category: PersonaCategory;
  role: string;
  age?: string;
  background: string;
  painPoints: string[];
  evaluationCriteria: string[];
}

export interface GenerationRequest {
  /** Project goal/description */
  goal: string;
  /** Number of personas to generate */
  count?: number;
  /** Existing persona IDs to avoid duplicating */
  existingPersonaIds?: string[];
}

export class DynamicPersonaGenerator {
  private ollama: OllamaClient;
  private openai: OpenAI | null = null;
  private ollamaModel: string;
  private openaiModel: string = 'gpt-4.1-mini'; // 2026 — upgraded from gpt-4o

  constructor(ollamaUrl?: string, model?: string) {
    this.ollama = new OllamaClient({
      baseUrl: ollamaUrl,
      timeoutMs: 60000,
    });
    this.ollamaModel = model || 'qwen2.5:7b';
    
    // Check for OpenAI API Key
    const apiKey = process.env.OPENAI_API_KEY;
    if (apiKey) {
      this.openai = new OpenAI({ apiKey });
      log.info('DynamicPersonaGenerator initialized with OpenAI (primary)', { model: this.openaiModel });
    } else {
      log.info('DynamicPersonaGenerator initialized with Ollama (primary)', { model: this.ollamaModel });
    }
  }

  async generate(request: GenerationRequest): Promise<PersonaTemplate[]> {
    const { goal, count = 3, existingPersonaIds = [] } = request;
    log.info(`Generating ${count} dynamic personas for: ${goal}`);

    const prompt = this.buildGenerationPrompt(goal, count, existingPersonaIds);
    let responseText = '';

    try {
      if (this.openai) {
        log.info('Using OpenAI API for generation');
        const completion = await this.openai.chat.completions.create({
          model: this.openaiModel,
          messages: [
            { role: 'system', content: 'You are an expert user researcher and product strategist.' },
            { role: 'user', content: prompt }
          ],
          temperature: 0.7,
        });
        responseText = completion.choices[0]?.message?.content || '';
      } else {
        log.info('Using local Ollama for generation');
        const result = await this.ollama.generate({
          model: this.ollamaModel,
          prompt,
          temperature: 0.7,
        });
        if (!result.success) throw new Error(result.error);
        responseText = result.response;
      }

      const parsed = this.parseGeneratedPersonas(responseText, goal);
      log.info(`Generated ${parsed.length} dynamic personas`, {
        personas: parsed.map(p => p.id),
      });

      return parsed;
    } catch (e) {
      log.error('Dynamic persona generation error', { error: String(e) });
      return [];
    }
  }

  /**
   * Build the LLM prompt for persona generation.
   */
  private buildGenerationPrompt(
    goal: string,
    count: number,
    existingIds: string[],
  ): string {
    const excludeNote = existingIds.length > 0
      ? `\n이미 다음 페르소나가 존재합니다 (중복 생성하지 마세요): ${existingIds.join(', ')}`
      : '';

    return `당신은 사용자 리서치 전문가입니다. 아래 프로젝트 목표를 읽고 **이 프로젝트의 핵심 사용자/이해관계자** ${count}명의 구체적인 페르소나를 생성하세요.
${excludeNote}

## 프로젝트 목표
${goal}

## 규칙
1. **구체적인 인물**: "불편한 사용자" 같은 모호한 표현 금지. "60대 남자 할아버지, 스마트폰 처음 사용" 같은 구체적 프로필 필수.
2. **도메인 전문가 포함**: 해당 분야의 현직 종사자를 반드시 1명 이상 포함 (의료→의사/간호사, 교육→교사, 금융→은행원 등)
3. **극단적 사용자 포함**: 가장 기술에 서툰 사용자 또는 가장 엄격한 비평가 반드시 1명 포함
4. **다양한 연령/성별/배경**: 모든 페르소나가 비슷하면 안 됨

## 출력 형식 (JSON 배열, 정확히 이 형식만)
\`\`\`json
[
  {
    "id": "영어-케밥-케이스",
    "name": "한글 이름 (역할)",
    "category": "customer|engineer|business|regulatory",
    "role": "구체적 역할 설명",
    "age": "나이대",
    "background": "배경 설명 1~2문장",
    "painPoints": ["불편함1", "불편함2"],
    "evaluationCriteria": ["이것 없으면 안 쓴다", "이것은 있으면 좋다"]
  }
]
\`\`\`

JSON 배열만 출력하세요. 다른 텍스트는 쓰지 마세요.`;
  }

  /**
   * Parse LLM output into PersonaTemplate[].
   */
  private parseGeneratedPersonas(response: string, goal: string): PersonaTemplate[] {
    try {
      // Extract JSON from response (handle code blocks)
      const jsonMatch = response.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        log.warn('No JSON array found in LLM response');
        return [];
      }

      const parsed: GeneratedPersona[] = JSON.parse(jsonMatch[0]);
      if (!Array.isArray(parsed)) return [];

      return parsed
        .filter(p => p.id && p.name && p.category)
        .map(p => this.toTemplate(p));
    } catch (e) {
      log.warn('Failed to parse generated personas', { error: String(e) });
      return [];
    }
  }

  /**
   * Convert a GeneratedPersona into a PersonaTemplate usable by PersonaEngine.
   */
  private toTemplate(persona: GeneratedPersona): PersonaTemplate {
    const category = this.normalizeCategory(persona.category);

    const content = [
      `당신은 **${persona.name}**입니다. ${persona.role}`,
      '',
      '## 배경',
      persona.background,
      persona.age ? `나이: ${persona.age}` : '',
      '',
      '## 불편한 점 (Pain Points)',
      ...persona.painPoints.map(p => `- ${p}`),
      '',
      '## 판단 기준',
      ...persona.evaluationCriteria.map((c, i) =>
        `${i + 1}. ${c}`
      ),
      '',
      '## 말투',
      `"${persona.name}"으로서 솔직하고 구체적으로 의견을 말하세요.`,
      `기술 용어보다 실제 경험에 기반한 표현을 사용하세요.`,
    ].filter(Boolean).join('\n');

    return {
      id: `dynamic-${persona.id}`,
      name: persona.name,
      category,
      era: '2026',
      activatedAt: ['understand', 'prototype', 'validate'],
      priority: 'high' as const,
      content,
    };
  }

  /**
   * Normalize category string to valid PersonaCategory.
   */
  private normalizeCategory(cat: string): PersonaCategory {
    const validCategories: PersonaCategory[] = [
      'customer', 'philosopher', 'business', 'engineer', 'regulatory', 'temporal',
    ];
    const normalized = cat.toLowerCase().trim() as PersonaCategory;
    return validCategories.includes(normalized) ? normalized : 'customer';
  }
}
