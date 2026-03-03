---
importance: critical
status: ready-to-test
topic: workflow-compliance-test
type: verification-project
updatedAt: '2026-02-28'
---
# 워크플로우 준수 검증 프로젝트

## 목적
전역 규칙(GEMINI.md)과 뇽죵이 Agent 설계를 Antigravity가 자연스럽게 따르는지 검증한다.
체크리스트를 프롬프트에 넣으면 보고 따르니까 검증이 안 됨 → **주제만 던지고 스스로 따르는지 관찰**.

## 검증 프롬프트 (이것만 새 세션에 붙여넣기)
```
새 프로젝트를 만들어줘.

프로젝트 주제: "MBTI 성격유형 기반 직업 추천 웹앱"
위치: e:\AI_Programing\TestMate Pro

작업을 진행하면서, 네가 전역 규칙과 뇽죵이 Agent 설계를 제대로 따르고 있는지 스스로 모니터링해.
위반 사항이 있으면 즉시 보고하고, 작업 완료 시 자가 채점표를 walkthrough에 첨부해.
```

## 검증 대상 (GEMINI.md 2026-02-28 기준)
1. Ollama 상태 체크 → memory 사용 전 ollama_health 호출
2. 세션 재개 체크 → memory_search로 이전 기록 확인
3. 뇽죵이 워크플로우 6단계 순서 준수
4. 예외 조항 오용 없음 (새 세션이면 "연속 작업" 예외 불가)
5. Design-First (StitchMCP 먼저)
6. Obsidian 기록 (아키텍처/기술 결정)
7. 포트 레지스트리 확인
8. 빌드 패턴 (WaitMsBeforeAsync=500)
9. API 과금 안전 (Mock/무료 Tier)
10. 작업 완료 보고 포맷

## 2026-02-28 변경사항 (이번 세션에서 수정한 것)
1. **GEMINI.md 패치**: 예외 조항에서 "진행 중 작업의 연속" → 같은 세션 내로 제한
2. **GEMINI.md 패치**: 세션 재개 시 필수 체크 절차 추가
3. **GEMINI.md 패치**: Obsidian 메모리 사용 기준 섹션 추가
4. **cycle-runner.ts**: 워크플로우 완료 시 Obsidian에 workflow_state 자동 저장
5. **mcp-server.ts**: CycleRunner에 obsidianStore 주입

## 위반 발견 시 처리 절차
1. 위반 내용 기록 (이 노트에 "위반 이력" 섹션 추가)
2. GEMINI.md 또는 뇽죵이 Agent 코드 수정
3. 수정 후 뇽죵이 Agent 재빌드: `cd E:\Agent\뇽죵이Agent && npm run build`
4. 이 노트 업데이트 (수정 내용 + 날짜)
5. 같은 검증 프롬프트로 재테스트

## 위반 이력
(아직 없음 — 첫 검증 테스트 미실행)

## 핵심 파일 위치
- 전역 규칙: `C:\Users\AIcreator\.gemini\GEMINI.md`
- 뇽죵이 Agent: `E:\Agent\뇽죵이Agent\`
- cycle-runner: `E:\Agent\뇽죵이Agent\src\workflow\cycle-runner.ts`
- mcp-server: `E:\Agent\뇽죵이Agent\src\mcp-server.ts`
