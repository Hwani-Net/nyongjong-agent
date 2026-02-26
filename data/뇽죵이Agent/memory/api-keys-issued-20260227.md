---
date: '2026-02-27'
tags:
  - api-keys
  - kosis
  - naver
  - grounding
type: credentials-log
---
# API 키 발급 기록

## 날짜
2026-02-27 08:20 KST

## KOSIS (통계청 공유서비스)
- **URL**: https://kosis.kr/openapi/
- **인증키**: `YjNjODRiNDJjMjZmZTk3MmVmN2NmNjhmYjU5NjBlMDg=`
- **서비스 유형**: REST
- **활용 용도**: 기타 (에이전트 연구 및 개발용)
- **상업적 활용**: 아니오
- **사용 목적**: LLM 기반 에이전트의 통계 데이터 통합 및 자동 분석을 위한 API 활용
- **심의**: 자동승인
- **활용 기간**: 인증키 만료일까지 활용 가능

## Naver Developers (검색 API)
- **URL**: https://developers.naver.com/
- **앱 이름**: JjinLocalKorea
- **Client ID**: `f9peMzmhgNZqZz3XGsKx`
- **Client Secret**: `uRS6nzG3bT`
- **일일 쿼터**: 25,000건
- **사용 API**: 검색 (블로그, 뉴스 등)

## .env 설정
```bash
KOSIS_API_KEY=YjNjODRiNDJjMjZmZTk3MmVmN2NmNjhmYjU5NjBlMDg=
NAVER_CLIENT_ID=f9peMzmhgNZqZz3XGsKx
NAVER_CLIENT_SECRET=uRS6nzG3bT
```

## ⚠️ 주의사항
- API 키는 `.env`에만 저장, `.gitignore`에 `.env` 포함 확인 필수
- KOSIS API는 무료지만 과도한 호출 시 차단 가능
- Naver 일일 25,000건 한도 → 대시보드에서 사용량 모니터링 필요
