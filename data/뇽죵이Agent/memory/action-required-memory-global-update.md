---
priority: high
project: global
status: action-required
type: reminder
---
# ⚠️ MEMORY[user_global] 업데이트 필요

## 요청 사항
**대표님이 Antigravity 전역 설정(MEMORY[user_global])에 아래 내용을 추가해주셔야 합니다.**

세션 재개 체크리스트 (🔁 세션 재개 시 필수 체크) 항목에 아래 줄 추가:

```
1-2. `C:\Users\AIcreator\.agent\LESSONS_LEARNED.md` — grep_search로 현재 작업 관련 키워드 검색 (프로젝트별 삽질 기록 포함)
```

## 추가 위치
기존 체크리스트:
```
1. 프로젝트의 docs/PROJECT_CONTEXT.md 읽기
1-1. docs/PITFALLS.md 있으면 읽기
```
→ 여기에 `1-2` 항목 추가

## 이유
- LESSONS_LEARNED.md (C:\Users\AIcreator\.agent\LESSONS_LEARNED.md)는 전체 프로젝트의 삽질 기록이 모인 글로벌 저장소
- 2026-03-04 기준 315줄 → 525줄로 BITE Log, BenefitBell, 뇽죵이Agent 삽질 19개 통합됨
- 세션 시작 시 자동으로 읽히지 않으면 같은 삽질이 반복됨

## 작업 완료일
2026-03-04
