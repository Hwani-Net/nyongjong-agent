// Integration tests for PersonaLoader and PersonaEngine — in-memory fake store
import { describe, it, expect, beforeEach } from 'vitest';
import { ObsidianStore } from '../../src/core/obsidian-store.js';
import { PersonaLoader } from '../../src/personas/persona-loader.js';
import { PersonaEngine } from '../../src/personas/persona-engine.js';
import matter from 'gray-matter';

// ── In-memory fake store (same utility as task-manager.test.ts) ────────────
function makeFakeStore(): ObsidianStore {
  const db = new Map<string, string>(); // vault-relative path → raw markdown

  const parseRaw = (path: string, raw: string) => {
    const parsed = matter(raw);
    return {
      path,
      frontmatter: parsed.data as Record<string, unknown>,
      content: parsed.content.trim(),
    };
  };

  return {
    async readNote(path: string) {
      const raw = db.get(path);
      if (!raw) throw Object.assign(new Error(`ENOENT: ${path}`), { code: 'ENOENT' });
      return parseRaw(path, raw);
    },
    async writeNote(path: string, content: string, frontmatter?: Record<string, unknown>) {
      const raw = (frontmatter && Object.keys(frontmatter).length > 0)
        ? matter.stringify(content, frontmatter)
        : content;
      db.set(path, raw);
    },
    async listNotes(dir: string, _recursive?: boolean) {
      return [...db.keys()].filter((p) => p.startsWith(dir + '/') && p.endsWith('.md'));
    },
    async searchNotes() { return []; },
    async exists(path: string) { return db.has(path); },
    async deleteNote(path: string) {
      if (!db.has(path)) return false;
      db.delete(path);
      return true;
    },
    getCacheStats() { return { hits: 0, misses: 0, invalidations: 0, size: 0 }; },
    clearNoteCache() {},
  } as unknown as ObsidianStore;
}

// ─── Setup ─────────────────────────────────────────────────────────────────
let store: ObsidianStore;

beforeEach(() => {
  store = makeFakeStore();
});

function makeLoader(): PersonaLoader {
  return new PersonaLoader({ store, personasDir: 'personas' });
}

// ─── PersonaLoader: CRUD ────────────────────────────────────────────────────
describe('PersonaLoader (real fs)', () => {
  it('should create and load a persona', async () => {
    const loader = makeLoader();
    await loader.createPersona({
      id: 'ceo-test',
      name: '테스트 CEO',
      category: 'business',
      era: '2024',
      activatedAt: ['understand', 'report'],
      priority: 'high',
      content: '비즈니스 관점에서 분석합니다.',
    });

    const persona = await loader.loadPersona('ceo-test');
    expect(persona).not.toBeNull();
    expect(persona!.name).toBe('테스트 CEO');
    expect(persona!.category).toBe('business');
    expect(persona!.activatedAt).toContain('understand');
    expect(persona!.content).toContain('비즈니스');
  });

  it('should return null for missing persona', async () => {
    const loader = makeLoader();
    const persona = await loader.loadPersona('nonexistent');
    expect(persona).toBeNull();
  });

  it('should load all personas', async () => {
    const loader = makeLoader();
    await loader.createPersona({ id: 'p1', name: 'Persona 1', category: 'business', era: '2024', activatedAt: ['understand'], priority: 'normal', content: 'A' });
    await loader.createPersona({ id: 'p2', name: 'Persona 2', category: 'customer', era: '2024', activatedAt: ['validate'], priority: 'normal', content: 'B' });

    const all = await loader.loadAll();
    expect(all.length).toBe(2);
    const ids = all.map((p) => p.id);
    expect(ids).toContain('p1');
    expect(ids).toContain('p2');
  });

  it('should update an existing persona', async () => {
    const loader = makeLoader();
    await loader.createPersona({ id: 'update-me', name: '수정 전', category: 'engineer', era: '2024', activatedAt: ['validate'], priority: 'normal', content: '원래 내용' });

    const result = await loader.updatePersona('update-me', { name: '수정 후', content: '수정된 내용' });
    expect(result).toBe(true);

    const updated = await loader.loadPersona('update-me');
    expect(updated!.name).toBe('수정 후');
    expect(updated!.content).toContain('수정된 내용');
  });

  it('should return false when updating non-existent persona', async () => {
    const loader = makeLoader();
    const result = await loader.updatePersona('nonexistent', { name: 'X' });
    expect(result).toBe(false);
  });

  it('should delete a persona', async () => {
    const loader = makeLoader();
    await loader.createPersona({ id: 'delete-me', name: '삭제 대상', category: 'philosopher', era: '2024', activatedAt: ['evolve'], priority: 'low', content: '삭제될 페르소나' });

    expect(await loader.loadPersona('delete-me')).not.toBeNull();
    const deleted = await loader.deletePersona('delete-me');
    expect(deleted).toBe(true);

    expect(await store.exists('personas/delete-me.md')).toBe(false);
    expect(await loader.loadPersona('delete-me')).toBeNull();
  });

  it('should return false when deleting non-existent persona', async () => {
    const loader = makeLoader();
    const result = await loader.deletePersona('does-not-exist');
    expect(result).toBe(false);
  });
});

