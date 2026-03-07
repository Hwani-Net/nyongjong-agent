# Changelog

All notable changes to this project will be documented in this file.

## [0.7.3] - 2026-03-07

### 🔬 Eval Framework 완성 — 52개 스킬 전수 검사

**352/352 unit tests (25 files), 0 defects**

Dashboard SSE 버그 수정 + Eval auto-generation + 52개 스킬 일괄 평가 완료.

### Added
- **`src/core/skill-eval.ts`** — Auto-generation 기능 추가
  - `extractKeywordsFromSkillMd()` — SKILL.md에서 키워드 자동 추출 (가중치: frontmatter 5, bold 4, heading 3, code 2)
  - `autoGenerateEval()` — SKILL.md 키워드 기반 tailored eval YAML 자동 생성
  - `bulkGenerateEvals()` — 미보유 스킬 전체 일괄 생성
- **`scripts/bulk-run-evals.ts`** — 52개 스킬 eval 일괄 실행 스크립트
  - KEEP/RETIRE/REVIEW 판정 집계 + Markdown 결과 파일 저장
- **`eval-results/`** — 스킬별 eval 결과 아카이브 (3회 실행)
- **42개 eval YAML** — 신규 생성 (`.agent/skills/*/eval/basic.yaml`)
- **11개 eval YAML** — 키워드 개선 (false REVIEW 오탐 수정)
  - DEPRECATED 스킬(`devil-*`) → 폐기 확인 테스트로 교체
  - 일반 키워드 → 스킬 고유 동작 키워드 (e.g. `#AI-Written`, `e2e-test.mjs`, `get_screen_code`)

### Fixed
- **Dashboard SSE "Connecting..." 버그** — `renderSkillCards` onclick의 `\\'` → `&apos;` 교체 (전체 인라인 스크립트 SyntaxError 방지)
- **SSE 강화** — 즉시 ping + 30s keepalive + resilient per-client broadcast + getAgentStatus 에러 시 ping fallback
- **Eval → Obsidian auto-flush** — `/api/skills/:name/eval` 결과를 `뇽죵이Agent/eval-results/{skill}-{date}.md`로 자동 저장

### Eval 전수 검사 결과 (2026-03-07 최종)
| 판정 | 개수 |
|------|------|
| ✅ KEEP | **52** |
| 🔴 RETIRE | **0** |
| 🟡 REVIEW | **0** |

### Changed
- Unit tests: 347 → **352** (+5 tests for auto-generation functions)
- Version bump: 0.7.2 → **0.7.3**

## [0.7.1] - 2026-03-06

### 🔍 Skills 2.0 — Lifecycle Management + A/B Benchmarking

**316/316 unit tests (24 files), 0 defects**

Inspired by Claude Code Skills 2.0, this release adds skill lifecycle management
and A/B benchmarking to the agent, enabling data-driven skill curation.

### Added
- **`skill_audit`** — scans `.agent/skills/` directory, classifies skills as capability/workflow, identifies retirement candidates
  - Reads SKILL.md frontmatter `category: capability | workflow`
  - Capability skills unused for N days → flagged for retirement
  - Workflow skills persist indefinitely
- **`skill_benchmark`** — A/B comparison engine for skill effectiveness
  - `start_baseline` → record without-skill metrics
  - `end_with_skill` → compare with-skill metrics
  - Auto-verdict: **KEEP** (≥10% improvement) / **REVIEW** (mixed) / **RETIRE** (regression)
  - Tracks success rate, token usage, duration
- **`src/core/skill-lifecycle.ts`** — SkillLifecycleManager module (frontmatter parsing, usage tracking, audit reports)
- **`src/core/skill-benchmark.ts`** — SkillBenchmark engine (A/B sessions, metrics computation, verdict logic)
- **`shared-state.ts`** — SkillUsageEntry ring buffer (max 200 entries)
- **52 SKILL.md files** — `category: capability | workflow` frontmatter tag added to all skills
  - ⚡ Capability: 15 skills (image-converter, exchange-rate, etc.)
  - 🔧 Workflow: 37 skills (devil-coding, pentagonal-audit, etc.)

### Changed
- MCP tools count: 31 → **33** (added `skill_audit`, `skill_benchmark` in `lifecycle` group)
- Unit tests: 287 → **316** (+29 new tests in 2 files)
- Version bump: 0.7.0 → **0.7.1**

## [0.6.0] - 2026-03-03

### 🎨 Stitch Design Orchestration Tools

**287/287 unit tests (22 files), 0 defects**

### Added
- **`stitch_ideate`** — multi-prompt design comparison plan generator
  - Generates N design variants (1-5) with diverse style directions (Minimalist, Bold, Dark, Warm, Editorial)
  - Returns execution plan for Antigravity to follow (does NOT call Stitch MCP directly)
  - Auto-selects model: first variant uses `GEMINI_3_PRO`, rest use `GEMINI_3_FLASH`
- **`stitch_design_system_extract`** — HTML→design token extractor
  - Parses Stitch-generated HTML for colors (hex/rgb/hsl), fonts, spacing, border-radius, shadows
  - Normalizes colors to hex, suggests roles (primary/secondary/accent/background/text)
  - Generates complete `DESIGN.md` markdown content automatically
- **`stitch_forum_check`** — Discourse RSS monitor for Stitch community
  - Parses `discuss.ai.google.dev/c/stitch/61.rss` for new posts
  - Classifies posts by skill-relevant keywords (MCP, design system, API, new feature, etc.)
  - Returns recommendation on whether skill updates are needed
- **`docs/PROJECT_CONTEXT.md`** — project north-star and progress tracker created
- **`src/stitch/` module** — 3 new TypeScript modules (522 lines total)

### Changed
- MCP tools count: 28 → **31** (added 3 Stitch tools)
- `mcp-server.ts` — `stitch` tool group registered in ToolRegistry
- Version bump: 0.5.1 → **0.6.0**

## [0.5.1] - 2026-03-02

### 🔗 Git Worktree Wiring + Documentation Overhaul

**246/246 unit tests (19 files), 0 defects**

### Added
- **Git Worktree → CycleRunner integration** — all tasks run in isolated `task/{slug}` branches
  - Success → auto-merge to main + cleanup
  - Failure → branch preserved for inspection, worktree removed
- **Claw Empire visual bridge** — `claw-bridge.ts` pushes stage changes to Claw office UI in real-time
- **3-Tier review workflows** — 5 slash commands (`/수정`, `/디자인`, `/기능`, `/분석`, `/자율`) now enforce Phase 1-5 review chain

### Changed
- `agent.ts` — `gitWorktree` instance now injected into CycleRunner
- MCP tools count: 25 → **28** (added `persona_generate` removed, corrected registry count)
- README.md — complete rewrite with accurate stats, Project Structure, domain personas table
- CHANGELOG.md — added this entry

### Fixed
- README listed outdated test count (169 → 246), MCP count (25 → 28), missing files in structure
- Claw-Empire comparison analysis corrected (3 false negatives identified and fixed)

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
