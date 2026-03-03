---
date: '2026-02-28'
type: rule-change
version: '1.1'
---
# critic-constitution v1.1 변경 내역 (2026-02-28)

## 변경 사유
이중 감사(Dual-Model Audit)에서 발견된 3개 반복 패턴 대응

## 변경 내용

### 1. CRITIC_TRACE 강화
- 5컬럼 마크다운 테이블 형식 **필수** (시점|stage|score|verdict|위반규칙)
- BLOCK 은폐 감사 조항 추가 (Obsidian critic-log/ ↔ walkthrough 교차 검증)

### 2. HONEST_SCORING 강화
- score=1.0 시 "만점 사유" 1줄 이상 기재 **필수** (사유 없는 만점 = WARN)
- CRITIC_TRACE BLOCK 은폐 시 HONEST_SCORING도 동시 BLOCK

### 3. BUILD_VERIFY 강화
- `as any` 캐스트 건수·사유 기재 **필수**

### 4. TASK_MD_CONSISTENCY 신설 (BLOCK)
- walkthrough 작성 전 task.md 체크율 80%+ 필수
- 완료 작업이 [ ] 미체크 상태면 BLOCK
- 포트·경로 등 사실 정보 3곳(task.md/walkthrough/Obsidian) 일관성 검증
