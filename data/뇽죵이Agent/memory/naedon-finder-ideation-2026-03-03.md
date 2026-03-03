---
project: naedon-finder
tags:
  - ideation
  - killer-feature
  - feasibility
  - handoff
workflow_state: ideation-complete
---
# 혜택알리미 발상(Ideation) 결과 — 2026-03-03

## 확정된 10x 킬러 피처 3개
1. **"나 해당돼?" 3초 AI 자격 판정** — 최우선 구현
2. **"돈 되는 알림" 광고 0% 맞춤 푸시**
3. **무관한 혜택 자동 숨김 + 원스톱 서류 안내**

## 김짜증 핑퐁에서 확정된 UX 스펙
- 프로필 입력: **단계별** (기본만 먼저 → 정확도 올리고 싶으면 추가)
- 자격 판정: **"해당 여부 + %" 배지**로 즉시 표시
- 알림 정책: **새 혜택만 + 사용자가 체크한 것만 재알림. 시스템 자동 재발송 ❌**
- 안 읽음 처리: 앱 내 **뱃지 UI**로만 표시 (재알림 아님)
- 만료 혜택: **매일 자동 숨김/삭제**
- 서류 안내: **정부24 등 바로가기 링크** 제공 (향후 대리발급 프리미엄 검토)

## 기술 검증 결과 (feasibility)
- recommendation.ts에 **프로필→점수화 매칭 엔진 이미 구현**
- Benefit.documents[] 필드 존재
- Gemini API 세팅 완료 → AI 자격 판정 바로 착수 가능
- 정부24 Open API + 하이픈 API로 일부 서류 대리 발급 기술적 가능

## 다음 구현 순서
1. 온보딩 단계별 프로필 입력 UI 리디자인
2. Gemini AI 자격 판정 엔진 (trgterIndvdl + slctCriteria 분석)
3. % 배지 UI 컴포넌트 (리스트 + 상세 페이지)
4. 발송 이력 체크 (Firestore sent_notifications)
5. 서류 바로가기 링크 매핑

## 핵심 문서 위치
- 북극성: `e:/AI_Programing/naedon-finder/NORTH_STAR.md`
- 안티테제 전략: 대화 아티팩트 `antithesis_strategy.md`
- 발상 결과: 대화 아티팩트 `ideation_result.md`
- 기술 검증: 대화 아티팩트 `feasibility_report.md`
