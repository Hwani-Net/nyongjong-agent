---
tags:
  - status
  - overview
  - v0.4.0
type: project-status
version: 0.4.0
---
# 뇽죵이 Agent v0.4.0 — 프로젝트 현황 요약

## 날짜
2026-02-27 08:22 KST

## 프로젝트 상태: ✅ v0.4.0 정식 릴리즈 완료

### 핵심 수치
| 항목 | 값 |
|------|-----|
| 버전 | v0.4.0 (Git 태그) |
| 유닛 테스트 | 169/169 (17파일) |
| MCP 도구 | 15개 |
| 페르소나 | 6명 |
| 대시보드 페이지 | 10개 |
| 발견/수정 이슈 | 18+/18+ (100%) |
| 코드 품질 | TODO 0, FIXME 0, any 0 |

### 완료된 Phase
1. **Phase 1-3**: 코어 모듈 (Obsidian, TaskManager, ModelSelector, PersonaEngine)
2. **Phase 4**: AI 순환 워크플로우 (Understand→Prototype→Validate→Evolve→Report)
3. **Phase 5**: Grounding 엔진 (GapDetector, FactInjector, API Adapters)
4. **Phase 6**: MCP 서버 15도구 등록
5. **Phase 7**: 대시보드 UI (10페이지, SSE, Chat, 테마)
6. **Phase 8**: 대시보드 SSE 버그 수정 + 랄프 모드 QA

### API 키 현황 (2026-02-27)
| 서비스 | 상태 | 용도 |
|--------|------|------|
| KOSIS | ✅ 발급 완료 | 통계청 데이터 검증 |
| Naver Search | ✅ 발급 완료 | 검색 기반 팩트 체크 |
| Ollama | ✅ 연결 중 | 로컬 LLM (페르소나 시뮬레이션) |

### 아키텍처
```
Antigravity (VS Code) ←MCP stdio→ MCP Server (15 tools)
                                   ├── Core (Obsidian, Task, Model)
                                   ├── Personas (6종, Ollama)
                                   ├── Workflow (6단계 순환)
                                   ├── Grounding (GapDetect, APIs)
                                   ├── Execution (Shell, Git, Test)
                                   └── Dashboard (10-page, SSE)
```

### 다음 작업 후보
1. KOSIS/Naver API 실테스트 (ground 명령)
2. npm publish 준비
3. Phase 5+ 신규 기능 기획
