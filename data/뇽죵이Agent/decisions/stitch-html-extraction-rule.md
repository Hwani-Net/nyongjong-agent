---
project: global-rules
status: completed
tags:
  - stitch
  - design-first
  - audit-lesson
type: decision
updated: '2026-02-28'
---
# Stitch HTML 추출 검증 강화 (2026-02-28)

## 발견 경위
- 3개 세션 감사 중 뽀모도로 세션(409cafb2)이 0.93으로 최우수 판정
- 대표님이 "Stitch HTML을 다운로드 안 받았는데?" 지적
- 감사자(에이전트)가 walkthrough 텍스트만 보고 "Stitch ID 있음 → PASS" 처리한 오류

## 문제
- Stitch 스크린을 **생성만** 하고 **HTML을 추출하지 않아** 실제 코드에 디자인 미반영
- 형식적 준수: 겉보기엔 Design-First 지켰지만 실질적으로 위반

## 해결 (3곳 수정)

### 1. critic-constitution.yaml — DESIGN_FIRST 원칙 강화
- 체크 질문 3개 → **5개**로 확장
- "HTML 원본 추출을 시도했는가? (get_screen 호출)" 추가
- "추출한 HTML/CSS가 실제 코드에 반영되었는가?" 추가
- "walkthrough에 'Stitch HTML 추출: ✅/❌' 기록이 있는가?" 추가
- common_bypass에 "스크린만 생성하고 HTML 미추출" 패턴 추가

### 2. GEMINI.md — walkthrough 필수 기록 항목 추가
- "Stitch HTML 추출 기록 의무" 서브섹션 신설
- walkthrough에 `Stitch HTML 추출: ✅/❌` 필수

### 3. 뽀모도로 감사 점수 하향
- DESIGN_FIRST: ✅ → ⚠️ WARN
- 0.93 → 0.86 수정
