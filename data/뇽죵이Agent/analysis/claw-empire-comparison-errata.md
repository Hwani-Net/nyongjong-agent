---
date: '2026-03-02'
project: 뇽죵이Agent
severity: high
type: errata
---
# Claw-Empire vs 뇽죵이Agent 비교 분석 — 정정 기록

> ⚠️ 2026-03-02 최초 분석에서 **3가지 오판** 발생. 이 문서는 정정된 결론.

## ❌ 오판 내역 (폐기됨)
1. "페르소나 회의/토론 없음" → **틀림**. persona_consult + DynamicPersonaGenerator + Council 모드(5인)으로 Claw보다 정교한 멀티모델 병렬 리뷰 가능
2. "스킬 시스템 열세" → **틀림**. 42개 실행형 스킬 + 스킬 체이닝 + BLOCK/critic 규율 체계. Claw의 600+ On/Off보다 질적 우세
3. "메신저 연동 없음" → **틀림**. telegram-test, user-feedback-loop, post-deploy-monitor 3개 스킬로 구현됨. 상시 데몬만 미완

## ✅ 정정된 결론
- 실제 불리한 점은 **2~3개**로 축소: 멀티 에이전트 병렬(철학 차이), Git Worktree 미연결(→ 이번 세션에서 연결 완료), Telegram 데몬(MCP 구조상 유료 API 없이 불가)
- Claw에 없는 우리 고유 기능: business_gate, prd_elicit, grounding(6개 어댑터), claw-bridge(Claw 시각화 연동), feedback_collect
- `claw-bridge.ts`로 뇽죵이Agent가 Claw의 두뇌 역할을 하는 통합 구조가 이미 구현됨

## 교훈
- 겉(UI/README)만 보고 비교하지 말 것 — 반드시 소스 코드를 열어서 확인
- "없다"는 결론은 코드 레벨 확인 후에만 내릴 것
