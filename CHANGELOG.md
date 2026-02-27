# Changelog

All notable changes to this project will be documented in this file.

## [0.5.0] - 2026-02-27

### 🔥 Stage-Gate Workflow + Dashboard Health Checks

**246/246 unit tests, E2E 6 scenarios, 0 defects**

### Added
- **Stage-Gate system** — 7-stage pipeline (Understand → Gate 0 → Gate 1 → Prototype → Validate → Evolve → Report)
  - `business-gate.ts`: Gate 0 business viability with persona reviews (PASS/PIVOT/FAIL)
  - `prd-elicitation.ts`: Gate 1 PRD customer self-healing loop (up to maxRounds)
  - `feedback-router.ts`: feedback classify and rollback routing
  - Auto-skip for bug fixes / refactoring / docs / simple tasks
- **shared-state.ts** — centralized in-memory store (gateHistory, lastGate, lastPRD)
  - Prevents circular imports between `mcp-server.ts` and `dashboard/server.ts`
  - `clearGateHistory()` for E2E test isolation
- **Error ring buffer** (max 200) — `getErrorLog()` / `clearErrorLog()` via logger.ts
- **`/api/errors`** endpoint — GET (ring buffer) + DELETE (clear)
- **`/health` degraded** — real module checks (taskManager + obsidian) → 503 + `issues[]` if critical
- **Dynamic versioning** — version read from `package.json` (no more hardcoded strings)
- **E2E demo v2** — 6 scenarios (Gate FAIL abort, CycleRunner full pipeline, shared-state ring buffer)

### Changed
- `getAgentStatus()` Ollama healthCheck → **30s module-level cache** (12 HTTP req/min → 2)
- SSE broadcast interval `5s → 10s` (persona 30s TTL + ollama 30s cache = 5s redundant)
- `/health` env: removed `LAW_API_KEY` / `APP_REVIEWS_KEY` (no API key needed adapters)
- `.env.example`: documented all key-free adapters
- Test count: 243 → **246** (3 new /health degraded tests)
- **Gate 0 verdict logic** — `hasProductionRisk: FAIL → PIVOT` (사전 승인 권고로 완화)
- **Gate 0 aggregation** — `any FAIL → FAIL` → **과반수(50%+) FAIL** 시에만 FAIL (1명 이상 동의 필요)
- **Dashboard Chat `게이트` 명령** — Dashboard에서 직접 `run_cycle` 실행, 동일 프로세스 Gate History 기록
- **`CycleRunner` 의존성 주입** — `personaEngine` + `personaSimulator` + `onGateDecision` 콜백 완전 연동


## [0.4.0-rc1] - 2026-02-27

### 🏆 Ralph Mode — Full Verification Complete

**138/138 unit tests, 68 MCP E2E scenarios, 0 defects**

### Added
- **Destructive operation detection** — `rm -rf`, `DROP TABLE`, `DELETE FROM`, `삭제`, `초기화` trigger risk warnings
- **Production environment guard** — combined destructive + production keywords escalate to `🚨` alert
- **English keyword support** — all signal patterns now support both Korean and English
  - `implement`, `create`, `deploy`, `architect`, `microservice`, `migrate`, etc.
- **18 new unit tests** covering all Ralph Mode fixes
- **Code coverage setup** with `@vitest/coverage-v8`
- **Grounding adapters** — 6 external API connectors (KOSIS, LawKR, Naver, GoogleTrends, AppReviews, WebScraper)
- **Tool toggle system** — enable/disable individual tools or groups at runtime

### Fixed
- **Empty input guard** — blank/whitespace goals return `simple/low` instead of crashing
- **Documentation priority** — `README 수정` now correctly classified as `documentation` (was `debugging`)
- **Complexity thresholds** — 1 signal = `low` (was `medium`), added i18n and multi-system signals
- **Gap detector dedup** — substring overlap removal, suffix number dedup (800/2800)
- **Leading zero filter** — `000조` no longer matches as valid number
- **Law name detection** — Korean particles (에, 에서, 의) no longer break detection
- **Unit suffix capture** — `약 1조` captures full text (was truncating to `약 1`)
- **Budget hard cap** — `budgetConstrained=true` excludes Opus (costTier 4)
- **Signal expansion** — `대시보드`, `차트`, `구축`, `Slack`, `Discord` now recognized
- **Memory search** — multi-word English AND matching
- **TypeScript strictness** — `catch(err: any)` → `catch(err: unknown)`

### Changed
- Test count: 70 → 138 (13 test files)
- MCP tools: 13 → 15 (added `tool_toggle`, `tool_status`)

## [0.3.0] - 2026-02-26

### Added
- Complete 6-stage AI workflow (Understand → Prototype → Validate → Evolve → Report)
- 10-page real-time dashboard with SSE
- Persona simulation via Ollama (6 personas)
- Grounding engine with gap detection
- Model recommendation system (6 models)

## [0.2.0] - 2026-02-25

### Added
- MCP server with stdio transport
- Obsidian vault integration
- Task manager with queue
- Basic persona loading

## [0.1.0] - 2026-02-24

### Added
- Initial project setup
- TypeScript + vitest configuration
- Core module structure
