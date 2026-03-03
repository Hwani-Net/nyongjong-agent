---
project: naedon-finder
tags:
  - kakao
  - api-key
  - oauth
---
# 카카오 API 키 위치

## REST API 키 (= OAuth client_id)
**경로**: 카카오 개발자센터 → 앱 → 내 앱 선택 → 앱 키 → REST API 키

**현재 naedon-finder(benefitbell) 값**:
```
KAKAO_CLIENT_ID=2ea24765291ab5909d7c489615615b92
```

## 주의사항
- REST API 키 = `KAKAO_CLIENT_ID` = 카카오 OAuth에서 쓰는 `client_id`. 동일한 값.
- `KAKAO_CLIENT_SECRET`은 카카오 개발자 콘솔에서 별도 활성화 시에만 필요. 기본적으로 없어도 OAuth 동작함.
- Vercel 환경변수에 `KAKAO_CLIENT_SECRET`가 없었던 이유: 앱에서 사용 안 함 (정상).

## 다음에 카카오 키 필요할 때
1. https://developers.kakao.com 접속
2. 내 애플리케이션 → 해당 앱 선택
3. **앱 키** 탭 → **REST API 키** 복사
