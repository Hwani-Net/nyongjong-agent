// Tests for ObsidianStore — REST API adapter (mocked fetch)
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ObsidianStore } from '../../src/core/obsidian-store.js';

// ── Minimal fetch mock helpers ─────────────────────────────────────────────
function makeResponse(
  body: string | object,
  status = 200,
  headers: Record<string, string> = {},
): Response {
  const bodyStr = typeof body === 'string' ? body : JSON.stringify(body);
  const finalHeaders: Record<string, string> = {
    'content-type': typeof body === 'string' ? 'text/plain' : 'application/json',
    etag: '"test-etag-123"',
    ...headers,
  };
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: (key: string) => finalHeaders[key.toLowerCase()] ?? null,
    },
    text: async () => bodyStr,
    json: async () => JSON.parse(bodyStr),
  } as unknown as Response;
}

const STORE_OPTS = { apiKey: 'test-api-key', apiUrl: 'http://127.0.0.1:27123' };

describe('ObsidianStore', () => {
  let store: ObsidianStore;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    store = new ObsidianStore(STORE_OPTS);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should write and read a note with frontmatter', async () => {
    // PUT (write)
    fetchMock.mockResolvedValueOnce(makeResponse('', 200));
    await store.writeNote('test/hello.md', '# Hello World\n\nThis is a test.', {
      title: 'Hello',
      tags: ['test', 'demo'],
    });

    // GET (read) — returns YAML+content
    const raw = '---\ntitle: Hello\ntags:\n  - test\n  - demo\n---\n# Hello World\n\nThis is a test.';
    fetchMock.mockResolvedValueOnce(makeResponse(raw, 200, { etag: '"abc"' }));
    const note = await store.readNote('test/hello.md');

    expect(note.frontmatter.title).toBe('Hello');
    expect(note.frontmatter.tags).toEqual(['test', 'demo']);
    expect(note.content).toContain('# Hello World');
  });

  it('should write a note without frontmatter', async () => {
    fetchMock.mockResolvedValueOnce(makeResponse('', 200));
    await store.writeNote('plain.md', 'Just plain text.');

    fetchMock.mockResolvedValueOnce(makeResponse('Just plain text.', 200, { etag: '"111"' }));
    const note = await store.readNote('plain.md');

    expect(note.content).toBe('Just plain text.');
    expect(Object.keys(note.frontmatter)).toHaveLength(0);
  });

  it('should list markdown notes in a directory', async () => {
    // listNotes calls GET /vault/notes/
    fetchMock.mockResolvedValueOnce(
      makeResponse({ files: ['a.md', 'b.md', 'c.txt'] }, 200),
    );
    const notes = await store.listNotes('notes');
    // Only .md files
    expect(notes).toHaveLength(2);
    expect(notes).toContain('notes/a.md');
    expect(notes).toContain('notes/b.md');
  });

  it('should list notes recursively', async () => {
    // First call: top-level dir with one subdir
    fetchMock.mockResolvedValueOnce(makeResponse({ files: ['level1'] }, 200));
    // Second call: level1 subdir with two .md files
    fetchMock.mockResolvedValueOnce(
      makeResponse({ files: ['a.md', 'b.md'] }, 200),
    );

    const recursive = await store.listNotes('deep', true);
    expect(recursive).toHaveLength(2);
  });

  it('should search notes via REST API', async () => {
    // searchNotes → POST /search/simple/
    fetchMock.mockResolvedValueOnce(
      makeResponse(
        [
          { filename: 'search/alpha.md', score: 1 },
          { filename: 'search/gamma.md', score: 0.8 },
        ],
        200,
      ),
    );
    // Then readNote for each hit
    const alphaRaw = 'The quick brown fox';
    const gammaRaw = 'Quick brown kangaroo';
    fetchMock.mockResolvedValueOnce(makeResponse(alphaRaw, 200, { etag: '"alpha"' }));
    fetchMock.mockResolvedValueOnce(makeResponse(gammaRaw, 200, { etag: '"gamma"' }));

    const results = await store.searchNotes('search', 'quick brown');
    expect(results).toHaveLength(2);
    expect(results.map((r) => r.path)).toContain('search/alpha.md');
    expect(results.map((r) => r.path)).toContain('search/gamma.md');
  });

  it('should check existence of notes', async () => {
    fetchMock.mockResolvedValueOnce(makeResponse('content', 200));
    expect(await store.exists('exists/real.md')).toBe(true);

    fetchMock.mockResolvedValueOnce(makeResponse('', 404));
    expect(await store.exists('exists/fake.md')).toBe(false);
  });

  it('should return empty list for non-existent directory', async () => {
    fetchMock.mockResolvedValueOnce(makeResponse('', 404));
    const notes = await store.listNotes('nope');
    expect(notes).toEqual([]);
  });

  it('should use ETag cache for repeated reads', async () => {
    // First read — cache miss
    const raw = 'Hello cached';
    fetchMock.mockResolvedValueOnce(makeResponse(raw, 200, { etag: '"etag-v1"' }));
    await store.readNote('notes/cached.md');

    // Second read — 304 Not Modified → return cache
    fetchMock.mockResolvedValueOnce(makeResponse('', 304));
    const note2 = await store.readNote('notes/cached.md');
    expect(note2.content).toBe('Hello cached');

    const stats = store.getCacheStats();
    expect(stats.hits).toBe(1);
    expect(stats.misses).toBe(1);
  });

  it('should delete a note', async () => {
    fetchMock.mockResolvedValueOnce(makeResponse('', 200));
    const result = await store.deleteNote('del/file.md');
    expect(result).toBe(true);
  });

  it('should return false when deleting non-existent note', async () => {
    fetchMock.mockResolvedValueOnce(makeResponse('', 404));
    const result = await store.deleteNote('del/missing.md');
    expect(result).toBe(false);
  });

  it('should fall back to local search when REST search fails', async () => {
    // searchNotes: REST search returns 500
    fetchMock.mockResolvedValueOnce(makeResponse('error', 500));
    // listNotes (fallback)
    fetchMock.mockResolvedValueOnce(makeResponse({ files: ['keywords.md', 'unrelated.md'] }, 200));
    // readNote keywords.md
    fetchMock.mockResolvedValueOnce(makeResponse('Keywords: TypeScript, Node.js, MCP, Obsidian, JWT', 200, { etag: '"k"' }));
    // readNote unrelated.md
    fetchMock.mockResolvedValueOnce(makeResponse('No matching content here.', 200, { etag: '"u"' }));

    const results = await store.searchNotes('search', 'MCP');
    expect(results).toHaveLength(1);
    expect(results[0].path).toBe('search/keywords.md');
  });

  it('should match file path keywords in local search', async () => {
    fetchMock.mockResolvedValueOnce(makeResponse('error', 500));
    fetchMock.mockResolvedValueOnce(makeResponse({ files: ['api-keys-issued.md'] }, 200));
    fetchMock.mockResolvedValueOnce(makeResponse('KOSIS key issued.', 200, { etag: '"kosis"' }));

    const results = await store.searchNotes('notes', 'api-keys');
    expect(results).toHaveLength(1);
    expect(results[0].path).toBe('notes/api-keys-issued.md');
  });
});
