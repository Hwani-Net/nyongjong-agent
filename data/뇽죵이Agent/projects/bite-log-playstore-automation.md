---
created: '2026-03-04'
status: completed
tags:
  - project
  - bite-log
  - playstore
  - automation
  - skill
---
# 🎣 BITE Log — Play Store 자동 배포 완성

> **완성일**: 2026-03-04 02:25 KST
> **결과**: 원스톱 배포 스크립트 실사 통과 (101초)

## 해결된 문제
1. **API Access 메뉴 미표시 (이전 블로커)** → Google 문서 업데이트로 Cloud 프로젝트 링크 불필요 확인
2. **403 Permission Denied** → Play Console에서 서비스 계정에 관리자 권한 부여 (browser_subagent로 직접 설정)
3. **"Only releases with status draft" 에러** → commit 단계에서 발생, draft status 사용으로 해결
4. **Node.js HTTPS 스트리밍 ZIP 손상** → curl execSync으로 대체

## 원스톱 명령어
```bash
node scripts/deploy-to-play.mjs internal "릴리즈 노트"
```

## 파이프라인 (자동)
1. pwa_build_request.json → appVersionCode 자동 증가
2. CloudAPK API → unsigned AAB 다운로드
3. jarsigner → 로컬 keystore로 서명
4. Google Play Developer API → 업로드 + draft 할당 + 커밋
5. 임시 파일 자동 정리

## 스킬 파일
- `C:\Users\AIcreator\.agent\skills\pwa-to-playstore\SKILL.md`
- `e:\AI_Programing\Fishing\fish-log\scripts\deploy-to-play.mjs` (원스톱)
- `e:\AI_Programing\Fishing\fish-log\scripts\upload-to-play.mjs` (개별)
