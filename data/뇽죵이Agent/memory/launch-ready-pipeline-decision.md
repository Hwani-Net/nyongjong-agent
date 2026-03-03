---
project: 뇽죵이Agent
tags:
  - launch-pipeline
  - workflow
  - skills
type: architecture-decision
---
# Launch-Ready Pipeline 설계 결정 (2026-03-01)

## 배경
MVP 파이프라인(분석→코딩→검증)을 스토어 출시까지 확장하기로 결정.

## 핵심 결정
1. **순환형 아키텍처**: 선형 파이프라인을 원형으로 확장 (Launch Gate에서 부적합 판정 시 이전 단계로 복귀)
2. **Launch Gate (STEP 7.5)**: MVP 완성 후 벤치마크 재검증 + 페르소나 재심사 + Lighthouse 감사
3. **점진적 배포**: 5% → 25% → 100% staged rollout + 자동 롤백

## 구현된 파일
- `workflows/launch-gate.md` — 출시 적합도 검증 (벤치마크+페르소나+Lighthouse)
- `skills/store-assets-generator/SKILL.md` — 스토어 에셋 자동생성
- `skills/legal-docs-generator/SKILL.md` — 개인정보처리방침/이용약관
- `workflows/ci-cd-gate.md` — staged rollout Phase 5 추가

## Pre-flight 통합
- STEP 7.5 = Launch Gate
- STEP 8.3 = 스토어 에셋 생성
- 기존 STEP 8.5 (post-deploy-monitor), STEP 9.5 (user-feedback-loop) 재사용

## workflow_state
- status: complete
- next_action: 실제 프로젝트에서 Launch Gate 테스트 실행
