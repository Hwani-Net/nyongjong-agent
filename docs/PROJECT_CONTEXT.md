# 뇽죵이Agent — PROJECT_CONTEXT.md

> **북극성**: AI 코딩 파트너를 위한 자율 에이전트 MCP 서버.
> Antigravity가 분석→설계→구현→검증→보고를 자동으로 수행하도록 지원하는 뇽죵이(NongjongAgent).

## 📦 프로젝트 정보

| 항목 | 값 |
|------|-----|
| **이름** | `nyongjong-agent` |
| **버전** | `0.6.0` |
| **경로** | `E:\Agent\뇽죵이Agent` |
| **런타임** | Node.js ≥22, TypeScript, ESM |
| **테스트** | vitest — **287/287 pass** (22 파일) |
| **MCP 도구** | **31개** (core 3 + toggle 28) |
| **프로토콜** | Model Context Protocol (stdio) |
| **GitHub** | https://github.com/Hwani-Net/nyongjong-agent |
| **npm** | https://www.npmjs.com/package/nyongjong-agent |

## 🏗️ 아키텍처 개요

```
src/
├── core/          # Config, ObsidianStore, TaskManager, ToolRegistry, SharedState
├── personas/      # PersonaLoader, PersonaEngine, PersonaSimulator, Templates, Generator
├── workflow/      # Understand, BusinessGate, PRDElicitation, FeedbackRouter, CycleRunner
├── grounding/     # GroundingEngine, Adapters (KOSIS, Law, Naver, Trends, AppReviews, Web)
├── execution/     # ShellRunner, SelfHeal, CompletionLoop, CICDGate
├── stitch/        # StitchIdeate, DesignSystemExtract, ForumCheck (v0.6.0)
├── advisory/      # CriticCheck (AgentPRM 패턴)
├── dashboard/     # Real-time SSE dashboard
├── utils/         # Logger (ring buffer)
├── mcp-server.ts  # 28개 도구 등록 + runtime toggle
├── agent.ts       # Agent orchestration
└── index.ts       # Entry point
```

## 📊 현재 진행 상태

### Phase: v0.6.0 릴리스 완료 ✅

- [x] Phase 0.1: 초기 설정 (MCP + vitest)
- [x] Phase 0.2: Obsidian + Task Manager
- [x] Phase 0.3: 워크플로우 6단계 + 대시보드 + 페르소나
- [x] Phase 0.4: Ralph Mode + Grounding + Tool Toggle
- [x] Phase 0.5: Stage-Gate + Dashboard Health + Git Worktree
- [x] Phase 0.6: **Stitch 도구 3종** (Ideate, DesignSystem, Forum)
- [x] 유닛 테스트 41개 추가 (287/287 pass)
- [x] README.md v0.6.0 업데이트 (31 tools, 287 tests, Stitch 섹션)
- [x] npm build 성공 (205KB 패키지)
- [x] Dashboard에 Stitch Design 페이지 추가 (13번째 페이지)
- [x] Git push (GitHub: **Hwani-Net/nyongjong-agent**)
- [x] npm publish 완료 (**nyongjong-agent@0.6.0**)
- [x] ObsidianStore REST API 전환 완료
- [x] `docs/` 레거시 5파일 아카이브 → `docs/archive/`
- [x] LESSONS_LEARNED.md execute_shell 구식 항목 DEPRECATED 처리
- [x] Obsidian 뇽죵이Agent 노트 동기화

### TODO (미래)
- [ ] npm Token 갱신 필요일: **2026-06-02** (Granular Token 90일 만료)
- [ ] Dashboard Stitch 페이지에 라이브 데이터 연동 (실시간 포럼 모니터링)
- [ ] GEMINI.md 다이어트 (572줄 → 축소)

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

## 🚨 알려진 이슈
- `persona_generate` 도구가 README에 언급되나 registry에서 확인 필요
- Stitch forum RSS URL이 실제로 접근 가능한지 네트워크 테스트 미완료
