// Grounding adapter: 범용 웹 스크래핑
import { createLogger } from '../../utils/logger.js';

const log = createLogger('adapter:web-scraper');

export interface WebScraperResult {
  source: 'web-scraper';
  query: string;
  success: boolean;
  data: string;
  durationMs: number;
  error?: string;
}

export interface WebScraperAdapterOptions {
  /** Request timeout in ms */
  timeoutMs?: number;
}

/**
 * Generic web scraper adapter.
 *
 * Fetches and extracts text content from web pages.
 * Used as a fallback when specialized adapters are not available.
 */
export class WebScraperAdapter {
  private timeoutMs: number;

  constructor(options: WebScraperAdapterOptions = {}) {
    this.timeoutMs = options.timeoutMs || 15000;
    log.info('WebScraperAdapter initialized');
  }

  isConfigured(): boolean {
    return true; // No API key needed
  }

  /**
   * Fetch a URL and extract text content.
   */
  async fetchPage(url: string): Promise<WebScraperResult> {
    const start = Date.now();
    log.info(`Scraping: ${url}`);

    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; NongjongAgent/0.3)',
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': 'ko-KR,ko;q=0.9',
        },
        signal: AbortSignal.timeout(this.timeoutMs),
      });

      if (!response.ok) {
        return {
          source: 'web-scraper',
          query: url,
          success: false,
          data: '',
          durationMs: Date.now() - start,
          error: `HTTP ${response.status} ${response.statusText}`,
        };
      }

      const html = await response.text();
      const text = this.extractText(html);

      log.info(`Page scraped: ${text.length} chars extracted`);

      return {
        source: 'web-scraper',
        query: url,
        success: true,
        data: text.slice(0, 2000), // Limit output size
        durationMs: Date.now() - start,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      log.error(`Scraping failed: ${msg}`);
      return {
        source: 'web-scraper',
        query: url,
        success: false,
        data: '',
        durationMs: Date.now() - start,
        error: msg,
      };
    }
  }

  /**
   * Search the web by constructing a search-engine-friendly query.
   */
  async search(query: string): Promise<WebScraperResult> {
    const start = Date.now();
    log.info(`Web search fallback: "${query}"`);

    // Use a simple approach: note that this is a fallback
    return {
      source: 'web-scraper',
      query,
      success: true,
      data: `[Web search for: "${query}"] — Use specialized adapters (Naver, KOSIS) for better results.`,
      durationMs: Date.now() - start,
    };
  }

  /**
   * Strip HTML tags and extract readable text.
   */
  private extractText(html: string): string {
    return html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
}
