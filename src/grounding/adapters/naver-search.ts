// Grounding adapter: 네이버 검색 API
import { createLogger } from '../../utils/logger.js';

const log = createLogger('adapter:naver-search');

export interface NaverSearchResult {
  source: 'naver';
  query: string;
  success: boolean;
  data: string;
  durationMs: number;
  error?: string;
}

export interface NaverSearchAdapterOptions {
  /** Naver API Client ID */
  clientId?: string;
  /** Naver API Client Secret */
  clientSecret?: string;
  /** Request timeout in ms */
  timeoutMs?: number;
}

/**
 * 네이버 검색 API adapter.
 *
 * Provides access to news, blog, shopping search results.
 * Free tier: 25,000 requests/day.
 */
export class NaverSearchAdapter {
  private clientId: string;
  private clientSecret: string;
  private timeoutMs: number;
  private readonly baseUrl = 'https://openapi.naver.com/v1/search';

  constructor(options: NaverSearchAdapterOptions = {}) {
    this.clientId = options.clientId || process.env.NAVER_CLIENT_ID || '';
    this.clientSecret = options.clientSecret || process.env.NAVER_CLIENT_SECRET || '';
    this.timeoutMs = options.timeoutMs || 10000;
    log.info('NaverSearchAdapter initialized', { configured: this.isConfigured() });
  }

  isConfigured(): boolean {
    return this.clientId.length > 0 && this.clientSecret.length > 0;
  }

  /**
   * Search Naver news.
   */
  async searchNews(query: string, display = 3): Promise<NaverSearchResult> {
    return this.search('news', query, display);
  }

  /**
   * Search Naver shopping (price comparison).
   */
  async searchShopping(query: string, display = 3): Promise<NaverSearchResult> {
    return this.search('shop', query, display);
  }

  /**
   * Search Naver blog posts.
   */
  async searchBlog(query: string, display = 3): Promise<NaverSearchResult> {
    return this.search('blog', query, display);
  }

  /**
   * Generic Naver search.
   */
  private async search(type: string, query: string, display: number): Promise<NaverSearchResult> {
    const start = Date.now();
    log.info(`Searching Naver ${type}: "${query}"`);

    if (!this.isConfigured()) {
      return {
        source: 'naver',
        query,
        success: false,
        data: '',
        durationMs: Date.now() - start,
        error: 'Naver API keys not configured. Set NAVER_CLIENT_ID and NAVER_CLIENT_SECRET.',
      };
    }

    try {
      const url = `${this.baseUrl}/${type}.json?query=${encodeURIComponent(query)}&display=${display}`;
      const response = await fetch(url, {
        headers: {
          'X-Naver-Client-Id': this.clientId,
          'X-Naver-Client-Secret': this.clientSecret,
        },
        signal: AbortSignal.timeout(this.timeoutMs),
      });

      if (!response.ok) {
        return {
          source: 'naver',
          query,
          success: false,
          data: '',
          durationMs: Date.now() - start,
          error: `HTTP ${response.status} ${response.statusText}`,
        };
      }

      const json = await response.json() as { items?: Array<{ title: string; description: string; link?: string }> };
      const items = json.items || [];
      const summary = items.map((i) => `${i.title}: ${i.description}`).join('\n');

      log.info(`Naver ${type} search found ${items.length} results`);

      return {
        source: 'naver',
        query,
        success: true,
        data: summary || 'No results found.',
        durationMs: Date.now() - start,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      log.error(`Naver search failed: ${msg}`);
      return {
        source: 'naver',
        query,
        success: false,
        data: '',
        durationMs: Date.now() - start,
        error: msg,
      };
    }
  }
}
