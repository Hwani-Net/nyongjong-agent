// Tests for ObsidianStore — file-based CRUD with YAML frontmatter
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { ObsidianStore } from '../../src/core/obsidian-store.js';

describe('ObsidianStore', () => {
  let tempDir: string;
  let store: ObsidianStore;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'obsidian-test-'));
    store = new ObsidianStore({ vaultPath: tempDir });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('should write and read a note with frontmatter', async () => {
    await store.writeNote('test/hello.md', '# Hello World\n\nThis is a test.', {
      title: 'Hello',
      tags: ['test', 'demo'],
    });

    const note = await store.readNote('test/hello.md');
    expect(note.frontmatter.title).toBe('Hello');
    expect(note.frontmatter.tags).toEqual(['test', 'demo']);
    expect(note.content).toContain('# Hello World');
  });

  it('should write a note without frontmatter', async () => {
    await store.writeNote('plain.md', 'Just plain text.');

    const note = await store.readNote('plain.md');
    expect(note.content).toBe('Just plain text.');
    expect(Object.keys(note.frontmatter)).toHaveLength(0);
  });

  it('should list markdown notes in a directory', async () => {
    await store.writeNote('notes/a.md', 'Note A');
    await store.writeNote('notes/b.md', 'Note B');
    await store.writeNote('notes/c.txt', 'Not a note'); // Should be excluded

    const notes = await store.listNotes('notes');
    expect(notes).toHaveLength(2);
    expect(notes).toContain('notes/a.md');
    expect(notes).toContain('notes/b.md');
  });

  it('should list notes recursively', async () => {
    await store.writeNote('deep/level1/a.md', 'A');
    await store.writeNote('deep/level1/level2/b.md', 'B');

    const flat = await store.listNotes('deep', false);
    expect(flat).toHaveLength(0); // No .md files directly in 'deep/'

    const recursive = await store.listNotes('deep', true);
    expect(recursive).toHaveLength(2);
  });

  it('should search notes by content', async () => {
    await store.writeNote('search/alpha.md', 'The quick brown fox');
    await store.writeNote('search/beta.md', 'The lazy dog');
    await store.writeNote('search/gamma.md', 'Quick brown kangaroo');

    const results = await store.searchNotes('search', 'quick brown');
    expect(results).toHaveLength(2);
    expect(results.map((r) => r.path)).toContain('search/alpha.md');
    expect(results.map((r) => r.path)).toContain('search/gamma.md');
  });

  it('should check existence of notes', async () => {
    await store.writeNote('exists/real.md', 'I exist');

    expect(await store.exists('exists/real.md')).toBe(true);
    expect(await store.exists('exists/fake.md')).toBe(false);
  });

  it('should return empty list for non-existent directory', async () => {
    const notes = await store.listNotes('nope');
    expect(notes).toEqual([]);
  });

  it('should search English keywords with surrounding punctuation', async () => {
    await store.writeNote('search/keywords.md', 'Keywords: TypeScript, Node.js, MCP, Obsidian, JWT');
    await store.writeNote('search/unrelated.md', 'No matching content here.');

    // "MCP" appears as "MCP," with trailing comma — should still match after punctuation stripping
    const results = await store.searchNotes('search', 'MCP');
    expect(results).toHaveLength(1);
    expect(results[0].path).toBe('search/keywords.md');

    // Multi-word AND with punctuation: "TypeScript" and "JWT" both appear
    const multi = await store.searchNotes('search', 'TypeScript JWT');
    expect(multi).toHaveLength(1);
  });

  it('should match file path keywords in search', async () => {
    await store.writeNote('notes/api-keys-issued.md', 'KOSIS key issued.');

    // Searching for "api-keys" should match via file path
    const results = await store.searchNotes('notes', 'api-keys');
    expect(results).toHaveLength(1);
  });
});
