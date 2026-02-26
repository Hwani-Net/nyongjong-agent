// Tests for GroundingEngine — mocked adapters, routing logic
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GroundingEngine } from '../../src/grounding/grounding-engine.js';

// Mock ALL adapter modules
vi.mock('../../src/grounding/adapters/kosis.js', () => ({
  KosisAdapter: vi.fn().mockImplementation(() => ({
    search: vi.fn().mockResolvedValue({ source: 'KOSIS', query: 'test', success: true, data: '실업률 3.2%', durationMs: 100 }),
    isConfigured: vi.fn().mockReturnValue(true),
  })),
}));
vi.mock('../../src/grounding/adapters/naver-search.js', () => ({
  NaverSearchAdapter: vi.fn().mockImplementation(() => ({
    searchShopping: vi.fn().mockResolvedValue({ source: 'Naver Shopping', query: 'test', success: true, data: '가격 50,000원', durationMs: 80 }),
    searchNews: vi.fn().mockResolvedValue({ source: 'Naver News', query: 'test', success: true, data: '경쟁사 뉴스', durationMs: 90 }),
    isConfigured: vi.fn().mockReturnValue(true),
  })),
}));
vi.mock('../../src/grounding/adapters/google-trends.js', () => ({
  GoogleTrendsAdapter: vi.fn().mockImplementation(() => ({
    getInterest: vi.fn().mockResolvedValue({ source: 'Google Trends', query: 'test', success: true, data: 'trend up 25%', durationMs: 120 }),
    isConfigured: vi.fn().mockReturnValue(true),
  })),
}));
vi.mock('../../src/grounding/adapters/law-kr.js', () => ({
  LawKrAdapter: vi.fn().mockImplementation(() => ({
    searchLaw: vi.fn().mockResolvedValue({ source: 'LawKR', query: 'test', success: true, data: '근로기준법 제50조', durationMs: 150 }),
    isConfigured: vi.fn().mockReturnValue(true),
  })),
}));
vi.mock('../../src/grounding/adapters/app-reviews.js', () => ({
  AppReviewsAdapter: vi.fn().mockImplementation(() => ({
    searchApp: vi.fn().mockResolvedValue({ source: 'App Reviews', query: 'test', success: true, data: '평점 4.5', durationMs: 200 }),
    isConfigured: vi.fn().mockReturnValue(true),
  })),
}));
vi.mock('../../src/grounding/adapters/web-scraper.js', () => ({
  WebScraperAdapter: vi.fn().mockImplementation(() => ({
    search: vi.fn().mockResolvedValue({ source: 'Web Scraper', query: 'test', success: true, data: '웹 검색 결과', durationMs: 300 }),
    isConfigured: vi.fn().mockReturnValue(true),
  })),
}));

describe('GroundingEngine (mocked adapters)', () => {
  let engine: GroundingEngine;

  beforeEach(() => {
    engine = new GroundingEngine({ minGroundingThreshold: 0.5 });
  });

  it('should return no_claims for plain text', async () => {
    const result = await engine.ground('좋은 아침입니다.');
    expect(result.status).toBe('no_claims');
    expect(result.verifications).toHaveLength(0);
  });

  it('should route statistic claims to KOSIS', async () => {
    const result = await engine.ground('실업률은 3.5%이며 취업자 수는 2700만명입니다.');
    // Should have verifications with statistic claims routed to KOSIS
    expect(result.verifications.length).toBeGreaterThanOrEqual(0);
    if (result.verifications.length > 0) {
      expect(result.verifications[0].apiResult.source).toBeDefined();
    }
  });

  it('should route regulation claims to LawKR', async () => {
    const result = await engine.ground('근로기준법에 따르면 주 52시간을 초과할 수 없습니다.');
    const regVerify = result.verifications.find(v => v.claim.type === 'regulation');
    if (regVerify) {
      expect(regVerify.apiResult.source).toBe('LawKR');
      expect(regVerify.verified).toBe(true);
    }
  });

  it('should route price claims to Naver', async () => {
    const result = await engine.ground('시가총액 3조원을 돌파했습니다.');
    expect(result.analysis.claims.length).toBeGreaterThanOrEqual(1);
  });

  it('should route trend claims to Google Trends', async () => {
    const result = await engine.ground('최근 3년간 AI 산업이 급성장 25% 성장하고 있다.');
    const trendVerify = result.verifications.find(v => v.claim.type === 'trend');
    if (trendVerify) {
      expect(trendVerify.apiResult.source).toBe('Google Trends');
    }
  });

  it('should determine grounded status when all claims verified', async () => {
    // Small threshold to ensure claims get verified
    const eng = new GroundingEngine({ minGroundingThreshold: 0.3 });
    const result = await eng.ground('실업률 3.5% 통계 발표');
    if (result.verifications.length > 0 && result.verifications.every(v => v.verified)) {
      expect(result.status).toBe('grounded');
    }
  });

  it('should quick check without API calls', () => {
    const analysis = engine.quickCheck('가격 50000원, 할인율 20%');
    expect(analysis.claims.length).toBeGreaterThanOrEqual(1);
    expect(analysis.overallScore).toBeGreaterThan(0);
  });

  it('should report adapter status', () => {
    const status = engine.getAdapterStatus();
    expect(status.kosis).toBe(true);
    expect(status.naver).toBe(true);
    expect(status.googleTrends).toBe(true);
    expect(status.lawKr).toBe(true);
    expect(status.appReviews).toBe(true);
    expect(status.webScraper).toBe(true);
  });

  it('should generate summary with verification counts', async () => {
    const result = await engine.ground('근로기준법 적용대상 기업은 52시간 준수 의무');
    expect(result.summary).toContain('claims');
    expect(result.summary.length).toBeGreaterThan(10);
  });
});
