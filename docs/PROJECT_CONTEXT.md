# 뇽죵이Agent — PROJECT_CONTEXT.md

> **북극성**: AI 코딩 파트너를 위한 자율 에이전트 MCP 서버.
> Antigravity가 분석→설계→구현→검증→보고를 자동으로 수행하도록 지원하는 뇽죵이(NongjongAgent).

## 📦 프로젝트 정보

| 항목 | 값 |
|------|-----|
| **이름** | `nyongjong-agent` |
| **버전** | `0.7.3` |
| **경로** | `E:\Agent\뇽죵이Agent` |
| **런타임** | Node.js ≥22, TypeScript, ESM |
| **테스트** | vitest — **352/352 pass** (25 파일) |
| **MCP 도구** | **33개** (core 3 + toggle 28 + lifecycle 2) |
| **프로토콜** | Model Context Protocol (stdio) |
| **GitHub** | https://github.com/Hwani-Net/nyongjong-agent |
| **npm** | https://www.npmjs.com/package/nyongjong-agent |

## 🏗️ 아키텍처 개요

```
src/
├── core/          # Config, ObsidianStore, TaskManager, ToolRegistry, SharedState
│                  # SkillLifecycleManager (v0.7.1), SkillBenchmark (v0.7.1)
├── personas/      # PersonaLoader, PersonaEngine, PersonaSimulator, Templates, Generator
├── workflow/      # Understand, BusinessGate, PRDElicitation, FeedbackRouter, CycleRunner
├── grounding/     # GroundingEngine, Adapters (KOSIS, Law, Naver, Trends, AppReviews, Web)
├── execution/     # ShellRunner, SelfHeal, CompletionLoop, CICDGate
├── stitch/        # StitchIdeate, DesignSystemExtract, ForumCheck (v0.6.0)
├── advisory/      # CriticCheck (AgentPRM 패턴)
├── dashboard/     # Real-time SSE dashboard
├── utils/         # Logger (ring buffer)
├── mcp-server.ts  # 33개 도구 등록 + runtime toggle
├── agent.ts       # Agent orchestration
└── index.ts       # Entry point
```

## 📊 현재 진행 상태

### Phase: v0.7.3 릴리스 완료 ✅

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

### TODO (미래)
- [ ] npm Token 갱신 필요일: **2026-06-02** (Granular Token 90일 만료)
- [ ] Dashboard Stitch 페이지에 라이브 데이터 연동 (실시간 포럼 모니터링)
- [ ] GEMINI.md 다이어트 (572줄 → 축소)
- [ ] npm publish v0.7.3
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
- [ ] GitHub Actions CI 파이프라인 (추후)
- [ ] `SKILL_CATALOG.md` 61개 → 최정예 재분류 최종 확정

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
- **SKILL_CATALOG.md**: 61개 활성 자산 카탈로그 (ADR-007 기반)
