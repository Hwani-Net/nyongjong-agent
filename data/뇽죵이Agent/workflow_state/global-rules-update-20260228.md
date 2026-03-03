---
project: global-rules
status: completed
tags:
  - critic-layer
  - constitution
  - gemini-md
  - svg-animation
  - search-policy
type: workflow_state
updated: '2026-02-28'
---
# 전역 규칙 & Constitution 업데이트 로그 (2026-02-28)

## 세션 정보
- Conversation ID: `8c68443a-d451-4470-bf75-a2fb0b7f0391`
- 작업: Critic Layer 구현 + 전역 규칙 강화 + 감사 기반 개선

## 변경 이력 (시간순)

### Phase 1: Critic Layer 구현
- `critic-constitution.yaml` 생성 (9개 원칙)
- `critic_check` MCP 도구 구현 (mcp-server.ts)
- 빌드 검증 완료 (nyongjong-agent@0.5.0)

### Phase 2: 정체성 앵커 + 이름 변경
- GEMINI.md에 `뇽죵이 정체성 앵커` 섹션 추가 (+21줄)
- GEMINI.md에 `Critic 체크포인트` 섹션 추가 (+10줄)
- naedon-agent → nyongjong-agent 이름 변경
- ceo-naedon → ceo-nyongjong 페르소나 교체

### Phase 3: 감사 기반 개선 (심리검사 앱 세션 감사 후)
- **CRITIC_TRACE 원칙 추가**: critic_check 호출 결과를 walkthrough에 테이블로 기록 의무
- **PORT_REGISTRY 강화**: walkthrough에 포트 등록 기록 의무 추가, 체크 질문 3개로 확장

### Phase 4: SVG 애니메이션 스킬 도입
- `C:\Users\AIcreator\.agent\skills\svg-animation\SKILL.md` 신규 생성
- TECH_STACK_STANDARD.md에 Framer Motion 추가
- **MICRO_ANIMATION 원칙 추가**: 정적 UI만 만들면 WARN

### Phase 5: 검색 도구 우선순위 정책
- GEMINI.md에 `검색 도구 우선순위 정책` 섹션 신설 (+19줄)
  - context7 → tavily_research → tavily_search/brave → search_web 계층
- **PACKAGE_VERIFY 원칙 추가**: 외부 패키지 사용 전 context7로 실존 검증 필수

## 현재 Constitution 원칙 총 13개
1. DESIGN_FIRST (BLOCK)
2. STITCH_SKILL_READ (WARN)
3. MICRO_ANIMATION (WARN) ← 신규
4. WORKFLOW_MANDATORY (WARN)
5. PACKAGE_VERIFY (WARN) ← 신규
6. FAILURE_REPORT (BLOCK)
7. NO_MOCK_IN_PROD (BLOCK)
8. YEAR_ACCURACY (WARN)
9. PORT_REGISTRY (WARN)
10. CRITIC_TRACE (WARN) ← 신규
11. HONEST_SCORING (BLOCK)
12. WALKTHROUGH_REQUIRED (WARN)
13. BUILD_VERIFY (WARN)

## 주요 파일 위치
- 전역 규칙: `C:\Users\AIcreator\.gemini\GEMINI.md`
- Constitution: `C:\Users\AIcreator\.agent\critic-constitution.yaml`
- 기술 표준: `C:\Users\AIcreator\.agent\TECH_STACK_STANDARD.md`
- SVG 스킬: `C:\Users\AIcreator\.agent\skills\svg-animation\SKILL.md`
