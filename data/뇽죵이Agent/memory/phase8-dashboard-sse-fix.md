---
phase: 8
status: completed
tags:
  - dashboard
  - sse
  - bugfix
  - qa
---
# Phase 8: Dashboard SSE Fix + QA 완료

## 날짜
2026-02-26 ~ 2026-02-27

## 요약
대시보드 SSE 연결 문제로 KPI 카드가 "—"로 표시되는 치명적 버그를 수정하고,
전체 10페이지 브라우저 QA (랄프 모드)를 통과했다.

## 근본 원인
- `server.ts:752`의 `.join('\\n')` → TypeScript 컴파일 시 literal newline이 됨
- 브라우저에서 전체 script 블록 파싱 실패 → 모든 함수 undefined
- `onclick` 핸들러의 single quote 이스케이프 누락도 동시 발생

## 수정 내용
1. `.join('\\n')` → `.join('<br>')` (server.ts:752)
2. `\\'approved\\'` → `&apos;approved&apos;` (server.ts:785-786)
3. 즉시 fetch + SSE 재시도(5회) + 폴링 폴백 추가
4. SSE keepalive ping 메시지 필터링

## QA 결과 (169/169 테스트)
- Dashboard: 6 KPI 모두 정상, Connected
- 10개 페이지 전부 정상 로딩
- Chat: "도움"(한글 명령 목록), "status"(시스템 상태) 정상 응답
- 테마: 다크→라이트→다크 전환 완벽

## 교훈
- TypeScript template literal 안의 `.join('\\n')`은 컴파일 시 의도치 않은 literal newline이 될 수 있다
- 브라우저 inline script의 문자열은 HTML entity(`&apos;`, `<br>`)를 사용해야 안전하다
- SSE 단일 의존은 위험 → 즉시 fetch + SSE + polling 3중 구조가 안정적

## 관련 커밋
- de95127 fix(dashboard): resolve critical JS syntax error + add resilient data loading
- b2c84f5 docs: update README to reflect v0.4.0 final state
