// Grounding engine — orchestrates gap detection, adapter routing, and fact verification
import { createLogger } from '../utils/logger.js';
import { detectGaps, type GapAnalysis, type FactualClaim } from './gap-detector.js';
import { KosisAdapter } from './adapters/kosis.js';
import { NaverSearchAdapter } from './adapters/naver-search.js';
import { GoogleTrendsAdapter } from './adapters/google-trends.js';
import { LawKrAdapter } from './adapters/law-kr.js';
import { AppReviewsAdapter } from './adapters/app-reviews.js';
import { WebScraperAdapter } from './adapters/web-scraper.js';

const log = createLogger('grounding-engine');

export interface ApiResult {
  source: string;
  query: string;
  success: boolean;
  data: string;
  durationMs: number;
  error?: string;
}

export interface GroundingResult {
  /** Original gap analysis */
  analysis: GapAnalysis;
  /** Verification results per claim */
  verifications: ClaimVerification[];
  /** Overall grounding status */
  status: 'grounded' | 'partially_grounded' | 'ungrounded' | 'no_claims';
  /** Summary for the report */
  summary: string;
}

export interface ClaimVerification {
  claim: FactualClaim;
  /** API result for this claim */
  apiResult: ApiResult;
  /** Whether the claim was verified */
  verified: boolean;
}

export interface GroundingEngineOptions {
  /** Minimum grounding need score to trigger verification (0-1) */
  minGroundingThreshold?: number;
}

/**
 * Grounding Engine — design doc Section 6.
 *
 * Orchestrates:
 *   1. Gap detection (gap-detector.ts)
 *   2. Adapter routing (adapters/*.ts)
 *   3. API calls for fact verification
 *
 * Each claim type routes to the appropriate adapter:
 *   - statistic → KOSIS
 *   - price → Naver Shopping
 *   - regulation → law.go.kr
 *   - trend → Google Trends
 *   - user_behavior → App Reviews
 *   - competitor → Web Scraper + Naver
 *   - tech_version → Naver Search + Web Scraper
 *   - general → Web Scraper fallback
 */
export class GroundingEngine {
  private minThreshold: number;

  // Adapters (design doc Section 7: grounding/adapters/)
  private kosis: KosisAdapter;
  private naver: NaverSearchAdapter;
  private googleTrends: GoogleTrendsAdapter;
  private lawKr: LawKrAdapter;
  private appReviews: AppReviewsAdapter;
  private webScraper: WebScraperAdapter;

  // ── Cache stats (in-memory, resets on process restart) ──
  private _resultCache: Map<string, { result: GroundingResult; expiresAt: number }> = new Map();
  private _stats = { hits: 0, misses: 0, totalLatencyMs: 0, calls: 0 };
  private static readonly CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h

  constructor(options: GroundingEngineOptions = {}) {
    this.minThreshold = options.minGroundingThreshold || 0.7;

    // Initialize all adapters
    this.kosis = new KosisAdapter();
    this.naver = new NaverSearchAdapter();
    this.googleTrends = new GoogleTrendsAdapter();
    this.lawKr = new LawKrAdapter();
    this.appReviews = new AppReviewsAdapter();
    this.webScraper = new WebScraperAdapter();

    log.info('GroundingEngine initialized with 6 adapters', {
      threshold: this.minThreshold,
    });
  }

