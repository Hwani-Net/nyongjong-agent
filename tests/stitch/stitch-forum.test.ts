// Tests for stitch-forum — Discourse RSS parser & classifier
// NOTE: These tests mock fetch() to avoid real network calls
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { checkStitchForum } from '../../src/stitch/stitch-forum.js';

// Sample RSS XML fixture
const SAMPLE_RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Stitch - Google AI Developer Forum</title>
    <item>
      <title>New MCP export feature released!</title>
      <link>https://discuss.ai.google.dev/t/new-mcp-export/123</link>
      <pubDate>Mon, 03 Mar 2026 10:00:00 +0000</pubDate>
      <description><![CDATA[<p>We've shipped a new MCP export feature that allows...</p>]]></description>
    </item>
    <item>
      <title>How to design a login page</title>
      <link>https://discuss.ai.google.dev/t/login-design/124</link>
      <pubDate>Sun, 02 Mar 2026 08:00:00 +0000</pubDate>
      <description>A simple question about designing login pages without any keywords.</description>
    </item>
    <item>
      <title>Bug fix for Gemini CLI integration</title>
      <link>https://discuss.ai.google.dev/t/gemini-cli-fix/125</link>
      <pubDate>Sat, 01 Mar 2026 12:00:00 +0000</pubDate>
      <description><![CDATA[<p>Fixed a bug in the Gemini CLI agent connection.</p>]]></description>
    </item>
    <item>
      <title>General question about Stitch</title>
      <link>https://discuss.ai.google.dev/t/general-stitch/126</link>
      <pubDate>Fri, 28 Feb 2026 09:00:00 +0000</pubDate>
      <description>Just wondering about general features.</description>
    </item>
  </channel>
</rss>`;

// Mock fetch globally
const originalFetch = globalThis.fetch;

beforeEach(() => {
  // Reset fetch mock before each test
  globalThis.fetch = vi.fn();
});

// Restore after all tests
afterAll(() => {
  globalThis.fetch = originalFetch;
});

// Import afterAll
import { afterAll } from 'vitest';

describe('StitchForum', () => {
  it('should parse all posts from RSS', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response(SAMPLE_RSS, { status: 200 }),
    );

    const result = await checkStitchForum();
    expect(result.totalNew).toBe(4);
    expect(result.lastChecked).toBeDefined();
  });

  it('should classify relevant posts by keywords', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response(SAMPLE_RSS, { status: 200 }),
    );

    const result = await checkStitchForum();
    // "New MCP export feature released!" matches: mcp, export, new feature
    expect(result.relevantPosts.length).toBeGreaterThanOrEqual(1);
    const mcpPost = result.relevantPosts.find(p => p.title.includes('MCP'));
    expect(mcpPost).toBeDefined();
    expect(mcpPost!.matchedKeywords).toContain('mcp');
    expect(mcpPost!.matchedKeywords).toContain('export');
    expect(mcpPost!.isRelevant).toBe(true);
  });

  it('should classify non-relevant posts', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response(SAMPLE_RSS, { status: 200 }),
    );

    const result = await checkStitchForum();
    // "How to design a login page" has no skill keywords
    expect(result.otherPosts.length).toBeGreaterThanOrEqual(1);
    const loginPost = result.otherPosts.find(p => p.title.includes('login'));
    expect(loginPost).toBeDefined();
    expect(loginPost!.isRelevant).toBe(false);
    expect(loginPost!.matchedKeywords).toEqual([]);
  });

  it('should filter by lastCheckDate', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response(SAMPLE_RSS, { status: 200 }),
    );

    // Only posts after March 2 00:00 UTC should be returned
    const result = await checkStitchForum('2026-03-02');
    expect(result.totalNew).toBe(2); // Mar 2 08:00 + Mar 3 10:00
  });

  it('should handle CDATA in descriptions', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response(SAMPLE_RSS, { status: 200 }),
    );

    const result = await checkStitchForum();
    const mcpPost = result.relevantPosts.find(p => p.title.includes('MCP'));
    // HTML tags should be stripped from description
    expect(mcpPost?.description).not.toContain('<p>');
    expect(mcpPost?.description).toContain('shipped');
  });

  it('should generate recommendation when relevant posts found', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response(SAMPLE_RSS, { status: 200 }),
    );

    const result = await checkStitchForum();
    expect(result.recommendation).toContain('⚠️');
    expect(result.recommendation).toContain('스킬 관련 새 글');
  });

  it('should generate clean recommendation when no relevant posts', async () => {
    const noRelevantRss = `<?xml version="1.0"?>
    <rss><channel>
      <item>
        <title>Random chat about weather</title>
        <link>https://example.com/1</link>
        <pubDate>Mon, 03 Mar 2026 10:00:00 +0000</pubDate>
        <description>Nothing related here.</description>
      </item>
    </channel></rss>`;

    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response(noRelevantRss, { status: 200 }),
    );

    const result = await checkStitchForum();
    expect(result.recommendation).toContain('✅');
    expect(result.relevantPosts).toEqual([]);
  });

  it('should handle fetch failure gracefully', async () => {
    vi.mocked(globalThis.fetch).mockRejectedValue(new Error('Network error'));

    const result = await checkStitchForum();
    expect(result.totalNew).toBe(0);
    expect(result.relevantPosts).toEqual([]);
    expect(result.recommendation).toContain('❌');
    expect(result.recommendation).toContain('Network error');
  });

  it('should handle HTTP error status', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response('Not Found', { status: 404, statusText: 'Not Found' }),
    );

    const result = await checkStitchForum();
    expect(result.totalNew).toBe(0);
    expect(result.recommendation).toContain('❌');
  });

  it('should handle empty RSS', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response('<rss><channel></channel></rss>', { status: 200 }),
    );

    const result = await checkStitchForum();
    expect(result.totalNew).toBe(0);
    expect(result.relevantPosts).toEqual([]);
    expect(result.otherPosts).toEqual([]);
  });

  it('should detect gemini cli keyword', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response(SAMPLE_RSS, { status: 200 }),
    );

    const result = await checkStitchForum();
    const cliPost = result.relevantPosts.find(p => p.title.includes('Gemini CLI'));
    expect(cliPost).toBeDefined();
    expect(cliPost!.matchedKeywords).toContain('gemini cli');
  });

  it('should detect bug fix keyword', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response(SAMPLE_RSS, { status: 200 }),
    );

    const result = await checkStitchForum();
    const bugPost = result.relevantPosts.find(p => p.title.includes('Bug fix'));
    expect(bugPost).toBeDefined();
    expect(bugPost!.matchedKeywords).toContain('bug fix');
  });
});
