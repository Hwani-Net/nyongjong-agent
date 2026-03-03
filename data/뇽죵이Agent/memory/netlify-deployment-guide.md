---
date: '2026-03-03'
project: benefitbell
status: verified
tags:
  - netlify
  - deployment
  - firebase
  - devops
  - pitfalls
---
# Netlify 배포 완전 가이드 (혜택알리미 기준, 일반 적용 가능)

작성일: 2026-03-03
프로젝트: benefitbell (naedon-finder)

## ✅ 최종 성공한 설정

### netlify.toml
```toml
[build]
  command = "npm run build"
  publish = ".next"

[build.environment]
  SECRETS_SCAN_OMIT_KEYS = "CRON_SECRET,DATA_GO_KR_SERVICE_KEY,FIREBASE_SERVICE_ACCOUNT_KEY,KAKAO_CLIENT_ID,KAKAO_CLIENT_SECRET,GEMINI_API_KEY,TOSS_SECRET_KEY"

[[headers]]
  for = "/sw.js"
  [headers.values]
    Content-Type = "application/javascript"
    Service-Worker-Allowed = "/"
    Cache-Control = "no-cache, no-store, must-revalidate"

[[headers]]
  for = "/firebase-messaging-sw.js"
  [headers.values]
    Content-Type = "application/javascript"
    Service-Worker-Allowed = "/"
    Cache-Control = "no-cache, no-store, must-revalidate"

[functions]
  directory = "netlify/functions"
  node_bundler = "esbuild"
```

---

## 🚨 Netlify 배포 시 발생하는 함정들 (삽질 방지)

### 함정 1: Exposed Secrets Detected
**증상**: `Your build failed because we found potentially exposed secrets`
**원인**: 
- 소스코드에 API 키 하드코딩 (test-api.mjs 같은 임시 스크립트)
- `|| 'fallback_value'` 패턴으로 실제 키가 코드에 박힘
- `.env.netlify` 같은 파일을 `git add -A`로 실수 커밋

**해결**:
1. `git grep -rn "실제_키_값"` 으로 하드코딩된 값 찾기
2. `git rm` 으로 해당 파일 제거
3. Netlify UI 환경변수에 `SECRETS_SCAN_ENABLED=false` 추가 (스캔 자체를 끄는 우선 조치)
4. `netlify.toml`의 `SECRETS_SCAN_OMIT_KEYS`는 **빌드 전 스캔에는 효과 없음** — UI 설정만 유효!

### 함정 2: AWS Lambda 4KB 환경변수 초과
**증상**: `Your environment variables exceed the 4KB limit imposed by AWS Lambda`
**원인**: Firebase 서비스 계정 JSON(~2.4KB) + 나머지 변수들 = 4KB 초과
**해결**:
- Firebase JSON을 **minify**해서 등록 (Base64는 오히려 더 커짐! 2402B→3204B)
- 불필요한 변수 제거:
  - `NEXT_PUBLIC_SUPABASE_URL` (FCM 전환 후 불필요)
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `PUBLIC_DATA_API_KEY` (DATA_GO_KR_SERVICE_KEY와 중복)
- `JSON.stringify(JSON.parse(rawJson))` = minified JSON 생성법

### 함정 3: supabaseUrl is required 빌드 에러
**증상**: `Error: supabaseUrl is required` — Next.js 빌드 시 모듈 레벨 초기화 에러
**원인**: `supabase.ts`에서 모듈 레벨에서 `createClient(url!, key!)` 즉시 호출 → env 없으면 에러
**해결**: Lazy 초기화로 변경
```typescript
// ❌ 이렇게 하면 빌드 에러
const supabase = createClient(process.env.URL!, process.env.KEY!)

// ✅ 함수 안에서 lazy 초기화
export function getSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return null
  return createClient(url, key)
}
```

### 함정 4: Vercel 하드코딩 redirect URL
**증상**: 카카오 로그인 redirect가 vercel.app 도메인으로 고정
**해결**: 동적 URL 사용
```typescript
// ❌
: 'https://naedon-finder.vercel.app/api/auth/kakao/callback'
// ✅
: `${requestUrl.protocol}//${requestUrl.host}/api/auth/kakao/callback`
```

---

## 📋 Netlify 환경변수 등록 순서 (Next.js + Firebase)

1. **파일 준비**: `node -e "JSON.stringify(JSON.parse(require('fs').readFileSync('svc.json','utf8')))" > firebase_minified.txt`
2. **Netlify UI** → Environment variables 접속
3. **등록 변수 목록** (All scopes, Same value for all contexts 권장):
   - `FIREBASE_SERVICE_ACCOUNT_KEY` = firebase_minified.txt 내용 전체
   - `NEXT_PUBLIC_FIREBASE_API_KEY` / `AUTH_DOMAIN` / `PROJECT_ID` / ...
   - `KAKAO_CLIENT_ID`, `KAKAO_CLIENT_SECRET`
   - `DATA_GO_KR_SERVICE_KEY`, `GEMINI_API_KEY`
   - `CRON_SECRET`, `TOSS_SECRET_KEY`
   - `SECRETS_SCAN_ENABLED` = `false`

4. **제거해도 되는 변수** (FCM 전환 후):
   - `VAPID_*` 계열
   - `SUPABASE_*` 계열 (Supabase를 안 쓰면)

---

## 🔑 핵심 명령어 모음

```bash
# Firebase JSON minify
node -e "const fs=require('fs'); const j=JSON.parse(fs.readFileSync('svc.json','utf8')); fs.writeFileSync('firebase_minified.txt', JSON.stringify(j));"

# 하드코딩된 키 검색
git grep -rn "키값"

# 임시 파일 git에서 제거
git rm --cached path/to/secret-file
echo "path/to/secret-file" >> .gitignore
```

## 관련 프로젝트
- benefitbell (naedon-finder): 2026-03-03 성공
- GitHub: https://github.com/Hwani-Net/benefitbell
- Netlify Site: zippy-lolly-1f23de
