// Obsidian Vault filesystem adapter — reads/writes markdown with YAML frontmatter
import { readFile, writeFile, readdir, stat, mkdir, unlink } from 'fs/promises';
import { join, resolve, extname } from 'path';
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
  /** Absolute path to the Obsidian vault root */
  vaultPath: string;
}

export class ObsidianStore {
  private vaultPath: string;

  /**
   * In-memory cache: path → { note, mtimeMs }
   * Mirrors Firestore's IndexedDB persistence — first load reads all files,
   * subsequent loads only re-read files whose mtime has changed (delta sync).
   */
  private noteCache = new Map<string, { note: NoteData; mtimeMs: number }>();

  /** Cache hit/miss stats for monitoring */
  private cacheStats = { hits: 0, misses: 0, invalidations: 0 };

  constructor(options: ObsidianStoreOptions) {
    this.vaultPath = resolve(options.vaultPath);
    log.info('ObsidianStore initialized', { vaultPath: this.vaultPath });
  }

  /**
   * Resolve a vault-relative path to an absolute path.
   */
  private resolvePath(relativePath: string): string {
    return join(this.vaultPath, relativePath);
  }

  /**
   * Read a markdown note and parse its YAML frontmatter.
   * Uses mtime-based delta sync: if the file hasn't changed since last read,
   * returns the cached version (same principle as Firestore IndexedDB persistence).
   */
  async readNote(relativePath: string): Promise<NoteData> {
    const fullPath = this.resolvePath(relativePath);

    // Get current file mtime
    const fileStat = await stat(fullPath);
    const currentMtime = fileStat.mtimeMs;

    // Check cache: if mtime matches, return cached note (delta sync)
    const cached = this.noteCache.get(relativePath);
    if (cached && cached.mtimeMs === currentMtime) {
      this.cacheStats.hits++;
      log.debug(`Cache hit (mtime unchanged): ${relativePath}`);
      return cached.note;
    }

    // Cache miss or file changed — re-read and parse
    if (cached) {
      this.cacheStats.invalidations++;
      log.debug(`Cache invalidated (mtime changed): ${relativePath}`);
    } else {
      this.cacheStats.misses++;
    }

    const raw = await readFile(fullPath, 'utf-8');
    const parsed = matter(raw);

    const note: NoteData = {
      path: relativePath,
      frontmatter: parsed.data as Record<string, unknown>,
      content: parsed.content.trim(),
    };

    // Store in cache with current mtime
    this.noteCache.set(relativePath, { note, mtimeMs: currentMtime });

    return note;
  }

  /**
   * Write a markdown note with optional YAML frontmatter.
   * Creates parent directories if they don't exist.
   */
  async writeNote(
    relativePath: string,
    content: string,
    frontmatter?: Record<string, unknown>,
  ): Promise<void> {
    const fullPath = this.resolvePath(relativePath);
    log.debug(`Writing note: ${relativePath}`);

    // Ensure parent directory exists
    const dir = fullPath.substring(0, fullPath.lastIndexOf('/') > 0 ? fullPath.lastIndexOf('/') : fullPath.lastIndexOf('\\'));
    await mkdir(dir, { recursive: true });

    let output: string;
    if (frontmatter && Object.keys(frontmatter).length > 0) {
      output = matter.stringify(content, frontmatter);
    } else {
      output = content;
    }

    await writeFile(fullPath, output, 'utf-8');

    // Update cache with new content and mtime
    const newStat = await stat(fullPath);
    const note: NoteData = {
      path: relativePath,
      frontmatter: frontmatter ?? {},
      content,
    };
    this.noteCache.set(relativePath, { note, mtimeMs: newStat.mtimeMs });

    log.info(`Note written: ${relativePath}`);
  }

  /**
   * List all markdown notes in a directory (non-recursive by default).
   */
  async listNotes(relativeDir: string, recursive = false): Promise<string[]> {
    const fullDir = this.resolvePath(relativeDir);
    log.debug(`Listing notes in: ${relativeDir}`);

    const results: string[] = [];

    async function walk(dir: string, base: string) {
      let entries;
      try {
        entries = await readdir(dir, { withFileTypes: true });
      } catch {
        log.warn(`Directory not found: ${dir}`);
        return;
      }

      for (const entry of entries) {
        const entryPath = join(base, entry.name);
        if (entry.isFile() && extname(entry.name) === '.md') {
          results.push(entryPath.replace(/\\/g, '/'));
        } else if (entry.isDirectory() && recursive) {
          await walk(join(dir, entry.name), entryPath);
        }
      }
    }

    await walk(fullDir, relativeDir);
    return results;
  }

  /**
   * Search notes for text matches in content or frontmatter.
   * Multi-word queries use AND logic — each word must appear somewhere in the note.
   * Single-word queries use simple substring matching.
   * Punctuation is stripped before matching so "MCP," matches "MCP".
   * File paths are included in the searchable text.
   */
  async searchNotes(relativeDir: string, query: string): Promise<NoteData[]> {
    log.debug(`Searching for "${query}" in ${relativeDir}`);

    const allNotes = await this.listNotes(relativeDir, true);
    const results: NoteData[] = [];

    // Strip punctuation from query tokens for fuzzy matching
    const tokens = query
      .toLowerCase()
      .split(/\s+/)
      .map(t => t.replace(/[.,;:!?'"()\[\]{}<>]/g, ''))
      .filter(t => t.length > 0);

    for (const notePath of allNotes) {
      try {
        const note = await this.readNote(notePath);
        // Include file path in searchable text so filename keywords also match
        const raw = `${notePath} ${JSON.stringify(note.frontmatter)} ${note.content}`;
        // Strip punctuation from searchable text too for consistent matching
        const searchable = raw.toLowerCase().replace(/[.,;:!?'"()\[\]{}<>]/g, ' ');

        // AND matching: every token must appear in the searchable text
        const allMatch = tokens.every(token => searchable.includes(token));
        if (allMatch) {
          results.push(note);
        }
      } catch (err) {
        log.warn(`Failed to read note during search: ${notePath}`, err);
      }
    }

    log.info(`Search found ${results.length} matches for "${query}" (${tokens.length} tokens)`);
    return results;
  }

  /**
   * Check if a note or directory exists in the vault.
   */
  async exists(relativePath: string): Promise<boolean> {
    try {
      await stat(this.resolvePath(relativePath));
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Delete a note from the vault.
   * Returns true if the file was deleted, false if it didn't exist.
   */
  async deleteNote(relativePath: string): Promise<boolean> {
    const fullPath = this.resolvePath(relativePath);
    try {
      await unlink(fullPath);
      this.noteCache.delete(relativePath);
      log.info(`Deleted note: ${relativePath}`);
      return true;
    } catch (err: any) {
      if (err.code === 'ENOENT') {
        log.debug(`Note not found for deletion: ${relativePath}`);
        return false;
      }
      throw err;
    }
  }

  /**
   * Get cache performance statistics.
   * Useful for monitoring delta sync effectiveness.
   */
  getCacheStats(): { hits: number; misses: number; invalidations: number; size: number } {
    return {
      ...this.cacheStats,
      size: this.noteCache.size,
    };
  }

  /**
   * Clear the entire note cache.
   * Forces full re-read on next access (like Firestore cache clear).
   */
  clearNoteCache(): void {
    this.noteCache.clear();
    this.cacheStats = { hits: 0, misses: 0, invalidations: 0 };
    log.info('Note cache cleared');
  }
}
