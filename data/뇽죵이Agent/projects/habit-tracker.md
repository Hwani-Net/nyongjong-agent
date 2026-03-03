---
port: 3009
project: habit-tracker
status: 구현완료
tags:
  - habit-tracker
  - next.js
  - tailwind
  - 완료
---
# Habit Tracker 프로젝트

**생성일**: 2026-02-28
**상태**: 구현 완료 (구현 단계)
**포트**: 3009
**경로**: `e:/AI_Programing/Jihasu/habit-tracker`

## 기술 스택
- Next.js 15 + TypeScript
- Tailwind CSS v4
- Framer Motion (애니메이션)
- canvas-confetti (streak 축하)
- Zustand (상태관리)
- localStorage (데이터 저장)

## 구현 기능
- ✅ 습관 추가/삭제 (이름, 이모지 아이콘, 색상, 빈도)
- ✅ 오늘의 체크리스트 (체크 애니메이션)
- ✅ 월간 히트맵 캘린더 (GitHub 스타일)
- ✅ 연속 달성일 streak 카운터 + confetti 축하
- ✅ localStorage 저장/복원
- ✅ 한국어/영어 i18n
- ✅ 라이트/다크/시스템 테마

## Stitch 프로젝트
- **ID**: 9081168621828514045
- **스크린 1**: 58a6b3725b2949f7b8325afda746195c (메인 대시보드)
- **스크린 2**: 00aaea2f80b2434fa81030ccb4c43f56 (습관 추가 모달)
- **스크린 3**: 7383634fff4b4ea9b4825755ddd15c33 (히트맵 캘린더)

## 파일 구조
```
src/
├── app/ (layout.tsx, page.tsx, calendar/page.tsx, globals.css)
├── components/ (HabitCard, AddHabitModal, StreakCounter, HeatmapCalendar, BottomNav, ThemeToggle, LanguageToggle)
├── hooks/ (useHabits.ts — Zustand 스토어)
├── lib/ (i18n.ts, streakCalc.ts)
├── locales/ (ko.json, en.json)
└── types/ (habit.ts)
```

## workflow_state
- Phase: 구현
- 다음 작업: Firebase Hosting 배포 시 `next export` 설정 필요 (현재 localStorage 전용이므로 SSR 불필요)
- 개선 여지: 습관 수정 기능, 주간 요약 Push 알림, Firebase Firestore 마이그레이션
