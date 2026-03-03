---
status: done
tags:
  - fishlog
  - phase2
  - sprint-complete
workflow_state: sprint3-complete
---
# FishLog Phase 2 — Sprint 1~3 완료 기록

## 날짜: 2026-03-01

## 완료 내용

### Sprint 1: 실시간 조과 뉴스 피드
- fishingNewsService.ts (Naver + YouTube 크롤링)
- /api/news/route.ts, /api/youtube/route.ts (프록시)
- news/page.tsx (풀 UI + 지역/소스 필터)
- 홈 화면 뉴스 카드 3개

### Sprint 2: 핵심 기능 강화
- /api/tide/route.ts (물때 서버 프록시 → CORS 해결)
- tideService 프록시 연동 (allorigins 제거)
- pushNotificationService.ts (FCM 알림)
- badgeService 9→16개 확장

### Sprint 3: 예약 연동 + 수익화
- booking/page.tsx (외부 플랫폼 딥링크)
- affiliateService.ts (쿠팡 파트너스)
- settings 알림 토글 + 바로가기

## 미해결
- API 키 등록 필요: NAVER_CLIENT_ID/SECRET, YOUTUBE_API_KEY
- Google 개발자 신원 확인 대기 중
- .aab 재빌드 + 재업로드 필요

## 다음 작업
- API 키 등록 → 실 뉴스 검증
- PWA .aab 재빌드
- Play Store 업데이트
