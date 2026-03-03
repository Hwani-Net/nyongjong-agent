---
progress: 97%
stage: deploy
tags:
  - bitelog
  - playstore
  - aab
  - deploy
  - handoff
---
# BITE Log — Play Store 배포 세션 핸드오프

> **세션 날짜**: 2026-03-04 (00:39~01:53 KST)
> **프로젝트 경로**: `e:/AI_Programing/Fishing/fish-log`
> **dev 서버**: `npm run dev -- -p 3002`

---

## 🎯 이번 세션에서 완료한 것

### 1. 코드 수정 + 빌드 + 배포
- ✅ 이용약관 보강 (7조 → 13조): 용어정의, 위치정보, 해지/탈퇴, 손해배상, 관할법원 추가
- ✅ 이메일 변경: `fishlog.app@gmail.com` → `hwanizero01@gmail.com` (terms + privacy)
- ✅ TypeScript 빌드 에러 0, 22페이지 정적 생성
- ✅ Firebase Hosting 재배포 완료 (https://fishlog-diary-2026.web.app)

### 2. AAB 자동 생성 파이프라인 구축 ✅
- ✅ **PWABuilder CloudAPK REST API** — curl로 unsigned AAB 직접 다운로드 (브라우저 불필요!)
- ✅ **Android Studio jarsigner** — 기존 signing.keystore로 AAB 직접 서명
- ✅ **SHA1 지문 일치 확인** — Play Console 요구 SHA1과 100% 일치
- ✅ 서명된 AAB 파일: `e:/AI_Programing/Fishing/fish-log/FishLog-v1.1.0-signed.aab` (3.3MB)

### 3. Play Console API 자동 업로드 시도 (부분 완료)
- ✅ gcloud CLI로 서비스 계정 생성: `play-uploader@fishlog-diary-2026.iam.gserviceaccount.com`
- ✅ JSON 키 발급: `play-service-account.json`
- ✅ `androidpublisher.googleapis.com` API 활성화
- ✅ Play Console에서 서비스 계정 사용자 초대 + 출시 권한 3개 부여
- ✅ 업로드 스크립트 작성: `scripts/upload-to-play.mjs` (googleapis 패키지)
- ❌ **403 Permission Denied** — "API 액세스" 메뉴가 개인 계정에서 안 보임 (블로커)

### 4. 스킬 생성 ✅
- `C:\Users\AIcreator\.agent\skills\pwa-to-playstore\SKILL.md` 생성
- Phase 1~3 검증 완료, Phase 4 블로커 기록됨

---

## ❌ 미완료 / 블로커

### Play Console "API 액세스" 메뉴 미표시
- **증상**: 설정 사이드바에 "API 액세스" 항목 없음, 직접 URL 접근 시 홈으로 리다이렉트
- **원인 추정**: (1) 개인 개발자 계정 제한 (2) "Android 개발자 인증" 미완료
- **해결 방안**: 개발자 인증(신원확인) 완료 후 재시도
- **임시 우회**: 서명된 AAB를 Play Console에서 수동 드래그 앤 드롭

### AAB 수동 업로드 아직 안 됨
- 서명된 AAB 파일은 준비됨
- Play Console > 테스트 및 출시 > 내부 테스트 > 새 버전 만들기에서 업로드 필요

---

## 📂 중요 파일 위치

| 파일 | 경로 | 용도 |
|------|------|------|
| 서명된 AAB | `FishLog-v1.1.0-signed.aab` | Play Console 업로드용 |
| 서명 키 | `signing.keystore` | AAB 서명 (.gitignore 등록됨) |
| 키 정보 | `signing-key-info.txt` | alias: my-key-alias, pw: _jfL6KOmykfE |
| 서비스 계정 | `play-service-account.json` | API 업로드용 (.gitignore 등록됨) |
| 업로드 스크립트 | `scripts/upload-to-play.mjs` | googleapis 기반 |
| 스킬 | `.agent/skills/pwa-to-playstore/SKILL.md` | 전체 파이프라인 문서 |
| 프로젝트 컨텍스트 | `docs/PROJECT_CONTEXT.md` | 북극성 + TODO + ADR |

---

## 📌 다음 세션 TODO (우선순위 순)

1. **AAB 수동 업로드** — Play Console에서 FishLog-v1.1.0-signed.aab 드래그 앤 드롭
2. **개발자 인증 완료** — Play Console 홈에 표시된 "Android 개발자 인증" 진행
3. **API 업로드 재시도** — 인증 후 "API 액세스" 메뉴 활성화 확인 → 스킬 업데이트
4. **금어기 법규 QA** — Tier 3 #10
5. **Git 커밋** — 이번 세션 변경사항 커밋 (약관 보강, 스크립트, gitignore)

---

## 🔧 기술적 발견 (삽질 로그)

1. **PWABuilder 브라우저 다운로드 불가** → CloudAPK REST API(`curl`)로 해결
2. **서명 키 불일치** → `signingMode: "none"` + 로컬 jarsigner 서명으로 해결
3. **Windows bash `@파일명` 실패** → `write_to_file`로 프로젝트 루트에 JSON 직접 생성
4. **Play Console 계정 인덱스** — `hwanizero01@gmail.com`은 `/u/3/` (브라우저 기준)
5. **Android Studio JDK 경로** — `C:/Program Files/Android/Android Studio/jbr/bin/`
