# 뇽죵이Agent — PROJECT_CONTEXT.md

> **북극성**: AI 코딩 파트너를 위한 자율 에이전트 MCP 서버.
> Antigravity가 분석→설계→구현→검증→보고를 자동으로 수행하도록 지원하는 뇽죵이(NongjongAgent).

## 📦 프로젝트 정보

| 항목 | 값 |
|------|-----|
| **이름** | `nyongjong-agent` |
| **버전** | `0.7.7` |
| **경로** | `E:\Agent\뇽죵이Agent` |
| **런타임** | Node.js ≥22, TypeScript, ESM |
| **테스트** | vitest — **445/445 pass** (30 파일) |
| **MCP 도구** | **26개 활성** (core 3 + toggle 12 + lifecycle 2 + 11 disabled → Skills) |
| **프로토콜** | Model Context Protocol (stdio) |
| **GitHub** | https://github.com/Hwani-Net/nyongjong-agent |
| **npm** | https://www.npmjs.com/package/nyongjong-agent |

## 🏗️ 아키텍처 개요

```
src/
├── core/          # Config, ObsidianStore, TaskManager, ToolRegistry, SharedState
│                  # SkillLifecycleManager (v0.7.1), SkillBenchmark (v0.7.1)
│                  # **LLMRouter (v0.7.4)** — 외부 LLM 바인딩 레이어
├── personas/      # PersonaLoader, PersonaEngine, PersonaSimulator, Templates, Generator
├── workflow/      # Understand, BusinessGate, PRDElicitation, FeedbackRouter, CycleRunner
├── grounding/     # GroundingEngine, Adapters (KOSIS, Law, Naver, Trends, AppReviews, Web)
├── execution/     # ShellRunner, SelfHeal, CompletionLoop, CICDGate
├── stitch/        # StitchIdeate, DesignSystemExtract, ForumCheck, **DesignAudit (v0.7.5)**
├── advisory/      # CriticCheck (AgentPRM 패턴)
├── dashboard/     # Real-time SSE dashboard
├── utils/         # Logger (ring buffer)
├── mcp-server.ts  # **35개 도구** 등록 + runtime toggle
├── agent.ts       # Agent orchestration
└── index.ts       # Entry point
```

## 📊 현재 진행 상태

### Phase: v0.7.3 릴리스 완료 ✅ (2026-03-07)

- [x] Phase 0.1: 초기 설정 (MCP + vitest)
- [x] Phase 0.2: Obsidian + Task Manager
- [x] Phase 0.3: 워크플로우 6단계 + 대시보드 + 페르소나
- [x] Phase 0.4: Ralph Mode + Grounding + Tool Toggle
- [x] Phase 0.5: Stage-Gate + Dashboard Health + Git Worktree
- [x] Phase 0.6: **Stitch 도구 3종** (Ideate, DesignSystem, Forum)
- [x] 유닛 테스트 287/287 pass → README.md v0.6.0 업데이트
- [x] npm publish 완료 (**nyongjong-agent@0.6.0**)
- [x] ObsidianStore REST API 전환 완료
- [x] `docs/` 레거시 5파일 아카이브 → `docs/archive/`

### Phase: ADR-014 QA 파이프라인 개선 ✅ (2026-03-11 완료)

- [x] CycleRunner Stage 5.5: Team Lead 코드 리뷰 (피드백 기반 Evolve→재검증 루프)
- [x] CycleRunner Stage 5.7: 브라우저 시각 검증 (UI 작업 자동 감지)
- [x] Evolve: `reviewFeedback` 필드 추가 (팀장 피드백→수정제안 통합)
- [x] 전역 재시도 기본값 3→10 (selfHeal, completionLoop, CycleRunner, Team Lead)
- [x] agent.ts: LLMRouter 인스턴스 CycleRunner에 주입
- [x] GEMINI.md: `뇽죵아 수정해/자율 진행` 매핑에 `external_review(team_lead)` 추가
- [x] `/수정` 워크플로우: 팀장 리뷰 HARD GATE + BLOCK→피드백 수정 루프
- [x] `/디자인` 워크플로우: `stitch_design_audit` + 팀장 리뷰 재시도 10회
- [x] 테스트: 439/439 pass (ADR-014 4개 테스트 추가)
- [x] v0.7.7 릴리스 + GitHub push

### Phase: v0.7.X 릴리스 준비 ✅ (2026-03-09 완료)

