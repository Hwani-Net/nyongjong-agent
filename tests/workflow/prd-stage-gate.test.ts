// Tests for PRD Stage-Gate system (Gate 0, Gate 1, Feedback Router)
import { describe, it, expect } from 'vitest';
import { analyzeGoal, detectAmbiguities, generateOptions, formatAnalysisForPRD } from '../../src/workflow/understand.js';
import { generateInitialPRD, applyComplaints, type CustomerVerdict, type PRDDocument } from '../../src/workflow/prd-elicitation.js';
import { classifyFeedback, describeRollback, type RollbackTarget } from '../../src/workflow/feedback-router.js';
import { shouldRunBusinessGate } from '../../src/workflow/business-gate.js';

// ═══════════════════════════════════════
// Test Group: detectAmbiguities (understand.ts extensions)
// ═══════════════════════════════════════

describe('detectAmbiguities', () => {
  it('should detect missing priority for complex tasks', () => {
    // Goal must trigger 'high' or 'critical' complexity (4+ signals)
    const goal = '프론트엔드 화면과 API 서버를 연결하는 실시간 대시보드 구축. 칸반, 채팅, 터미널, 에이전트 상태 포함. Firebase 인증, WebSocket 필요. 여러 컴포넌트로 분리.';
    const analysis = analyzeGoal({ goal });
    const ambiguities = detectAmbiguities(analysis, goal);
    
    // Verify it was indeed high/critical
    expect(['high', 'critical']).toContain(analysis.analysis.complexity);
    const hasPriority = ambiguities.some(a => a.type === 'priority');
    expect(hasPriority).toBe(true);
  });

  it('should NOT detect missing priority when MVP is mentioned', () => {
    const goal = 'MVP로 대시보드 먼저 만들어';
    const analysis = analyzeGoal({ goal });
    const ambiguities = detectAmbiguities(analysis, goal);
    
    const hasPriority = ambiguities.some(a => a.type === 'priority');
    expect(hasPriority).toBe(false);
  });

  it('should detect missing tech stack for architecture tasks', () => {
    const goal = '프론트엔드 API 연결하는 대시보드 구축. 여러 파일로 분리.';
    const analysis = analyzeGoal({ goal });
    const ambiguities = detectAmbiguities(analysis, goal);
    
    const hasTechStack = ambiguities.some(a => a.type === 'techStack');
    expect(hasTechStack).toBe(true);
  });

  it('should NOT detect missing tech stack when React is mentioned', () => {
    const goal = 'React로 대시보드 만들기. 여러 파일로 구축.';
    const analysis = analyzeGoal({ goal });
    const ambiguities = detectAmbiguities(analysis, goal);
    
    const hasTechStack = ambiguities.some(a => a.type === 'techStack');
    expect(hasTechStack).toBe(false);
  });

  it('should detect missing success criteria', () => {
    const goal = '대시보드 만들어';
    const analysis = analyzeGoal({ goal });
    const ambiguities = detectAmbiguities(analysis, goal);
    
    const hasSuccess = ambiguities.some(a => a.type === 'successCriteria');
    expect(hasSuccess).toBe(true);
  });

  it('should NOT detect missing success criteria when KPI is mentioned', () => {
    const goal = '대시보드 만들어. 성공 기준: 3초 이내 로딩';
    const analysis = analyzeGoal({ goal });
    const ambiguities = detectAmbiguities(analysis, goal);
    
    const hasSuccess = ambiguities.some(a => a.type === 'successCriteria');
    expect(hasSuccess).toBe(false);
  });

  it('should return max 3 ambiguities', () => {
    const goal = '뭔가 만들어'; // vague → many gaps
    const analysis = analyzeGoal({ goal });
    const ambiguities = detectAmbiguities(analysis, goal);
    
    expect(ambiguities.length).toBeLessThanOrEqual(3);
  });

  it('should detect missing target user', () => {
    const goal = '재고 관리 앱 만들어';
    const analysis = analyzeGoal({ goal });
    const ambiguities = detectAmbiguities(analysis, goal);
    
    const hasTargetUser = ambiguities.some(a => a.type === 'targetUser');
    expect(hasTargetUser).toBe(true);
  });
});

