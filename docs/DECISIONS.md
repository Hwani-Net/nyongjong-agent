# 📋 Architecture Decision Records (ADR)

> 모든 아키텍처 결정의 **WHY를 보존**합니다. 축약 금지.

---

## ADR-014: QA 파이프라인 개선 — Team Lead 리뷰 + 시각 검증 통합 (2026-03-11)

### 컨텍스트
v0.7.5에서 `CycleRunner` 파이프라인은 `Gate0(사업성) → Gate1(PRD) → Prototype → Validate(빌드/테스트) → Evolve(재시도) → Report` 순서로 실행됨. 그러나 3가지 핵심 GAP이 발견됨:

1. **G-1: Team Lead 코드 리뷰 미통합** (🔴 Critical) — `external_review(team_lead)` 도구가 독립적으로 존재하지만 `CycleRunner`에 연결되지 않음. 코드 변경이 검수 없이 보고됨.
2. **G-2: 브라우저 시각 검증 없음** (🔴 Critical) — UI 작업 후 브라우저 확인 단계가 파이프라인에 없음. 빌드 통과 ≠ 화면 정상.
3. **G-3: 검증↔보고 사이 품질 게이트 없음** (🟡 Medium) — Validate 통과하면 바로 Report. 중간에 코드 품질/보안 체크 없음.

### 결정
업계 표준 CI/CD + Code Review 파이프라인 순서에 맞춰 2개 신규 Stage를 `CycleRunner`에 추가:

```
Gate0 → Gate1 → Prototype → Validate(빌드/테스트)
  → Stage 5.5: Team Lead 코드 리뷰
  → Stage 5.7: 브라우저 시각 검증
  → Report(대표님 보고)
```

**Stage 5.5: Team Lead Review**
- Validate PASS 후에만 실행 (빌드 실패한 코드를 리뷰하면 시간 낭비)
- `LLMRouter`를 통해 `external_review(team_lead)` 호출 (기본: DeepSeek-V3.1:671b)
- BLOCK 판정 시 → `reviewFeedback` 필드로 Evolve 단계에 피드백 전달 → 수정 → 재검증 → 재리뷰
- 최대 10회 재시도 (기존 3회에서 상향). 10회째도 BLOCK이면 보고에 포함하고 대표님에게 에스컬레이션

**Stage 5.7: Browser Visual Check**
- UI 작업(`hasUI=true`)일 때만 실행 (regex: `ui|페이지|화면|컴포넌트|디자인|프론트|대시보드`)
- `browser_subagent` 호출하여 dev 서버 스크린샷 캡처
- 결과를 Report에 첨부
- 비-UI 작업(리팩터링, 문서)은 자동 스킵

**피드백 기반 Evolve 루프**
- Team Lead가 BLOCK + 피드백을 줄 경우, `CycleState.reviewFeedback`에 저장
- Evolve 단계에서 피드백을 참조하여 수정안 생성 → Validate → 재리뷰
- 이 루프가 업계 표준 "코드 리뷰 → 수정 → 재리뷰" 패턴과 동일

### 왜 이 결정을 했는가
종합 감사(ADR-013, 22/22 S등급) 실행 후, 도구 개별 동작은 완벽하지만 **파이프라인 수준에서 연결이 끊어져 있음**을 발견:

- `external_review(team_lead)` 도구는 정상 동작하지만, `run_cycle`을 실행해도 호출되지 않음
- AI가 자기 코드를 자기가 검수하는 echo chamber 문제가 `CycleRunner` 파이프라인 내에서도 그대로 재현
- 브라우저 확인 없이 `빌드 통과 = 완료`로 보고하면, 실제 화면이 깨진 채 대표님에게 전달

**업계 표준과의 비교:**
```
일반 CI/CD: 빌드 → 테스트 → 코드 리뷰(PR) → QA 시각 검증 → 승인 → 배포
뇽죵이 AS-IS: 빌드 → 테스트 → [GAP] → [GAP] → 보고
뇽죵이 TO-BE: 빌드 → 테스트 → Team Lead 리뷰 → 시각 검증 → 보고
```

**"코드 리뷰 → 시각 검증" 순서의 이유:**
코드에 보안 취약점이나 아키텍처 문제가 있으면 화면이 멀쩡해도 릴리스 불가. 코드 리뷰를 먼저 통과해야 시각 검증에 들어가는 것이 업계 표준.

