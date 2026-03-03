# 🐾 뇽죵이 Agent v0.5.1

> AI-native 자율 에이전트 서버 — MCP 프로토콜, Obsidian 메모리, 멀티 모델, 페르소나 시스템

![Tests](https://img.shields.io/badge/tests-246%2F246-brightgreen) ![Coverage](https://img.shields.io/badge/coverage-core_95%25+-blue) ![v0.5.1](https://img.shields.io/badge/version-0.5.1-green)

## Quick Start

```bash
npm install
cp .env.example .env    # 경로 설정

npm start               # MCP 서버 (Antigravity 자동 연결)
npm run dashboard       # 대시보드 → http://localhost:3100
npm run test:mcp        # MCP 연결 검증
npm test                # 유닛 테스트 (246/246, 19 files)
npm run test:coverage   # 커버리지 리포트
```

## Architecture

```
┌─────────────┐    MCP stdio    ┌──────────────────┐
│ Antigravity  │◄──────────────►│  MCP Server (28)  │
│ (VS Code)    │                │                    │
└─────────────┘                └────────┬───────────┘
                                        │
                    ┌───────────────────┼───────────────────┐
                    ▼                   ▼                   ▼
             ┌──────────┐      ┌──────────────┐    ┌──────────────┐
             │  Core     │      │  Personas    │    │  Workflow    │
             │ ─────── │      │ ──────────── │    │ ────────── │
             │ Obsidian  │      │ 6종 Loader   │    │ Understand   │
             │ TaskMgr   │      │ Engine       │    │ Gate 0 / 1   │
             │ ModelSel  │      │ Simulator    │    │ Prototype    │
             │ ToolReg   │      │ Generator    │    │ Validate     │
             └──────────┘      │ Templates    │    │ Evolve       │
                               │ (8 domains)  │    │ Report       │
             ┌──────────┐      │ (Ollama)     │    │ CycleRunner  │
             │ Grounding│      └──────────────┘    │ Claw Bridge  │
             │ ─────── │                          └──────────────┘
             │ GapDetect│      ┌──────────────┐
             │ 6 Adapter│      │  Execution   │    ┌──────────────┐
             │ Engine   │      │ ──────────── │    │  Dashboard   │
             │ Market   │      │ Shell        │    │ ──────────── │
             └──────────┘      │ Git Worktree │    │ 10-page UI   │
                               │ Test Runner  │    │ SSE realtime │
                               │ Self-Heal    │    │ REST API     │
                               │ CI/CD Gate   │    └──────────────┘
                               └──────────────┘
```

## 📊 Dashboard (10 Pages)

실시간 에이전트 모니터링 대시보드 — `http://localhost:3100`

| # | Page | Description |
|---|------|-------------|
| 1 | 📊 **Dashboard** | 6 KPI 카드 + Task Queue 실시간 |
| 2 | 📋 **Kanban** | 6단계 AI 순환 워크플로우 보드 |
| 3 | 🔧 **Tool Registry** | 8그룹 28도구 상태 모니터링 |
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

- 🌗 라이트/다크 테마 토글 (QA 검증 완료)
- 📡 SSE 실시간 + 자동 재연결 (5회) + 폴링 폴백
- 🔄 즉시 fetch 초기 데이터 로딩 (SSE 독립)
- 💬 Chat 한글 입력/응답 (도움, 상태, 분석 등)
- 🎨 글래시 디자인 + CSS 애니메이션
- 📱 반응형 쉘 레이아웃 (260px 사이드바)

## MCP Tools (28)

### Core
| Tool | Description |
|------|-------------|
| `agent_status` | 서버 상태 확인 |
| `tool_toggle` | 도구 활성/비활성 토글 |
| `tool_status` | 도구 상태 조회 |

### Task
| Tool | Description |
|------|-------------|
| `task_list` | 태스크 목록 조회 |
| `task_create` | 태스크 생성 |

### Model
| Tool | Description |
|------|-------------|
| `recommend_model` | 작업에 최적 모델 추천 |
| `list_models` | 전체 모델 목록 |

### Memory
| Tool | Description |
|------|-------------|
| `memory_search` | Obsidian 메모리 검색 |
| `memory_write` | Obsidian 메모리 기록 |

### Persona
| Tool | Description |
|------|-------------|
| `persona_list` | 페르소나 목록 |
| `persona_consult` | 페르소나 자문 (Ollama 멀티모델) |
| `persona_create` | 새 페르소나 생성 |
| `persona_update` | 기존 페르소나 수정 |
| `persona_delete` | 페르소나 삭제 |

### Workflow
| Tool | Description |
|------|-------------|
| `analyze_goal` | 목표 분석 → 유형/복잡도/요구사항 |
| `run_cycle` | AI 순환 워크플로우 실행 (Git Worktree 격리 포함) |
| `business_gate` | Gate 0: 사업성 검토 (페르소나 심사) |
| `prd_elicit` | Gate 1: PRD 자가치유 루프 |
| `feedback_classify` | 피드백 분류 → 최소 롤백 지점 결정 |

### Advisory
| Tool | Description |
|------|-------------|
| `ollama_health` | Ollama 상태 + 모델 목록 |

### Grounding
| Tool | Description |
|------|-------------|
| `ground_check` | 팩트 검증 (KOSIS/네이버/법령/Google Trends/App Reviews/WebScraper) |
| `market_research` | 경쟁사 및 시장 조사 (Play Store 등) |

### Critic
| Tool | Description |
|------|-------------|
| `critic_check` | Think/Critique/Score 규칙 준수 자가검증 |

### Failsafe
| Tool | Description |
|------|-------------|
| `self_heal` | 빌드/테스트 자동 재시도 (최대 3회) |
| `cicd_gate` | 커밋 전 품질 게이트 (lint + build + test) |
| `feedback_collect` | 만족도 피드백 수집 및 Obsidian 저장 |

### Execution
| Tool | Description |
|------|-------------|
| `shell_run` | 셸 명령 직접 실행 (command, cwd, timeoutMs) |

## Personas

### 기본 페르소나 (6명)

| Name | Category | Activated At |
|------|----------|-------------|
| 내돈내산 대표 | business | understand, report |
| 사용자 대변인 | customer | understand, prototype, validate |
| 시니어 엔지니어 | engineer | prototype, validate, evolve |
| 그로스 해커 | business | understand, report |
| 보안 감사관 | engineer | validate, evolve |
| 기술 철학자 | philosopher | understand, evolve |

### 도메인 특화 페르소나 (8개 도메인, 18명)

`persona-templates.ts`에 내장. 목표 텍스트 키워드로 자동 배정.

| Domain | Personas | Example |
|--------|----------|---------|
| fintech | 규제전문가, 코인단타족, 블랙컨슈머 | "약관 3조 2항 보니까..." |
| healthcare | 의료법자문, 70대 할머니, 수간호사 | "이 '로그인'이 무슨 말이야?" |
| AI/ML | 데이터사이언티스트, 할루시네이션 저격수 | "가드레일 다 뚫렸습니다" |
| ecommerce | CVR전문가, 충동구매족 | "결제 3초 동안 충동이 식었어요" |
| devops | DevOps엔지니어, 편집증 SRE | "캐스케이딩 페일리어 나는 구조" |
| design | UX디자이너, 1px 강박증 | "여백 16px인데 저기는 14px" |
| blockchain | Web3 PO, 화이트햇 해커 | "Reentrancy 취약점" |
| education | EdTech전문가, 집중력 3초 학생 | "이거 하면 나한테 뭐 주는데요?" |

## AI Workflow (7-Stage Cycle)

```
Gate 0 (사업성) → Gate 1 (PRD) → Prototype → Validate ↔ Evolve → Report
                                      │                      │
                                      └── Git Worktree ───────┘
                                      (격리 브랜치, 성공 시 병합)
```

## Claw Empire Integration

`claw-bridge.ts` — 뇽죵이Agent가 Claw Empire 오피스 UI에 실시간 stage 변경을 push.
워크플로우 단계별로 해당 부서 에이전트의 working/idle 상태를 WebSocket으로 전송.

## Project Structure

```
src/
├── index.ts              # MCP entry point
├── mcp-server.ts         # 28 MCP tools
├── agent.ts              # Module orchestrator
├── dashboard-main.ts     # Dashboard entry point
├── core/
│   ├── config.ts         # Zod-validated config
│   ├── obsidian-store.ts # Vault filesystem adapter
│   ├── model-selector.ts # Multi-model recommender
│   ├── task-manager.ts   # Task queue
│   ├── tool-registry.ts  # Tool toggle registry
│   └── shared-state.ts   # Gate history, PRD state
├── personas/
│   ├── persona-loader.ts    # Obsidian CRUD
│   ├── persona-engine.ts    # Stage-based selection
│   ├── persona-simulator.ts # Ollama simulation
│   ├── persona-generator.ts # Dynamic persona creation
│   └── persona-templates.ts # 8-domain preset personas (18)
├── workflow/
│   ├── understand.ts        # Goal analysis
│   ├── business-gate.ts     # Gate 0: business viability
│   ├── prd-elicitation.ts   # Gate 1: PRD self-healing loop
│   ├── prototype.ts         # Plan generation
│   ├── validate.ts          # Build/test/lint
│   ├── evolve.ts            # Failure analysis
│   ├── report.ts            # CEO report
│   ├── cycle-runner.ts      # Orchestrator (Git Worktree integrated)
│   ├── claw-bridge.ts       # Claw Empire visual bridge
│   ├── feedback-router.ts   # Feedback classify & rollback
│   └── feedback-collector.ts # Satisfaction feedback → Obsidian
├── grounding/
│   ├── gap-detector.ts      # Fact claim detection
│   ├── grounding-engine.ts  # 6-adapter verification pipeline
│   ├── fact-injector.ts     # Inject verified facts
│   ├── market-research.ts   # Competitor benchmark
│   └── adapters/            # KOSIS, Naver, LawKR, GoogleTrends, AppReviews, WebScraper
├── execution/
│   ├── shell-runner.ts   # Command execution (execa)
│   ├── git-worktree.ts   # Git branch isolation
│   ├── test-runner.ts    # vitest + tsc
│   ├── self-heal.ts      # Auto-retry with backoff
│   └── cicd-gate.ts      # Pre-commit quality gate
├── dashboard/
│   └── server.ts         # HTTP + SSE dashboard (10-page UI)
└── utils/
    └── logger.ts         # Structured logging

data/personas/            # Default persona definitions (6)
tests/                    # 246 unit tests (19 files)
scripts/test-mcp.ts       # MCP connection verifier
```

## Requirements

- Node.js ≥ 22
- Ollama (optional, for persona simulation)

## License

Private — 내돈내산 프로젝트
