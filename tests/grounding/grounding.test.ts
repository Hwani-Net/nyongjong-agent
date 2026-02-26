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

  // === Ralph Mode fixes ===
  it('should not match 000 as a valid number (non-zero leading digit)', () => {
    const result = detectGaps('2000조원 규모');
    // Should NOT produce a claim with text '000조'
    const hasBadClaim = result.claims.some(c => c.text === '000조');
    expect(hasBadClaim).toBe(false);
  });

  it('should dedup suffix numbers (800 from 2800)', () => {
    const result = detectGaps('경제활동인구는 약 2800만명입니다.');
    // Should not have both '약 2800' and '800만' — dedup should remove '800만'
    const texts = result.claims.map(c => c.text);
    const has800 = texts.some(t => t === '800만');
    expect(has800).toBe(false);
  });

  it('should capture unit suffix with 약 pattern', () => {
    const result = detectGaps('약 1조 3000억원');
    // '약 1조' should be captured, not just '약 1'
    const approxClaim = result.claims.find(c => c.text.startsWith('약'));
    if (approxClaim) {
      expect(approxClaim.text.length).toBeGreaterThan(3); // More than just '약 1'
    }
  });

  it('should detect law names with Korean particles', () => {
    const result = detectGaps('개인정보보호법에 따르면 동의가 필요합니다.');
    const regClaims = result.claims.filter(c => c.type === 'regulation');
    expect(regClaims.length).toBeGreaterThanOrEqual(1);
  });

  it('should handle empty text gracefully', () => {
    const result = detectGaps('');
    expect(result.claims.length).toBe(0);
    expect(result.overallScore).toBe(0);
  });

  it('should detect regulation + statistic together without over-counting', () => {
    const result = detectGaps('전자상거래법에 따라 5000억원 이상 사업자는 공시 의무가 있습니다.');
    const regCount = result.claims.filter(c => c.type === 'regulation').length;
    const statCount = result.claims.filter(c => c.type === 'statistic').length;
    expect(regCount).toBeGreaterThanOrEqual(1);
    expect(statCount).toBeGreaterThanOrEqual(1);
    // Should not have excessive total claims
    expect(result.claims.length).toBeLessThanOrEqual(4);
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
