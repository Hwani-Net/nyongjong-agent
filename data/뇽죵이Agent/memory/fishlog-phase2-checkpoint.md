---
next_action: aab-rebuild
status: checkpoint
tags:
  - fishlog
  - phase2
  - checkpoint
  - session-end
workflow_state: sprint3-complete
---
# FishLog Phase 2 — 세션 체크포인트

## 작성일: 2026-03-02

---

## ✅ 완료 상태 (Phase 2 Sprint 1~3 전체 완료)

### 프로젝트 경로
`e:\AI_Programing\Fishing\fish-log`

### Dev 서버
- 포트: **3008** (port-registry.json에 등록됨)
- 명령: `npm run dev -- -p 3008`

---

## 구현 완료 목록

### Sprint 1: 실시간 조과 뉴스 피드 ✅
- `src/services/fishingNewsService.ts` — Naver+YouTube 직접 클라이언트 호출 방식 (corsproxy.io 사용)
- `src/app/news/page.tsx` — 뉴스 피드 페이지 (지역/소스 필터, 신선도 표시)
- 홈 화면(`src/app/page.tsx`)에 뉴스 카드 3개 추가

### Sprint 2: 핵심 기능 강화 ✅
- `src/services/tideService.ts` — corsproxy.io 방식으로 복원 (static export 호환)
- `src/services/pushNotificationService.ts` — FCM 알림 (입질/뉴스/배지)
- `src/services/badgeService.ts` — 배지 9→16개 확장
- `src/app/settings/page.tsx` — 알림 토글 3종 + 바로가기 추가

### Sprint 3: 예약 연동 + 수익화 ✅
- `src/app/booking/page.tsx` — 선상24/더피싱/낚시가/피싱캠프 딥링크
- `src/services/affiliateService.ts` — 쿠팡 파트너스 장비 추천

---

## API 키 (.env.local) — 모두 NEXT_PUBLIC_ 접두사

| 변수명 | 값 | 비고 |
|--------|-----|------|
| `NEXT_PUBLIC_NAVER_CLIENT_ID` | `GQaYUOBwxud3JC_u5d4h` | 25,000건/일 무료 |
| `NEXT_PUBLIC_NAVER_CLIENT_SECRET` | `Gexa1C5lDO` | |
| `NEXT_PUBLIC_YOUTUBE_API_KEY` | `AIzaSyChILYZduPD9oEPFCluTbOLodjgiDVwPKc` | 10,000 units/일 |
| `NEXT_PUBLIC_KHOA_API_KEY` | 기존 키 유지 | 물때 API |
| `NEXT_PUBLIC_GEMINI_API_KEY` | 기존 키 유지 | AI 어종 인식 |
| `NEXT_PUBLIC_FIREBASE_*` | 기존 키 유지 | Firebase 설정 |

---

## 아키텍처 결정 사항

### ⚠️ 중요: output: 'export' (static export) 설정
- `next.config.ts`에 `output: 'export'` + `trailingSlash: true` 유지 중
- **이유**: TWA/PWA → .aab 빌드를 위해 static HTML export 필수
- **제약**: Next.js API Route (`/api/*`) 사용 **불가**
- **해결책**: 모든 외부 API 호출을 클라이언트 직접 호출로 처리
  - Naver API: `corsproxy.io` 경유 (CORS 우회)
  - YouTube API: 직접 호출 (CORS 허용됨)
  - KHOA 물때 API: `corsproxy.io` 경유

### 삭제된 파일
- `src/app/api/news/route.ts` — static export 충돌로 삭제
- `src/app/api/youtube/route.ts` — static export 충돌로 삭제
- `src/app/api/tide/route.ts` — static export 충돌로 삭제

---

## 빌드 상태

```
npm run build → ✅ Exit 0
✓ 13 static pages generated
Route: /, /booking, /feed, /news, /ranking, /record, /records, /settings, /stats, /terms, /privacy ...
```

---

## 미완 / 다음 세션 작업

1. **Play Store .aab 재빌드** — Phase 2 코드 반영한 새 .aab 필요
   - PWABuilder (`pwabuilder.com`) 또는 Bubblewrap 사용
   - 현재 파일: `e:\AI_Programing\Fishing\fish-log\FishLog.aab` (구버전)

2. **Google 신원 확인 대기** — Play Console 심사 중
   - 완료 후: 테스터 12명 등록 + 14일 비공개 테스트 시작

3. **실 뉴스 연동 확인** — corsproxy.io CORS 우회 실제 동작 검증 필요
   - Naver 응답 확인 (특히 블로그/뉴스 파싱)
   - YouTube 응답 확인

4. **YouTube API 키 제한 추가** (보안)
   - GCP Console에서 HTTP Referrer 제한 추가 권장

---

## workflow_state
- 단계: `sprint3-complete`
- 다음: `aab-rebuild → play-store-update`
