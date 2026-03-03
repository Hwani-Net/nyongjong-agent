// Obsidian Vault adapter — reads/writes via Local REST API (http://127.0.0.1:27123)
// Replaces the previous filesystem adapter; no vault path config needed.
import matter from 'gray-matter';
import { createLogger } from '../utils/logger.js';

const log = createLogger('obsidian-store');

export interface NoteData {
  /** Vault-relative file path */
  path: string;
  /** YAML frontmatter as key-value pairs */
  frontmatter: Record<string, unknown>;
  /** Markdown body content (without frontmatter) */
  content: string;
}

export interface ObsidianStoreOptions {
  /** Base URL of the Obsidian Local REST API. Default: http://127.0.0.1:27123 */
  apiUrl?: string;
  /** API key for the Obsidian Local REST API plugin */
  apiKey: string;
}

export class ObsidianStore {
  private apiUrl: string;
  private apiKey: string;
  private headers: Record<string, string>;

  /**
   * In-memory cache: path → { note, etag }
   * REST API responses include an ETag header which we use for conditional GET.
   */
  private noteCache = new Map<string, { note: NoteData; etag: string }>();

  /** Cache hit/miss stats for monitoring */
  private cacheStats = { hits: 0, misses: 0, invalidations: 0 };

  constructor(options: ObsidianStoreOptions) {
    this.apiUrl = (options.apiUrl ?? 'http://127.0.0.1:27123').replace(/\/$/, '');
    this.apiKey = options.apiKey;
    this.headers = {
      Authorization: `Bearer ${this.apiKey}`,
      'Content-Type': 'text/markdown',
    };
    log.info('ObsidianStore initialized (REST API mode)', { apiUrl: this.apiUrl });
  }

  /**
   * Internal fetch helper — throws on non-2xx.
   */
  private async request(
    method: string,
    path: string,
    body?: string,
    extraHeaders?: Record<string, string>,
  ): Promise<Response> {
    const url = `${this.apiUrl}${path}`;
    const res = await fetch(url, {
      method,
      headers: { ...this.headers, ...extraHeaders },
      body,
    });
    return res;
  }

  /**
   * Read a markdown note and parse its YAML frontmatter.
   * Uses ETag-based conditional GET for cache efficiency.
   */
  async readNote(relativePath: string): Promise<NoteData> {
    // Encode Korean/special chars in path segments
    const encoded = relativePath
      .split('/')
      .map(encodeURIComponent)
      .join('/');

    const cached = this.noteCache.get(relativePath);
    const conditionalHeaders: Record<string, string> = {};
    if (cached) {
      conditionalHeaders['If-None-Match'] = cached.etag;
    }

    const res = await this.request('GET', `/vault/${encoded}`, undefined, conditionalHeaders);

    if (res.status === 304 && cached) {
      this.cacheStats.hits++;
      log.debug(`Cache hit (304 Not Modified): ${relativePath}`);
      return cached.note;
    }

    if (!res.ok) {
      throw new Error(`ObsidianStore.readNote failed: ${res.status} ${res.statusText} — ${relativePath}`);
    }

    if (cached) {
      this.cacheStats.invalidations++;
    } else {
      this.cacheStats.misses++;
    }

    const raw = await res.text();
    const parsed = matter(raw);
    const etag = res.headers.get('etag') ?? Date.now().toString();

    const note: NoteData = {
      path: relativePath,
      frontmatter: parsed.data as Record<string, unknown>,
      content: parsed.content.trim(),
    };

    this.noteCache.set(relativePath, { note, etag });
    return note;
  }

  /**
   * Write a markdown note with optional YAML frontmatter.
   * Creates the note (and any parent folders) automatically.
   */
  async writeNote(
    relativePath: string,
    content: string,
    frontmatter?: Record<string, unknown>,
  ): Promise<void> {
    const encoded = relativePath
      .split('/')
      .map(encodeURIComponent)
      .join('/');

    let body: string;
    if (frontmatter && Object.keys(frontmatter).length > 0) {
      body = matter.stringify(content, frontmatter);
    } else {
      body = content;
    }

    log.debug(`Writing note via REST API: ${relativePath}`);
    const res = await this.request('PUT', `/vault/${encoded}`, body);

    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      throw new Error(
        `ObsidianStore.writeNote failed: ${res.status} ${res.statusText} — ${relativePath}\n${errBody}`,
      );
    }

