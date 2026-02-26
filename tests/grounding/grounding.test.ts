import { describe, it, expect } from 'vitest';
import { detectGaps } from '../../src/grounding/gap-detector.js';
import { GroundingEngine } from '../../src/grounding/grounding-engine.js';

describe('GapDetector', () => {
  it('should detect statistics', () => {
    const result = detectGaps('한국의 실업률은 3.5%이며, 취업자 수는 27,000,000명입니다.');
    expect(result.claims.length).toBeGreaterThanOrEqual(2);
    const types = result.claims.map((c) => c.type);
    expect(types).toContain('statistic');
  });

  it('should detect regulation references', () => {
    const result = detectGaps('근로기준법 에 따르면 주 52시간을 초과할 수 없습니다.');
    const regClaims = result.claims.filter((c) => c.type === 'regulation');
    expect(regClaims.length).toBeGreaterThanOrEqual(1);
  });

  it('should detect prices', () => {
    const result = detectGaps('시가총액 3조원 돌파');
    const priceClaims = result.claims.filter((c) => c.type === 'price');
    expect(priceClaims.length).toBeGreaterThanOrEqual(1);
  });

  it('should detect trends', () => {
    const result = detectGaps('최근 3년간 AI 산업이 25% 성장했다.');
    const trendClaims = result.claims.filter((c) => c.type === 'trend');
    expect(trendClaims.length).toBeGreaterThanOrEqual(1);
  });

  it('should detect competitor claims', () => {
    const result = detectGaps('경쟁사는 시장 점유율 35%를 차지하고 있다.');
    const compClaims = result.claims.filter((c) => c.type === 'competitor');
    expect(compClaims.length).toBeGreaterThanOrEqual(1);
  });

  it('should detect user behavior claims', () => {
    const result = detectGaps('사용자들은 보통 3분 안에 이탈한다.');
    const userClaims = result.claims.filter((c) => c.type === 'user_behavior');
    expect(userClaims.length).toBeGreaterThanOrEqual(1);
  });

  it('should return no claims for plain text', () => {
    const result = detectGaps('좋은 아침입니다. 오늘 날씨가 좋네요.');
    expect(result.claims.length).toBe(0);
    expect(result.overallScore).toBe(0);
  });

  it('should calculate overall grounding score', () => {
    const result = detectGaps('매출액 100억원, 전년 대비 20% 성장, 2024년 1월 기준.');
    expect(result.overallScore).toBeGreaterThan(0);
    expect(result.claims.length).toBeGreaterThanOrEqual(2);
  });
});

describe('GroundingEngine', () => {
  it('should return no_claims for plain text', async () => {
    const engine = new GroundingEngine();
    const result = await engine.ground('좋은 아침입니다.');
    expect(result.status).toBe('no_claims');
    expect(result.verifications.length).toBe(0);
  });

  it('should support quick check without API calls', () => {
    const engine = new GroundingEngine();
    const analysis = engine.quickCheck('가격 50,000원 적용');
    expect(analysis.claims.length).toBeGreaterThanOrEqual(1);
  });

  it('should report adapter status', () => {
    const engine = new GroundingEngine();
    const status = engine.getAdapterStatus();
    expect(status).toHaveProperty('kosis');
    expect(status).toHaveProperty('naver');
    expect(status).toHaveProperty('webScraper');
  });
});
