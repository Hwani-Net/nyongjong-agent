# FishLog 프로젝트 메모리 (2026-03-01 최종)

## 현재 단계: 프로덕션 준비 완료

## 완료된 기능
- [x] GPS + 날씨 + 물때(mock), 지도 뷰, 통계, 랭킹
- [x] Firebase Auth + Firestore, 다크모드 + i18n
- [x] SNS 피드 (`/feed`) — Option B: 좋아요+댓글
- [x] 공개/비공개 토글 (기본값=공개)
- [x] Firestore publicFeed 전역 컬렉션 (Dual-Write)
- [x] 피드 필터 (전체/어종별/지역별)
- [x] Firestore 보안규칙 (`firestore.rules`)
- [x] PWA (manifest.json + sw.js v2)
- [x] firebase.json (호스팅 설정)

## 남은 작업
- [ ] KHOA 물때 API 실 연동 (Key 발급 후)
- [ ] Vercel 또는 Firebase Hosting 배포
- [ ] Google Play Store PWA 래핑 (TWA)

## 포트: 3007