    // Invalidate cache so next read fetches fresh content
    this.noteCache.delete(relativePath);
    log.info(`Note written (REST API): ${relativePath}`);
  }

  /**
   * List markdown notes in a vault directory.
   * Uses GET /vault/{dir}/ which returns a JSON list of files.
   */
  async listNotes(relativeDir: string, recursive = false): Promise<string[]> {
    const dirPath = relativeDir.endsWith('/') ? relativeDir : `${relativeDir}/`;
    const encoded = dirPath
      .split('/')
      .filter(Boolean)
      .map(encodeURIComponent)
      .join('/');

    log.debug(`Listing notes via REST API: ${relativeDir} (recursive=${recursive})`);

    const res = await this.request('GET', `/vault/${encoded}/`);

    if (res.status === 404) {
      log.warn(`Directory not found: ${relativeDir}`);
      return [];
    }
    if (!res.ok) {
      throw new Error(`ObsidianStore.listNotes failed: ${res.status} — ${relativeDir}`);
    }

    const json = (await res.json()) as { files: string[] };
    let files = (json.files ?? []).filter((f) => f.endsWith('.md'));

    if (recursive) {
      // Recurse into subdirectories reported without .md extension
      const subdirs = (json.files ?? []).filter((f) => !f.includes('.'));
      for (const sub of subdirs) {
        const subPath = `${relativeDir}/${sub}`.replace(/\/+/g, '/');
        const subFiles = await this.listNotes(subPath, true);
        files = files.concat(subFiles);
      }
    }

    // Prefix with parent dir to get vault-relative paths
    return files.map((f) => `${relativeDir}/${f}`.replace(/\/+/g, '/'));
  }

  /**
   * Search notes using Obsidian REST API simple search.
   * Falls back to local content scan if REST search returns no results.
   */
  async searchNotes(relativeDir: string, query: string): Promise<NoteData[]> {
    log.debug(`Searching "${query}" in ${relativeDir}`);

    // Use REST API simple search endpoint
    const res = await this.request(
      'POST',
      `/search/simple/?query=${encodeURIComponent(query)}&contextLength=100`,
    );

    if (res.ok) {
      const hits = (await res.json()) as Array<{ filename: string; score: number }>;
      // Filter to only notes under relativeDir
      const filtered = hits
        .filter((h) => h.filename.startsWith(relativeDir))
        .slice(0, 20);

      const results: NoteData[] = [];
      for (const hit of filtered) {
        try {
          const note = await this.readNote(hit.filename);
          results.push(note);
        } catch (err) {
          log.warn(`Failed to read search result: ${hit.filename}`, err);
        }
      }
      log.info(`REST search found ${results.length} matches for "${query}"`);
      return results;
    }

    // Fallback: local keyword scan
    log.warn(`REST search failed (${res.status}), falling back to local scan`);
    return this._localSearch(relativeDir, query);
  }

  /** Local content scan fallback */
  private async _localSearch(relativeDir: string, query: string): Promise<NoteData[]> {
    const allNotes = await this.listNotes(relativeDir, true);
    const tokens = query
      .toLowerCase()
      .split(/\s+/)
      .map((t) => t.replace(/[.,;:!?'"()\[\]{}<>]/g, ''))
      .filter((t) => t.length > 0);

    const results: NoteData[] = [];
    for (const notePath of allNotes) {
      try {
        const note = await this.readNote(notePath);
        const raw = `${notePath} ${JSON.stringify(note.frontmatter)} ${note.content}`;
        const searchable = raw.toLowerCase().replace(/[.,;:!?'"()\[\]{}<>]/g, ' ');
        if (tokens.every((t) => searchable.includes(t))) {
          results.push(note);
        }
      } catch (err) {
        log.warn(`Failed to read note during local search: ${notePath}`, err);
      }
    }
    return results;
  }

  /**
   * Check if a note or directory exists.
   */
  async exists(relativePath: string): Promise<boolean> {
    const encoded = relativePath.split('/').map(encodeURIComponent).join('/');
    const res = await this.request('GET', `/vault/${encoded}`);
    return res.ok;
  }

  /**
   * Delete a note from the vault.
   */
  async deleteNote(relativePath: string): Promise<boolean> {
    const encoded = relativePath.split('/').map(encodeURIComponent).join('/');
    const res = await this.request('DELETE', `/vault/${encoded}`);
    if (res.ok) {
      this.noteCache.delete(relativePath);
      log.info(`Deleted note (REST API): ${relativePath}`);
      return true;
    }
    if (res.status === 404) {
      log.debug(`Note not found for deletion: ${relativePath}`);
      return false;
    }
    throw new Error(`ObsidianStore.deleteNote failed: ${res.status} — ${relativePath}`);
  }

  /**
   * Get cache performance statistics.
   */
  getCacheStats(): { hits: number; misses: number; invalidations: number; size: number } {
    return { ...this.cacheStats, size: this.noteCache.size };
  }

  /**
   * Clear the entire note cache.
   */
  clearNoteCache(): void {
    this.noteCache.clear();
    this.cacheStats = { hits: 0, misses: 0, invalidations: 0 };
    log.info('Note cache cleared');
  }
}
