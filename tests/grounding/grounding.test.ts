import { describe, it, expect } from 'vitest';
import { detectGaps } from '../../src/grounding/gap-detector.js';
import { ApiConnector } from '../../src/grounding/api-connector.js';
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
    // 근로기준법 should match [\uAC00-\uD7A3]+법 pattern
    const regClaims = result.claims.filter((c) => c.type === 'regulation');
    expect(regClaims.length).toBeGreaterThanOrEqual(1);
  });

  it('should detect prices', () => {
    const result = detectGaps('시가총액 3조원 돌파');
    // 시가총액 matches price pattern, 3조원 matches stat
    const priceClaims = result.claims.filter((c) => c.type === 'price');
    expect(priceClaims.length).toBeGreaterThanOrEqual(1);
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

describe('ApiConnector', () => {
  it('should list web as always available', () => {
    const connector = new ApiConnector();
    const sources = connector.getAvailableSources();
    expect(sources).toContain('web');
  });

  it('should return placeholder for web search', async () => {
    const connector = new ApiConnector();
    const result = await connector.webSearch('test query');
    expect(result.success).toBe(true);
    expect(result.source).toBe('web');
    expect(result.data).toContain('test query');
  });
});

describe('GroundingEngine', () => {
  it('should return no_claims for plain text', async () => {
    const connector = new ApiConnector();
    const engine = new GroundingEngine({ apiConnector: connector });
    const result = await engine.ground('좋은 아침입니다.');
    expect(result.status).toBe('no_claims');
    expect(result.verifications.length).toBe(0);
  });

  it('should detect and verify claims', async () => {
    const connector = new ApiConnector();
    const engine = new GroundingEngine({ apiConnector: connector, minGroundingThreshold: 0.5 });
    const result = await engine.ground('매출액 100억원, 전년 대비 20% 성장');
    expect(result.analysis.claims.length).toBeGreaterThanOrEqual(1);
    // Web search fallback should produce results
    expect(result.verifications.length).toBeGreaterThanOrEqual(1);
  });

  it('should support quick check without API calls', () => {
    const connector = new ApiConnector();
    const engine = new GroundingEngine({ apiConnector: connector });
    const analysis = engine.quickCheck('가격 50,000원 적용');
    expect(analysis.claims.length).toBeGreaterThanOrEqual(1);
  });
});
