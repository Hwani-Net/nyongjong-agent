---
importance: critical
topic: antigravity-config
type: reference
updatedAt: '2026-02-28'
---
# Antigravity 전역 규칙 파일 위치

**절대 경로**: `C:\Users\AIcreator\.gemini\GEMINI.md`

## 파일 상세
- **역할**: Antigravity가 모든 대화에서 자동으로 읽는 `MEMORY[user_global]`
- **형식**: Markdown (YAML frontmatter 없음)
- **크기**: 약 350줄, 19KB (2026-02-28 기준)
- **편집 방법**: `multi_replace_file_content` 또는 `replace_file_content` 도구로 직접 편집 가능

## 자주 하는 실수
- ❌ WebStorage/IndexedDB에 있다고 착각 → 파일 시스템에 없다고 보고
- ❌ VS Code/Cursor 설정(settings.json)에서 찾으려 함
- ✅ `.gemini/GEMINI.md` — 이것이 정답

## 관련 파일
- `.gemini/settings.json` — MCP 서버 설정 (nongjong-agent, pencil 등)
- `.agent/` — 스킬, 워크플로우, 규칙 등 에이전트 보조 파일