// ═══════════════════════════════════════
// Test Group: generateOptions (understand.ts)
// ═══════════════════════════════════════

describe('generateOptions', () => {
  it('should return formatted options for ambiguities', () => {
    const ambiguities = [
      { type: 'priority' as const, question: '우선순위?', options: ['A기능', 'B기능'] },
    ];
    const result = generateOptions(ambiguities);
    
    expect(result).toContain('Q1');
    expect(result).toContain('우선순위?');
    expect(result).toContain('A)');
    expect(result).toContain('B)');
  });

  it('should return "no ambiguity" message for empty list', () => {
    const result = generateOptions([]);
    expect(result).toContain('불명확한 포인트 없음');
  });
});

// ═══════════════════════════════════════
// Test Group: formatAnalysisForPRD (understand.ts)
// ═══════════════════════════════════════

describe('formatAnalysisForPRD', () => {
  it('should format analysis output as markdown', () => {
    const analysis = analyzeGoal({ goal: 'API 서버 만들기' });
    const result = formatAnalysisForPRD(analysis);
    
    expect(result).toContain('목표 분석 결과');
    expect(result).toContain('유형:');
    expect(result).toContain('복잡도:');
  });
});

// ═══════════════════════════════════════
// Test Group: generateInitialPRD (prd-elicitation.ts)
// ═══════════════════════════════════════

describe('generateInitialPRD', () => {
  it('should generate PRD with all required sections', () => {
    const analysis = analyzeGoal({ goal: '프론트엔드 대시보드 만들기' });
    const prd = generateInitialPRD('프론트엔드 대시보드 만들기', analysis);
    
    expect(prd.context).toBeTruthy();
    expect(prd.scope).toBeInstanceOf(Array);
    expect(prd.nonGoals).toBeInstanceOf(Array);
    expect(prd.mustHave).toBeInstanceOf(Array);
    expect(prd.mustNot).toBeInstanceOf(Array);
    expect(prd.successCriteria).toBeInstanceOf(Array);
    expect(prd.risks).toBeInstanceOf(Array);
    expect(prd.version).toBe(0);
  });

  it('should include UI-specific success criteria for UI tasks', () => {
    const analysis = analyzeGoal({ goal: '페이지 디자인 만들기' });
    const prd = generateInitialPRD('페이지 디자인 만들기', analysis);
    
    const has3Click = prd.successCriteria.some(c => c.includes('3클릭'));
    expect(has3Click).toBe(true);
  });

  it('should infer non-goals when not mentioned in goal', () => {
    const analysis = analyzeGoal({ goal: '대시보드 만들기' });
    const prd = generateInitialPRD('대시보드 만들기', analysis);
    
    // Should infer mobile is not in scope (not mentioned)
    expect(prd.nonGoals.some(n => /모바일/i.test(n))).toBe(true);
  });

  it('should include safety constraints in mustNot', () => {
    const analysis = analyzeGoal({ goal: '결제 API 구현' });
    const prd = generateInitialPRD('결제 API 구현', analysis);
    
    expect(prd.mustNot.some(m => /API\s*키|비밀번호/i.test(m))).toBe(true);
  });

  it('should include project context when provided', () => {
    const analysis = analyzeGoal({ goal: '기능 추가', projectContext: '기존 Next.js 프로젝트' });
    const prd = generateInitialPRD('기능 추가', analysis, '기존 Next.js 프로젝트');
    
    expect(prd.context).toContain('Next.js');
  });
});

// ═══════════════════════════════════════
// Test Group: applyComplaints (prd-elicitation.ts)
// ═══════════════════════════════════════

