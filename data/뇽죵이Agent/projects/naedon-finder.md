---
project: naedon-finder
stack: 'Next.js 16, React 19, Supabase, Gemini, Toss'
status: active
---
# 나/너 복지 알리미 (naedon-finder / BenefitBell)

## 프로젝트 개요
- **정식 앱명**: 혜택알리미 (BenefitBell)
- **도메인**: `Hwani-Net/benefitbell`
- **위치**: `e:\AI_Programing\naedon-finder`
- **배포**: Vercel (`.vercel` 디렉터리 존재)

## 기술 스택
- **Framework**: Next.js 16.1.6 (App Router)
- **React**: 19.2.3
- **DB/Auth**: Supabase (`dbolydpnqefusswahfml`)
- **AI**: @google/generative-ai (Gemini)
- **결제**: TossPayments SDK (Toss + KakaoPay)
- **알림**: web-push (VAPID 방식 PWA 푸시)
- **캐시**: @vercel/kv
- **스타일**: Vanilla CSS + CSS Modules

## 핵심 기능
1. **복지 혜택 검색 & 탐색**: data.go.kr 한국사회보장정보원 API 연동
2. **AI 개인 맞춤 추천**: Gemini API 활용, 나이/지역/고용상태/주거형태/특이사항 기반 점수화
3. **마감 D-day 알림**: Vercel Cron + Web Push로 매일 자정 발송
4. **카카오 로그인**: Kakao OAuth (KAKAO_CLIENT_ID)
5. **프리미엄 구독**: 월 4,900원 — AI 무제한 + 광고 제거 + 14일 전 알림
6. **북마크**: 로컬 + Supabase 동기화
7. **다국어 지원**: 한국어/영어 토글 (`lang` context)
8. **PWA**: service worker + web-push

## 디렉터리 구조
```
src/
  app/
    page.tsx          — 홈 (마감임박/맞춤추천/카테고리/신규/인기)
    detail/[id]/      — 혜택 상세 페이지
    search/           — 검색/필터 페이지
    premium/          — 결제 페이지 (Toss/KakaoPay)
    premium/success/  — 결제 성공
    premium/fail/     — 결제 실패
    calendar/         — 혜택 캘린더
    profile/          — 사용자 프로필
    ai/               — AI 추천 페이지
    api/
      benefits/       — 혜택 목록 API
      ai-check/       — AI 자격 확인
      ai-recommend/   — AI 추천
      auth/           — 카카오 OAuth 콜백
      cron/
        check-new-benefits/  — 신규 혜택 확인 & 푸시 (매일 자정)
        notify/              — 알림 발송 (매일 자정)
        prefetch-details/    — 상세 데이터 프리패치 (매일 17:00)
      payments/       — Toss 결제 처리
      premium/        — 프리미엄 상태 관리
      push/
        cron-deadline/ — 마감 임박 알림 (매일 자정)
  lib/
    welfare-api.ts    — data.go.kr API 클라이언트 (XML 파싱)
    recommendation.ts — 개인 맞춤 점수화 엔진
    context.tsx       — 앱 전체 상태 (lang, kakaoUser, userProfile, bookmarks)
    supabase.ts       — Supabase 클라이언트
    kakao.ts          — 카카오 SDK 래퍼
    push-store.ts     — 푸시 구독 관리
  components/
    layout/           — TopBar, BottomNav
    ads/              — Google AdSense 배너
    ai/               — AI 추천 UI
    agentation/       — agentation 컴포넌트
    analytics/        — GA 컴포넌트
    pwa/              — PWA 설치 프롬프트
  data/
    benefits.ts       — 타입 정의 + 카테고리 상수 + 정적 fallback 데이터
  styles/
    globals.css       — 글로벌 CSS 변수/디자인 시스템
```

## API 연동
- **data.go.kr**: `NationalWelfareInformationsV001` (XML 파싱)
  - 목록: `NationalWelfarelistV001` (최대 5000건 페이지네이션)
  - 상세: `NationalWelfaredetailedV001` (JSON)
- **Supabase**: `push_subscriptions` 테이블

## Cron 스케줄 (vercel.json)
| Path | Schedule | 역할 |
|------|---------|------|
| /api/cron/notify | 0 0 * * * | 매일 자정 알림 |
| /api/push/cron-deadline | 0 0 * * * | 마감 임박 푸시 |
| /api/cron/check-new-benefits | 0 0 * * * | 신규 혜택 체크 & 푸시 |
| /api/cron/prefetch-details | 0 17 * * * | 매일 17:00 상세 데이터 프리패치 |

## 환경변수 (설정됨)
- DATA_GO_KR_SERVICE_KEY ✅
- GEMINI_API_KEY ✅
- Supabase (URL + ANON KEY + SERVICE_ROLE_KEY) ✅
- VAPID (공개/비공개 키) ✅
- KAKAO_CLIENT_ID ✅
- Toss 결제 키 ✅ (현재 테스트 키)
- KakaoPay QR 링크 ✅
- CRON_SECRET ✅
- GA_ID ✅

## 파악 날짜
2026-03-02
