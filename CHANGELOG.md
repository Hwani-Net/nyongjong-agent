# Changelog

All notable changes to this project will be documented in this file.

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