describe('applyComplaints', () => {
  const basePRD: PRDDocument = {
    context: '테스트 앱',
    scope: ['기능 A'],
    nonGoals: [],
    mustHave: ['기본 기능'],
    shouldHave: [],
    mustNot: [],
    successCriteria: ['빌드 에러 0개'],
    risks: [],
    version: 0,
  };

  it('should add blockers that mention criteria to successCriteria', () => {
    const verdicts: CustomerVerdict[] = [{
      personaId: 'user-advocate',
      personaName: 'test',
      verdict: 'REJECTED',
      blockers: ['핵심 기능 3클릭 이내 기준이 성공 기준에 없습니다'],
      wishes: [],
      approvedAspects: [],
    }];

    const refined = applyComplaints(basePRD, verdicts);
    
    expect(refined.version).toBe(1);
    expect(refined.successCriteria.some(c => c.includes('3클릭'))).toBe(true);
  });

  it('should add wishes to shouldHave', () => {
    const verdicts: CustomerVerdict[] = [{
      personaId: 'user-advocate',
      personaName: 'test',
      verdict: 'APPROVED',
      blockers: [],
      wishes: ['다크모드 추가 권장'],
      approvedAspects: [],
    }];

    const refined = applyComplaints(basePRD, verdicts);
    
    expect(refined.shouldHave).toContain('다크모드 추가 권장');
  });

  it('should add nonGoals when missing and blocker mentions scope', () => {
    const verdicts: CustomerVerdict[] = [{
      personaId: 'frustrated-user',
      personaName: 'test',
      verdict: 'REJECTED',
      blockers: ['구체적인 기능 범위가 부족합니다. "무엇을 만드나"가 명확해야 합니다'],
      wishes: [],
      approvedAspects: [],
    }];

    const refined = applyComplaints(basePRD, verdicts);
    // Scope-related blocker adds to mustHave
    expect(refined.mustHave.length).toBeGreaterThan(basePRD.mustHave.length);
  });

  it('should increment version on each apply', () => {
    const v1 = applyComplaints(basePRD, []);
    expect(v1.version).toBe(1);
    
    const v2 = applyComplaints(v1, []);
    expect(v2.version).toBe(2);
  });

  it('should deduplicate arrays', () => {
    const verdicts: CustomerVerdict[] = [
      {
        personaId: 'a', personaName: 'a', verdict: 'APPROVED',
        blockers: [], wishes: ['다크모드 추가 권장'], approvedAspects: [],
      },
      {
        personaId: 'b', personaName: 'b', verdict: 'APPROVED',
        blockers: [], wishes: ['다크모드 추가 권장'], approvedAspects: [],
      },
    ];

    const refined = applyComplaints(basePRD, verdicts);
    const darkModeCount = refined.shouldHave.filter(s => s === '다크모드 추가 권장').length;
    expect(darkModeCount).toBe(1);
  });
});

// ═══════════════════════════════════════
// Test Group: shouldRunBusinessGate (business-gate.ts)
// ═══════════════════════════════════════

describe('shouldRunBusinessGate', () => {
  it('should SKIP debugging tasks', () => {
    const result = shouldRunBusinessGate('로그인 버그 수정', 'debugging', 'medium');
    expect(result.need).toBe('SKIP');
  });

  it('should SKIP refactoring tasks', () => {
    const result = shouldRunBusinessGate('코드 리팩터링', 'refactoring', 'medium');
    expect(result.need).toBe('SKIP');
  });

  it('should SKIP documentation tasks', () => {
    const result = shouldRunBusinessGate('API 문서 작성', 'documentation', 'low');
    expect(result.need).toBe('SKIP');
  });

  it('should SKIP internal tool keywords', () => {
    const result = shouldRunBusinessGate('내부 관리자 도구 만들기', 'implementation', 'medium');
    expect(result.need).toBe('SKIP');
  });

  it('should SKIP simple low complexity tasks', () => {
    const result = shouldRunBusinessGate('버튼 텍스트 바꿔', 'simple', 'low');
    expect(result.need).toBe('SKIP');
  });

  it('should REQUIRE new service/product', () => {
    const result = shouldRunBusinessGate('새 SaaS 플랫폼 런칭', 'architecture', 'high');
    expect(result.need).toBe('REQUIRED');
  });

  it('should REQUIRE revenue/payment related', () => {
    const result = shouldRunBusinessGate('구독 결제 시스템 구현', 'implementation', 'high');
    expect(result.need).toBe('REQUIRED');
  });

  it('should REQUIRE marketing related', () => {
    const result = shouldRunBusinessGate('사용자 유치를 위한 SEO 구현', 'implementation', 'medium');
    expect(result.need).toBe('REQUIRED');
  });

  it('should ASK_HUMAN for medium implementation', () => {
    const result = shouldRunBusinessGate('게시판 기능 만들기', 'implementation', 'medium');
    expect(result.need).toBe('ASK_HUMAN');
  });

  it('should ASK_HUMAN for ambiguous strategy tasks', () => {
    const result = shouldRunBusinessGate('로드맵 기획', 'strategy', 'medium');
    expect(result.need).toBe('ASK_HUMAN');
  });
});

