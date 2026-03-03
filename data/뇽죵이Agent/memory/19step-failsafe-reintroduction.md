---
date: '2026-03-01'
project: 뇽죵이Agent
tags:
  - architecture
  - workflow
  - decision
---
# 19단계 안전망 재도입 결정 (2026-03-01)

## 결정 사항
19단계 Pre-flight에서 사라진 5개 기능 중 2개를 GLOBAL_RULES에 안전망으로 재도입.

### Phase 1: 런치 완성도 체크리스트
- **위치**: GEMINI.md critic_check 섹션 하단
- **동작**: 웹 프로젝트 배포 시 walkthrough에 OG태그/favicon/robots.txt/manifest 등 체크 의무
- **위반**: LAUNCH_READINESS 감점

### Phase 2: 5인 전략검증 (Council 모드)
- **위치**: GEMINI.md nongjong-agent 워크플로우 5-2번
- **트리거**: 새 프로젝트 + high 이상 복잡도 + architecture/implementation
- **실행**: persona_consult(stage: "prototype", maxPersonas: 5)
- **제외**: medium 이하, 버그수정, 리팩터링, 단순 CRUD

### 미도입 (중기)
- e2e 자동수정 → 결제/퍼널 앱에서만
- CI/CD 게이트 → 실서비스 외부 런칭 시
- 피드백 수집 → 멀티유저 전환 시

## 관련 분석
- 19단계 해부 분석 완료 (DNA 5대 원칙 보존 확인)
- 시나리오 2회 검증 (일반+극한)
- market_research MCP 도구 복원 완료 (같은 세션)

## workflow_state
- phase: 완료
- next: 없음 (단발성 분석+도입 작업)
