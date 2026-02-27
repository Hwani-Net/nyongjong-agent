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
  /** KOSIS API key */
  apiKey?: string;
  /** Request timeout in ms */
  timeoutMs?: number;
}

/**
 * 통계청 KOSIS API adapter.
 *
 * API Docs: https://kosis.kr/openapi/
 * Endpoint: statisticsList.do — 통계목록 조회
 */
export class KosisAdapter {
  private apiKey: string;
  private timeoutMs: number;
  // Correct KOSIS OpenAPI endpoint
  private readonly baseUrl = 'https://kosis.kr/openapi/statisticsList.do';

  constructor(options: KosisAdapterOptions = {}) {
    this.apiKey = options.apiKey || process.env.KOSIS_API_KEY || '';
    this.timeoutMs = options.timeoutMs || 10000;
    log.info('KosisAdapter initialized', { configured: !!this.apiKey });
  }

  isConfigured(): boolean {
    return this.apiKey.length > 0;
  }

  /**
   * Search KOSIS statistics by keyword.
   * Uses statisticsList.do — vwCd=MT_ZTITLE (국내통계 주제별)
   * Since list API has no keyword search, we fetch top-level list
   * and filter client-side.
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
      const params = new URLSearchParams({
        method: 'getList',
        apiKey: this.apiKey,
        vwCd: 'MT_ZTITLE',
        parentId: '',
        format: 'json',
        jsonVD: 'Y',
      });

      const url = `${this.baseUrl}?${params.toString()}`;

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

      const json = await response.json() as Array<{
        TBL_NM?: string;
        STAT_NM?: string;
        PRD_DE?: string;
        TBL_ID?: string;
      }>;

      const items = Array.isArray(json) ? json : [];

      // Client-side keyword filter
      const lowerQuery = query.toLowerCase();
      const matched = items
        .filter((item) => {
          const name = (item.TBL_NM || item.STAT_NM || '').toLowerCase();
          return name.includes(lowerQuery);
        })
        .slice(0, 5);

      const displayed = matched.length > 0 ? matched : items.slice(0, 3);
      const summary = displayed
        .map((item) => `[${item.STAT_NM || ''}] ${item.TBL_NM || ''} (${item.PRD_DE || ''})`)
        .join('\n');

      log.info(`KOSIS search: ${items.length} total, ${matched.length} matched`);

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
