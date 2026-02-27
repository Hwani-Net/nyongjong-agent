---
priority: critical
tags:
  - tech-stack
  - firebase
  - architecture
---
# 기술 스택 결정: Firebase 단일 플랫폼

**결정일**: 2026-02-27
**결정자**: 대표님

## 핵심 원칙
> 분산 관리 최소화. Firebase 계열 서비스를 최우선으로 사용한다.

## Firebase 스택 매핑

| 역할 | 서비스 |
|------|--------|
| 인증 | Firebase Authentication (이메일 + 구글) |
| DB | Cloud Firestore |
| 파일 저장 | Firebase Storage |
| 배포/호스팅 | Firebase Hosting |
| 서버리스 | Firebase Functions |
| AI | Firebase AI Logic (Gemini) |
| 분석 | Google Analytics for Firebase |

## 대체 금지 서비스

| 금지 | 이유 |
|------|------|
| Supabase | Firebase로 대체 |
| Vercel | Firebase Hosting으로 대체 |
| Cloudflare R2 | Firebase Storage로 대체 |
| AWS | Firebase로 대체 |

## 참조 파일
- `C:\Users\AIcreator\.agent\TECH_STACK_STANDARD.md` — 전역 표준 (Firebase로 업데이트됨)
