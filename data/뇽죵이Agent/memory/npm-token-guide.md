---
project: nyongjong-agent
topic: npm-token
type: guide
verified_date: '2026-03-04'
---
# npm Token 발급 올바른 방법 (경험 기반)

## ✅ 정답: Granular Token + Bypass 2FA

npmjs.com Classic Token의 Automation 타입이 없어진 것으로 보임.
아래 방법이 2026-03-04 기준 작동 확인된 방법.

### 발급 절차
1. npmjs.com → Access Tokens → Generate New Token → **Granular Access Token**
2. Token name: 원하는 이름 (예: `nyongjong-publish`)
3. **Bypass two-factor authentication (2FA): ✅ 체크** ← 핵심!
4. Packages and scopes → Permissions: **Read and write**
5. Select packages: **All packages**
6. Expiration: 90일 (최대치)
7. Generate token

### 설정 방법
```bash
npm set //registry.npmjs.org/:_authToken=npm_xxx...
npm publish --access public
```

## ⚠️ 만료 주의
- Granular Token 최대 90일 제한
- 현재 토큰 만료: **2026-06-02**
- 만료 시 위 절차 반복하여 재발급