  /**
   * Analyze text and verify factual claims above threshold.
   * Results are cached by input text for 24h to reduce API calls.
   */
  async ground(text: string): Promise<GroundingResult> {
    const t0 = Date.now();
    this._stats.calls++;

    // Cache lookup
    const cacheKey = text.slice(0, 200);
    const cached = this._resultCache.get(cacheKey);
    if (cached && Date.now() < cached.expiresAt) {
      this._stats.hits++;
      log.debug('Grounding cache hit', { textLength: text.length });
      return cached.result;
    }
    this._stats.misses++;

    log.info('Starting grounding process', { textLength: text.length });

    // Step 1: Detect gaps
    const analysis = detectGaps(text);

    if (analysis.claims.length === 0) {
      const result: GroundingResult = {
        analysis,
        verifications: [],
        status: 'no_claims',
        summary: 'No factual claims detected.',
      };
      this._resultCache.set(cacheKey, { result, expiresAt: Date.now() + GroundingEngine.CACHE_TTL_MS });
      this._stats.totalLatencyMs += Date.now() - t0;
      return result;
    }

    // Step 2: Filter claims above threshold
    const toVerify = analysis.claims.filter((c) => c.groundingNeed >= this.minThreshold);
    log.info(`${toVerify.length}/${analysis.claims.length} claims above threshold`);

    // Step 3: Route each claim to appropriate adapter and verify
    const verifications: ClaimVerification[] = [];

    for (const claim of toVerify) {
      const apiResult = await this.routeToAdapter(claim);
      verifications.push({
        claim,
        apiResult,
        verified: apiResult.success && apiResult.data.length > 0,
      });
    }

    // Step 4: Determine overall status
    const verifiedCount = verifications.filter((v) => v.verified).length;
    const status = verifiedCount === 0 ? 'ungrounded'
      : verifiedCount === toVerify.length ? 'grounded'
      : 'partially_grounded';

    const summary = `Grounding: ${verifiedCount}/${toVerify.length} claims verified (${status}). ` +
      `Total claims detected: ${analysis.claims.length}.`;

    log.info(summary);

    const result: GroundingResult = { analysis, verifications, status, summary };
    this._resultCache.set(cacheKey, { result, expiresAt: Date.now() + GroundingEngine.CACHE_TTL_MS });
    this._stats.totalLatencyMs += Date.now() - t0;
    return result;
  }

  /**
   * Return cache statistics for the dashboard Cache Stats panel.
   */
  getStats(): { hitRate: number; callCount: number; avgLatencyMs: number; cacheSize: number } {
    const { hits, misses, totalLatencyMs, calls } = this._stats;
    const total = hits + misses;
    return {
      hitRate: total === 0 ? 0 : Math.round((hits / total) * 100),
      callCount: calls,
      avgLatencyMs: calls === 0 ? 0 : Math.round(totalLatencyMs / calls),
      cacheSize: this._resultCache.size,
    };
  }

  /**
   * Quick check — only detect gaps without calling APIs.
   */
  quickCheck(text: string): GapAnalysis {
    return detectGaps(text);
  }

  /**
   * Route a claim to the appropriate adapter based on type and suggested source.
   *
   * Design doc Section 6.1 — adapter routing table:
   *   정량 추측 → KOSIS
   *   가격 추측 → 네이버쇼핑
   *   규제 → 법령정보
   *   트렌드 → Google Trends
   *   사용자 행동 → 앱스토어 리뷰
   *   경쟁사 → 웹 검색
   */
  private async routeToAdapter(claim: FactualClaim): Promise<ApiResult> {
    log.info(`Routing claim: "${claim.text.slice(0, 50)}" (type: ${claim.type})`);

    switch (claim.type) {
      case 'statistic': {
        const result = await this.kosis.search(claim.text);
        return { ...result, source: result.source };
      }
      case 'price': {
        const result = await this.naver.searchShopping(claim.text);
        return { ...result, source: result.source };
      }
      case 'regulation': {
        const result = await this.lawKr.searchLaw(claim.text);
        return { ...result, source: result.source };
      }
      case 'trend': {
        const result = await this.googleTrends.getInterest(claim.text);
        return { ...result, source: result.source };
      }
      case 'user_behavior': {
        const result = await this.appReviews.searchApp(claim.text);
        return { ...result, source: result.source };
      }
      case 'competitor': {
        // Try Naver first, fall back to web scraper
        if (this.naver.isConfigured()) {
          const result = await this.naver.searchNews(claim.text);
          return { ...result, source: result.source };
        }
        const result = await this.webScraper.search(claim.text);
        return { ...result, source: result.source };
      }
      case 'tech_version': {
        // Technology version claims — Naver search for Korean tech news/docs
        if (this.naver.isConfigured()) {
          const result = await this.naver.searchNews(claim.text);
          return { ...result, source: result.source };
        }
        const result = await this.webScraper.search(claim.text);
        return { ...result, source: result.source };
      }
      default: {
        // Fallback to web scraper
        const result = await this.webScraper.search(claim.text);
        return { ...result, source: result.source };
      }
    }
  }

  /**
   * Get available adapter status.
   */
  getAdapterStatus(): Record<string, boolean> {
    return {
      kosis: this.kosis.isConfigured(),
      naver: this.naver.isConfigured(),
      googleTrends: this.googleTrends.isConfigured(),
      lawKr: this.lawKr.isConfigured(),
      appReviews: this.appReviews.isConfigured(),
      webScraper: this.webScraper.isConfigured(),
    };
  }
}
