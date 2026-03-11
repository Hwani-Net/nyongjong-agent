const API_URL = 'http://127.0.0.1:27123';
const API_KEY = '176eab4a9d880276954d940b0bf681c4bcfaf2a2cbd409040fbbc0f6db14c2df';
const NOTE_PATH = '뇽죵이 설명서.md';

const newContent = `---
created: 2026-03-03
updated: 2026-03-11
pinned: true
tags:
  - 뇽죵이
  - MCP
  - 설명서
type: guide
version: 0.7.7
---

# 🐸 뇽죵이 설명서 v1.0

> **뇽죵이(NongjongAgent)** = 대표님의 AI 코딩 파트너를 위한 자율 에이전트 MCP 서버.
> Antigravity가 분석→설계→구현→검증→보고를 자동으로 수행하도록 지원합니다.

---

## 🚀 빠른 시작 — npm으로 설치/실행

\\\`\\\`\\\`bash
# MCP 서버 실행 (npx로 바로 실행)
npx nyongjong-agent

# 또는 전역 설치 후 실행
npm install -g nyongjong-agent
nyongjong-agent
\\\`\\\`\\\`

**현재 버전**: \\\`nyongjong-agent@0.7.7\\\` ([npm](https://www.npmjs.com/package/nyongjong-agent) | [GitHub](https://github.com/Hwani-Net/nyongjong-agent))

### Claude Desktop / Antigravity 설정 예시
\\\`\\\`\\\`json
{
  "mcpServers": {
    "nongjong-agent": {
      "command": "npx",
      "args": ["nyongjong-agent"],
      "env": {
        "OBSIDIAN_API_KEY": "...",
        "DASHBOARD_PORT": "3100"
      }
    }
  }
}
\\\`\\\`\\\`

---

## 🎯 2-Track 모드 시스템 (ADR-011)

> v0.7.5부터 도입. **"뇽죵아"** 트리거가 모드를 결정합니다.

### 🐸 뇽죵이 모드 — "뇽죵아 ○○해"

\\\`"뇽죵아"\\\` + 동사 트리거 시 활성화. MCP 풀셋 + Pre/Post-Flight 게이트.

| 트리거 | MCP 시퀀스 | 설명 |
|--------|-----------|------|
| **뇽죵아 분석해** | analyze_goal → persona_consult(2인+) → 보고 | 목표 분석 |
| **뇽죵아 수정해** | critic_check → 코딩 → 빌드/테스트 → external_review(team_lead) → critic_check(verification) | 구조적 코드 수정 |
| **뇽죵아 자율 진행** | analyze_goal → business_gate → prd_elicit → 코딩 → 검증 → external_review(team_lead) → 보고 | MVP 풀 파이프라인 |
| **뇽죵아 기획해** | business_gate → prd_elicit → 대표님 질문 → 보고 | PRD 작성 |
| **뇽죵아 조사해** | NLM 생성 → tavily_research → NLM 적재 → 보고 | 리서치 (NLM 필수) |
| **뇽죵아 자문 구해** | external_review(council 또는 team_lead) | 외부 LLM 리뷰 |
| **뇽죵아 디자인해** | Stitch 파이프라인 (디자인→코드) | 디자인→코드 |

### ⚡ 일반 모드 — 트리거 없는 지시

트리거 없이 "이거 고쳐줘", "버그 잡아줘" 등:
- MCP 도구 사용 안 함
- Pre/Post-Flight 적용 안 함
- 코드 분석 → 수정 → 빌드/테스트 → 보고

---

## 📋 슬래시 커맨드 (5개)

| 커맨드 | 언제 쓰나? | 뇽죵이가 하는 일 |
|--------|-----------|---------------------|
| \\\`/저장\\\` | 지금 상태 저장할 때 | Obsidian에 세션 상태 즉시 저장 + 핸드오프 프롬프트 생성 |
| \\\`/이어서\\\` | 이전 대화 이어갈 때 | PROJECT_CONTEXT → PITFALLS → DECISIONS → 메모리 조회 → 맥락 복구 |
| \\\`/디자인\\\` | UI 만들 때 | Stitch 디자인 생성 → HTML 추출 → stitch_design_audit → 팀장 리뷰 → 코드 반영 |
| \\\`/조사\\\` | 기술/시장 조사할 때 | NLM 노트북 생성 → Tavily + search_web → NLM 적재 → 보고서 |
| \\\`/배포\\\` | 배포할 때 | 배포 절차 실행 |

> 나머지 커맨드(\\\`/분석\\\`, \\\`/자율\\\`, \\\`/기획\\\`, \\\`/수정\\\` 등)는 "뇽죵아 ○○해" 트리거로 대체됨.

---

## 🔧 MCP 도구 35개

### Core (3개) — 항상 ON
| 도구 | 역할 |
|------|------|
| \\\`agent_status\\\` | 에이전트 상태 확인 |
| \\\`tool_status\\\` | 도구 활성/비활성 상태 |
| \\\`tool_toggle\\\` | 도구 그룹 ON/OFF |

### Persona (6개)
| 도구 | 역할 |
|------|------|
| \\\`persona_list\\\` | 전체 페르소나 목록 |
| \\\`persona_consult\\\` | 페르소나 자문 (2인+ 관점) |
| \\\`persona_create\\\` | 새 페르소나 생성 |
| \\\`persona_update\\\` | 페르소나 수정 |
| \\\`persona_delete\\\` | 페르소나 삭제 |
| \\\`persona_generate\\\` | 목표 기반 동적 페르소나 생성 (Ollama) |

### Workflow (6개)
| 도구 | 역할 |
|------|------|
| \\\`analyze_goal\\\` | 목표 분석 (유형/복잡도/위험) |
| \\\`business_gate\\\` | Gate 0: 사업성 판정 |
| \\\`prd_elicit\\\` | Gate 1: PRD 자기 치유 루프 |
| \\\`feedback_classify\\\` | 피드백 분류 (rollback 포인트) |
| \\\`run_cycle\\\` | 자율 워크플로우 (5단계 + Team Lead 리뷰 + 시각 검증) |
| \\\`critic_check\\\` | AgentPRM 패턴 규칙 준수 평가 |

### Review (1개) — ADR-010
| 도구 | 역할 |
|------|------|
| \\\`external_review\\\` | 외부 LLM 리뷰 (council/team_lead/custom) |

### Execution (4개)
| 도구 | 역할 |
|------|------|
| \\\`shell_run\\\` | 셸 명령 실행 |
| \\\`self_heal\\\` | 빌드/테스트 자동 재시도 (최대 10회) |
| \\\`completion_loop\\\` | 성공 조건 충족까지 반복 |
| \\\`cicd_gate\\\` | CI/CD 사전 검사 |

### Memory (3개)
| 도구 | 역할 |
|------|------|
| \\\`memory_search\\\` | Obsidian 메모리 검색 |
| \\\`memory_write\\\` | Obsidian 메모리 기록 |
| \\\`ollama_health\\\` | 로컬 Ollama 상태 확인 |

### Task (2개)
| 도구 | 역할 |
|------|------|
| \\\`task_create\\\` | 작업 대기열 생성 |
| \\\`task_list\\\` | 작업 목록 조회 |

### Model (3개)
| 도구 | 역할 |
|------|------|
| \\\`list_models\\\` | 사용 가능 모델 목록 |
| \\\`recommend_model\\\` | 작업별 최적 모델 추천 |
| \\\`feedback_collect\\\` | 만족도 피드백 수집 |

### Stitch (4개)
| 도구 | 역할 |
|------|------|
| \\\`stitch_ideate\\\` | 디자인 비교 계획 생성 |
| \\\`stitch_design_system_extract\\\` | HTML에서 디자인 토큰 추출 |
| \\\`stitch_forum_check\\\` | Stitch 커뮤니티 모니터링 |
| \\\`stitch_design_audit\\\` | Stitch HTML vs 구현 코드 감사 (ADR-008) |

### Skill Lifecycle (2개) — Skills 2.0
| 도구 | 역할 |
|------|------|
| \\\`skill_audit\\\` | 스킬 전수 스캔 → 은퇴 후보 식별 |
| \\\`skill_benchmark\\\` | A/B 벤치마크 (with/without skill) |

### Market (1개)
| 도구 | 역할 |
|------|------|
| \\\`market_research\\\` | 시장 조사 (경쟁사 분석) |

---

## 🛡️ QA 파이프라인 (ADR-014, v0.7.7)

> \\\`run_cycle\\\` 실행 시 자동으로 적용되는 품질 게이트 파이프라인.

\\\`\\\`\\\`
Gate0(사업성) → Gate1(PRD) → Prototype → Validate(빌드/테스트)
  → Stage 5.5: Team Lead 코드 리뷰 (외부 LLM)
  → Stage 5.7: 브라우저 시각 검증 (UI 작업만)
  → Report(대표님 보고)
\\\`\\\`\\\`

### Team Lead 리뷰 (Stage 5.5)
- Validate 통과 후 \\\`LLMRouter\\\`로 외부 LLM(DeepSeek-V3.1:671b) 코드 리뷰
- BLOCK 판정 → 피드백 기반 Evolve → 재검증 → 재리뷰 (최대 10회)
- 비용: 약 $0.002/회

### 브라우저 시각 검증 (Stage 5.7)
- UI 작업(화면/컴포넌트/디자인) 자동 감지 시 브라우저 스크린샷 캡처
- 비-UI 작업은 자동 스킵

---

## 🏛️ 주요 ADR (Architecture Decision Records)

| ADR | 결정 | 핵심 이유 |
|-----|------|----------|
| **ADR-014** | QA 파이프라인에 Team Lead 리뷰 + 시각 검증 통합 | 빌드 통과 ≠ 품질 검수. echo chamber 방지 |
| **ADR-013** | 22개 E2E 감사 프레임워크 | 도구 개별 테스트 ≠ 파이프라인 수준 검증 |
| **ADR-011** | "뇽죵아" 트리거 기반 2-Track 모드 | MCP 풀셋 항상 적용 시 준수율 ~15%. 트리거 도입으로 해결 |
| **ADR-010** | Council + 팀장 외부 LLM 바인딩 | 3개 제조사 LLM으로 echo chamber 방지 |
| **ADR-008** | 디자인 독재 프로토콜 | AI의 어림짐작이 디자인 훼손의 근본 원인 |

> 전체 ADR: \\\`docs/DECISIONS.md\\\` 참조 (ADR-001~014)

---

## 🔬 Skills 2.0 — 스킬 생애주기 관리

| 도구 | 역할 |
|------|------|
| \\\`skill_audit\\\` | .agent/skills/ 전체 스캔 → capability/workflow 분류 → 은퇴 후보 식별 |
| \\\`skill_benchmark\\\` | 스킬 ON/OFF A/B 비교 → KEEP/REVIEW/RETIRE 자동 판정 |

### 스킬 분류 기준 (ADR-005)
| 분류 | 설명 | 은퇴 가능? |
|------|------|-----------:|
| ⚡ capability | 모델 한계 보완용 | ✅ 자동 은퇴 후보 |
| 🔧 workflow | 팀 규칙/배포 흐름 | ❌ 영구 유지 |

---

## 🎯 상황별 추천 가이드

\\\`\\\`\\\`
"이 버그 좀 고쳐줘"          → 그냥 말하기 (일반 모드)
"새 화면 만들어줘"           → 뇽죵아 디자인해 또는 /디자인
"○○ 만들어줘" (막연)         → 뇽죵아 기획해
"로그인 기능 추가해줘"       → 뇽죵아 수정해
"결제 시스템 설계해줘"       → 뇽죵아 분석해
"이 기술 좋은지 알아봐줘"    → 뇽죵아 조사해 또는 /조사
"새 앱 처음부터 만들어줘"    → 뇽죵아 자율 진행
"어제 하던 거 이어서"        → /이어서
"지금 저장해둬"              → /저장
"전문가 의견 좀 들어보자"    → 뇽죵아 자문 구해
\\\`\\\`\\\`

---

## 📦 버전 히스토리

| 버전 | 날짜 | 주요 변경 |
|------|------|----------|
| \\\`0.7.7\\\` | 2026-03-11 | 🛡️ ADR-014: QA 파이프라인 (Team Lead 리뷰 + 시각 검증 + 피드백 루프) |
| \\\`0.7.6\\\` | 2026-03-11 | 🔧 감사 관찰 사항 #1~#3 수정 (feedback confidence, complexity signals) |
| \\\`0.7.5\\\` | 2026-03-10 | 🎯 2-Track 모드, NLM Hard Gate, 비즈니스 페르소나 12개, stitch_design_audit |
| \\\`0.7.4\\\` | 2026-03-10 | 🤖 LLM Router + external_review (Council/팀장 외부 LLM) |
| \\\`0.7.3\\\` | 2026-03-07 | 🔬 Eval Framework 완성 (KEEP:52/RETIRE:0) |
| \\\`0.7.1\\\` | 2026-03-06 | 🔍 Skills 2.0 — SkillLifecycleManager + A/B Benchmarking |
| \\\`0.6.0\\\` | 2026-03-03 | 🎨 Stitch 도구 3종 + npm 최초 배포 |

---

## 📌 완료 시 보고 포맷

\\\`\\\`\\\`
## 📋 다음 작업 추천
| 항목 | 내용 |
|------|------|
| 모델명 | Gemini 3.1 Pro / Gemini 3 Flash / Claude Sonnet 4.6 |
| 모드 | Planning / Fast |
| 진행도 | 분석→설계→구현→검증→배포→완료 (현재 단계 볼드) |
| 컨텍스트 | 🟢 양호 / 🟡 잘림 / 🔴 새 세션 권장 |
| 추천 커맨드 | 뇽죵아 ○○해 또는 /슬래시 |
\\\`\\\`\\\`

---

> 💡 **팁**: "뇽죵아" 없이 그냥 말하면 일반 모드로 바로 작업합니다. 복잡한 분석이 필요할 때만 "뇽죵아 ○○해"를 사용하세요.

> 🐸 뇽죵이는 **npm 패키지**로 배포되어 있어 누구나 \\\`npx nyongjong-agent\\\`로 실행할 수 있습니다.
`;

const encoded = encodeURIComponent(NOTE_PATH);
const url = `${API_URL}/vault/${encoded}`;

const res = await fetch(url, {
  method: 'PUT',
  headers: {
    Authorization: `Bearer ${API_KEY}`,
    'Content-Type': 'text/markdown',
  },
  body: newContent,
});

if (res.ok) {
  console.log('✅ 뇽죵이 설명서 v1.0 업데이트 완료 (' + res.status + ')');
} else {
  const body = await res.text().catch(() => '');
  console.error('❌ 업데이트 실패: ' + res.status + ' ' + res.statusText + '\n' + body);
  process.exit(1);
}