- [x] 워크플로우 분석.md, 자율.md에 `persona_generate` 선행 조건 수동 매핑 추가 (GAP 1)
- [x] 워크플로우 수정.md에 `mcp_nongjong-agent_feedback_classify` 피드백 분류 추가 (GAP 3)
- [x] **`stitch_design_audit`** 도구 개발 (ADR-008 준수: Approximation 감지, DOM / Effect 유지 확인) (GAP 2)
  - [x] `auditDesignCompliance` 모듈 및 16개 테스트 케이스 구현 완료
  - [x] `tests/stitch/stitch-design-audit.test.ts` (100% 통과)
  - [x] `mcp-server.ts` 등록 (도구 34개)
- [x] **NotebookLM(NLM) Fact-Only 지식 저장소 통합**
  - [x] 조사, 분석, 자율, 기획 워크플로우 전반에 걸쳐 NLM을 기본 RAG 파이프라인으로 강제
  - [x] 할루시네이션 방지: AI가 생성한 요약 대신 원본 URL과 텍스트만을 Source로 추가하고 질의
- [x] npm 패키지 배포 (`v0.7.4` 게시 완료 ✅)

### Phase: v0.7.0 → v0.7.3 완료 ✅ (2026-03-06 ~ 2026-03-07)

- [x] Phase 0.7: **Skills 2.0** — SkillLifecycleManager + SkillBenchmark A/B 엔진
  - [x] `src/core/skill-lifecycle.ts` [NEW] — capability/workflow 이원화, 사용량 추적, 은퇴 후보 식별
  - [x] `src/core/skill-benchmark.ts` [NEW] — A/B 성공률/토큰/속도 비교 → KEEP/REVIEW/RETIRE
  - [x] `src/core/shared-state.ts` [MODIFIED] — SkillUsageEntry 링 버퍼 (max 200)
  - [x] `src/mcp-server.ts` [MODIFIED] — `skill_audit`, `skill_benchmark` 도구 2개 등록
  - [x] `tests/core/skill-lifecycle.test.ts` [NEW] — 14 tests
  - [x] `tests/core/skill-benchmark.test.ts` [NEW] — 15 tests
  - [x] 52개 `.agent/skills/*/SKILL.md` — `category` 태그 추가 (capability 15개 / workflow 37개)
  - [x] tsc --noEmit 에러 0개, vitest 316/316 pass
  - [x] CHANGELOG.md v0.7.1 업데이트
  - [x] Git push (커밋 `43b708e`) + npm publish 완료

### Phase: MCP→Skills Phase 0+1 완료 ✅ (2026-03-12)

- [x] Phase 0: 스킬 7개 신규 생성 + 3개 확장 (MCP 코드 변경 0)
- [x] Phase 1: `tool_toggle`로 11개 MCP 도구 비활성화
  - disabled: `analyze_goal`, `business_gate`, `prd_elicit`, `feedback_classify`, `run_cycle`, `critic_check`, `recommend_model`, `list_models`, `stitch_ideate`, `stitch_design_system_extract`, `stitch_design_audit`
  - 대체 Skills: `goal-analyzer`, `business-viability`, `prd-template`(확장), `feedback-router`, `cycle-orchestrator`, `pentagonal-audit`(확장), `model-selector`, `stitch-pencil-pipeline`(확장), `design-token-extractor`, `design-audit`
  - 롤백: `tool_toggle(group="workflow", enabled=true)` → 10초 복원
- [ ] Phase 2: MCP 코드 제거 (Phase 1 성공 2주 후)

### Phase: Agent Manager 통합 + 감사 시스템 ✅ (2026-03-12)

- [x] Agent Manager 통합 분석 보고서 작성 (6개 전략, GEMINI.md 분리 안 하기로 결정)
- [x] `.agent/references/agent-manager-templates.md` — 병렬 에이전트 프롬프트 템플릿 3시나리오
- [x] `.agent/references/tool-toggle-profiles.md` — 역할별 MCP tool_toggle 프로파일
- [x] `/저장` 워크플로우에 Agent Manager 릴레이 패턴 추가
- [x] Skills description 보강 (8개 frontmatter 트리거 키워드 추가)
- [x] `/감사` 워크플로우 2-모드 체계 구축
  - `.agent/evals/agent/` — 에이전트 감사 YAML 7그룹 22개
  - `.agent/evals/project/` — 프로젝트 감사 YAML 8개 체크포인트
- [x] 에이전트 감사 실행: **22/22 S등급**
- [x] 프로젝트 감사 실행: **3/3 S등급** (pentagonal 93/100, 445/445 tests)

### Phase: drift-guard 통합 분석 + 세션 핸드오프 개선 ✅ (2026-03-12)