### 결과
- `src/workflow/cycle-runner.ts` — Stage 5.5, 5.7 구현 + `reviewFeedback` 루프
- `CycleStatus`에 `'reviewing'`, `'visual_check'` 추가
- `CycleState`에 `teamLeadReview?`, `visualCheck?` 필드 추가
- `CycleRunnerOptions`에 `llmRouter?`, `onVisualCheck?`, `maxReviewRetries?` 추가
- `agent.ts` — LLMRouter 인스턴스를 CycleRunner에 주입
- 전역 재시도 기본값 3→10회 상향 (`selfHeal`, `completionLoop`, `CycleRunner`, Team Lead`)
- `/수정` 워크플로우에 팀장 리뷰 HARD GATE + BLOCK→피드백 수정 루프 추가
- `/디자인` 워크플로우에 `stitch_design_audit` + 팀장 리뷰 재시도 10회 추가
- 테스트 4건 추가 (Team Lead PASS flow, Report markdown, UI visual check 트리거, 비-UI 스킵)
- **439/439 테스트 전체 통과**, v0.7.7 릴리스 + GitHub push 완료

---

## ADR-013: MCP 도구 종합 감사 프레임워크 (2026-03-11)

### 컨텍스트
v0.7.5에서 35개 MCP 도구가 등록되었으나 통합 검증 수단이 없었음. 개별 유닛 테스트(413개)는 모듈 단위 검증이지, MCP 프로토콜을 통한 E2E 동작은 보장하지 않음.

### 결정
22개 E2E 테스트 × 7개 그룹으로 구성된 **종합 감사 프롬프트**를 정형화:
- **그룹 A**: 상태 확인 (agent_status, tool_status, list_models, recommend_model)
- **그룹 B**: 페르소나 CRUD (list → consult → create → update → delete)
- **그룹 C**: 워크플로우 분석 (analyze_goal, business_gate, feedback_classify, critic_check)
- **그룹 D**: 스킬 라이프사이클 (skill_audit, skill_benchmark summary/cycle)
- **그룹 E**: 외부 LLM 리뷰 (external_review team_lead — 실비용 발생)
- **그룹 F**: 실행/복구 (shell_run, task CRUD, tool_toggle ON/OFF/ON)
- **그룹 G**: Stitch 디자인 (stitch_ideate, stitch_design_audit)

**채점**: S(100%) / A(86%+) / B(68%+) / C(50%+) / F 등급제. SKIP은 분모에서 제외.

### 결과
- `nongjong_agent_audit_prompt.md` — 외부 Agent Manager에서 독립 실행 가능한 프롬프트
- 첫 감사 결과: **22/22 (S등급)**, 실패 항목 없음 (2026-03-11)
- 매 릴리스 전 감사 프롬프트 실행을 권장 (CI 대체 아님, 보완용)

---

## ADR-011: Workflow Pipeline Hard-Links (2026-03-10)

### 컨텍스트
세션 핸드오프 문제 해결 후 동일한 패턴의 "연결고리 부재(Missing Link)"가 3건 발견됨. ADR-008(Design Dictatorship)과 동일한 교훈: "AI의 자율에 의존하면 데이터가 왜곡된다."

### 결정
워크플로우 파이프라인의 3개 단절점에 강제 연결(Hard-Link) 적용:
1. **Gate Context Pipe**: Gate 0(business) 결과를 Gate 1(PRD) 입력에 강제 주입. `PRDElicitationInput`에 `businessConstraints` 필드 추가.
2. **PRD Auto-Persist**: `prd_elicit` 완료 시 Obsidian에 PRD 구조체를 JSON+MD로 자동 저장. Antigravity의 "요약"에 의존하지 않음.
3. **State Hydration**: `run_cycle`에 `resumeGoal` 파라미터 추가. Obsidian `workflow_state/` 파일에서 이전 상태 복원하여 멈춘 Stage부터 재개.

### 결과
- `PRDElicitationInput` 인터페이스 확장
- `CycleRunner`에 Gate 0 → Gate 1 데이터 파이프라인 추가
- `prd_elicit` 핸들러에 `store.writeNote()` 자동 호출 추가
- `CycleRunner.restoreWorkflowState()` 구현

---

## ADR-010: Council + 팀장 통합 외부 LLM 바인딩 (2026-03-09)

### 컨텍스트
AI가 자기 작업을 자기가 검수하는 "Echo Chamber" 문제. 단일 LLM(Gemini)만으로는 편향된 검수가 불가피.

### 결정
3개 서로 다른 제조사 LLM을 병렬 호출하여 다각도 검수 체계 구축:
- `openai`(GPT-4o), `deepseek-cloud`(DeepSeek-V3.1:671b), `qwen3-local`(Qwen3:30b)
- Council 모드: 5인(CTO/CFO/CMO/CLO/악마의 대변인) 병렬 전략 회의
- Team Lead 모드: 코드 리뷰어 1인 검수 (DeepSeek 기본)

### 결과
- `src/core/llm-router.ts` + `external_review` MCP 도구 구현
- 예상 비용: 월 $2~4 (CFO 검토 통과)
- CLO 역할 시 법률 면책 disclaimer 자동 삽입

---

## ADR-008: Design Dictatorship Protocol (2026-03-08)

### 컨텍스트
AI가 Stitch 디자인을 코드로 변환할 때 스타일을 "어림짐작"으로 근사화하고, DOM 구조를 임의로 평탄화하며, 시각 효과를 누락하는 문제가 반복.

### 결정
3개의 불가침 규칙을 시스템에 하드코딩:
1. **Rule 1: No Approximation** — `border-radius: 14px` → `rounded-md(6px)` 같은 근사 금지. `rounded-[14px]` 필수.
2. **Rule 2: DOM Preservation** — Stitch 깊이 4 → 구현 깊이 1 허용 불가. 구조 보존 필수.
3. **Rule 3: Effect Preservation** — `backdrop-filter`, `linear-gradient` 등 시각 효과 누락 금지.

### 결과
- `src/stitch/stitch-design-audit.ts` + `stitch_design_audit` MCP 도구 구현
- 자동 감사: Stitch HTML vs 구현 코드 비교 → 위반 시 점수 차감
- 16개 유닛 테스트 + E2E 검증 완료

---

## ADR-007: 스킬 96→61 통폐합 (2026-03-08)

### 컨텍스트
Full Council 6인 회의에서 96개 스킬 자산이 과도하다고 판단. 중복, DEPRECATED, 1줄 명령어 스킬이 혼재.

### 결정
- **삭제 9건**: DEPRECATED + 단일 명령어 스킬
- **통합 26건**: 상위 호환 스킬로 흡수 (예: `/자문`→`council`, `pentagonal-*`→`pentagonal-audit`)
- **아카이브 9건**: 사용 빈도 낮지만 참고 가치 있는 워크플로우

### 결과
- `SKILL_CATALOG.md` 최종 완성 (2026-03-10)
- 활성 자산 51개 (워크플로우 9 + 스킬 40 + Antigravity 2)

---

## ADR-006: Skills 2.0 — Lifecycle Management (2026-03-06)

### 컨텍스트
스킬이 계속 늘어나지만 퇴역(retire) 메커니즘이 없음. 미사용 스킬이 컨텍스트를 낭비.

### 결정
- `skill_benchmark` 도구: A/B 벤치마크 (with/without skill), 통계 추적
- `skill_audit` 도구: 30일 미사용 스킬 감지, 자동 RETIRE 후보 추천
- `auto_generate_eval`: SKILL.md에서 키워드 추출하여 eval YAML 자동 생성

### 결과
- 52개 스킬 전수 검사 완료: KEEP 52 / RETIRE 0 / REVIEW 0
- eval 결과 Obsidian 자동 저장

---

## ADR-005: Obsidian REST API 메모리 (2026-03-04)

### 컨텍스트
멀티 세션 프로젝트에서 컨텍스트 유실. 이전 세션의 결정/배경을 알 수 없어 같은 실수 반복.

### 결정
- Obsidian Local REST API (port 27123)를 통한 메모리 읽기/쓰기
- `memory_search` + `memory_write` MCP 도구
- 진실 원천: `docs/PROJECT_CONTEXT.md`, Obsidian은 보조

### 결과
- 세션 핸드오프 성공률 향상
- `PITFALLS.md`에 삽질 기록 → 재발 방지

---

## ADR-004: MCP 100개 도구 한계 (2026-03-03)

### 컨텍스트
Gemini CLI MCP 프로토콜의 도구 등록 한계: 동시 100개 초과 시 성능 저하.

### 결정
- 코어 도구(obsidian/StitchMCP/tavily) 상시 ON
- 나머지 도구 그룹별 온디맨드 활성화: `tool_toggle`
- `tool_status`로 현재 상태 확인

### 결과
- 34개 도구 등록 (한계 내 안정 운용)
- 그룹: core, persona, grounding, research, stitch, review, execution, skill

---

## ADR-003: Pre-Flight / Post-Flight 게이트 (2026-03-02)

### 컨텍스트
코딩에 바로 뛰어들어 디자인/분석 누락. 완료 보고 시 미검증 항목 은폐.

### 결정
- **Pre-Flight**: 코딩 전 7개 항목 필수 체크 (유형/복잡도, 페르소나 2인+, 사업성, Stitch 등)
- **Post-Flight**: 보고 전 4개 항목 필수 체크 (PROJECT_CONTEXT, audit 점수, Stitch 추출, Obsidian 기록)

### 결과
- `user_global` 시스템 프롬프트에 하드코딩
- 위반 시 BLOCK → 작업 중단

---

## ADR-002: 5-Phase 워크플로우 (2026-03-01)

### 컨텍스트
AI 에이전트의 비구조화 작업이 품질 편차를 유발.

### 결정
Understand → Prototype → Validate → Evolve → Report 5단계 순환 워크플로우 체계 도입.

### 결과
- `CycleRunner` 구현 (`src/workflow/cycle-runner.ts`)
- 각 단계별 MCP 도구 매핑
- 자동 재시도 (최대 3회) + 인간 에스컬레이션

---

## ADR-001: 뇽죵이Agent MCP 서버 아키텍처 (2026-02-28)

### 컨텍스트
Antigravity(Gemini CLI)의 능력을 확장하되, 코드베이스를 직접 수정하지 않는 방식 필요.

### 결정
- MCP (Model Context Protocol) 서버로 구현
- TypeScript + Node.js, ESM 모듈
- stdio 기반 통신 (Gemini CLI 표준)

### 결과
- `nyongjong-agent` npm 패키지 (v0.7.4)
- 34개 MCP 도구, 9개 워크플로우, 40개 스킬
