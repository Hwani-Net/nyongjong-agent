---
phase: phase-4-done
status: in-progress
type: project
workflow_state: phase5-pending
---
# Claw-Empire 모듈화 프로젝트

## 상태
- **Phase 1~4 완료** (2026-03-01)
- Phase 5 대기

## 핵심 결정
- 뇽죵이 에이전트와 **완전 분리** — 독립 프로젝트
- Firebase 예외: Express + SQLite 유지 (로컬-퍼스트 필수)

## 완료 내역
### Phase 1: 서버 코어 4모듈
- `modules/db/index.ts` — SQLite, 스키마, 시드, 쿼리 헬퍼
- `modules/security/index.ts` — 인증, 멱등성, 감사
- `modules/gateway/index.ts` — WebSocket, 알림
- `modules/runtime/index.ts` — RuntimeContext 타입, 지연 프록시

### Phase 2: 라우트 모듈화
- `modules/routes/core.ts` — CRUD 엔드포인트
- `modules/routes/collab.ts` — 채팅, 수신함, 공지
- `modules/routes/ops.ts` — CLI 상태, OAuth, 업데이트
- `modules/routes.ts` — 라우트 등록 오케스트레이터

### Phase 3: 워크플로우 모듈화
- `modules/workflow/core.ts` — 태스크 상태, 로깅, 브로드캐스트
- `modules/workflow/agents.ts` — CLI 스폰, 에이전트 세션
- `modules/workflow/orchestration.ts` — 회의, 리뷰, 워크트리
- `modules/workflow.ts` — 워크플로우 초기화 오케스트레이터

### Phase 4: 프론트엔드 분해 (2026-03-01)
- `App.tsx` 2,374줄 → 302줄 (87% 감소)
- Zustand 스토어 6개 생성 (agent, task, message, settings, office, UI)
- `useRealtimeSync.ts` / `useAppActions.ts` 리팩터 (setter params → store.getState())
- 검증: tsc 0 errors, vitest 32/32, vite build 성공
- `AGENTS.md` 새 모듈 구조에 맞게 재작성 (~240줄)

## 미완료
### Phase 5: PixiJS Office View 정리
- `src/components/office-view/` 19개 파일 → `useOfficeStore` 직접 구독
- Zustand 스토어 단위 테스트 추가
