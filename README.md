# 🐾 뇽죵이 Agent

> AI-native 자율 에이전트 서버 — MCP 프로토콜, Obsidian 메모리, 멀티 모델, 페르소나 시스템

## Quick Start

```bash
npm install
cp .env.example .env    # 경로 설정

npm start               # MCP 서버 (Antigravity 자동 연결)
npm run dashboard       # 대시보드 → http://localhost:3100
npm run test:mcp        # MCP 연결 검증
npm test                # 유닛 테스트 (51/51)
```

## Architecture

```
┌─────────────┐    MCP stdio    ┌──────────────────┐
│ Antigravity  │◄──────────────►│  MCP Server (13)  │
│ (VS Code)    │                │                    │
└─────────────┘                └────────┬───────────┘
                                        │
                    ┌───────────────────┼───────────────────┐
                    ▼                   ▼                   ▼
             ┌──────────┐      ┌──────────────┐    ┌──────────────┐
             │  Core     │      │  Personas    │    │  Workflow    │
             │ ─────── │      │ ──────────── │    │ ────────── │
             │ Obsidian  │      │ 6종 Loader   │    │ Understand   │
             │ TaskMgr   │      │ Engine       │    │ Prototype    │
             │ ModelSel  │      │ Simulator    │    │ Validate     │
             └──────────┘      │ (Ollama)     │    │ Evolve       │
                               └──────────────┘    │ Report       │
             ┌──────────┐                          │ CycleRunner  │
             │ Grounding│      ┌──────────────┐    └──────────────┘
             │ ─────── │      │  Execution   │
             │ GapDetect│      │ ──────────── │    ┌──────────────┐
             │ API Conn │      │ Shell        │    │  Dashboard   │
             │ Engine   │      │ Git Worktree │    │ ──────────── │
             └──────────┘      │ Test Runner  │    │ 10-page UI   │
                               └──────────────┘    │ SSE realtime │
                                                   │ REST API     │
                                                   └──────────────┘
```

## 📊 Dashboard (10 Pages)

실시간 에이전트 모니터링 대시보드 — `http://localhost:3100`

| # | Page | Description |
|---|------|-------------|
| 1 | 📊 **Dashboard** | 6 KPI 카드 + Task Queue 실시간 |
| 2 | 📋 **Kanban** | 6단계 AI 순환 워크플로우 보드 |
| 3 | 🔧 **Tool Registry** | 8그룹 15도구 상태 모니터링 |
| 4 | 🎭 **Personas** | 6개 페르소나 카테고리별 그리드 |
| 5 | 💬 **Chat** | 대표님 ↔ 에이전트 대화 인터페이스 |
| 6 | 🎮 **Office** | 에이전트 오피스 뷰 (역할별 데스크) |
| 7 | 🖥️ **Terminal** | Build/Test/Lint 원클릭 실행 |
| 8 | 📨 **Decision Inbox** | 승인/반려 판단 게이트 |
| 9 | ⚙️ **Settings** | 모델/Ollama/API키/Vault 설정 |
| 10 | 📝 **Event Log** | SSE 실시간 이벤트 기록 |

### Dashboard API

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/` | Dashboard HTML |
| `GET` | `/events` | SSE 실시간 스트림 |
| `GET` | `/api/status` | JSON 상태 응답 |
| `POST` | `/api/action/build` | npm run build 실행 |
| `POST` | `/api/action/test` | npm test 실행 |
| `POST` | `/api/action/lint` | npx tsc --noEmit 실행 |

### Features

- 🌗 라이트/다크 테마 토글
- 📡 SSE 5초 주기 실시간 업데이트
- 🎨 글래시 디자인 + CSS 애니메이션
- 📱 반응형 쉘 레이아웃 (260px 사이드바)

## MCP Tools (13)

| Tool | Description |
|------|-------------|
| `agent_status` | 서버 상태 확인 |
| `task_list` | 태스크 목록 조회 |
| `task_create` | 태스크 생성 |
| `recommend_model` | 작업에 최적 모델 추천 |
| `list_models` | 전체 모델 목록 |
| `memory_search` | Obsidian 메모리 검색 |
| `memory_write` | Obsidian 메모리 기록 |
| `persona_list` | 페르소나 목록 |
| `persona_consult` | 페르소나 자문 (Ollama) |
| `analyze_goal` | 목표 분석 → 유형/복잡도/요구사항 |
| `ollama_health` | Ollama 상태 + 모델 목록 |
| `ground_check` | 팩트 검증 (통계/법률/가격) |
| `run_cycle` | AI 순환 워크플로우 실행 |

## Personas (6)

| Name | Category | Activated At |
|------|----------|-------------|
| 내돈내산 대표 | business | understand, report |
| 사용자 대변인 | customer | understand, prototype, validate |
| 시니어 엔지니어 | engineer | prototype, validate, evolve |
| 그로스 해커 | business | understand, report |
| 보안 감사관 | engineer | validate, evolve |
| 기술 철학자 | philosopher | understand, evolve |

## AI Workflow (6-Stage Cycle)

```
Understand → Prototype → Validate ↔ Evolve → Report
     ↑                        ↓
     └────── Self-Healing ─────┘
```

## Project Structure

```
src/
├── index.ts              # MCP entry point
├── mcp-server.ts         # 13 MCP tools
├── agent.ts              # Module orchestrator
├── dashboard-main.ts     # Dashboard entry point
├── core/
│   ├── config.ts         # Zod-validated config
│   ├── obsidian-store.ts # Vault filesystem adapter
│   ├── model-selector.ts # Multi-model recommender
│   └── task-manager.ts   # Task queue
├── personas/
│   ├── persona-loader.ts # Obsidian CRUD
│   ├── persona-engine.ts # Stage-based selection
│   └── persona-simulator.ts # Ollama simulation
├── workflow/
│   ├── understand.ts     # Goal analysis
│   ├── prototype.ts      # Plan generation
│   ├── validate.ts       # Build/test/lint
│   ├── evolve.ts         # Failure analysis
│   ├── report.ts         # CEO report
│   └── cycle-runner.ts   # Orchestrator
├── grounding/
│   ├── gap-detector.ts   # Fact claim detection
│   ├── api-connector.ts  # External API routing
│   └── grounding-engine.ts # Verification pipeline
├── execution/
│   ├── shell-runner.ts   # Command execution
│   ├── git-worktree.ts   # Git isolation
│   └── test-runner.ts    # vitest + tsc
├── dashboard/
│   └── server.ts         # HTTP + SSE dashboard (10-page UI)
└── utils/
    └── logger.ts         # Structured logging

data/personas/            # Default persona definitions (6)
tests/                    # 51 unit tests
scripts/test-mcp.ts       # MCP connection verifier
```

## Requirements

- Node.js ≥ 22
- Ollama (optional, for persona simulation)

## License

Private — 내돈내산 프로젝트
