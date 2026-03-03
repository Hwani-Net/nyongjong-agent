---
importance: critical
topic: config-fix
type: incident
updatedAt: '2026-02-28'
---
# Obsidian Vault 경로 수정 (2026-02-28)

## 변경 내용
- **이전**: `E:\Agent\뇽죵이Agent\data` (Obsidian 앱에 연결 안 됨)
- **이후**: `C:\Users\AIcreator\Obsidian-Vault` (실제 Obsidian 앱 vault)

## 수정 파일
- `C:\Users\AIcreator\.gemini\settings.json` → `OBSIDIAN_VAULT_PATH` 변경

## 영향
- 이전까지 `memory_write`로 쓴 파일이 Obsidian 앱에서 보이지 않았음
- 기존 파일 15개를 새 vault로 복사 완료
- 이후 `memory_write`는 자동으로 올바른 vault에 쓰임

## 주의
- `AGENT_DATA_DIR`은 여전히 `E:\Agent\뇽죵이Agent` (Agent 코드/설정용)
- Obsidian vault만 분리됨
