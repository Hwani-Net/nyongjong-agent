import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PersonaLoader, type PersonaCategory } from '../../src/personas/persona-loader.js';
import { PersonaEngine } from '../../src/personas/persona-engine.js';

// Mock ObsidianStore
const mockStore = {
  exists: vi.fn(),
  readNote: vi.fn(),
  writeNote: vi.fn(),
  deleteNote: vi.fn(),
  listNotes: vi.fn(),
  searchNotes: vi.fn(),
};

describe('PersonaLoader', () => {
  let loader: PersonaLoader;

  beforeEach(() => {
    vi.clearAllMocks();
    loader = new PersonaLoader({
      store: mockStore as any,
      personasDir: 'agent/personas',
    });
  });

  it('should load a persona by ID', async () => {
    mockStore.exists.mockResolvedValue(true);
    mockStore.readNote.mockResolvedValue({
      path: 'agent/personas/ceo-kim.md',
      content: '비즈니스 관점에서 분석합니다.',
      frontmatter: {
        id: 'ceo-kim',
        name: 'CEO Kim',
        category: 'business',
        era: 'modern',
        activated_at: ['understand', 'report'],
        priority: 'high',
      },
    });

    const persona = await loader.loadPersona('ceo-kim');
    expect(persona).not.toBeNull();
    expect(persona!.name).toBe('CEO Kim');
    expect(persona!.category).toBe('business');
    expect(persona!.activatedAt).toContain('understand');
  });

  it('should return null for missing persona', async () => {
    mockStore.exists.mockResolvedValue(false);
    const persona = await loader.loadPersona('nonexistent');
    expect(persona).toBeNull();
  });

  it('should load all personas', async () => {
    mockStore.listNotes.mockResolvedValue([
      'agent/personas/ceo-kim.md',
      'agent/personas/user-park.md',
    ]);

    mockStore.readNote
      .mockResolvedValueOnce({
        path: 'agent/personas/ceo-kim.md',
        content: '비즈니스 관점',
        frontmatter: { id: 'ceo-kim', name: 'CEO Kim', category: 'business', activated_at: ['report'] },
      })
      .mockResolvedValueOnce({
        path: 'agent/personas/user-park.md',
        content: '사용자 관점',
        frontmatter: { id: 'user-park', name: 'User Park', category: 'customer', activated_at: ['understand'] },
      });

    const all = await loader.loadAll();
    expect(all.length).toBe(2);
    expect(all[0].id).toBe('ceo-kim');
    expect(all[1].id).toBe('user-park');
  });

  it('should create a persona', async () => {
    mockStore.writeNote.mockResolvedValue(undefined);

    await loader.createPersona({
      id: 'new-persona',
      name: 'New Persona',
      category: 'philosopher',
      era: '2024',
      activatedAt: ['evolve'],
      priority: 'normal',
      content: 'Deep thinker',
    });

    expect(mockStore.writeNote).toHaveBeenCalledWith(
      'agent/personas/new-persona.md',
      'Deep thinker',
      expect.objectContaining({ id: 'new-persona', name: 'New Persona' }),
    );
  });
});

describe('PersonaEngine', () => {
  let engine: PersonaEngine;

  beforeEach(() => {
    vi.clearAllMocks();
    const loader = new PersonaLoader({
      store: mockStore as any,
      personasDir: 'agent/personas',
    });
    engine = new PersonaEngine(loader);

    // Mock loader to return some personas
    mockStore.listNotes.mockResolvedValue([
      'agent/personas/ceo.md',
      'agent/personas/user.md',
      'agent/personas/eng.md',
    ]);

    mockStore.readNote
      .mockResolvedValueOnce({
        path: 'agent/personas/ceo.md',
        content: 'Business lens',
        frontmatter: { id: 'ceo', name: 'CEO', category: 'business', activated_at: ['understand', 'report'], priority: 'high' },
      })
      .mockResolvedValueOnce({
        path: 'agent/personas/user.md',
        content: 'User lens',
        frontmatter: { id: 'user', name: 'User', category: 'customer', activated_at: ['understand', 'prototype'], priority: 'normal' },
      })
      .mockResolvedValueOnce({
        path: 'agent/personas/eng.md',
        content: 'Engineer lens',
        frontmatter: { id: 'eng', name: 'Engineer', category: 'engineer', activated_at: ['validate'], priority: 'normal' },
      });
  });

  it('should create consultation plan for understand stage', async () => {
    const plan = await engine.createConsultationPlan({
      stage: 'understand',
      topic: 'New feature analysis',
      maxPersonas: 3,
    });

    expect(plan.stage).toBe('understand');
    expect(plan.consultations.length).toBeGreaterThanOrEqual(1);
    expect(plan.consultations[0].prompt).toContain('understand');
  });

  it('should get persona summary by category', async () => {
    // Need to re-mock since loadAll will be called again
    mockStore.listNotes.mockResolvedValue(['agent/personas/ceo.md']);
    mockStore.readNote.mockResolvedValue({
      path: 'agent/personas/ceo.md',
      content: 'Business',
      frontmatter: { id: 'ceo', name: 'CEO', category: 'business', activated_at: [], priority: 'high' },
    });

    const summary = await engine.getPersonaSummary();
    expect(summary['business']).toBeDefined();
  });
});

