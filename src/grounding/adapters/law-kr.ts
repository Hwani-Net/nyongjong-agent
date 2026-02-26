// Grounding adapter: 국가법령정보센터 (law.go.kr)
import { createLogger } from '../../utils/logger.js';

const log = createLogger('adapter:law-kr');

export interface LawKrResult {
  source: 'law-kr';
  query: string;
  success: boolean;
  data: string;
  durationMs: number;
  error?: string;
}

export interface LawKrAdapterOptions {
  /** Request timeout in ms */
  timeoutMs?: number;
}

/**
 * 국가법령정보센터 API adapter.
 *
 * Provides access to Korean laws, regulations, and precedents.
 * Free, no API key required.
 */
export class LawKrAdapter {
  private timeoutMs: number;
  private readonly baseUrl = 'https://www.law.go.kr/DRF';

  constructor(options: LawKrAdapterOptions = {}) {
    this.timeoutMs = options.timeoutMs || 10000;
    log.info('LawKrAdapter initialized');
  }

  isConfigured(): boolean {
    return true; // No API key needed
  }

  /**
   * Search Korean laws by keyword.
   */
  async searchLaw(query: string): Promise<LawKrResult> {
    const start = Date.now();
    log.info(`Searching law.go.kr: "${query}"`);

    try {
      const url = `${this.baseUrl}/lawSearch.do` +
        `?OC=nongjong&target=law&type=JSON` +
        `&query=${encodeURIComponent(query)}&display=5`;

      const response = await fetch(url, {
        signal: AbortSignal.timeout(this.timeoutMs),
      });

      if (!response.ok) {
        return {
          source: 'law-kr',
          query,
          success: false,
          data: '',
          durationMs: Date.now() - start,
          error: `HTTP ${response.status} ${response.statusText}`,
        };
      }

      const json = await response.json() as {
        LawSearch?: {
          law?: Array<{ 법령명한글?: string; 법령종류?: string; 시행일자?: string; 법령ID?: string }>;
          totalCnt?: number;
        };
      };

      const laws = json.LawSearch?.law || [];
      const total = json.LawSearch?.totalCnt || 0;
      const summary = laws.map((l) =>
        `[${l.법령종류 || ''}] ${l.법령명한글 || ''} (시행: ${l.시행일자 || ''})`
      ).join('\n');

      log.info(`Law search found ${laws.length}/${total} results`);

      return {
        source: 'law-kr',
        query,
        success: true,
        data: summary || `No laws found for "${query}".`,
        durationMs: Date.now() - start,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      log.error(`Law search failed: ${msg}`);
      return {
        source: 'law-kr',
        query,
        success: false,
        data: '',
        durationMs: Date.now() - start,
        error: msg,
      };
    }
  }
}
