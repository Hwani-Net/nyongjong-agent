---
created: '2026-03-04'
status: in-progress
tags:
  - project
  - bite-log
  - playstore
  - handoff
---
# 🎣 BITE Log — Play Store 게시 핸드오프 (2026-03-04 02:46 KST)

## ✅ 완료된 작업
- Play Store 자동 배포 파이프라인 완성 (`scripts/deploy-to-play.mjs`)
- AAB versionCode 7 업로드 완료 (내부 테스트 트랙, draft → 출시 완료)
- 개인정보처리방침 페이지 Firebase 재배포 (https://fishlog-diary-2026.web.app/privacy)
- 출시 노트 수정 (내부 용어 제거, 사용자 관점 문구로 교체)

## 🔴 미완료 — Play Console 필수 항목 (게시 개요 화면에서 진행)

URL: https://play.google.com/console/u/3/developers/5565554790849512525/app/4976432993860036854/publishing

아래 항목들이 "변경사항이 아직 검토를 위해 전송되지 않음" 상태:

| 항목 | 상태 | 처리 방법 |
|------|------|-----------|
| 콘텐츠 등급 | ❌ 새 설문지 제출 필요 | IARC 설문: 스포츠 카테고리, 유해 콘텐츠 없음 |
| 타겟층 및 콘텐츠 | ❌ 18세 이상으로 업데이트 | 타겟 연령대 만 18세 이상 |
| 광고 선언 | ❌ 업데이트 필요 | 광고 없음 선택 |
| 데이터 보안 | ❌ 설문지 작성 필요 | 이메일/위치/사진 수집, 제3자 미공유, 암호화, 삭제 가능 |
| 앱 카테고리 | ❌ 스포츠 앱 선택 필요 | 스포츠 선택 |
| 스토어 등록정보 | ⚠️ 앱 이름이 FishLog로 표시됨 | BITE Log — 낚시 조과 일지로 업데이트 |

## 앱 정보 (설문 작성 시 참조)
- 앱 이름: BITE Log (낚시 조과 일지)
- 패키지: com.fishlog.diary
- 카테고리: 스포츠
- 타겟: 18세 이상
- 광고: 없음
- 개인정보처리방침: https://fishlog-diary-2026.web.app/privacy
- 문의 이메일: hwanizero01@gmail.com
- 수집 데이터: 이메일/이름(Google 로그인), GPS 위치(앱 기능), 사진(AI 분석)
- 제3자 공유: 없음 (단, Firebase/Gemini API 처리 위탁)

## 다음 세션 재개
1. `docs/PROJECT_CONTEXT.md` 확인
2. 위 URL로 Play Console 접속
3. 미완료 항목 순서대로 처리
4. "검토를 위해 앱 전송" 버튼 클릭으로 심사 제출
