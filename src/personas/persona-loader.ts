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
  | 'temporal';

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
   */
  async loadAll(): Promise<Persona[]> {
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

    log.info(`Loaded ${personas.length} personas`);
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
