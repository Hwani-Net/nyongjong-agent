// Market Research — proactive competitor benchmarking for new projects
// Design doc: unified_agent_architecture.md Section 4.4 (STEP 2 벤치마크)
// Hybrid: Naver (Korean) → Tavily SDK → WebScraper fallback

import { createLogger } from '../utils/logger.js';
import { NaverSearchAdapter } from './adapters/naver-search.js';
import { WebScraperAdapter } from './adapters/web-scraper.js';
import type { UnderstandOutput } from '../workflow/understand.js';

const log = createLogger('market-research');

// ─── Interfaces ───

export interface CompetitorInfo {
  /** App/service name */
  name: string;
  /** Key features or description */
  description: string;
  /** Source of this info (Naver, web scraper, etc.) */
  source: string;
}

export interface MarketResearchResult {
  /** The category/domain researched */
  category: string;
  /** Platform (android/ios/web) */
  platform: string;
  /** Original goal for context */
  goal: string;
  /** Discovered competitors */
  competitors: CompetitorInfo[];
  /** Raw search results for further analysis */
  rawData: string[];
  /** Overall market assessment */
  assessment: string;
  /** Duration of the research in ms */
  durationMs: number;
  /** Whether the research was successful */
  success: boolean;
  /** Error message if failed */
  error?: string;
}

// ─── Trigger Condition ───

/**
 * Determine if market research should run for this analysis.
 *
 * Only triggers for:
 * - New projects (not existing project extensions)
 * - Medium or higher complexity
 * - Not documentation or simple tasks
 */
export function shouldResearchMarket(analysis: UnderstandOutput): boolean {
  const { scope, taskType, complexity } = analysis.analysis;
  const isNewProject = scope === '새 프로젝트';
  const isSubstantial = taskType !== 'documentation' && taskType !== 'simple';
  const isComplex = complexity !== 'low';

  const should = isNewProject && isSubstantial && isComplex;
  log.info('shouldResearchMarket', { isNewProject, isSubstantial, isComplex, result: should });
  return should;
}

// ─── Extract Category from Goal ───

/**
 * Extract the app/service category from the goal text.
 * e.g., "가계부 앱 만들어줘" → "가계부"
 */
export function extractCategory(goal: string): string {
  // Try to match pattern: "X 앱/서비스/플랫폼/시스템 만들어/구축/개발"
  const categoryMatch = goal.match(
    /([가-힣\w]{2,10})\s*(?:앱|어플|애플리케이션|서비스|플랫폼|시스템|사이트|웹|도구|툴)/i,
  );
  if (categoryMatch) return categoryMatch[1];

  // Fallback: first noun-like phrase (Korean 2-6 chars)
  const fallback = goal.match(/([가-힣]{2,6})/);
  return fallback ? fallback[1] : goal.slice(0, 20);
}

// ─── Core Research Function ───

/**
 * Research the market for a given category.
 *
 * Uses existing Naver Search adapter for Korean market data
 * and Web Scraper as fallback.
 */
export async function researchMarket(
  category: string,
  platform: string = 'android',
  goal: string = '',
): Promise<MarketResearchResult> {
  const start = Date.now();
  log.info('Starting market research', { category, platform });

  const naver = new NaverSearchAdapter();
  const webScraper = new WebScraperAdapter();

  const competitors: CompetitorInfo[] = [];
  const rawData: string[] = [];

  // ─── Tier 1: Naver (Korean market, best coverage) ───
  if (naver.isConfigured()) {
    try {
      const newsResult = await naver.searchNews(`${category} 앱 시장 경쟁 2026`);
      if (newsResult.success && newsResult.data) {
        rawData.push(`[Naver News] ${newsResult.data}`);
        for (const name of extractCompetitorNames(newsResult.data)) {
          competitors.push({ name, description: `Naver 뉴스에서 발견: "${category}" 시장`, source: 'Naver News' });
        }
      }
    } catch (err) { log.warn('Naver news search failed', err); }

    try {
      const blogResult = await naver.searchBlog(`${category} 앱 추천 비교 리뷰`);
      if (blogResult.success && blogResult.data) {
        rawData.push(`[Naver Blog] ${blogResult.data}`);
        for (const name of extractCompetitorNames(blogResult.data)) {
          if (!competitors.some(c => c.name === name)) {
            competitors.push({ name, description: `Naver 블로그 리뷰에서 발견: "${category}"`, source: 'Naver Blog' });
          }
        }
      }
    } catch (err) { log.warn('Naver blog search failed', err); }
  }

  // ─── Tier 2: Tavily SDK (structured web search, API key optional) ───
  if (competitors.length < 3) {
    const tavilyKey = process.env.TAVILY_API_KEY;
    if (tavilyKey) {
      try {
        const { tavily } = await import('@tavily/core');
        const client = tavily({ apiKey: tavilyKey });

        const searchQuery = `${category} 앱 경쟁사 순위 ${platform === 'android' ? 'Android' : platform} 2026`;
        log.info('Tavily market search', { query: searchQuery });

        const result = await client.search(searchQuery, {
          maxResults: 5,
          searchDepth: 'basic',
        });

        for (const item of result.results || []) {
          const snippet = `${item.title}: ${item.content?.slice(0, 200) || ''}`;
          rawData.push(`[Tavily] ${snippet}`);
          for (const name of extractCompetitorNames(snippet)) {
            if (!competitors.some(c => c.name === name)) {
              competitors.push({
                name,
                description: `${item.title} (출처: ${item.url})`,
                source: 'Tavily Web',
              });
            }
          }
        }
        log.info(`Tavily found ${result.results?.length} results`);
      } catch (err) {
        log.warn('Tavily market search failed', err);
      }
    } else {
      log.info('TAVILY_API_KEY not set — skipping Tier 2');
    }
  }

  // ─── Tier 3: WebScraper (last resort, no API key needed) ───
  if (rawData.length === 0) {
    log.info('All configured sources empty, falling back to WebScraper');
    const webResult = await webScraper.search(`${category} 앱 인기 순위 2026 비교`);
    if (webResult.success) {
      rawData.push(`[WebScraper] ${webResult.data}`);
    }
  }

  // ─── Assess the market ───
  const assessment = generateAssessment(category, competitors, rawData);

  const result: MarketResearchResult = {
    category,
    platform,
    goal,
    competitors: competitors.slice(0, 10),
    rawData,
    assessment,
    durationMs: Date.now() - start,
    success: rawData.length > 0,
    error: rawData.length === 0 ? 'No data retrieved — NAVER or TAVILY_API_KEY 설정을 확인하세요' : undefined,
  };

  log.info('Market research complete', {
    category,
    competitorCount: competitors.length,
    durationMs: result.durationMs,
    tiers: `Naver:${naver.isConfigured()} Tavily:${!!process.env.TAVILY_API_KEY}`,
  });

  return result;
}

