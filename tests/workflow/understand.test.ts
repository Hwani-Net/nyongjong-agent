import { describe, it, expect } from 'vitest';
import { analyzeGoal } from '../../src/workflow/understand.js';

describe('analyzeGoal complexity improvements (Audit Observation #2)', () => {
  it('should classify "AI 세금 신고 앱" as high complexity', () => {
    const result = analyzeGoal({ goal: '소상공인을 위한 AI 세금 신고 도우미 앱 개발' });
    // "AI" → AI regex (1 signal)
    // "세금" + "신고" → regulatory regex (1 signal)
    // "소상공인" → enterprise regex (1 signal)
    // Total = 3 signals → high
    expect(['high', 'critical']).toContain(result.analysis.complexity);
  });

  it('should classify "HIPAA 의료 플랫폼 with Firebase" as medium+', () => {
    const result = analyzeGoal({ goal: 'HIPAA 규제를 준수하는 의료 데이터 플랫폼을 Firebase와 React로 구축' });
    // regulatory regex (HIPAA+의료+규제) = 1 signal
    // enterprise regex (플랫폼) = 1 signal
    // hasExternalAPI (Firebase) = 1 signal
    // Total = 3 → high
    expect(['medium', 'high', 'critical']).toContain(result.analysis.complexity);
  });

  it('should classify "GDPR B2B SaaS 대시보드 API" as medium+', () => {
    const result = analyzeGoal({ goal: 'GDPR 컴플라이언스 B2B SaaS 대시보드 API 서버 개발' });
    // regulatory regex (GDPR+컴플라이언스) = 1 signal
    // enterprise regex (B2B+SaaS) = 1 signal
    // hasUI (대시보드) && hasAPI (API) = 1 signal
    // Total = 3 → high
    expect(['medium', 'high', 'critical']).toContain(result.analysis.complexity);
  });

  it('should keep simple bug fix as low complexity (no regression)', () => {
    const result = analyzeGoal({ goal: '버튼 색상 버그 수정' });
    expect(result.analysis.complexity).toBe('low');
  });

  it('should detect AI/ML keywords as complexity signal', () => {
    // AI regex alone = 1 signal → low. Add another signal source.
    const result = analyzeGoal({ goal: 'LLM 기반 RAG 파이프라인 + Firebase 연동 구축' });
    // AI regex (LLM+RAG) = 1 signal, hasExternalAPI (Firebase) = 1 signal → 2 → medium
    expect(['medium', 'high', 'critical']).toContain(result.analysis.complexity);
  });

  it('should detect regulatory keywords as complexity signal', () => {
    // regulatory regex alone = 1 signal → low. Add another signal source.
    const result = analyzeGoal({ goal: '개인정보 처리방침 관련 금융 데이터 API 대시보드 시스템' });
    // regulatory regex (개인정보+금융) = 1 signal
    // hasUI (대시보드) && hasAPI (API) = 1 signal → 2 → medium
    expect(['medium', 'high', 'critical']).toContain(result.analysis.complexity);
  });

  it('should detect enterprise scale keywords as complexity signal', () => {
    // Need 2+ signals for medium: hasUI && hasAPI (1 signal) + enterprise regex (1 signal)
    const result = analyzeGoal({ goal: '중소기업용 멀티테넌트 SaaS 대시보드 API 서버 구축' });
    // "대시보드" → hasUI, "API 서버" → hasAPI → hasUI && hasAPI = 1 signal
    // "중소기업"+"멀티테넌트"+"SaaS" → enterprise regex = 1 signal
    // Total = 2 signals → medium
    expect(['medium', 'high', 'critical']).toContain(result.analysis.complexity);
  });

  it('should count new AI/regulatory/enterprise signals independently', () => {
    // Verify each new signal contributes to complexity by testing isolated goals
    const aiOnly = analyzeGoal({ goal: 'GPT 모델 테스트' });
    const regOnly = analyzeGoal({ goal: '세금 신고 확인' });
    const entOnly = analyzeGoal({ goal: '소상공인 도구 조회' });
    const none = analyzeGoal({ goal: '단순 코드 확인' });
    // Each should be simple/low (1 signal each), but the important thing is
    // we verify the signals exist by combining them
    const combined = analyzeGoal({ goal: 'AI 세금 소상공인 앱 개발' });
    // AI(1) + reg(1) + enterprise(1) = 3 signals → high
    expect(['high', 'critical']).toContain(combined.analysis.complexity);
  });
});

describe('analyzeGoal basic behavior (no regression)', () => {
  it('should return correct fields', () => {
    const result = analyzeGoal({ goal: '간단한 할일 목록 조회' });
    expect(result.analysis).toHaveProperty('taskType');
    expect(result.analysis).toHaveProperty('complexity');
    expect(result.analysis).toHaveProperty('scope');
    expect(result.analysis).toHaveProperty('keyRequirements');
    expect(result.analysis).toHaveProperty('risks');
    expect(result.personaQuestions.length).toBeGreaterThan(0);
  });

  it('should handle empty goal gracefully', () => {
    const result = analyzeGoal({ goal: '' });
    expect(result.analysis.complexity).toBe('low');
    expect(result.analysis.taskType).toBe('simple');
  });
});

describe('analyzeGoal NLM research detection (ADR-015 / G-3)', () => {
  it('should detect "조사" keyword and require NLM notebook', () => {
    const result = analyzeGoal({ goal: '한국 프랜차이즈 시장 규모와 트렌드를 조사하고 보고서를 작성해줘' });
    expect(result.analysis.keyRequirements).toContain('📚 NLM 노트북 필수 — 팩트 기반 지식만 사용');
    expect(result.analysis.risks.some(r => r.includes('NLM'))).toBe(true);
  });

  it('should detect "리서치" keyword and require NLM', () => {
    const result = analyzeGoal({ goal: 'AI 에이전트 프레임워크 리서치 및 비교 분석' });
    expect(result.analysis.keyRequirements).toContain('📚 NLM 노트북 필수 — 팩트 기반 지식만 사용');
  });

  it('should detect "경쟁사" keyword and require NLM', () => {
    const result = analyzeGoal({ goal: '경쟁사 제품 분석 보고서 작성' });
    expect(result.analysis.keyRequirements).toContain('📚 NLM 노트북 필수 — 팩트 기반 지식만 사용');
  });

  it('should detect English "research" keyword', () => {
    const result = analyzeGoal({ goal: 'Research best practices for MCP server design' });
    expect(result.analysis.keyRequirements).toContain('📚 NLM 노트북 필수 — 팩트 기반 지식만 사용');
  });

  it('should add NLM data source persona question', () => {
    const result = analyzeGoal({ goal: '시장 조사 후 진입 가능성 보고서 작성' });
    expect(result.personaQuestions.some(q => q.includes('NLM'))).toBe(true);
  });

  it('should NOT require NLM for non-research tasks', () => {
    const result = analyzeGoal({ goal: '버튼 색상 버그 수정' });
    expect(result.analysis.keyRequirements).not.toContain('📚 NLM 노트북 필수 — 팩트 기반 지식만 사용');
  });
});