- [x] drift-guard CLI 뇽죵이Agent 통합 분석: MCP 코드 변경 0건, 워크플로우/스킬/CI 수준 통합
- [x] drift-guard 개선 로드맵 7가지 (P-1~P-7) + MCP 의존도 저감 전략
- [x] `/저장` Enhanced Handoff: 5줄 세션 요약 + ADR 체인 + 핵심 PITFALL + Phase (ADR-015)
- [x] `/이어서` Smart Recovery 3계층: L1(항상 읽기) + L2(Smart) + Full Legacy fallback
- [x] Council 5인 검토 (4/5 동의) → PITFALLS 항상 읽기 확정
- [x] 팀장 검수 PASS → ADR 파싱 fallback + Obsidian 조건 명확화 반영
- [x] `.agent/DECISIONS.md` ADR-015 추가
- [x] 빌드 0 에러 + 테스트 445/445 통과

### TODO (미래)
- [ ] npm Token 갱신 필요일: **2026-06-02** (Granular Token 90일 만료)
- [ ] Dashboard Stitch 페이지에 라이브 데이터 연동 (실시간 포럼 모니터링)
- [ ] GEMINI.md 다이어트 (572줄 → 축소)
- [ ] 비즈니스 도메인 페르소나 추가 (프랜차이즈/부동산/SaaS/법률)
- [x] npm publish v0.7.3 ✅
- [x] npm publish v0.7.4 ✅
- [x] npm publish v0.7.5 ✅
- [x] v0.7.6 감사 관찰 사항 #1~#3 수정 (feedback confidence, complexity signals, uptime warning)
- [x] v0.7.7 ADR-014 QA 파이프라인 (Team Lead + Visual Check + 피드백 기반 재시도)
- [x] SkillBenchmark 메트릭 → Obsidian flush 구현 ✅ (커밋 `3d8813c`)
      - `POST /api/skills/flush-all` 엔드포인트 추가
      - Skills 페이지 💾 Obsidian 저장 버튼 UI 추가
      - vitest 328/328 pass
- [x] Dashboard Tool Registry 페이지에 Skill 분류(capability/workflow) 표시 ✅ (커밋 `6469c88`)
      - `lifecycle` 그룹 하단 인라인 badge, 상단 요약 KPI
- [x] MCP → 스킬 마이그레이션 (2026-03-04): `perplexity-ask` → disabled (tavily 대체), `agentation` → disabled (온디맨드), `brave-search` → 설정 제거
- [x] **Eval Framework 완성** ✅ (2026-03-07, 커밋 `2f2806d`, `195bd17`)
      - 52개 스킬 eval YAML 생성 + bulk runner 스크립트
      - KEEP:52 / RETIRE:0 / REVIEW:0 달성
      - Dashboard SSE "Connecting..." 버그 근본 수정 (onclick `\\'` → `&apos;`)
      - obsidian-writing eval 오탐 수정 (workflow 스킬 → 은퇴 대상 아님 확인)

### 96개 자산 재분류 실행 현황 (ADR-007, 2026-03-09)
- [x] **삭제 9건** ✅ — devil-* 3개, secret-filter, 단일명령어 5개 완료
- [x] **디자인 스킬 통합** ✅ — 구 스킬 5개 삭제, `stitch-pencil-pipeline` 마스터 파이프라인 유지
- [x] **Git pre-commit hook** ✅ — tsc 타입체크 + 시크릿 패턴 필터 (ADR-003 이행)
- [x] **GitHub Actions CI** ✅ — push/PR 시 tsc + vitest + build 자동 실행 (커밋 `077ff07`)
- [x] `SKILL_CATALOG.md` 51개 최정예 재분류 최종 확정 ✅ (2026-03-10)

### Phase: v0.7.4 완료 ✅ (2026-03-10)

- [x] **LLM Router** (`src/core/llm-router.ts`) — Council(5인)/팀장(1인) 통합 외부 LLM 바인딩 레이어
  - [x] 3개 프로바이더: OpenAI GPT-4o, Ollama Cloud (DeepSeek-V3.1:671b), Ollama Local (Qwen3:30b)
  - [x] `invokeParallel()` — Promise.allSettled 기반 병렬 호출 (부분 실패 허용)
  - [x] CLO 의무 disclaimer 자동 삽입 (법무/의료 역할)
