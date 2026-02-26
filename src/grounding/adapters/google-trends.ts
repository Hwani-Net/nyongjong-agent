// Grounding adapter: Google Trends (unofficial)
import { createLogger } from '../../utils/logger.js';

const log = createLogger('adapter:google-trends');

export interface GoogleTrendsResult {
  source: 'google-trends';
  query: string;
  success: boolean;
  data: string;
  durationMs: number;
  error?: string;
}

export interface GoogleTrendsAdapterOptions {
  /** Request timeout in ms */
  timeoutMs?: number;
}

/**
 * Google Trends adapter.
 *
 * Provides search trend data via unofficial API.
 * Free, no API key required, but rate-limited.
 */
export class GoogleTrendsAdapter {
  private timeoutMs: number;

  constructor(options: GoogleTrendsAdapterOptions = {}) {
    this.timeoutMs = options.timeoutMs || 15000;
    log.info('GoogleTrendsAdapter initialized');
  }

  isConfigured(): boolean {
    return true; // No API key needed for unofficial access
  }

  /**
   * Get trend interest over time for a keyword.
   */
  async getInterest(query: string): Promise<GoogleTrendsResult> {
    const start = Date.now();
    log.info(`Fetching Google Trends: "${query}"`);

    try {
      // Google Trends explore URL for data extraction
      const url = `https://trends.google.com/trends/api/explore?hl=ko&tz=-540&req=` +
        encodeURIComponent(JSON.stringify({
          comparisonItem: [{ keyword: query, geo: 'KR', time: 'today 3-m' }],
          category: 0,
          property: '',
        }));

      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; NongjongAgent/0.3)',
        },
        signal: AbortSignal.timeout(this.timeoutMs),
      });

      if (!response.ok) {
        return {
          source: 'google-trends',
          query,
          success: false,
          data: '',
          durationMs: Date.now() - start,
          error: `HTTP ${response.status} — Google Trends may be rate-limiting.`,
        };
      }

      const text = await response.text();
      // Google Trends API prefixes responses with ")]}'" for XSS protection
      const cleaned = text.startsWith(')]}\',') ? text.slice(5) : text;

      let summary: string;
      try {
        const json = JSON.parse(cleaned);
        summary = `Trend data for "${query}" (KR, 3 months): ${JSON.stringify(json).slice(0, 500)}`;
      } catch {
        summary = `Raw trend data received for "${query}" (${text.length} bytes)`;
      }

      log.info('Google Trends data retrieved');

      return {
        source: 'google-trends',
        query,
        success: true,
        data: summary,
        durationMs: Date.now() - start,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      log.error(`Google Trends failed: ${msg}`);
      return {
        source: 'google-trends',
        query,
        success: false,
        data: '',
        durationMs: Date.now() - start,
        error: msg,
      };
    }
  }
}
