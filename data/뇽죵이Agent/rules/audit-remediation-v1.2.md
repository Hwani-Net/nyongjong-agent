---
date: '2026-02-28'
type: rule-change
---
# 감사 4연속 실패 항목 대응 조치 (2026-02-28)

## 문제
CRITIC_TRACE(5컬럼 테이블)와 DESIGN_FIRST(HTML 저장)가 4세션 연속 실패.
yaml 규칙만으로는 "특정 양식 출력" 및 "파일 저장" 행동을 강제 불가.

## 적용된 조치

### 1. stitch-design-first/SKILL.md 강화
- HTML 저장: WARN → **BLOCK** 격상 + 4단계 체크리스트
- Step 5 추가: Obsidian memory_write (멀티세션 프로젝트 필수)
- Step 6 추가: critic_check 5컬럼 테이블 템플릿 (복붙용)

### 2. GLOBAL_RULES_PATCH 패치 4 추가
- CRITIC_TRACE 인라인 템플릿 (MEMORY[user_global]에 직접 삽입용)
- _stitch_designs/ HTML 미저장 = BLOCK 경고문
- Obsidian 테이블 행 추가

### 3. critic-constitution.yaml (이전 적용 완료)
- v1.1: TASK_MD_CONSISTENCY 신설, CRITIC_TRACE 강화, HONEST_SCORING 강화

## 검증 필요
다음 프로젝트에서 이 조치가 효과적인지 재감사 필요.