describe('PersonaLoader CRUD', () => {
  let loader: PersonaLoader;

  beforeEach(() => {
    vi.clearAllMocks();
    loader = new PersonaLoader({
      store: mockStore as any,
      personasDir: 'agent/personas',
    });
  });

  it('should update an existing persona', async () => {
    // First, prime the cache with an existing persona
    mockStore.exists.mockResolvedValue(true);
    mockStore.readNote.mockResolvedValue({
      path: 'agent/personas/test-p.md',
      content: 'Original content',
      frontmatter: {
        id: 'test-p',
        name: 'Test Persona',
        category: 'business',
        era: '2024',
        activated_at: ['understand'],
        priority: 'normal',
      },
    });
    mockStore.writeNote.mockResolvedValue(undefined);

    const result = await loader.updatePersona('test-p', {
      name: 'Updated Persona',
      content: 'Updated content',
    });

    expect(result).toBe(true);
    expect(mockStore.writeNote).toHaveBeenCalledWith(
      'agent/personas/test-p.md',
      'Updated content',
      expect.objectContaining({ name: 'Updated Persona', id: 'test-p' }),
    );
  });

  it('should return false when updating non-existent persona', async () => {
    mockStore.exists.mockResolvedValue(false);
    const result = await loader.updatePersona('nonexistent', { name: 'New Name' });
    expect(result).toBe(false);
  });

  it('should delete a persona', async () => {
    mockStore.deleteNote.mockResolvedValue(true);
    const result = await loader.deletePersona('test-p');
    expect(result).toBe(true);
    expect(mockStore.deleteNote).toHaveBeenCalledWith('agent/personas/test-p.md');
  });

  it('should return false when deleting non-existent persona', async () => {
    mockStore.deleteNote.mockResolvedValue(false);
    const result = await loader.deletePersona('nonexistent');
    expect(result).toBe(false);
  });
});

describe('PersonaEngine auto-creation', () => {
  it('should auto-create persona from template when not found', async () => {
    vi.clearAllMocks();
    const loader = new PersonaLoader({
      store: mockStore as any,
      personasDir: 'agent/personas',
    });
    const engine = new PersonaEngine(loader);

    // First loadPersona returns null (not found), then returns the created persona
    mockStore.exists
      .mockResolvedValueOnce(false)   // ensurePersonaExists → loadPersona → not found
      .mockResolvedValueOnce(true);   // ensurePersonaExists → loadPersona after create → found
    mockStore.writeNote.mockResolvedValue(undefined);  // createPersona
    mockStore.readNote.mockResolvedValue({
      path: 'agent/personas/test-template.md',
      content: 'Template content',
      frontmatter: {
        id: 'test-template',
        name: 'Test Template',
        category: 'engineer',
        activated_at: ['validate'],
        priority: 'normal',
      },
    });
    // loadAll for stage filtering returns empty
    mockStore.listNotes.mockResolvedValue([]);

    const plan = await engine.createConsultationPlan({
      stage: 'validate',
      topic: 'Test auto-creation',
      suggestedPersonas: [{
        id: 'test-template',
        name: 'Test Template',
        category: 'engineer',
        era: '2024',
        activatedAt: ['validate'],
        priority: 'normal',
        content: 'Template content',
      }],
      autoCreate: true,
      maxPersonas: 3,
    });

    expect(mockStore.writeNote).toHaveBeenCalled();
    expect(plan.consultations.length).toBeGreaterThanOrEqual(1);
  });
});