// ─── PersonaEngine: consultation plan ─────────────────────────────────────
describe('PersonaEngine (real fs)', () => {
  it('should create consultation plan for understand stage', async () => {
    const loader = makeLoader();
    await loader.createPersona({ id: 'ceo', name: 'CEO', category: 'business', era: '2024', activatedAt: ['understand', 'report'], priority: 'high', content: '비즈니스 렌즈' });
    await loader.createPersona({ id: 'user', name: 'User', category: 'customer', era: '2024', activatedAt: ['understand', 'prototype'], priority: 'normal', content: '사용자 렌즈' });
    await loader.createPersona({ id: 'eng', name: 'Engineer', category: 'engineer', era: '2024', activatedAt: ['validate'], priority: 'normal', content: '엔지니어 렌즈' });

    const engine = new PersonaEngine(loader);
    const plan = await engine.createConsultationPlan({ stage: 'understand', topic: '신기능 분석', maxPersonas: 3 });

    expect(plan.stage).toBe('understand');
    expect(plan.consultations.length).toBeGreaterThanOrEqual(1);
  });

  it('should get persona summary by category', async () => {
    const loader = makeLoader();
    await loader.createPersona({ id: 'biz', name: 'Biz', category: 'business', era: '2024', activatedAt: [], priority: 'normal', content: '비즈니스' });
    await loader.createPersona({ id: 'cust', name: 'Cust', category: 'customer', era: '2024', activatedAt: [], priority: 'normal', content: '고객' });

    const engine = new PersonaEngine(loader);
    const summary = await engine.getPersonaSummary();

    expect(summary['business']).toBeDefined();
    expect(summary['customer']).toBeDefined();
    const bizEntry = summary['business'].find((e: string) => e.includes('biz'));
    expect(bizEntry).toBeDefined();
    expect(bizEntry).toContain('Biz');
  });

  it('should auto-create persona from template when not found', async () => {
    const loader = makeLoader();
    const engine = new PersonaEngine(loader);

    const template = {
      id: 'auto-persona',
      name: '자동생성 페르소나',
      category: 'engineer' as const,
      era: '2024',
      activatedAt: ['validate'] as Array<'understand' | 'prototype' | 'validate' | 'evolve' | 'report'>,
      priority: 'normal' as const,
      content: '자동 생성 테스트 내용',
    };

    expect(await loader.loadPersona('auto-persona')).toBeNull();

    const plan = await engine.createConsultationPlan({
      stage: 'validate',
      topic: '자동생성 테스트',
      suggestedPersonas: [template],
      autoCreate: true,
      maxPersonas: 3,
    });

    expect(await store.exists('personas/auto-persona.md')).toBe(true);
    expect(plan.consultations.length).toBeGreaterThanOrEqual(1);
  });
});

// ─── Role Card System ───────────────────────────────────────────────────────
import { BUILTIN_ROLE_CARDS, findRoleCard, buildRoleCardPrompt, buildSituationPrompt } from '../../src/personas/role-cards.js';
import type { Persona } from '../../src/personas/persona-loader.js';

describe('Role Card System', () => {
  it('should have 6 built-in Role Cards (CTO, QA, CEO, Designer, DevRel, Angry User)', () => {
    expect(BUILTIN_ROLE_CARDS.length).toBe(6);

    const ids = BUILTIN_ROLE_CARDS.map((c) => c.id);
    expect(ids).toContain('cto-jihoon');
    expect(ids).toContain('qa-soojin');
    expect(ids).toContain('ceo-minsu');
    expect(ids).toContain('designer-yuna');
    expect(ids).toContain('angry-kim');
    expect(ids).toContain('devrel-jaehee');

    // Verify each card has required fields
    for (const card of BUILTIN_ROLE_CARDS) {
      expect(card.communication.tone).toBeTruthy();
      expect(card.communication.style).toBeTruthy();
      expect(card.communication.catchphrases.length).toBeGreaterThan(0);
      expect(card.responseTemplate.format).toBeTruthy();
      expect(Object.keys(card.situationRules).length).toBeGreaterThan(0);
    }
  });

  it('should match Role Card by persona category', () => {
    const engineerPersona: Persona = {
      id: 'test-eng', name: '엔지니어', category: 'engineer',
      era: '2024', activatedAt: ['validate'], priority: 'normal',
      content: '엔지니어 페르소나',
      metadata: {},
    };

    const businessPersona: Persona = {
      id: 'test-biz', name: '사업가', category: 'business',
      era: '2024', activatedAt: ['understand'], priority: 'normal',
      content: '사업 페르소나',
      metadata: {},
    };

    const designerPersona: Persona = {
      id: 'test-ui', name: 'UI 디자이너', category: 'designer',
      era: '2024', activatedAt: ['prototype'], priority: 'normal',
      content: '디자이너 페르소나',
      metadata: {},
    };

    const engCard = findRoleCard(engineerPersona);
    expect(engCard).not.toBeNull();
    expect(engCard!.role).toBe('CTO');

    const bizCard = findRoleCard(businessPersona);
    expect(bizCard).not.toBeNull();
    expect(bizCard!.role).toBe('CEO');

    const uiCard = findRoleCard(designerPersona);
    expect(uiCard).not.toBeNull();
    expect(uiCard!.role).toBe('리드 디자이너');
  });

  it('should inject Role Card into buildPrompt for engineer persona', async () => {
    const loader = makeLoader();
    await loader.createPersona({
      id: 'cto-test',
      name: 'CTO 테스트',
      category: 'engineer',
      era: '2024',
      activatedAt: ['prototype'],
      priority: 'high',
      content: '기술 리더',
    });

    const engine = new PersonaEngine(loader);
    const plan = await engine.createConsultationPlan({
      stage: 'prototype',
      topic: '아키텍처 검토',
      maxPersonas: 1,
      taskType: 'architecture',
    });

    expect(plan.consultations.length).toBe(1);
    const prompt = plan.consultations[0].prompt;

    // Role Card communication protocol should be injected
    expect(prompt).toContain('커뮤니케이션 프로토콜');
    expect(prompt).toContain('톤 & 말투');
    expect(prompt).toContain('응답 형식');
    // Situation rule for architecture should be present
    expect(prompt).toContain('특별 규칙');
    expect(prompt).toContain('architecture');
  });
});