- [x] **`external_review` MCP 도구** — council / team_lead / custom 3모드
- [x] `tests/core/llm-router.test.ts` — 17 tests, tsc clean, 369/369 pass
- [x] **ADR-010 추가** → `DECISIONS.md`
- [x] **npm publish v0.7.4** ✅
- [x] `SKILL_CATALOG.md` 최종 완성 (실제 폴더 검증, 51개 활성 자산)
- [x] `stitch_design_audit` MCP E2E 검증 완료
- [x] Obsidian 의료 페르소나 3개 정리 (health-compliance/elderly/nurse 삭제)
- [x] `docs/DECISIONS.md` 생성 — ADR-001~010 전체 기록 (커밋 `bfc321f`)

### Phase: v0.7.5-dev (2026-03-10 진행 중)

- [x] **ADR-011: Workflow Pipeline Hard-Links** ✅ (커밋 `9383708`)
  - [x] Gate 0 → Gate 1 컨텍스트 파이프: `PRDElicitationInput.businessConstraints` 추가
  - [x] PRD 자동 영속화: `prd_elicit` 완료 시 Obsidian `뇽죵이Agent/prd/` 자동 저장
  - [x] CycleRunner 상태 복원: `restoreWorkflowState()` 구현 + `run_cycle` 호출 시 이전 상태 확인
  - [x] 팀장 외부 검수 PASS (DeepSeek)
  - [x] 유닛 테스트 15건 추가 (커밋 `9ceffe5`) — 395/395 pass
- [x] **NLM 파이프라인 Hard Gate** (2026-03-10)
  - [x] `GEMINI.md`에 NotebookLM 적재 의무 Hard Gate 규칙 추가
  - [x] `SKILL_CATALOG.md`에 nlm-skill "조사·분석 필수" 등록
  - [x] `nlm-skill/SKILL.md` v0.4.4 반영 (cited_text, cited_table, cinematic, 파일포맷, bulk sharing, setup all, mind map JSON)
  - [x] `/조사` NLM 파이프라인 검증 — 3소스 적재 + cited_text 응답 확인 (alias: `nlm04x`)
- [x] 비즈니스 도메인 페르소나 추가 (프랜차이즈/부동산/SaaS/법률) ✅
  - [x] 4개 도메인 키워드 패턴 + 12개 페르소나 템플릿 (커밋 `76c2ca7`)
  - [x] 2개 역할 카드 추가 (민지: 프랜차이즈 규제 자문, 선우: 법무 리스크 관리자)
  - [x] 18개 테스트 추가 — 413/413 pass
- [x] `npm version patch` → v0.7.5 배포 ✅
- [x] **ADR-011: "뇽죵아" 트리거 기반 워크플로우 전환** (2026-03-10)
  - [x] GEMINI.md 전면 리팩터링: 2-Track 모드 시스템 (뇽죵이 모드 + 일반 모드)
  - [x] 트리거-액션 매핑 7개, Pre/Post-Flight 조건부 전환
  - [x] 슬래시 커맨드 9→5개 정리 (분석/자율/기획/수정 아카이브)
- [x] **ADR-012: MCP→CLI 전환** (2026-03-10)
  - [x] Obsidian MCP → Obsidian CLI (v1.12.4) — 12도구 절약
  - [x] Perplexity MCP → curl REST API — 1도구 절약
  - [x] Firebase MCP → firebase CLI — 크래시 제거
  - [x] CLI 전체 검증 완료 (9개 Obsidian 명령 + curl + firebase-tools)
- [x] **Claude Code YOLO vs 뇽죵이 비교 분석** (2026-03-10 야간)
  - [x] Agent Manager 백그라운드 실행 능력 vs Claude YOLO 정직한 비교
  - [x] Antigravity 세션 한계(~1시간): 자기 연속 불가, 컨텍스트 소진
  - [x] Cursor Automations(클라우드 기반, 3/5 출시) 발견 — 가장 앞선 예약 에이전트
  - [x] Google 포럼 "Scheduled/Always-on Agents" Feature Request 3건 수집 (Google 무응답)
- [x] **뇽죵이 설명서 v1.0** (Obsidian) (2026-03-10 야간)
  - [x] 구버전(v0.8 슬래시 12개 중심) → v1.0 전면 재작성
  - [x] 2-Track 모드, MCP 35개 도구 상세, 감사 프롬프트, 스킬 51개, 세션 관리 팁 추가
- [x] **수정 워크플로우 복원 + 테스트 HARD GATE** (2026-03-10 야간)
  - [x] `workflows/archived/수정.md` → `workflows/수정.md` 복원
  - [x] 빌드(tsc)와 테스트(npm test)를 별도 HARD GATE로 분리 강제
  - [x] 보고 양식에 빌드/테스트 별도 행 기재 의무화
