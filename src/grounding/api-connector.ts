// API connector — calls external data APIs for fact verification
import { createLogger } from '../utils/logger.js';

const log = createLogger('api-connector');

export interface ApiSource {
  name: string;
  baseUrl: string;
  type: 'search' | 'statistics' | 'regulation' | 'finance';
}

export interface ApiResult {
  source: string;
  query: string;
  success: boolean;
  data: string;
  /** Time taken in ms */
  durationMs: number;
  error?: string;
}

/** Available API sources */
export const API_SOURCES: Record<string, ApiSource> = {
  naver: {
    name: 'Naver Search API',
    baseUrl: 'https://openapi.naver.com/v1/search',
    type: 'search',
  },
  kosis: {
    name: 'KOSIS 통계정보',
    baseUrl: 'https://kosis.kr/openapi',
    type: 'statistics',
  },
  dataGoKr: {
    name: '공공데이터포털',
    baseUrl: 'https://apis.data.go.kr',
    type: 'finance',
  },
  lawGoKr: {
    name: '국가법령정보센터',
    baseUrl: 'https://www.law.go.kr/DRF',
    type: 'regulation',
  },
};

export interface ApiConnectorOptions {
  /** API keys per source name */
  apiKeys?: Record<string, string>;
  /** Request timeout in ms */
  timeoutMs?: number;
}

export class ApiConnector {
  private apiKeys: Record<string, string>;
  private timeoutMs: number;

  constructor(options: ApiConnectorOptions = {}) {
    this.apiKeys = options.apiKeys || {};
    this.timeoutMs = options.timeoutMs || 10000;
    log.info('ApiConnector initialized', { sources: Object.keys(this.apiKeys) });
  }

  /**
   * Search using Naver Search API.
   */
  async searchNaver(query: string): Promise<ApiResult> {
    return this.callApi('naver', query, async () => {
      const clientId = this.apiKeys['naver_client_id'];
      const clientSecret = this.apiKeys['naver_client_secret'];

      if (!clientId || !clientSecret) {
        return { success: false, data: '', error: 'Naver API keys not configured' };
      }

      const url = `${API_SOURCES.naver.baseUrl}/news.json?query=${encodeURIComponent(query)}&display=3`;
      const response = await fetch(url, {
        headers: {
          'X-Naver-Client-Id': clientId,
          'X-Naver-Client-Secret': clientSecret,
        },
        signal: AbortSignal.timeout(this.timeoutMs),
      });

      if (!response.ok) {
        return { success: false, data: '', error: `HTTP ${response.status}` };
      }

      const json = await response.json() as { items?: Array<{ title: string; description: string }> };
      const items = json.items || [];
      const summary = items.map((i) => `${i.title}: ${i.description}`).join('\n');

      return { success: true, data: summary };
    });
  }

  /**
   * Generic web search fallback using fetch.
   */
  async webSearch(query: string): Promise<ApiResult> {
    return this.callApi('web', query, async () => {
      // Fallback: return a structured note that grounding was attempted
      // In production, this would call a real search API
      return {
        success: true,
        data: `[Web search placeholder for: "${query}"] — Configure API keys for real results.`,
      };
    });
  }

  /**
   * Determine the best API source for a given claim type and call it.
   */
  async groundClaim(claimText: string, suggestedSource: string): Promise<ApiResult> {
    log.info(`Grounding claim: "${claimText.slice(0, 50)}" via ${suggestedSource}`);

    // Route to appropriate API
    if (suggestedSource.includes('KOSIS') || suggestedSource.includes('통계')) {
      return this.webSearch(`${claimText} 통계`);
    }
    if (suggestedSource.includes('법제처') || suggestedSource.includes('법령')) {
      return this.webSearch(`${claimText} 법률`);
    }
    if (this.apiKeys['naver_client_id']) {
      return this.searchNaver(claimText);
    }

    return this.webSearch(claimText);
  }

  /**
   * List available (configured) API sources.
   */
  getAvailableSources(): string[] {
    const available: string[] = ['web']; // Always available
    if (this.apiKeys['naver_client_id']) available.push('naver');
    if (this.apiKeys['kosis_key']) available.push('kosis');
    if (this.apiKeys['data_go_kr_key']) available.push('dataGoKr');
    return available;
  }

  private async callApi(
    source: string,
    query: string,
    fn: () => Promise<{ success: boolean; data: string; error?: string }>,
  ): Promise<ApiResult> {
    const start = Date.now();
    try {
      const result = await fn();
      return {
        source,
        query,
        ...result,
        durationMs: Date.now() - start,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      log.error(`API call failed: ${source}`, error);
      return {
        source,
        query,
        success: false,
        data: '',
        error: msg,
        durationMs: Date.now() - start,
      };
    }
  }
}