// ─── Format for Grounding Data ───

/**
 * Convert MarketResearchResult to a string suitable for groundingData parameter.
 */
export function formatAsGroundingData(result: MarketResearchResult): string {
  const lines: string[] = [
    `## 📊 시장 조사 결과: ${result.category}`,
    `- **플랫폼**: ${result.platform}`,
    `- **발견된 경쟁사**: ${result.competitors.length}개`,
    '',
  ];

  if (result.competitors.length > 0) {
    lines.push('### 경쟁사 목록');
    for (const comp of result.competitors) {
      lines.push(`- **${comp.name}** — ${comp.description} (출처: ${comp.source})`);
    }
    lines.push('');
  }

  lines.push('### 시장 평가');
  lines.push(result.assessment);

  if (result.rawData.length > 0) {
    lines.push('');
    lines.push('### 원본 데이터 (요약)');
    for (const data of result.rawData) {
      lines.push(`- ${data.slice(0, 200)}`);
    }
  }

  return lines.join('\n');
}

// ─── Helpers ───

/**
 * Extract potential competitor app/service names from text.
 * Looks for Korean app name patterns.
 */
function extractCompetitorNames(text: string): string[] {
  const names: string[] = [];

  // Pattern: quoted names or well-known app name patterns
  const patterns = [
    // Quoted Korean names: "뱅크샐러드", '토스', 「카카오뱅크」
    /['"「]([가-힣\w]{2,10})['"」]/g,
    // App name patterns: ~앱, ~어플
    /([가-힣]{2,8})(?:앱|어플)/g,
  ];

  for (const pattern of patterns) {
    const matches = text.matchAll(new RegExp(pattern.source, pattern.flags));
    for (const match of matches) {
      const name = match[1].trim();
      // Filter out common non-app words
      const STOP_WORDS = ['이것', '그것', '저것', '이번', '다음', '모든', '각종', '여러'];
      if (name.length >= 2 && !STOP_WORDS.includes(name) && !names.includes(name)) {
        names.push(name);
      }
    }
  }

  return names.slice(0, 10);
}

/**
 * Generate a market assessment based on competitor count and data.
 */
function generateAssessment(
  category: string,
  competitors: CompetitorInfo[],
  rawData: string[],
): string {
  if (rawData.length === 0) {
    return `"${category}" 카테고리 시장 데이터를 가져올 수 없습니다. API 키 설정을 확인해주세요.`;
  }

  if (competitors.length === 0) {
    return `"${category}" 카테고리에서 주요 경쟁사가 감지되지 않았습니다. 블루오션 가능성이 있지만, 수동 확인을 권장합니다.`;
  }

  if (competitors.length >= 5) {
    return `"${category}" 카테고리는 경쟁이 치열합니다 (${competitors.length}개 경쟁사 발견). 명확한 차별점이 필수입니다.`;
  }

  return `"${category}" 카테고리에 ${competitors.length}개의 경쟁사가 있습니다. 적절한 경쟁 수준으로, 차별화된 접근이 가능합니다.`;
}
