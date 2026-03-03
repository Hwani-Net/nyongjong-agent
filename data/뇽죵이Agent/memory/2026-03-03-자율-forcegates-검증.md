---
date: '2026-03-03'
tags:
  - 자율
  - run_cycle
  - PRD
  - forceGates
  - bugfix
title: /자율 워크플로우 forceGates 검증 및 적용 완료
---
# `/자율` 워크플로우 forceGates 적용 및 검증 완료

## 📌 문제 상황
기존 `/자율` (mcp_openclaw-v2_run_cycle) 워크플로우 실행 시, 사용자가 제공한 목표의 복잡도(complexity)가 `low`로 판정될 경우 **Gate 0 (사업성 검토) 및 Gate 1 (PRD 생성) 단계가 자동 SKIP**되는 문제가 발생.
이로 인해 자율 모드의 핵심인 "PRD 생성 기반 구현" 로직이 작동하지 않고 기존 파일 테스트만 돌고 종료됨.

## 🛠️ 해결 방안 (수정된 파일)
`/자율` 명령 실행 시, 복잡도 판정을 우회하여 어떤 경우라도 반드시 PRD를 생성하도록 `forceGates` 파라미터를 도입.

1. **`src/workflow/understand.ts`**
   - `UnderstandInput` 인터페이스에 `forceGates?: boolean` 속성 추가.
2. **`src/workflow/cycle-runner.ts`**
   - `forceGates === true`일 경우, `shouldRunBusinessGate()`의 결과값을 덮어쓰고 강제로 `need: 'REQUIRED'` 처리.
   - `generateReport` 함수 호출 시 Gate 실행 결과(`businessGateVerdict`, `prdResult`, `forceGates`)를 전달.
3. **`src/workflow/report.ts`**
   - `ReportInput` 인터페이스에 Gate 결과 필드 추가.
   - `generateReport` 내부에 `## 🚦 Gate 실행 결과` 섹션을 마크다운으로 추가하여 출력 가시성 확보.
4. **`src/mcp-server.ts`**
   - `run_cycle` 도구 파라미터 스키마에 `forceGates` 추가.
5. **`.agent/workflows/자율.md`**
   - Phase 1 로직을 전면 수정:
     - `prd_elicit` 도구 선행 호출로 PRD 강제 생성.
     - `run_cycle` 시 `forceGates: true` 강제 전달.

## 🎯 검증 결과
- **테스트 케이스**: "포모도로 타이머 웹앱 MVP" (단순 구현 목표, 원래 `low` 판정으로 SKIP 대상).
- **결과**:
  - `low` 판정임에도 Gate 0(사업성) 및 Gate 1(PRD) 루프 강제 진입 확인.
  - "프랜차이즈 브로커", "의료법 자문" 등 커스토머 페르소나 3라운드 심사 정상 작동 (일부 PIVOT 및 ⚠️ 판정 반환).
  - 결과 리포트에 강제 실행 사실(`> ⚡ forceGates=true — complexity 무관 강제 실행`) 라벨 표출 정상 확인.

## 📝 교훈 및 한계점
- **페르소나 혼선**: 전역 템플릿에 등록된 페르소나(예: 프랜차이즈 브로커)가 주제(포모도로 타이머)에 무관하게 심사위원으로 채택되는 현상 발견. 페르소나 동적 생성 로직의 가중치 개선이 향후 필요함.
- **오픈소스 LLM 한계**: 7B/14B 모델 등 로컬 모델 특성상 3라운드 심사 후에도 `일부 불만 잔존` 상태로 넘어갈 확률이 존재. 이는 `/자율` PRD 초안을 대표님이 리뷰 후 보완하는 것으로 갈음 가능.
