import { describe, it, expect } from 'vitest';
import { classifyFeedback, formatFeedbackReport } from '../../src/workflow/feedback-router.js';

describe('classifyFeedback', () => {
  describe('confidence improvements (Audit Observation #1)', () => {
    it('should have confidence >= 0.4 with a single keyword match', () => {
      // "디자인" matches one pattern in stitch_design → was 14%, now should be >= 40%
      const result = classifyFeedback('디자인은 좋은데 로딩이 너무 느려요. 첫 화면에서 3초 이상 걸립니다.');
      expect(result.confidence).toBeGreaterThanOrEqual(0.4);
    });

    it('should increase confidence with more keyword matches', () => {
      const single = classifyFeedback('디자인 수정해주세요');
      const multi = classifyFeedback('디자인 색상 폰트 크기 아이콘 전부 다 수정해주세요');
      expect(multi.confidence).toBeGreaterThan(single.confidence);
    });

    it('should boost confidence when winner has 2x+ score over runner-up', () => {
      // Heavy design keywords, minimal code keywords → clear winner
      const result = classifyFeedback('색상이 너무 투박하고 폰트 크기가 작아요. 아이콘도 바꿔주세요.');
      expect(result.target).toBe('stitch_design');
      expect(result.confidence).toBeGreaterThanOrEqual(0.5);
    });

    it('should default to evolve_code with 0.3 confidence when no match', () => {
      const result = classifyFeedback('잘 모르겠어요');
      expect(result.target).toBe('evolve_code');
      expect(result.confidence).toBe(0.3);
    });

    it('should never exceed 1.0 confidence', () => {
      // Hit as many patterns as possible
      const result = classifyFeedback('색상 컬러 디자인 레이아웃 폰트 글꼴 아이콘 위치 다크모드 세련되게');
      expect(result.confidence).toBeLessThanOrEqual(1.0);
    });
  });

  describe('target classification accuracy', () => {
    it('should classify business strategy feedback as gate0', () => {
      const result = classifyFeedback('타겟 시장을 변경하고 수익 모델을 재검토해야 합니다');
      expect(result.target).toBe('gate0');
      expect(result.matchedKeywords.length).toBeGreaterThanOrEqual(2);
    });

    it('should classify feature scope feedback as gate1_prd', () => {
      const result = classifyFeedback('이 기능 빼고 대신 결제 기능 추가해주세요. MVP 범위 수정');
      expect(result.target).toBe('gate1_prd');
    });

    it('should classify visual feedback as stitch_design', () => {
      const result = classifyFeedback('색상이 마음에 안 들어요. 다크 모드로 바꿔주세요.');
      expect(result.target).toBe('stitch_design');
    });

    it('should classify bug feedback as evolve_code', () => {
      const result = classifyFeedback('버그가 있어요. 클릭 안 되고 에러 메시지가 나옵니다.');
      expect(result.target).toBe('evolve_code');
    });
  });
});

describe('formatFeedbackReport', () => {
  it('should format report with target, confidence, and keywords', () => {
    const classification = classifyFeedback('디자인 색상 변경해주세요');
    const report = formatFeedbackReport(classification);
    expect(report).toContain('피드백 분류 결과');
    expect(report).toContain('롤백 위치');
    expect(report).toContain('확신도');
  });
});
