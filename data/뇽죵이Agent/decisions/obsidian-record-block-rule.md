---
project: global-rules
status: completed
tags:
  - obsidian
  - constitution
  - block-rule
type: decision
updated: '2026-02-28'
---
# Obsidian 기록 의무 BLOCK 원칙 추가 (2026-02-28)

## 문제
- Obsidian memory_write 규칙이 여러 세션에서 반복적으로 무시됨
- 결과: Obsidian 볼트에 프로젝트 기록이 거의 없음
- 근본 원인: GEMINI.md에만 규칙이 있고, Critic Layer(Constitution)에 없었음
  → 안 지켜도 아무 제재 없었음

## 해결
- `critic-constitution.yaml`에 `OBSIDIAN_RECORD` 원칙 추가
- **Severity: BLOCK** (가장 높은 수준)
- 세션 종료 전 memory_write 최소 1회 호출 필수
- walkthrough에 Obsidian 기록 완료 여부 명시 필수
- 미준수 시 → critic_check에서 BLOCK → 보고 강제 중단

## Constitution 원칙 현황 (총 14개)
- BLOCK (5개): DESIGN_FIRST, FAILURE_REPORT, NO_MOCK_IN_PROD, HONEST_SCORING, **OBSIDIAN_RECORD**
- WARN (9개): STITCH_SKILL_READ, MICRO_ANIMATION, WORKFLOW_MANDATORY, PACKAGE_VERIFY, YEAR_ACCURACY, PORT_REGISTRY, CRITIC_TRACE, WALKTHROUGH_REQUIRED, BUILD_VERIFY
