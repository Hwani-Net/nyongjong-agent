// Grounding adapter: 통계청 KOSIS API
import { createLogger } from '../../utils/logger.js';

const log = createLogger('adapter:kosis');

export interface KosisResult {
  source: 'kosis';
  query: string;
  success: boolean;
  data: string;
  durationMs: number;
  error?: string;
}

export interface KosisAdapterOptions {
  /** KOSIS API key (공공데이터포털 발급) */
  apiKey?: string;
  /** Request timeout in ms */
  timeoutMs?: number;
}

/**
 * 통계청 KOSIS API adapter.
 *
 * Provides access to population, economy, and industry statistics.
 * Free tier with generous daily limits.
 */
export class KosisAdapter {
  private apiKey: string;
  private timeoutMs: number;
  private readonly baseUrl = 'https://kosis.kr/openapi';

  constructor(options: KosisAdapterOptions = {}) {
    this.apiKey = options.apiKey || process.env.KOSIS_API_KEY || '';
    this.timeoutMs = options.timeoutMs || 10000;
    log.info('KosisAdapter initialized', { configured: !!this.apiKey });
  }

  /**
   * Check if the adapter is configured with an API key.
   */
  isConfigured(): boolean {
    return this.apiKey.length > 0;
  }

  /**
   * Search KOSIS statistics by keyword.
   */
  async search(query: string): Promise<KosisResult> {
    const start = Date.now();
    log.info(`Searching KOSIS: "${query}"`);

    if (!this.isConfigured()) {
      return {
        source: 'kosis',
        query,
        success: false,
        data: '',
        durationMs: Date.now() - start,
        error: 'KOSIS API key not configured. Set KOSIS_API_KEY in environment.',
      };
    }

    try {
      const url = `${this.baseUrl}/Param/statisticsParameterView.do` +
        `?method=getList&apiKey=${encodeURIComponent(this.apiKey)}` +
        `&vwCd=MT_ZTITLE&searchKwd=${encodeURIComponent(query)}` +
        `&format=json`;

      const response = await fetch(url, {
        signal: AbortSignal.timeout(this.timeoutMs),
      });

      if (!response.ok) {
        return {
          source: 'kosis',
          query,
          success: false,
          data: '',
          durationMs: Date.now() - start,
          error: `HTTP ${response.status} ${response.statusText}`,
        };
      }

      const json = await response.json() as Array<{ TBL_NM?: string; STAT_NM?: string; PRD_DE?: string }>;
      const items = Array.isArray(json) ? json.slice(0, 5) : [];
      const summary = items.map((item) =>
        `[${item.STAT_NM || ''}] ${item.TBL_NM || ''} (${item.PRD_DE || ''})`
      ).join('\n');

      log.info(`KOSIS search found ${items.length} results`);

      return {
        source: 'kosis',
        query,
        success: true,
        data: summary || 'No matching statistics found.',
        durationMs: Date.now() - start,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      log.error(`KOSIS search failed: ${msg}`);
      return {
        source: 'kosis',
        query,
        success: false,
        data: '',
        durationMs: Date.now() - start,
        error: msg,
      };
    }
  }
}