// ═══════════════════════════════════════
// Test Group: classifyFeedback (feedback-router.ts)
// ═══════════════════════════════════════

describe('classifyFeedback', () => {
  it('should classify business direction change as gate0', () => {
    const result = classifyFeedback('타겟 시장을 B2B로 바꾸자');
    expect(result.target).toBe('gate0');
  });

  it('should classify strategy change as gate0', () => {
    const result = classifyFeedback('사업 전략을 방향 전환하고 싶어');
    expect(result.target).toBe('gate0');
  });

  it('should classify feature change as gate1_prd', () => {
    const result = classifyFeedback('이 기능 빼고 우선순위 바꿔');
    expect(result.target).toBe('gate1_prd');
  });

  it('should classify scope change as gate1_prd', () => {
    const result = classifyFeedback('범위를 줄이고 MUST 항목만 남겨');
    expect(result.target).toBe('gate1_prd');
  });

  it('should classify color/design change as stitch_design', () => {
    const result = classifyFeedback('색상이 마음에 안 들어. 더 세련되게');
    expect(result.target).toBe('stitch_design');
  });

  it('should classify layout change as stitch_design', () => {
    const result = classifyFeedback('레이아웃 배치 바꿔줘. 아이콘 위치도.');
    expect(result.target).toBe('stitch_design');
  });

  it('should classify bug report as evolve_code', () => {
    const result = classifyFeedback('버튼 눌러도 동작 안 돼. 에러 남.');
    expect(result.target).toBe('evolve_code');
  });

  it('should classify performance issue as evolve_code', () => {
    const result = classifyFeedback('페이지가 느려. 최적화 해줘');
    expect(result.target).toBe('evolve_code');
  });

  it('should default to evolve_code for unknown feedback', () => {
    const result = classifyFeedback('음 뭔가 이상해');
    expect(result.target).toBe('evolve_code');
  });

  it('should return confidence > 0 for matched patterns', () => {
    const result = classifyFeedback('타겟 시장을 바꾸자');
    expect(result.confidence).toBeGreaterThan(0);
  });

  it('should include matched keywords', () => {
    const result = classifyFeedback('색상 바꿔줘');
    expect(result.matchedKeywords.length).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════
// Test Group: describeRollback (feedback-router.ts)
// ═══════════════════════════════════════

describe('describeRollback', () => {
  it('should return descriptions for all rollback targets', () => {
    const targets: RollbackTarget[] = ['gate0', 'gate1_prd', 'stitch_design', 'evolve_code'];
    for (const target of targets) {
      const desc = describeRollback(target);
      expect(desc).toBeTruthy();
      expect(desc.length).toBeGreaterThan(10);
    }
  });
});

// ═══════════════════════════════════════
// Test Group: analyzeGoal backward compatibility
// ═══════════════════════════════════════

describe('analyzeGoal backward compatibility', () => {
  it('should still return all original fields', () => {
    const result = analyzeGoal({ goal: '대시보드 만들기' });
    
    expect(result.analysis).toBeDefined();
    expect(result.analysis.taskType).toBeDefined();
    expect(result.analysis.complexity).toBeDefined();
    expect(result.analysis.scope).toBeDefined();
    expect(result.analysis.keyRequirements).toBeInstanceOf(Array);
    expect(result.analysis.risks).toBeInstanceOf(Array);
    expect(result.personaQuestions).toBeInstanceOf(Array);
    expect(result.nextAction).toBeDefined();
    expect(result.rawAnalysis).toBeDefined();
    expect(result.suggestedPersonas).toBeInstanceOf(Array);
  });

  it('should handle empty goal gracefully', () => {
    const result = analyzeGoal({ goal: '' });
    expect(result.analysis.taskType).toBe('simple');
    expect(result.analysis.complexity).toBe('low');
  });

  it('should detect bugs as debugging type', () => {
    const result = analyzeGoal({ goal: '로그인 에러 수정해줘' });
    expect(result.analysis.taskType).toBe('debugging');
  });
});
