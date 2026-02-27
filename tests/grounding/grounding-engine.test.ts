// Integration tests for GroundingEngine — REAL adapters, NO module mocks
// Adapters that need API keys will correctly return isConfigured: false (not fake success)
import { describe, it, expect } from 'vitest';
import { GroundingEngine } from '../../src/grounding/grounding-engine.js';

describe('GroundingEngine (real adapters)', () => {
  it('should return no_claims for plain text (no API calls needed)', async () => {
    const engine = new GroundingEngine();
    const result = await engine.ground('좋은 아침입니다. 오늘 날씨가 맑습니다.');
    expect(result.status).toBe('no_claims');
    expect(result.verifications).toHaveLength(0);
  });

  it('should quick check without any API calls', () => {
    const engine = new GroundingEngine();
    const analysis = engine.quickCheck('가격 50,000원 적용, 할인율 20%');
    expect(analysis.claims.length).toBeGreaterThanOrEqual(1);
    expect(analysis.overallScore).toBeGreaterThan(0);
  });

  it('should report REAL adapter configuration status (not mocked)', () => {
    const engine = new GroundingEngine();
    const status = engine.getAdapterStatus();

    // These must be real boolean values based on actual environment
    expect(typeof status.kosis).toBe('boolean');
    expect(typeof status.naver).toBe('boolean');
    expect(typeof status.googleTrends).toBe('boolean');
    expect(typeof status.lawKr).toBe('boolean');
    expect(typeof status.appReviews).toBe('boolean');
    expect(typeof status.webScraper).toBe('boolean');

    // Google Trends and Web Scraper require no API key — should always be configured
    expect(status.googleTrends).toBe(true);
    expect(status.webScraper).toBe(true);
    expect(status.appReviews).toBe(true);
    expect(status.lawKr).toBe(true);

    // KOSIS and Naver depend on env vars — log actual state, don't fake it
    console.log('[REAL] KOSIS configured:', status.kosis, '| Naver configured:', status.naver);
  });

  it('should attempt real ground() with statistic text (verifyApi depends on threshold)', async () => {
    const engine = new GroundingEngine({ minGroundingThreshold: 0.3 });
    const result = await engine.ground('실업률은 3.5%이며 취업자 수는 2700만명입니다.');

    // Claims must be detected
    expect(result.analysis.claims.length).toBeGreaterThanOrEqual(1);

    // Verifications run against REAL adapters
    // If no API keys, statistic → KOSIS → fails with success: false
    // That is CORRECT behavior — not hiding it
    for (const v of result.verifications) {
      expect(typeof v.verified).toBe('boolean');
      expect(v.apiResult.source).toBeDefined();
      // If adapter not configured, it returns success: false — expected
      console.log(`[REAL] claim="${v.claim.text}" source=${v.apiResult.source} verified=${v.verified}`);
    }
  });

  it('should attempt real ground() with regulation text (LawKR — no API key needed)', async () => {
    const engine = new GroundingEngine({ minGroundingThreshold: 0.3 });
    const result = await engine.ground('근로기준법에 따르면 주 52시간을 초과할 수 없습니다.');

    const regClaims = result.analysis.claims.filter(c => c.type === 'regulation');
    expect(regClaims.length).toBeGreaterThanOrEqual(1);

    // LawKR needs no key — should attempt real HTTP call
    const regVerify = result.verifications.find(v => v.claim.type === 'regulation');
    if (regVerify) {
      // actual source string from law-kr adapter
      expect(regVerify.apiResult.source).toBe('law-kr');
      console.log(`[REAL] LawKR result: success=${regVerify.apiResult.success} data="${regVerify.apiResult.data.slice(0, 100)}"`);
    }
  });

  it('should attempt real ground() with trend text (Google Trends — no API key needed)', async () => {
    const engine = new GroundingEngine({ minGroundingThreshold: 0.3 });
    const result = await engine.ground('최근 3년간 AI 산업이 25% 성장했다.');

    const trendVerify = result.verifications.find(v => v.claim.type === 'trend');
    if (trendVerify) {
      expect(trendVerify.apiResult.source).toBe('google-trends');
      console.log(`[REAL] GoogleTrends result: success=${trendVerify.apiResult.success}`);
    }
  });

  it('should generate meaningful summary', async () => {
    const engine = new GroundingEngine();
    const result = await engine.ground('경쟁사는 시장 점유율 35%를 차지하고 있다.');
    expect(result.summary).toBeDefined();
    expect(result.summary.length).toBeGreaterThan(5);
    expect(['grounded', 'partially_grounded', 'ungrounded', 'no_claims']).toContain(result.status);
  });
});
