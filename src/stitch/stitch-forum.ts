// Stitch Forum Monitor — parse Discourse RSS for new posts
// Checks https://discuss.ai.google.dev/c/stitch/61.rss

import { createLogger } from '../utils/logger.js';

const log = createLogger('stitch-forum');

const STITCH_RSS_URL = 'https://discuss.ai.google.dev/c/stitch/61.rss';

// Keywords that indicate a post is relevant to our skills
const SKILL_KEYWORDS = [
  'mcp', 'design system', 'api', 'export', 'figma', 'prototype',
  'new feature', 'update', 'model', 'variant', 'prompt',
  'bug fix', 'fixed', 'shipped', 'release', 'launch',
  'ideate', 'agent', 'antigravity', 'gemini cli',
];

export interface ForumPost {
  title: string;
  link: string;
  pubDate: string;
  description: string;
  isRelevant: boolean;
  matchedKeywords: string[];
}

export interface ForumCheckResult {
  totalNew: number;
  relevantPosts: ForumPost[];
  otherPosts: ForumPost[];
  lastChecked: string;
  recommendation: string;
}

/**
 * Check the Stitch forum RSS feed for new posts.
 *
 * @param lastCheckDate - ISO date string of last check (filters posts after this)
 * @returns Parsed and classified forum posts
 */
export async function checkStitchForum(lastCheckDate?: string): Promise<ForumCheckResult> {
  log.info('Checking Stitch forum RSS', { lastCheckDate });

  let rssText: string;
  try {
    const response = await fetch(STITCH_RSS_URL, {
      headers: { 'User-Agent': 'NongjongAgent/1.0 StitchForumMonitor' },
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) {
      throw new Error(`RSS fetch failed: ${response.status} ${response.statusText}`);
    }
    rssText = await response.text();
  } catch (err) {
    log.error('Failed to fetch Stitch RSS', err);
    return {
      totalNew: 0,
      relevantPosts: [],
      otherPosts: [],
      lastChecked: new Date().toISOString(),
      recommendation: `❌ RSS 피드 접근 실패: ${String(err)}. 네트워크 확인 필요.`,
    };
  }

  // Parse RSS XML (simple regex-based parser — no XML dependency needed)
  const posts = parseRssItems(rssText);

  // Filter by date if provided
  const cutoff = lastCheckDate ? new Date(lastCheckDate) : new Date(0);
  const newPosts = posts.filter(p => new Date(p.pubDate) > cutoff);

  // Classify posts by relevance
  const relevantPosts: ForumPost[] = [];
  const otherPosts: ForumPost[] = [];

  for (const post of newPosts) {
    const matched = classifyPost(post);
    if (matched.length > 0) {
      relevantPosts.push({ ...post, isRelevant: true, matchedKeywords: matched });
    } else {
      otherPosts.push({ ...post, isRelevant: false, matchedKeywords: [] });
    }
  }

  // Generate recommendation
  let recommendation: string;
  if (relevantPosts.length === 0) {
    recommendation = '✅ 스킬 업데이트가 필요한 새 글이 없습니다.';
  } else {
    const keywords = [...new Set(relevantPosts.flatMap(p => p.matchedKeywords))];
    recommendation = `⚠️ 스킬 관련 새 글 ${relevantPosts.length}개 발견!\n` +
      `키워드: ${keywords.join(', ')}\n` +
      `→ 스킬 업데이트 검토가 필요합니다.`;
  }

  return {
    totalNew: newPosts.length,
    relevantPosts,
    otherPosts,
    lastChecked: new Date().toISOString(),
    recommendation,
  };
}

// ── Helpers ──

function parseRssItems(xml: string): ForumPost[] {
  const items: ForumPost[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;

  while ((match = itemRegex.exec(xml)) !== null) {
    const itemXml = match[1];
    const title = extractTag(itemXml, 'title');
    const link = extractTag(itemXml, 'link');
    const pubDate = extractTag(itemXml, 'pubDate');
    const description = extractTag(itemXml, 'description')
      .replace(/<[^>]+>/g, '') // Strip HTML tags
      .slice(0, 300); // Truncate

    if (title && link) {
      items.push({
        title,
        link,
        pubDate: pubDate || new Date().toISOString(),
        description,
        isRelevant: false,
        matchedKeywords: [],
      });
    }
  }

  return items;
}

function extractTag(xml: string, tagName: string): string {
  // Handle CDATA and regular content
  const cdataRegex = new RegExp(`<${tagName}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tagName}>`, 'i');
  const cdataMatch = cdataRegex.exec(xml);
  if (cdataMatch) return cdataMatch[1].trim();

  const regex = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)</${tagName}>`, 'i');
  const match = regex.exec(xml);
  return match ? match[1].trim() : '';
}

function classifyPost(post: ForumPost): string[] {
  const searchText = `${post.title} ${post.description}`.toLowerCase();
  return SKILL_KEYWORDS.filter(kw => searchText.includes(kw.toLowerCase()));
}
