---
phase: 설계
project: FishLog
status: active
workflow_state: design_complete
---
# FishLog LLM 전략 기획 — 세션 체크포인트

## 프로젝트: FishLog (낚시 앱)
## 진행도: 설계 (기획/전략 완료, Stitch 디자인 대기)
## 마지막 세션: 2026-03-02

---

## 완료된 작업
1. ✅ 경쟁사 11개 벤치마크 → benchmark_report.md
2. ✅ LLM 차별화 전략 v2 → llm_strategy.md (9개 피처 설계)
3. ✅ 비용 정밀 산정 & 실현 가능성 재검토 → feasibility_review.md
4. ✅ 어종별 전문가 페르소나 챗봇 설계 (6종 페르소나)
5. ✅ AI 낚시 컨시어지 (출발 시간 역산, 선제적 꿀팁 포함)
6. ✅ GPS 전자승선명부 조사 (해양수산부 API 연계 가능 확인)
7. ✅ 바이럴 채비 모니터링 → 커머스 연계 수익 모델

## 핵심 수치
- 월 운영비: ~₩40,000 (유저 1만명 기준)
- 손익분기: 프로회원 11명
- 즉시 가능 피처: 8개 / 조건부: 1개(승선명부 API 승인)

## 9대 피처 목록
1. 자연어 공지 파서
2. 치어 방류 시즌 예측 AI
3. SNS 바이럴 채비 모니터링 + 커머스 연계
4. 맞춤 오픈런 알림
5. GPS 전자승선명부 (해양수산부 API)
6. AI 낚시 컨시어지 (출발시간 역산 + 선제적 꿀팁)
7. 어종별 전문가 페르소나 챗봇 (프리미엄 구독)
8. 금어기 법규 QA (RAG)
9. 음성 기록

## 다음 작업
1. Stitch 디자인 (AI 컨시어지 화면, 챗봇 화면, 승선명부 화면)
2. 코드 구현 시작 (Phase 1: 공지 파서 + 알림 + 법규 QA)
3. 해양수산부 '협업이음터' API 연동 신청 검토

## 핵심 산출물 위치
- benchmark_report.md: 경쟁사 분석
- llm_strategy.md: LLM 전략 전체 (v2)
- feasibility_review.md: 비용 산정 & 실현 가능성
- 프로젝트 경로: e:\AI_Programing\Fishing\fish-log\
