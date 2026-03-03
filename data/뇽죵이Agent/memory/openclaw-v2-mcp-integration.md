---
phase: mcp-integration
project: openclaw-v2
status: e2e-verified
type: project-checkpoint
---
# OpenClaw v2 — MCP Antigravity 통합 완료

## 날짜: 2026-03-01
## 상태: E2E 검증 완료

## 완료된 작업
- `server/mcp-entry.ts` — stdio 전용 MCP 엔트리포인트 생성
- `server/main.ts` — 12/12 부팅 시퀀스에 MCP init 추가
- `AgentSpawner.spawn()` → 3-tier 우선순위: CLI → MCP delegation → simulation
- `agent_complete` MCP 도구 추가 (총 17개 도구)
- 워크스페이스 MCP 설정 등록 (`claw-empire/.gemini/settings.json`)
- pencil MCP 삭제 (settings.json + mcp_config.json)
- 전체 테스트 154개 통과
- E2E: 9/17 도구 실행 검증 완료

## 핵심 교훈
1. **MCP 서버 설정 위치**: 워크스페이스 `.gemini/settings.json`이 필요 (글로벌만으로는 인식 안됨)
2. **tsx 경로 문제**: `node --import tsx/esm`은 Antigravity 디렉토리에서 실해되므로 tsx 못 찾음 → `tsx.cmd` 절대경로 사용
3. **HTTP↔MCP 분리**: main.ts와 mcp-entry.ts는 별도 프로세스. SQLite 공유하지만 EventBus는 공유하지 않음

## 워크플로우 상태
- workflow_state: `구현` (대시보드↔MCP 브릿지)
- 남은 작업: WebSocket URL 프록시 수정 + 대시보드 지시 → MCP 태스크 수신 파이프라인
