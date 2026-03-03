// Persona loader — loads persona definitions from Obsidian vault
import { ObsidianStore, type NoteData } from '../core/obsidian-store.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('persona-loader');

export type PersonaCategory =
  | 'customer'
  | 'philosopher'
  | 'business'
  | 'engineer'
  | 'regulatory'
  | 'temporal'
  | 'designer';

export interface Persona {
  id: string;
  name: string;
  category: PersonaCategory;
  era: string;
  /** Workflow stages where this persona should be activated */
  activatedAt: string[];
  priority: 'low' | 'normal' | 'high' | 'critical';
  /** Full persona description and questions */
  content: string;
  /** Raw frontmatter for extra metadata */
  metadata: Record<string, unknown>;
}

export interface PersonaLoaderOptions {
  store: ObsidianStore;
  /** Vault-relative path to personas directory */
  personasDir: string;
}

export class PersonaLoader {
  private store: ObsidianStore;
  private personasDir: string;
  private cache: Map<string, Persona> = new Map();

  constructor(options: PersonaLoaderOptions) {
    this.store = options.store;
    this.personasDir = options.personasDir;
    log.info('PersonaLoader initialized', { personasDir: this.personasDir });
  }

  /**
   * Load a single persona by ID from the vault.
   */
  async loadPersona(id: string): Promise<Persona | null> {
    // Check cache first
    if (this.cache.has(id)) {
      log.debug(`Persona cache hit: ${id}`);
      return this.cache.get(id)!;
    }

    // Try to find the persona file
    const filePath = `${this.personasDir}/${id}.md`;
    const exists = await this.store.exists(filePath);

    if (!exists) {
      log.warn(`Persona not found: ${id}`);
      return null;
    }

    const note = await this.store.readNote(filePath);
    const persona = this.noteToPersona(note);

    if (persona) {
      this.cache.set(id, persona);
    }

    return persona;
  }

  /**
   * Load all personas from the vault directory.
   * Result is TTL-cached for 30s to avoid repeated I/O and log spam.
   */
  private allCache: { personas: Persona[]; expiresAt: number } | null = null;

  async loadAll(): Promise<Persona[]> {
    // Return cached result if still fresh (30s TTL)
    if (this.allCache && Date.now() < this.allCache.expiresAt) {
      return this.allCache.personas;
    }

    const notePaths = await this.store.listNotes(this.personasDir, false);
    const personas: Persona[] = [];

    for (const path of notePaths) {
      // Skip registry file
      if (path.endsWith('_registry.md')) continue;

      try {
        const note = await this.store.readNote(path);
        const persona = this.noteToPersona(note);
        if (persona) {
          this.cache.set(persona.id, persona);
          personas.push(persona);
        }
      } catch (err) {
        log.warn(`Failed to load persona from ${path}`, err);
      }
    }

    // Cache for 30 seconds
    this.allCache = { personas, expiresAt: Date.now() + 30_000 };
    log.debug(`Loaded ${personas.length} personas (cached 30s)`);
    return personas;
  }

  /**
   * Find personas matching a specific category or activation stage.
   */
  async findByCategory(category: PersonaCategory): Promise<Persona[]> {
    const all = await this.loadAll();
    return all.filter((p) => p.category === category);
  }

  /**
   * Find personas that should be activated at a given workflow stage.
   */
  async findByStage(stage: string): Promise<Persona[]> {
    const all = await this.loadAll();
    return all.filter((p) => p.activatedAt.includes(stage));
  }

  /**
   * Create a new persona definition in the vault.
   */
  async createPersona(persona: Omit<Persona, 'metadata'>): Promise<void> {
    const filePath = `${this.personasDir}/${persona.id}.md`;
    const frontmatter: Record<string, unknown> = {
      id: persona.id,
      name: persona.name,
      category: persona.category,
      era: persona.era,
      activated_at: persona.activatedAt,
      priority: persona.priority,
    };

    await this.store.writeNote(filePath, persona.content, frontmatter);
    this.cache.set(persona.id, { ...persona, metadata: frontmatter });
    log.info(`Persona created: ${persona.id}`);
  }

  /**
   * Update an existing persona definition in the vault.
   */
  async updatePersona(id: string, updates: Partial<Omit<Persona, 'id' | 'metadata'>>): Promise<boolean> {
    const existing = await this.loadPersona(id);
    if (!existing) {
      log.warn(`Cannot update non-existent persona: ${id}`);
      return false;
    }

    const merged: Omit<Persona, 'metadata'> = {
      id,
      name: updates.name ?? existing.name,
      category: updates.category ?? existing.category,
      era: updates.era ?? existing.era,
      activatedAt: updates.activatedAt ?? existing.activatedAt,
      priority: updates.priority ?? existing.priority,
      content: updates.content ?? existing.content,
    };

    const filePath = `${this.personasDir}/${id}.md`;
    const frontmatter: Record<string, unknown> = {
      id: merged.id,
      name: merged.name,
      category: merged.category,
      era: merged.era,
      activated_at: merged.activatedAt,
      priority: merged.priority,
    };

    await this.store.writeNote(filePath, merged.content, frontmatter);
    this.cache.set(id, { ...merged, metadata: frontmatter });
    log.info(`Persona updated: ${id}`);
    return true;
  }

  /**
   * Delete a persona from the vault.
   */
  async deletePersona(id: string): Promise<boolean> {
    const filePath = `${this.personasDir}/${id}.md`;
    const deleted = await this.store.deleteNote(filePath);
    this.cache.delete(id);
    if (deleted) {
      log.info(`Persona deleted: ${id}`);
    }
    return deleted;
  }

  /**
   * Clear the in-memory cache.
   */
  clearCache(): void {
    this.cache.clear();
    log.debug('Persona cache cleared');
  }

  /**
   * Convert an Obsidian note to a Persona object.
   */
  private noteToPersona(note: NoteData): Persona | null {
    const fm = note.frontmatter;
    if (!fm.id || !fm.name) {
      log.warn(`Invalid persona (missing id/name): ${note.path}`);
      return null;
    }

    return {
      id: fm.id as string,
      name: fm.name as string,
      category: (fm.category as PersonaCategory) || 'customer',
      era: (fm.era as string) || 'unknown',
      activatedAt: (fm.activated_at as string[]) || [],
      priority: (fm.priority as Persona['priority']) || 'normal',
      content: note.content,
      metadata: fm,
    };
  }
}
