// Obsidian Vault filesystem adapter — reads/writes markdown with YAML frontmatter
import { readFile, writeFile, readdir, stat, mkdir } from 'fs/promises';
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
   */
  async readNote(relativePath: string): Promise<NoteData> {
    const fullPath = this.resolvePath(relativePath);
    log.debug(`Reading note: ${relativePath}`);

    const raw = await readFile(fullPath, 'utf-8');
    const parsed = matter(raw);

    return {
      path: relativePath,
      frontmatter: parsed.data as Record<string, unknown>,
      content: parsed.content.trim(),
    };
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
   */
  async searchNotes(relativeDir: string, query: string): Promise<NoteData[]> {
    log.debug(`Searching for "${query}" in ${relativeDir}`);

    const allNotes = await this.listNotes(relativeDir, true);
    const results: NoteData[] = [];

    // Split query into individual tokens for AND matching
    const tokens = query.toLowerCase().split(/\s+/).filter(t => t.length > 0);

    for (const notePath of allNotes) {
      try {
        const note = await this.readNote(notePath);
        const searchable = `${JSON.stringify(note.frontmatter)} ${note.content}`.toLowerCase();

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
}
