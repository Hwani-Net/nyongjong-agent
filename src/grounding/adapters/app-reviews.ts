// Grounding adapter: 앱스토어 리뷰 (Google Play Store scraping)
import { createLogger } from '../../utils/logger.js';

const log = createLogger('adapter:app-reviews');

export interface AppReviewsResult {
  source: 'app-reviews';
  query: string;
  success: boolean;
  data: string;
  durationMs: number;
  error?: string;
}

export interface AppReviewsAdapterOptions {
  /** Request timeout in ms */
  timeoutMs?: number;
}

/**
 * App reviews adapter.
 *
 * Scrapes Google Play Store for app reviews and ratings.
 * Free, no API key required (web scraping).
 */
export class AppReviewsAdapter {
  private timeoutMs: number;

  constructor(options: AppReviewsAdapterOptions = {}) {
    this.timeoutMs = options.timeoutMs || 15000;
    log.info('AppReviewsAdapter initialized');
  }

  isConfigured(): boolean {
    return true; // Scraping-based, no API key needed
  }

  /**
   * Search Google Play Store for app info and reviews.
   */
  async searchApp(query: string): Promise<AppReviewsResult> {
    const start = Date.now();
    log.info(`Searching Play Store: "${query}"`);

    try {
      const searchUrl = `https://play.google.com/store/search?q=${encodeURIComponent(query)}&c=apps&hl=ko`;

      const response = await fetch(searchUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; NongjongAgent/0.3)',
          'Accept-Language': 'ko-KR,ko;q=0.9',
        },
        signal: AbortSignal.timeout(this.timeoutMs),
      });

      if (!response.ok) {
        return {
          source: 'app-reviews',
          query,
          success: false,
          data: '',
          durationMs: Date.now() - start,
          error: `HTTP ${response.status} ${response.statusText}`,
        };
      }

      const html = await response.text();

      // Extract basic app info from HTML
      const titleMatches = html.match(/<span[^>]*>([^<]{3,60})<\/span>/g) || [];
      const appNames = titleMatches
        .map((m) => m.replace(/<[^>]+>/g, '').trim())
        .filter((name) => name.length > 3 && name.length < 60)
        .slice(0, 5);

      const summary = appNames.length > 0
        ? `Play Store results for "${query}":\n${appNames.map((n, i) => `${i + 1}. ${n}`).join('\n')}`
        : `No app results found for "${query}" on Play Store.`;

      log.info(`App search found ${appNames.length} results`);

      return {
        source: 'app-reviews',
        query,
        success: true,
        data: summary,
        durationMs: Date.now() - start,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      log.error(`App reviews search failed: ${msg}`);
      return {
        source: 'app-reviews',
        query,
        success: false,
        data: '',
        durationMs: Date.now() - start,
        error: msg,
      };
    }
  }
}
