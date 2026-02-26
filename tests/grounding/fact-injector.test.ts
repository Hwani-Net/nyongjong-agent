// Tests for grounding: fact-injector + grounding-engine adapter status
import { describe, it, expect } from 'vitest';
import { injectFacts } from '../../src/grounding/fact-injector.js';
import { GroundingEngine } from '../../src/grounding/grounding-engine.js';
import type { GroundingResult, ClaimVerification } from '../../src/grounding/grounding-engine.js';

// ─── FactInjector ────────────────────────────────────────────────────
describe('FactInjector', () => {
  it('should return original text when no verifications', () => {
    const result = injectFacts('Hello world', {
      verifications: [],
      summary: '',
      status: 'no_claims',
      analysis: { originalText: '', claims: [], groundingNeedScore: 0, suggestedSources: [] },
    });

    expect(result.injectedText).toBe('Hello world');
    expect(result.factCount).toBe(0);
  });

  it('should inject verified statistic facts', () => {
    const groundingResult: GroundingResult = {
      verifications: [
        {
          claim: { text: '약 1000건', type: 'statistic', groundingNeed: 0.8, suggestedSource: 'KOSIS' },
          verified: true,
          apiResult: {
            success: true,
            data: '실제 1,234건',
            source: 'KOSIS',
            query: '약 1000건',
            durationMs: 100,
          },
        },
      ],
      summary: '1 claim verified',
      status: 'grounded',
      analysis: { originalText: '', claims: [], groundingNeedScore: 0.8, suggestedSources: ['KOSIS'] },
    };

    const result = injectFacts('검색 결과 약 1000건이 발견됨', groundingResult);

    expect(result.injectedText).toContain('📊');
    expect(result.injectedText).toContain('실제 통계');
    expect(result.injectedText).toContain('KOSIS');
    expect(result.factCount).toBe(1);
  });

  it('should inject verified price facts', () => {
    const groundingResult: GroundingResult = {
      verifications: [
        {
          claim: { text: '월 5000원', type: 'price', groundingNeed: 0.7, suggestedSource: 'Naver Shopping' },
          verified: true,
          apiResult: { success: true, data: '3,900~9,900원', source: 'Naver Shopping', query: '월 5000원', durationMs: 200 },
        },
      ],
      summary: '1 claim verified',
      status: 'grounded',
      analysis: { originalText: '', claims: [], groundingNeedScore: 0.7, suggestedSources: [] },
    };

    const result = injectFacts('이 서비스는 월 5000원 정도 예상됩니다.', groundingResult);
    expect(result.injectedText).toContain('실제 가격');
    expect(result.factCount).toBe(1);
  });

  it('should skip unverified claims', () => {
    const groundingResult: GroundingResult = {
      verifications: [
        {
          claim: { text: 'unverified claim', type: 'statistic', groundingNeed: 0.3, suggestedSource: '' },
          verified: false,
          apiResult: { success: false, data: '', source: 'none', query: '', durationMs: 0 },
        },
      ],
      summary: '',
      status: 'ungrounded',
      analysis: { originalText: '', claims: [], groundingNeedScore: 0, suggestedSources: [] },
    };

    const result = injectFacts('This has unverified claim in it.', groundingResult);
    expect(result.factCount).toBe(0);
  });

  it('should handle regulation type facts', () => {
    const groundingResult: GroundingResult = {
      verifications: [
        {
          claim: { text: '개인정보보호법', type: 'regulation', groundingNeed: 0.9, suggestedSource: 'LawKr' },
          verified: true,
          apiResult: { success: true, data: '제15조 수집·이용', source: 'LawKr', query: '개인정보보호법', durationMs: 150 },
        },
      ],
      summary: '',
      status: 'grounded',
      analysis: { originalText: '', claims: [], groundingNeedScore: 0.9, suggestedSources: [] },
    };

    const result = injectFacts('개인정보보호법에 따라 처리합니다.', groundingResult);
    expect(result.injectedText).toContain('법령 확인');
    expect(result.factCount).toBe(1);
  });

  it('should handle claims not found in text gracefully', () => {
    const groundingResult: GroundingResult = {
      verifications: [
        {
          claim: { text: 'not in original', type: 'statistic', groundingNeed: 0.8, suggestedSource: '' },
          verified: true,
          apiResult: { success: true, data: 'data', source: 'src', query: '', durationMs: 50 },
        },
      ],
      summary: '',
      status: 'grounded',
      analysis: { originalText: '', claims: [], groundingNeedScore: 0, suggestedSources: [] },
    };

    const result = injectFacts('Completely different text.', groundingResult);
    expect(result.factCount).toBe(0);
  });

  it('should handle verified but API failed', () => {
    const groundingResult: GroundingResult = {
      verifications: [
        {
          claim: { text: 'test claim', type: 'statistic', groundingNeed: 0.8, suggestedSource: '' },
          verified: true,
          apiResult: { success: false, data: '', source: '', query: '', durationMs: 0 },
        },
      ],
      summary: '',
      status: 'ungrounded',
      analysis: { originalText: '', claims: [], groundingNeedScore: 0, suggestedSources: [] },
    };

    const result = injectFacts('Some test claim here.', groundingResult);
    expect(result.factCount).toBe(0);
  });
});

// ─── GroundingEngine adapter status ─────────────────────────────────
describe('GroundingEngine Adapter Status', () => {
  it('should report all 6 adapters', () => {
    const engine = new GroundingEngine();
    const status = engine.getAdapterStatus();

    expect(Object.keys(status).length).toBe(6);
    expect(status).toHaveProperty('kosis');
    expect(status).toHaveProperty('naver');
    expect(status).toHaveProperty('googleTrends');
    expect(status).toHaveProperty('lawKr');
    expect(status).toHaveProperty('appReviews');
    expect(status).toHaveProperty('webScraper');
  });
});
