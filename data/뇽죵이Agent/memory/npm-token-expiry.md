---
expires: '2026-06-02'
project: nyongjong-agent
service: npm
type: expiry-reminder
---
# npm Token 만료 주의

## 토큰 정보
- **패키지**: nyongjong-agent
- **발급일**: 2026-03-04
- **만료일**: 2026-06-02 (약 90일, 최대치)
- **타입**: Granular Access Token (Read & Write)

## ⚠️ 주의사항
- npmjs.com의 Granular Token은 최대 90일 제한
- 만료 시 `npm publish` 실패 → 토큰 재발급 필요
- 재발급 절차: npmjs.com → Access Tokens → Generate New Token → Granular → Read & Write
- **만료 예상 문제 발생 시기**: 2026년 6월 초

## 재발급 후 설정 방법
```bash
npm set //registry.npmjs.org/:_authToken=npm_새토큰값
```
