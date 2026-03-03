---
next_action: Gemini API 연결
phase: 구현
project: BITE Log
session_date: '2026-03-03'
type: handoff
---
# BITE Log 세션 핸드오프 — 2026-03-03 13:05 KST

## 세션 목표
시즌 예측 데이터 고도화 + AI 비용 전략 수립 + API 키 보안

## 완료 항목
- [x] 시즌 예측 DB: 실제 2026 FIRA 방류계획 데이터만 적용 (203건 전수조사)
  - 5개 어종: 주꾸미(인천 30만), 우럭(인천 25만+부산 9.6만), 광어(부산 10만), 참돔(부산 10만), 볼락(통영 30.9만+사천 22만+하동 14.3만+거제 2.6만)
  - 가짜 데이터(2025→2026 라벨링) 완전 제거
- [x] 어종 이모지 → AI 생성 실사 이미지 교체 (48x48 원형, public/fish-*.png)
- [x] Windy: "출항 날씨"로 리브랜딩, 날짜 탭 시도 후 Windy embed가 timestamp 무시하여 제거
- [x] AI Rate Limiter 생성: `src/services/aiRateLimiter.ts`
  - 컨시어지 5회/일, 어종감별 20회/일, 공지파싱 10회/일, 바이럴장비 3회/일
- [x] LLM 가격 비교: Gemini 2.0 Flash 단일 모델 확정 ($0.10/$0.40 per 1M tokens)
  - GPT-4o-mini/4.1 모두 2026-02 단종됨, Claude Haiku는 8배 비쌈
  - Gemini 무료 티어: 1,500건/일 (MVP 충분)
- [x] GCP API 키 보안: HTTP 리퍼러 제한 + Generative Language API만 허용
  - 허용: fishlog-diary-2026.web.app, zippy-lolly-1f23de.netlify.app, localhost

## 미완료 / 다음 세션 TODO
- [ ] Gemini 2.0 Flash API 실제 연결 (AI Fish ID + 컨시어지)
- [ ] aiRateLimiter를 실제 AI 호출 함수에 적용
- [ ] 프로덕션 빌드 & Netlify 배포
- [ ] 홈 시즌 예측 위젯이 새 DB 구조와 호환되는지 확인
- [ ] 뉴스 섹션: 낚시 무관 콘텐츠 필터링 추가 검증

## 키 파일 변경사항
- `src/data/fishSeasonDB.ts` — 실제 2026 FIRA 데이터 + image 필드 추가
- `src/services/aiRateLimiter.ts` — 신규 생성 (AI 일일 사용량 제한)
- `src/app/page.tsx` — WindyWeatherSection 컴포넌트 (출항 날씨)
- `src/app/season-forecast/page.tsx` — 어종 카드 img 태그 적용
- `public/fish-*.png` — 5개 어종 실사 이미지
- `.env.local` — NEXT_PUBLIC_GEMINI_API_KEY 설정 완료

## 기술 결정 (ADR)
- **LLM 선택**: Gemini 2.0 Flash 단일 모델 (비용+성능+안정성)
- **API 키 방식**: NEXT_PUBLIC_ 클라이언트 노출 + GCP 리퍼러 제한 (static export 제약)
- **비용 제어**: 클라이언트 localStorage 기반 일일 제한 (MVP, 서버 검증 미구현)
- **데이터 정책**: 실제 확정 공고만 표시, 추정 데이터 사용 금지

## 컨텍스트 상태
- 세션 길이: 긴 편 (CHECKPOINT 발생)
- dev 서버: 포트 3002 실행 중
- 추천 모델: Gemini 3.1 Pro (Low) / Fast
- 추천 커맨드: `/이어서`
