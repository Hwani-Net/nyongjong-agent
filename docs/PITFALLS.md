# 뇽죵이Agent — PITFALLS.md

> 이 프로젝트에서 마주친 함정, 근본 원인 분석, 해결법, 재발 방지 규칙 모음.
> **새 함정 발견 즉시 추가.** 과거 실수를 반복하지 않기 위한 "흉터 조직".

---

## [P-001] Windows bash에서 파이프(|) 사용 시 hang

- **발견**: 2026-03-04 (세션 초기)
- **증상**: `grep "패턴" file | head -20` 형태 명령이 무한 대기
- **원인**: Windows bash(Git Bash)에서 파이프 조합 시 특정 명령이 stdin을 닫지 않아 hang 발생
- **해결**: 파이프 없이 `grep_search` 도구를 직접 사용하거나, 단일 명령으로 분리
- **재발 방지**: `run_command`에서는 파이프(`|`) 와 셸 변수(`$VAR`) **절대 금지**

---

## [P-002] ObsidianStore 볼트 경로 하드코딩 → 파일 불일치

- **발견**: 2026-03-04 (v0.5.x 시대)
- **증상**: 파일시스템으로 직접 쓴 메모가 Obsidian 볼트에 반영되지 않음
- **원인**: 코드에 하드코딩된 경로와 실제 Obsidian 볼트 경로 불일치
- **해결**: ObsidianStore를 Obsidian Local REST API 기반으로 전면 재작성 (ADR-004)
- **재발 방지**: 볼트 경로 하드코딩 금지. 반드시 `OBSIDIAN_VAULT_PATH` 환경변수 또는 REST API 사용

---

## [P-003] npm publish 후 `node_modules` 포함 문제

- **발견**: 2026-03-04
- **증상**: npm 패키지 크기가 비정상적으로 커짐
- **원인**: `.npmignore` 미설정 시 `node_modules`가 포함될 수 있음
- **해결**: `.npmignore`에 `node_modules/`, `tests/`, `coverage/`, `*.test.ts` 명시
- **재발 방지**: `npm publish --dry-run`으로 포함 파일 목록 사전 확인

---

## [P-004] vitest `describe` 중첩에서 `beforeEach` 스코프 오해

- **발견**: 2026-03-06 (Skills 2.0 테스트 작성 중)
- **증상**: 중첩 `describe` 안의 테스트가 상위 `beforeEach`를 상속받지 못함
- **원인**: vitest에서 `beforeEach`는 해당 `describe` 블록과 그 자식에만 적용. 형제 블록은 적용 안됨
- **해결**: 각 `describe` 블록에 독립적인 `beforeEach` 작성, 또는 공통 setup을 최상위 `describe`로 올림
- **재발 방지**: 테스트 격리 원칙 — 각 `describe`는 자체 setup을 가질 것

---

## [P-005] skill_audit 스캔 시 `.agent/skills` 경로 못 찾음 (잠재적)

- **발견**: 2026-03-06 (예상 이슈, 아직 실제 발생 미확인)
- **증상**: `skill_audit` 도구 호출 시 빈 결과 또는 에러
- **원인 예상**: `AGENT_ROOT` 환경변수가 설정되지 않았거나, CWD가 프로젝트 루트가 아닌 경우
- **해결**: `skill-lifecycle.ts`의 `scanSkills()`는 `process.env.AGENT_ROOT` → `process.cwd()` 순으로 fallback
- **재발 방지**: `.env`에 `AGENT_ROOT=E:\Agent\뇽죵이Agent` 명시

---

## [P-006] MCP 서버 100개 도구 한계

- **발견**: 2026-03-04
- **증상**: MCP 도구가 100개를 초과하면 Antigravity가 일부 도구를 인식하지 못함
- **원인**: MCP 프로토콜 스펙 또는 Antigravity 내부 limit
- **해결**: `tool_toggle`로 불필요한 도구 비활성화. 코어(obsidian/StitchMCP/tavily) 항상 ON
- **재발 방지**: 신규 도구 추가 전 현재 활성 도구 수 확인 (`tool_status` 호출)

---

## [P-007] SkillBenchmark 메트릭 in-memory → 서버 재시작 시 초기화

- **발견**: 2026-03-06 (설계 결정)
- **증상**: 서버 재시작 후 이전 A/B 벤치마크 결과가 사라짐
- **원인**: `shared-state.ts` 링 버퍼는 in-memory. 영속성 계층 없음
- **해결 예정**: Obsidian flush 구현 (TODO에 등록됨)
- **재발 방지**: 중요한 벤치마크 결과는 세션 중에 직접 `memory_write`로 저장

---

*마지막 업데이트: 2026-03-09 | v0.7.3*

---

## [P-008] /자율 커맨드 실행 중 run_command 터미널 멈춤

- **발견**: 2026-03-09 (야간 세션, MCP 순수 자율 테스트 중)
- **증상**: `/자율` 워크플로우 중 `run_command`로 `npx tsc --noEmit`, `npx tsx scripts/...` 실행 시 터미널 hang → 사용자가 수동 취소해야만 해제됨
- **원인 추정**: 복수 Antigravity 터미널 컨텍스트 충돌, 또는 `/자율`의 긴 연속 컨텍스트에서 WaitMsBeforeAsync 부족
- **해결**: `mcp_nongjong-agent_shell_run` MCP 도구로 대체 (timeoutMs: 30000 명시)
- **재발 방지**: `/자율` 워크플로우 내 빌드/테스트/실행은 `shell_run` 우선 사용. `run_command`는 배포 등 대화형 단계에만.