- [x] **뇽죵이 Agent 종합 감사 프롬프트 22개 테스트** 작성 완료
- [x] **Antigravity v1.20.3 패치 분석** (2026-03-11)
  - [x] AGENTS.md 규칙 읽기 지원 추가 (Cross-tool 표준)
  - [x] Auto-continue 기본 활성화 (설정 불필요)
  - [x] 토큰 회계 조기 한도 도달 버그 수정 (세션 길어질 수 있음)
  - [x] NLM 노트북 `antigravity-docs` 생성 — 8개 소스 적재 완료
- [x] **AGENTS.md 도입** (2026-03-11, 커밋 `2ded31f`)
  - [x] Cross-tool 표준 규칙 파일 (Antigravity/Cursor/Claude Code 공용)
  - [x] 빌드/테스트/코드 스타일/안전 규칙 정리
- [x] **GEMINI.md 슬래시 커맨드 HARD GATE 추가** (2026-03-11)
  - [x] `/` 입력 시 `view_file workflows/[커맨드].md` 첫 번째 도구 호출 강제
  - [x] 기억 의존 절차 스킵 방지
- [x] **🐸 종합 감사 실행 — S등급 (22/22)** (2026-03-11)
  - [x] 감사 프롬프트 22개 테스트 × 7개 그룹 직접 실행
  - [x] 전 도구 정상 동작 확인 (external_review DeepSeek 실비용 $0.002)
  - [x] ADR-013 추가: MCP 도구 종합 감사 프레임워크

## 🔧 ADR (Architecture Decision Records)

### ADR-001: Stitch 도구는 MCP 프록시가 아닌 "계획 생성기"
- **결정**: `stitch_ideate`는 Stitch MCP를 직접 호출하지 않고, Antigravity가 따를 실행 계획을 반환
- **이유**: 뇽죵이Agent는 MCP 서버이므로, 다른 MCP 서버를 직접 호출하는 것은 MCP 프로토콜 위반
- **결과**: Antigravity가 계획을 받아 `mcp_StitchMCP_*` 도구를 순차 호출

### ADR-002: 디자인 토큰 추출은 정규식 기반 (DOM 파서 미사용)
- **결정**: `stitch-design-system.ts`에서 HTML 파싱을 정규식으로 수행
- **이유**: jsdom/cheerio 등 추가 의존성 회피 (경량화 원칙)
- **트레이드오프**: 복잡한 CSS-in-JS는 놓칠 수 있음

### ADR-003: Forum RSS는 Discourse 표준 RSS 파싱
- **결정**: XML 파서 라이브러리 대신 정규식으로 RSS 파싱
- **이유**: 동일한 경량화 원칙, Discourse RSS는 구조가 단순

### ADR-004: Obsidian REST API 전환 (2026-03-04)
- **결정**: ObsidianStore를 파일시스템 직접 쓰기 → Obsidian Local REST API로 전환
- **이유**: 경로 하드코딩 의존 제거, 볼트 불일치 위험 해소
- **관련**: `src/core/obsidian-store.ts` 전면 재작성

### ADR-005: Skills 2.0 이원화 분류 기준 (2026-03-06)
- **결정**: 스킬을 `capability`(15개)와 `workflow`(37개) 두 카테고리로 분류
- **capability 기준**: 모델 발전 시 불필요해질 수 있는 API 래퍼, 포맷 변환, 단일 도구 통합 등
- **workflow 기준**: 팀 규정, 배포 흐름, 코딩 표준 등 모델 성능과 무관하게 영구 유지되는 프로세스
- **은퇴 기준**: capability + 30일 미사용 → `skill_audit`이 자동 플래그
- **메트릭 저장**: in-memory (shared-state 링 버퍼 max 200) — Obsidian flush는 향후 구현

## 🚨 알려진 이슈
- `persona_generate` 도구가 README에 언급되나 registry에서 확인 필요
- Stitch forum RSS URL이 실제로 접근 가능한지 네트워크 테스트 미완료
- SkillBenchmark 메트릭이 in-memory에만 저장됨 — 서버 재시작 시 초기화

## 🔒 시스템 강제 게이트
- **Git pre-commit hook** (`.git/hooks/pre-commit`): tsc 타입체크 + 시크릿 패턴 필터
- **GitHub Actions CI** (`.github/workflows/ci.yml`): push/pull_request 시 tsc, vitest, build 강제 검증 자동화
- **SKILL_CATALOG.md**: 51개 활성 자산 카탈로그 (ADR-007 기반, 2026-03-10 최종 검증)
- **DECISIONS.md**: ADR-001~011 아키텍처 결정 기록 (축약 금지 원칙)
