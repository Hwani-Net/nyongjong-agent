---
date: '2026-03-01'
project: 뇽죵이Agent
tags:
  - e2e
  - workflow
  - persona
type: test-result
---
# E2E 워크플로우 테스트 결과 (2026-03-01)

## 시나리오: "실버세대를 위한 간편 가계부 앱"

## 결과: 8/8 단계 성공

| Step | 도구 | 결과 | 비고 |
|:----:|------|:----:|------|
| 1 | analyze_goal | ✅ | healthcare 도메인 감지, 3개 suggestedPersonas 자동 주입 |
| 2 | persona_consult (understand) | ✅ | 5명, 4개 모델(14b/8b/7b/4b/3b), 도메인 페르소나 작동 |
| 3 | recommend_model | ✅ | Gemini 3.1 Pro (Low) 추천 |
| 4 | business_gate | ✅ | FAIL(2/3 거절) — 컨텍스트 부족 지적. 정상 방어 |
| 5 | market_research | ✅ | 네이버 블로그 기반 경쟁사 1건 발견 |
| 6 | prd_elicit | ✅ | PRD v1 생성, 의료법 자문이 비식별화 전략 부재 REJECT |
| 7 | persona_consult (prototype) | ✅ | 3명, 3개 모델 |
| 8 | critic_check | ✅ | PASS, 위반 0건 |

## 발견된 이슈
- deepseek-r1:8b 모델이 빈 응답("") 반환하는 문제 반복적으로 발생
- qwen2.5:7b 모델이 중국어 혼입 현상 (한국어 프롬프트인데 중국어로 전환)
- business_gate가 가계부 앱을 FAIL 처리 — 컨텍스트 부족이 원인이나, 실제 사업성은 있는 아이템이므로 gate 판정이 너무 보수적일 수 있음

## 페르소나 시스템 검증 완료
- Layer 0 (기본 8개): 정상 작동
- Layer 1 (도메인 템플릿): healthcare/fintech 키워드 감지 → 자동 주입 확인
- Layer 2 (LLM 동적 생성): Ollama 기반 동적 생성 확인 (OpenAI는 결제 미완료로 fallback)
- 멀티 모델 라운드 로빈: 5개 모델 배정 확인
