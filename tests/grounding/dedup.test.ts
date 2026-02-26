import { describe, it, expect } from 'vitest';
import { detectGaps } from '../../src/grounding/gap-detector.js';

describe('gap-detector dedup fix', () => {
  it('should not duplicate "5조" and "약 5" as separate claims', () => {
    const result = detectGaps(
      '한국의 자율주행 배달 로봇 시장은 2025년까지 약 5조원 규모로 성장할 것으로 예상되며, 현재 배민로봇 등이 약 200대를 운영하고 있습니다.'
    );

    // Extract statistic claims only
    const statClaims = result.claims.filter(c => c.type === 'statistic');
    const texts = statClaims.map(c => c.text);
    console.log('Statistic claims:', texts);

    // "5조" and "약 5" should be deduplicated (same number "5")
    // "200대" and "약 200" should be deduplicated (same number "200")
    expect(statClaims.length).toBeLessThanOrEqual(2);
  });

  it('should keep distinct numbers as separate claims', () => {
    const result = detectGaps('매출 100억원, 직원 500명, 점유율 30%');
    const texts = result.claims.map(c => c.text);
    console.log('Distinct claims:', texts);

    // Each number is different, so at least 3 claims
    expect(result.claims.length).toBeGreaterThanOrEqual(3);
  });
});
