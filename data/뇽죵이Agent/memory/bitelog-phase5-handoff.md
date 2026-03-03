---
last_updated: '2026-03-03'
next_task: 'Phase 5 #4 맞춤 오픈런 알림'
phase: Phase 5
project: BITE Log
status: in-progress
---
# BITE Log — Phase 5 LLM 킬러 피처 핸드오프

## workflow_state
- **현재 Phase**: Phase 5 — LLM 킬러 피처 구현 중
- **마지막 세션**: 2026-03-03 (04:11 KST)
- **서버**: `npm run dev -- -p 3002` (http://localhost:3002)

## ✅ 완료된 작업

### Phase 5 #1 — 자연어 공지 파서
- 서비스: `src/services/noticeParserService.ts`
- UI: `src/app/tools/notice-parser/page.tsx`
- 상태: 완료 (API 키 없으면 Mock 폴백)

### Phase 5 #2 — 치어 방류 시즌 예측 AI ✅ (이번 세션 완료)
- DB: `src/data/fishSeasonDB.ts` — 6개 어종 × 지역별 방류 실적 하드코딩
- 서비스: `src/services/seasonForecastService.ts` — Gemini Flash + Mock 폴백
- UI: `src/app/season-forecast/page.tsx` — 어종/해역 선택 → AI 리포트 카드
- 홈 위젯: `src/app/page.tsx` — 스카이블루 배너 (뉴스 아래)
- i18n: `src/lib/i18n.ts` — season.* 키 ko/en 추가
- 검증: TS 타입 체크 통과, 브라우저 확인 완료

### Phase 5 #3 — SNS 바이럴 채비 모니터링 ✅ (이번 세션 완료)
- 서비스: `src/services/viralGearService.ts` — 네이버 Blog 검색 + Gemini Flash 분석 + Mock
- UI: `src/app/viral-gear/page.tsx` — TOP5 채비 랭킹 카드 + 바이럴 점수 바 + 쿠팡 CTA
- 홈 위젯: `src/app/page.tsx` — 오렌지 배너 (AI 시즌 예측 아래)
- 검증: TS exit code 0, 브라우저 확인 완료

## ⬜ 남은 작업

### Phase 5 #4 — 맞춤 오픈런 알림
- 선착순 마감 임박 낚시배 알림 push
- 구현 방향: `pushNotificationService.ts` 확장 + 오픈런 스케줄 감지 서비스
- 참고: `src/services/pushNotificationService.ts` 이미 존재

## 핵심 아키텍처 결정 (ADR)

| 결정 | 이유 |
|------|------|
| 공공데이터 API 직접 연동 포기 | 수산자원공단 API = 파일 다운로드만, 실시간 OpenAPI 없음 |
| 하드코딩 DB + LLM 요약 전략 | fishSeasonDB.ts만 교체하면 향후 확장 가능 |
| Naver API CORS 우회 = corsproxy.io | 기존 fishingNewsService 패턴 동일하게 적용 |
| i18n 패턴 = useAppStore(s=>s.locale) 인라인 삼항 | useLocale 훅 없음, 앱 전체 동일 패턴 |

## 환경 변수 현황

```
NEXT_PUBLIC_NAVER_CLIENT_ID=      # 설정 시 실제 검색 작동
NEXT_PUBLIC_NAVER_CLIENT_SECRET=  # 설정 시 실제 검색 작동
NEXT_PUBLIC_GEMINI_API_KEY=       # 설정 시 AI 분석 작동 (없으면 Mock)
```

## 주의사항 (PITFALL)
- `useLocale` 훅 없음 → `useAppStore(s => s.locale)` 사용
- Mock 폴백은 항상 동작 — API 키 없어도 정상 UI 표시
- 쿠팡 파트너스 링크: `link_id=re_1765888&subId=bitelog` 파라미터 유지
